"""
transfer_process.py - Cloud Data Forwarding Process
==================================
Responsibilities:
  - Subscribe to local MQTT telemetry topics (from sensor_process & vision_process)
  - Merge states into a complete JSON payload
  - Aggregate merged telemetry hourly (24/day)
  - Local disk caching when offline (SQLite, crash-safe)
  - Catch-up upload via MQTT when network recovers, delete cache on PUBACK (QoS1)

No hardware/camera interaction, purely network IO.
"""
from __future__ import annotations

import argparse
import base64
import json
import logging
import os
import signal
import socket
import sqlite3
import threading
import time
import hashlib
import zlib
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from config import RuntimeConfig, apply_env_overrides, setup_logger
from diagnostics_helper import DiagnosticTicker, truncate_middle
from mqtt_support import connect_mqtt_with_retries, create_mqtt_client

try:
    import paho.mqtt.client as mqtt
except Exception:
    mqtt = None


# ------------------------------------------------------------------ #
#  共享状态（来自两个进程的最新数据在此合并）
# ------------------------------------------------------------------ #

class MergedState:
    """线程安全的合并状态，由 MQTT 消息回调写入，由上传工作线程读取。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # 来自 sensor_process
        self.temp: float = 0.0
        self.humi: float = 0.0
        self.out_temp: float = 0.0
        self.out_humi: float = 0.0
        self.weight: float = 0.0
        self.in_count: int = 0
        self.out_count: int = 0
        self.lat: float = 0.0
        self.lon: float = 0.0
        # 来自 vision_process
        self.hornet_count: int = 0
        self.fps: float = 0.0
        self.latency_ms: float = 0.0
        self.sensor_updated_at: float = 0.0
        self.outside_updated_at: float = 0.0
        self.weight_updated_at: float = 0.0
        self.counter_updated_at: float = 0.0
        self.gps_updated_at: float = 0.0
        self.vision_updated_at: float = 0.0
        self._updated = threading.Event()

    def update_from_sensor(self, sensors: list) -> None:
        mapping = {
            "temperature": "temp",
            "humidity": "humi",
            "in_temp": "temp",
            "in_humi": "humi",
            "out_temp": "out_temp",
            "out_humi": "out_humi",
            "weight": "weight",
            "bee_in": "in_count",
            "bee_out": "out_count",
            "in_count": "in_count",
            "out_count": "out_count",
            "gps_lat": "lat",
            "gps_lon": "lon",
            "lat": "lat",
            "lon": "lon",
        }
        with self._lock:
            now = time.time()
            for s in sensors:
                raw_type = str(s.get("type", ""))
                attr = mapping.get(raw_type)
                if attr:
                    val = s.get("value", 0)
                    setattr(self, attr, int(val) if attr in ("in_count", "out_count") else float(val))
                    if attr in ("temp", "humi"):
                        self.sensor_updated_at = now
                    elif attr in ("out_temp", "out_humi"):
                        self.outside_updated_at = now
                    elif attr == "weight":
                        self.weight_updated_at = now
                    elif attr in ("in_count", "out_count"):
                        self.counter_updated_at = now
                    elif attr in ("lat", "lon"):
                        self.gps_updated_at = now
        self._updated.set()

    def update_from_vision(self, data: Dict[str, Any]) -> None:
        with self._lock:
            self.hornet_count = int(data.get("hornet_count", 0))
            self.fps = float(data.get("fps", 0.0))
            self.latency_ms = float(data.get("latency_ms", 0.0))
            self.vision_updated_at = time.time()

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "temp": self.temp,
                "humi": self.humi,
                "out_temp": self.out_temp,
                "out_humi": self.out_humi,
                "weight": self.weight,
                "in_count": self.in_count,
                "out_count": self.out_count,
                "lat": self.lat,
                "lon": self.lon,
                "hornet_count": self.hornet_count,
                "fps": self.fps,
                "latency_ms": self.latency_ms,
                "sensor_updated_at": self.sensor_updated_at,
                "outside_updated_at": self.outside_updated_at,
                "weight_updated_at": self.weight_updated_at,
                "counter_updated_at": self.counter_updated_at,
                "gps_updated_at": self.gps_updated_at,
                "vision_updated_at": self.vision_updated_at,
            }

    def wait_for_update(self, timeout: float = 5.0) -> bool:
        result = self._updated.wait(timeout=timeout)
        self._updated.clear()
        return result


# ------------------------------------------------------------------ #
#  MqttBridge - Local Telemetry Receiver
# ------------------------------------------------------------------ #

class MqttBridge:
    SENSOR_TOPIC  = "smarthive/pi5/sensors"
    VISION_TOPIC  = "pi5/vision/result"
    COMMAND_TOPIC_KEY = "command_topic"   # 从 cfg.mqtt 读

    def __init__(self, cfg: RuntimeConfig, state: MergedState, logger: logging.Logger,
                 on_model_switch: Any) -> None:
        self._cfg = cfg.mqtt
        self._state = state
        self._logger = logger
        self._on_model_switch = on_model_switch
        self._client: Optional[Any] = None
        self._stop = threading.Event()  # 停止退避重连循环
        self._diag = cfg.diagnostics
        iv = max(5.0, cfg.diagnostics.summary_interval_seconds)
        self._in_sensor_ticker = DiagnosticTicker(iv)
        self._in_vision_ticker = DiagnosticTicker(iv)

    def _on_connect(self, client: Any, *_) -> None:
        client.subscribe(self.SENSOR_TOPIC, qos=0)
        client.subscribe(self.VISION_TOPIC, qos=0)
        client.subscribe(self._cfg.command_topic, qos=0)
        self._logger.info("MqttBridge: 已连接，订阅 %s / %s / %s",
                          self.SENSOR_TOPIC, self.VISION_TOPIC, self._cfg.command_topic)

    def _on_message(self, client: Any, _ud: Any, msg: Any) -> None:
        try:
            raw = msg.payload.decode("utf-8")
            data = json.loads(raw)
            if data.get("compressed") is True and data.get("codec") == "zlib+base64" and isinstance(data.get("payload"), str):
                inflated = zlib.decompress(base64.b64decode(data["payload"])).decode("utf-8")
                data = json.loads(inflated)
        except Exception as e:
            self._logger.debug("MqttBridge: Parse failed %s", e)
            return

        topic = msg.topic
        if topic == self.SENSOR_TOPIC:
            # From sensor_process
            sensors = data.get("sensors")
            if sensors:
                self._state.update_from_sensor(sensors)
                if self._diag.enabled and self._diag.log_mqtt_in and self._in_sensor_ticker.should_fire():
                    self._logger.info(
                        "[DIAG][Transfer←sensor MQTT] deviceId=%s sensors=%d preview=%s",
                        data.get("deviceId", "?"),
                        len(sensors) if isinstance(sensors, list) else 0,
                        truncate_middle(raw, 220),
                    )
        elif topic == self.VISION_TOPIC:
            self._state.update_from_vision(data)
            if self._diag.enabled and self._diag.log_mqtt_in and self._in_vision_ticker.should_fire():
                self._logger.info(
                    "[DIAG][Transfer←vision MQTT] hornet=%s fps=%s %s",
                    data.get("hornet_count"),
                    data.get("fps"),
                    truncate_middle(raw, 180),
                )
        elif topic == self._cfg.command_topic:
            # Model switch command -> forward to vision_process via UDS
            self._on_model_switch(data)

    def start(self) -> None:
        if mqtt is None:
            self._logger.warning("MqttBridge: paho-mqtt 不可用")
            return
        self._client = create_mqtt_client(f"{self._cfg.client_id}-transfer")
        if getattr(self._cfg, "username", ""):
            # 支持 EMQX MQTT 用户名/密码鉴权
            self._client.username_pw_set(self._cfg.username, self._cfg.password)
        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message
        if not connect_mqtt_with_retries(
            self._client,
            self._cfg.host,
            self._cfg.port,
            30,
            self._stop,
            self._logger,
            label="MqttBridge",
        ):
            self._logger.warning("MqttBridge: 未连接（进程已停止或重连已取消）")

    def stop(self) -> None:
        self._stop.set()
        if self._client:
            try:
                self._client.loop_stop()
            except Exception:
                pass
            try:
                self._client.disconnect()
            except Exception:
                pass


# ------------------------------------------------------------------ #
#  LocalDBSyncManager - 断点续传 SQLite 管理
# ------------------------------------------------------------------ #

class LocalDBSyncManager:
    def __init__(self, db_path: str, logger: logging.Logger, max_pending: int, max_db_bytes: int, keep_days: int):
        self.db_path = db_path
        self.logger = logger
        self.max_pending = int(max(24, max_pending))
        self.max_db_bytes = int(max(2 * 1024 * 1024, max_db_bytes))
        self.keep_days = int(max(1, keep_days))
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=5.0)
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute("PRAGMA temp_store=MEMORY;")
        except Exception:
            pass
        return conn

    def _init_db(self):
        try:
            db_dir = os.path.dirname(self.db_path)
            if db_dir:
                os.makedirs(db_dir, exist_ok=True)
            with self._connect() as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS telemetry_cache (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        device_id TEXT NOT NULL,
                        hour_bucket INTEGER NOT NULL,
                        payload TEXT NOT NULL,
                        payload_sha1 TEXT NOT NULL,
                        created_at_ms INTEGER NOT NULL,
                        sent_at_ms INTEGER
                    )
                """)
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_telemetry_device_hour ON telemetry_cache(device_id, hour_bucket)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_id ON telemetry_cache(id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_created ON telemetry_cache(created_at_ms)")
                self.logger.info("LocalDBSyncManager: SQLite 数据库初始化成功 %s", self.db_path)
        except Exception as e:
            self.logger.error("LocalDBSyncManager: 数据库初始化失败: %s", e)

    def _prune_if_needed(self) -> None:
        """
        Best-effort pruning:
        - Keep most recent max_pending records
        - Drop records older than keep_days
        - Try to keep DB file under max_db_bytes
        """
        try:
            now_ms = int(time.time() * 1000)
            cutoff_ms = now_ms - int(self.keep_days) * 24 * 3600 * 1000
            with self._connect() as conn:
                conn.execute("DELETE FROM telemetry_cache WHERE created_at_ms < ?", (cutoff_ms,))
                # Cap by count
                cur = conn.execute("SELECT COUNT(*) FROM telemetry_cache")
                total = int(cur.fetchone()[0] or 0)
                if total > self.max_pending:
                    excess = total - self.max_pending
                    conn.execute(
                        "DELETE FROM telemetry_cache WHERE id IN (SELECT id FROM telemetry_cache ORDER BY id ASC LIMIT ?)",
                        (excess,),
                    )
                conn.commit()
        except Exception as e:
            self.logger.debug("LocalDBSyncManager: prune failed: %s", e)

        # File size cap (best-effort)
        try:
            if os.path.exists(self.db_path) and os.path.getsize(self.db_path) > self.max_db_bytes:
                with self._connect() as conn:
                    # Drop oldest 25% and vacuum
                    cur = conn.execute("SELECT COUNT(*) FROM telemetry_cache")
                    total = int(cur.fetchone()[0] or 0)
                    drop_n = max(1, int(total * 0.25))
                    conn.execute(
                        "DELETE FROM telemetry_cache WHERE id IN (SELECT id FROM telemetry_cache ORDER BY id ASC LIMIT ?)",
                        (drop_n,),
                    )
                    conn.commit()
                    try:
                        conn.execute("VACUUM;")
                    except Exception:
                        pass
        except Exception as e:
            self.logger.debug("LocalDBSyncManager: size-cap failed: %s", e)

    def save_payload(self, device_id: str, hour_bucket: int, payload: Dict[str, Any]):
        try:
            payload_text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            sha1 = hashlib.sha1(payload_text.encode("utf-8")).hexdigest()
            created_at_ms = int(time.time() * 1000)
            with self._connect() as conn:
                # Upsert by (device_id, hour_bucket): keep latest payload for that hour
                conn.execute(
                    """
                    INSERT INTO telemetry_cache (device_id, hour_bucket, payload, payload_sha1, created_at_ms, sent_at_ms)
                    VALUES (?, ?, ?, ?, ?, NULL)
                    ON CONFLICT(device_id, hour_bucket) DO UPDATE SET
                      payload=excluded.payload,
                      payload_sha1=excluded.payload_sha1,
                      created_at_ms=excluded.created_at_ms,
                      sent_at_ms=NULL
                    """,
                    (device_id, int(hour_bucket), payload_text, sha1, created_at_ms),
                )
                conn.commit()
            self._prune_if_needed()
        except Exception as e:
            self.logger.error("LocalDBSyncManager: 保存载荷失败: %s", e)

    def get_unsynced(self, limit=20) -> List[tuple]:
        try:
            with self._connect() as conn:
                cursor = conn.execute(
                    "SELECT id, payload FROM telemetry_cache ORDER BY id ASC LIMIT ?",
                    (int(limit),),
                )
                return cursor.fetchall()
        except Exception as e:
            self.logger.error("LocalDBSyncManager: 获取未同步数据失败: %s", e)
            return []

    def delete_records(self, ids: List[int]):
        if not ids: return
        try:
            with self._connect() as conn:
                placeholders = ",".join(["?"] * len(ids))
                conn.execute(f"DELETE FROM telemetry_cache WHERE id IN ({placeholders})", ids)
                conn.commit()
        except Exception as e:
            self.logger.error("LocalDBSyncManager: 删除已同步记录失败: %s", e)


# ------------------------------------------------------------------ #
#  HourlyMqttSync - Aggregate hourly and catch-up upload via MQTT
# ------------------------------------------------------------------ #

class HourlyMqttSync:
    def __init__(self, cfg: RuntimeConfig, state: MergedState, logger: logging.Logger) -> None:
        self._cfg = cfg.telemetry_sync
        self._runtime_cfg = cfg
        self._state = state
        self._logger = logger
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._client: Optional[Any] = None
        self._connected = threading.Event()
        self._lock = threading.Lock()

        self._device_id = cfg.mqtt.client_id
        self._topic = (self._cfg.cloud_topic or cfg.mqtt.data_topic).strip() or "smarthive/pi5/sensors"

        self._db = LocalDBSyncManager(
            self._cfg.local_db_path,
            logger,
            max_pending=self._cfg.max_pending_records,
            max_db_bytes=self._cfg.max_db_bytes,
            keep_days=self._cfg.prune_keep_days,
        )
        self._diag = cfg.diagnostics
        self._hourly_diag_ticker = DiagnosticTicker(45.0)
        self._reset_hour_window()

    def _reset_hour_window(self) -> None:
        self._temp_sum = 0.0
        self._humi_sum = 0.0
        self._sensor_n = 0
        self._out_temp_sum = 0.0
        self._out_humi_sum = 0.0
        self._outside_n = 0
        self._weight_sum = 0.0
        self._weight_n = 0
        self._bee_in_peak = 0
        self._bee_out_peak = 0
        self._counter_seen = False
        self._hornet_peak = 0
        self._fps_sum = 0.0
        self._latency_sum = 0.0
        self._vision_n = 0
        self._last_lat: Optional[float] = None
        self._last_lon: Optional[float] = None
        self._has_any_observation = False

    def _is_recent(self, updated_at: float, max_age_s: float) -> bool:
        return updated_at > 0 and (time.time() - updated_at) <= max_age_s

    def _accumulate_snapshot(self, snap: Dict[str, Any]) -> None:
        sensor_cfg = self._runtime_cfg.sensor
        mqtt_cfg = self._runtime_cfg.mqtt
        if self._is_recent(float(snap["sensor_updated_at"]), max(30.0, float(sensor_cfg.dht_read_interval) * 3.0)):
            self._temp_sum += float(snap["temp"])
            self._humi_sum += float(snap["humi"])
            self._sensor_n += 1
            self._has_any_observation = True
        if self._is_recent(float(snap["outside_updated_at"]), max(30.0, float(sensor_cfg.dht_read_interval) * 3.0)):
            self._out_temp_sum += float(snap["out_temp"])
            self._out_humi_sum += float(snap["out_humi"])
            self._outside_n += 1
            self._has_any_observation = True
        if self._is_recent(float(snap["weight_updated_at"]), max(10.0, float(sensor_cfg.hx711_read_interval) * 3.0)):
            self._weight_sum += float(snap["weight"])
            self._weight_n += 1
            self._has_any_observation = True
        if self._is_recent(float(snap["counter_updated_at"]), max(15.0, float(mqtt_cfg.publish_interval_seconds) * 3.0)):
            self._bee_in_peak = max(self._bee_in_peak, int(snap["in_count"]))
            self._bee_out_peak = max(self._bee_out_peak, int(snap["out_count"]))
            self._counter_seen = True
            self._has_any_observation = True
        if self._is_recent(float(snap["vision_updated_at"]), max(15.0, float(mqtt_cfg.publish_interval_seconds) * 3.0)):
            self._hornet_peak = max(self._hornet_peak, int(snap["hornet_count"]))
            self._fps_sum += float(snap["fps"])
            self._latency_sum += float(snap["latency_ms"])
            self._vision_n += 1
            self._has_any_observation = True
        if float(snap["gps_updated_at"]) > 0:
            self._last_lat = float(snap["lat"])
            self._last_lon = float(snap["lon"])
            self._has_any_observation = True

    def _build_payload(self, sample_ts_ms: int) -> Optional[Dict[str, Any]]:
        """
        sample_ts_ms should represent the “hour bucket” timestamp (aligned),
        so backend bucketing stays stable even if catch-up happens later.
        """
        now_ms = int(time.time() * 1000)
        if not self._has_any_observation:
            self._reset_hour_window()
            return None
        sensors: List[Dict[str, Any]] = []
        if self._counter_seen:
            sensors.extend([
                {"type": "bee_in", "value": self._bee_in_peak, "unit": "count"},
                {"type": "bee_out", "value": self._bee_out_peak, "unit": "count"},
            ])
        if self._sensor_n > 0:
            sensors.extend([
                {"type": "temperature", "value": round(self._temp_sum / self._sensor_n, 1), "unit": "C"},
                {"type": "humidity", "value": round(self._humi_sum / self._sensor_n, 1), "unit": "%"},
            ])
        if self._outside_n > 0:
            sensors.extend([
                {"type": "out_temp", "value": round(self._out_temp_sum / self._outside_n, 1), "unit": "C"},
                {"type": "out_humi", "value": round(self._out_humi_sum / self._outside_n, 1), "unit": "%"},
            ])
        if self._weight_n > 0:
            sensors.append({"type": "weight", "value": round(self._weight_sum / self._weight_n, 2), "unit": "kg"})
        if self._last_lat is not None and self._last_lon is not None:
            sensors.extend([
                {"type": "gps_lat", "value": self._last_lat, "unit": "deg"},
                {"type": "gps_lon", "value": self._last_lon, "unit": "deg"},
            ])
        if self._vision_n > 0:
            sensors.extend([
                {"type": "hornet_count", "value": float(self._hornet_peak), "unit": "count"},
                {"type": "fps", "value": round(self._fps_sum / self._vision_n, 2), "unit": "fps"},
                {"type": "latency_ms", "value": round(self._latency_sum / self._vision_n, 2), "unit": "ms"},
            ])
        if not sensors:
            return None
        payload = {
            "deviceId": self._device_id,
            "timestamp": int(sample_ts_ms),
            "qos": int(self._cfg.publish_qos),
            "sensors": sensors,
            # Mark as replay/catch-up record: backend will persist but skip realtime broadcast to UI.
            "status": {"online": True, "replay": True, "replayType": "hourly", "replayAt": now_ms},
        }
        self._reset_hour_window()
        return payload

    def _next_wait(self) -> float:
        if self._cfg.align_to_hour and int(self._cfg.interval_seconds) == 3600:
            return 3600.0 - (time.time() % 3600.0)
        return float(self._cfg.interval_seconds)

    def _hour_bucket(self, ts_ms: int) -> int:
        return int(ts_ms // (3600 * 1000))

    def _disconnect_cloud_mqtt(self) -> None:
        if self._client:
            try:
                self._client.loop_stop()
            except Exception:
                pass
            try:
                self._client.disconnect()
            except Exception:
                pass
            self._client = None
        self._connected.clear()

    def _connect_cloud_mqtt(self) -> None:
        if mqtt is None:
            self._logger.warning("HourlyMqttSync: paho-mqtt 不可用，无法补传")
            return
        if not self._cfg.cloud_enabled:
            return

        # Parse broker url: mqtt://host:port or tcp://... (paho uses host/port)
        parsed = urlparse(self._cfg.cloud_broker_url)
        host = (parsed.hostname or "").strip() or "127.0.0.1"
        port = int(parsed.port or 1883)
        client_id = f"{self._device_id}{self._cfg.cloud_client_id_suffix}"

        self._disconnect_cloud_mqtt()

        c = create_mqtt_client(client_id)
        if self._cfg.cloud_username.strip():
            c.username_pw_set(self._cfg.cloud_username.strip(), self._cfg.cloud_password or None)

        def on_connect(_client, *_args):
            self._connected.set()
            self._logger.info("HourlyMqttSync: 已连接云端 MQTT %s:%d topic=%s", host, port, self._topic)

        def on_disconnect(_client, *_args):
            self._connected.clear()
            self._logger.warning("HourlyMqttSync: 云端 MQTT 已断开，将自动重连")

        c.on_connect = on_connect
        c.on_disconnect = on_disconnect
        try:
            c.connect(host, port, keepalive=30)
            c.loop_start()
            self._client = c
        except Exception as e:
            self._logger.warning("HourlyMqttSync: 连接云端 MQTT 失败: %s", e)
            self._client = None
            self._connected.clear()

    def _publish_one(self, payload_text: str) -> bool:
        """
        Publish one cached record and wait for broker ack (QoS1).
        Return True if published+acked, else False.
        """
        if not self._client or not self._connected.is_set():
            return False
        try:
            qos = max(0, min(2, int(self._cfg.publish_qos)))
            info = self._client.publish(self._topic, payload_text, qos=qos)
            ok = info.wait_for_publish(timeout=max(1.0, float(self._cfg.publish_timeout_seconds)))
            return bool(ok) and info.rc == 0
        except Exception as e:
            self._logger.debug("HourlyMqttSync: publish failed: %s", e)
            self._connected.clear()
            return False

    def _worker(self) -> None:
        if not self._cfg.enabled:
            self._logger.info("HourlyMqttSync: disabled")
            return

        self._connect_cloud_mqtt()

        # Hourly collection loop
        next_wait = self._next_wait()
        next_collection_at = time.time() + next_wait
        self._logger.info("HourlyMqttSync: 首次采集将在 %.0f 秒后触发", next_wait)

        while not self._stop.is_set():
            now = time.time()
            self._accumulate_snapshot(self._state.snapshot())

            # 1) Hourly snapshot -> SQLite (even if offline)
            if now >= next_collection_at:
                # Align timestamp to hour bucket boundary
                ts_ms_now = int(time.time() * 1000)
                bucket = self._hour_bucket(ts_ms_now)
                sample_ts_ms = bucket * 3600 * 1000
                payload = self._build_payload(sample_ts_ms)
                if payload is not None:
                    self._db.save_payload(self._device_id, bucket, payload)
                    self._logger.info("HourlyMqttSync: 已聚合并落盘 hour_bucket=%d", bucket)
                    if self._diag.enabled and self._hourly_diag_ticker.should_fire():
                        self._logger.info(
                            "[DIAG][HourlyMqttSync] 本地库=%s cloud_enabled=%s topic=%s",
                            self._cfg.local_db_path,
                            self._cfg.cloud_enabled,
                            self._topic,
                        )
                else:
                    self._logger.warning("HourlyMqttSync: 本小时无有效数据，跳过落盘")
                next_collection_at = now + self._next_wait()

            # 2) Flush cached records to cloud MQTT (catch-up)
            if self._cfg.cloud_enabled and (self._client is None or not self._connected.is_set()):
                # try reconnect (lightweight)
                self._connect_cloud_mqtt()

            unsynced = self._db.get_unsynced(limit=int(self._cfg.batch_sync_size))
            if not unsynced:
                # Sleep until next collection or short wait
                remaining = max(0.2, min(2.0, next_collection_at - time.time()))
                self._stop.wait(timeout=remaining)
                continue

            if not self._cfg.cloud_enabled:
                # Still collect to disk, but no upload configured
                self._stop.wait(timeout=max(0.5, float(self._cfg.min_flush_interval_seconds)))
                continue

            if not self._connected.is_set():
                self._stop.wait(timeout=max(0.5, float(self._cfg.min_flush_interval_seconds)))
                continue

            synced_ids: List[int] = []
            for row_id, payload_text in unsynced:
                if self._stop.is_set():
                    break
                if self._publish_one(payload_text):
                    synced_ids.append(int(row_id))
                else:
                    # offline / publish fail -> stop this round, keep cache
                    break

            if synced_ids:
                self._db.delete_records(synced_ids)
                self._logger.info("HourlyMqttSync: 云端补传成功 %d 条，已清理本地缓存", len(synced_ids))
                if self._diag.enabled:
                    self._logger.info("[DIAG][HourlyMqttSync] 本轮补传 id 数=%d", len(synced_ids))

            self._stop.wait(timeout=0.1)

    def start(self) -> None:
        self._thread = threading.Thread(target=self._worker, daemon=True, name="hourly-mqtt-sync")
        self._thread.start()
        self._logger.info("HourlyMqttSync started")

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)
        self._disconnect_cloud_mqtt()


# ------------------------------------------------------------------ #
#  UdsCommandRelay — 把外部命令转发给 vision_process 的 UDS socket
# ------------------------------------------------------------------ #

class UdsCommandRelay:
    """
    接收来自 MqttBridge 的模型切换指令，通过 Unix Domain Socket
    发给 vision_process（vision_process 内部有 UDS 服务器）。
    """

    def __init__(self, uds_path: str, logger: logging.Logger) -> None:
        self._uds_path = uds_path
        self._logger = logger

    def send(self, payload: Dict[str, Any]) -> bool:
        if not os.path.exists(self._uds_path):
            self._logger.warning("UdsCommandRelay: socket 不存在 %s", self._uds_path)
            return False
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
                s.settimeout(2.0)
                s.connect(self._uds_path)
                s.sendall(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
                resp = json.loads(s.recv(256).decode("utf-8"))
                ok = bool(resp.get("ok"))
                if ok:
                    self._logger.info("UdsCommandRelay: 指令已转发 %s", payload)
                else:
                    self._logger.warning("UdsCommandRelay: vision_process 返回失败")
                return ok
        except Exception as e:
            self._logger.warning("UdsCommandRelay: 发送失败: %s", e)
            return False


# ------------------------------------------------------------------ #
#  ErrorReporter — 将错误发布到 MQTT error_topic
# ------------------------------------------------------------------ #

class ErrorReporter:
    def __init__(self, cfg: RuntimeConfig, logger: logging.Logger) -> None:
        self._cfg = cfg.mqtt
        self._logger = logger
        self._client: Optional[Any] = None

    def attach(self, client: Any) -> None:
        self._client = client

    def report(self, code: str, message: str) -> None:
        self._logger.error("[%s] %s", code, message)
        if self._client is not None:
            try:
                self._client.publish(
                    self._cfg.error_topic,
                    json.dumps({"code": code, "message": message, "ts": time.time()},
                               ensure_ascii=False),
                    qos=0,
                )
            except Exception:
                pass


# ------------------------------------------------------------------ #
#  TransferProcess - Entry Point
# ------------------------------------------------------------------ #

class TransferProcess:
    def __init__(self, cfg: RuntimeConfig, logger: logging.Logger) -> None:
        self.cfg = cfg
        self.logger = logger
        self._stop = threading.Event()

        self.state = MergedState()
        self.relay = UdsCommandRelay(cfg.uds_path, logger)
        self.error_reporter = ErrorReporter(cfg, logger)
        self.bridge = MqttBridge(cfg, self.state, logger, on_model_switch=self._on_model_switch)
        self.hourly_sync = HourlyMqttSync(cfg, self.state, logger)

    def _on_model_switch(self, payload: Dict[str, Any]) -> None:
        """MqttBridge 收到模型切换指令时的回调。"""
        self.relay.send(payload)

    def start(self) -> None:
        self.bridge.start()
        self.hourly_sync.start()
        self.logger.info("=== TransferProcess started ===")

    def stop(self) -> None:
        self._stop.set()
        self.hourly_sync.stop()
        self.bridge.stop()
        self.logger.info("=== TransferProcess stopped ===")


def main() -> None:
    parser = argparse.ArgumentParser(description="Hive transfer process")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument(
        "--diagnostics",
        action="store_true",
        help="启用 MQTT 桥接与小时同步的诊断日志",
    )
    parser.add_argument("--verbose", action="store_true", help="日志级别 DEBUG")
    args = parser.parse_args()

    cfg = RuntimeConfig.from_yaml(args.config)
    apply_env_overrides(cfg)
    if args.diagnostics:
        cfg.diagnostics.enabled = True
    if args.verbose:
        cfg.logging.level = "DEBUG"
    logger = setup_logger(cfg.logging, name="transfer")
    proc = TransferProcess(cfg, logger)

    def _sig(sig, _frame):
        logger.info("TransferProcess: Received signal %s, stopping...", sig)
        proc.stop()

    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    try:
        proc.start()
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        logger.exception("TransferProcess exited with exception: %s", e)
    finally:
        proc.stop()


if __name__ == "__main__":
    main()
