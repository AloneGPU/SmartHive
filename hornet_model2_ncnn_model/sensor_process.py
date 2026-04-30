"""
sensor_process.py - Sensor Data Collection Process
==================================
Responsibilities:
  - Read DHT22 temperature and humidity (inside & outside)
  - Read HX711 scale (with median filtering)
  - Read GPS NMEA data
  - IR bee counter (GPIO interrupt mode)
  - Humidifier control (GPIO25, active-low, triggered by hornet detection via MQTT)
  - OLED display (SSD1306, I2C, 128x64)
  - Write sampling snapshots to SharedSensorState
  - Push telemetry via MQTT every N seconds
  - Archive data to backend /api/beehive hourly

Fix log (2026-04-03):
  [BUG-1] 外部DHT22复用 last_dht 计时器 → 几乎永远不读外部传感器，改为独立 last_dht_outside
  [BUG-2] _check_direction() 在 self._state._lock 持有期间被调用，而回调本身也在锁外，
           改为 IR 回调不持锁，仅用局部变量 + 独立 IR 锁避免嵌套锁死锁
  [BUG-3] MQTT payload 字段名用 temperature/humidity 而非 in_temp/in_humi，
           后端 dataMappingValidator 不识别 → 改为与文档一致的字段名
  [BUG-4] HourlyArchiver 只聚合 temp/humi，外部温湿度完全丢失 → 补全四路温湿度
  [FEAT-1] 新增 HumidifierController：胡蜂检测时触发 GPIO25（低电平30秒），5分钟冷却
  [FEAT-2] 新增 OLEDDisplayService：每秒刷新 SSD1306 显示蜂箱数据
  [FEAT-3] sensor_process 通过 MQTT 订阅 pi5/vision/result 以获取 hornet_count，
           用于触发加湿器
"""
from __future__ import annotations

import argparse
import gc
import json
import signal
import threading
import time
import zlib
import base64
import logging
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen

from config import RuntimeConfig, apply_env_overrides, setup_logger
from diagnostics_helper import DiagnosticTicker, format_sensor_snapshot, truncate_middle
from mqtt_support import connect_mqtt_with_retries, create_mqtt_client

try:
    import paho.mqtt.client as mqtt
except Exception:
    mqtt = None

try:
    import adafruit_dht
    import board as adafruit_board
except Exception:
    adafruit_dht = None
    adafruit_board = None

try:
    import serial as pyserial
    import pynmea2
except Exception:
    pyserial = None
    pynmea2 = None

try:
    from hx711 import HX711 as _HX711
except Exception:
    _HX711 = None

# OLED 依赖（adafruit-circuitpython-ssd1306 + pillow）
try:
    import board as _oled_board
    import busio
    import adafruit_ssd1306
    from PIL import Image, ImageDraw, ImageFont
    _OLED_AVAILABLE = True
except Exception:
    _OLED_AVAILABLE = False


# ------------------------------------------------------------------ #
#  Shared Sensor State
# ------------------------------------------------------------------ #

class SharedSensorState:
    """Thread-safe sensor state, exposed via get_snapshot()."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # 内部温湿度
        self.in_temp: float = 0.0
        self.in_humi: float = 0.0
        # 外部温湿度
        self.out_temp: float = 0.0
        self.out_humi: float = 0.0
        # 兼容旧字段（映射到内部温湿度）
        self.temp: float = 0.0
        self.humi: float = 0.0
        self.weight: float = 0.0
        self.in_count: int = 0
        self.out_count: int = 0
        self.lat: float = 0.0
        self.lon: float = 0.0
        # Vision 回写（通过 MQTT 订阅）
        self.hornet_count: int = 0
        self.fps: float = 0.0
        self.latency_ms: float = 0.0
        # 各类数据最近一次成功更新时间，避免把 0.0 误判为“无效值”
        self.inside_updated_at: float = 0.0
        self.outside_updated_at: float = 0.0
        self.weight_updated_at: float = 0.0
        self.gps_updated_at: float = 0.0
        self.vision_updated_at: float = 0.0

    def update_sensors(self, **kwargs: Any) -> None:
        with self._lock:
            now = time.time()
            touched_inside = False
            touched_outside = False
            touched_weight = False
            touched_gps = False
            touched_vision = False
            for k, v in kwargs.items():
                if hasattr(self, k):
                    setattr(self, k, v)
                    if k in ("in_temp", "in_humi", "temp", "humi"):
                        touched_inside = True
                    elif k in ("out_temp", "out_humi"):
                        touched_outside = True
                    elif k == "weight":
                        touched_weight = True
                    elif k in ("lat", "lon"):
                        touched_gps = True
                    elif k in ("hornet_count", "fps", "latency_ms"):
                        touched_vision = True
            if touched_inside:
                self.inside_updated_at = now
            if touched_outside:
                self.outside_updated_at = now
            if touched_weight:
                self.weight_updated_at = now
            if touched_gps:
                self.gps_updated_at = now
            if touched_vision:
                self.vision_updated_at = now

    def get_snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "in_temp": self.in_temp, "in_humi": self.in_humi,
                "out_temp": self.out_temp, "out_humi": self.out_humi,
                "temp": self.temp, "humi": self.humi,
                "weight": self.weight,
                "in_count": self.in_count, "out_count": self.out_count,
                "lat": self.lat, "lon": self.lon,
                "hornet_count": self.hornet_count,
                "fps": self.fps, "latency_ms": self.latency_ms,
                "inside_updated_at": self.inside_updated_at,
                "outside_updated_at": self.outside_updated_at,
                "weight_updated_at": self.weight_updated_at,
                "gps_updated_at": self.gps_updated_at,
                "vision_updated_at": self.vision_updated_at,
            }


# ------------------------------------------------------------------ #
#  SensorReader — DHT22 / HX711 / GPS / IR
# ------------------------------------------------------------------ #

class SensorReader:
    def __init__(self, cfg: RuntimeConfig, state: SharedSensorState, logger: logging.Logger) -> None:
        self._cfg = cfg.sensor
        self._diag = cfg.diagnostics
        self._summary_ticker = DiagnosticTicker(cfg.diagnostics.summary_interval_seconds)
        self._state = state
        self._logger = logger
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._weight_buf: List[float] = []
        # [BUG-2 FIX] 用独立的 IR 锁，不复用 state._lock，避免嵌套死锁
        self._ir_lock = threading.Lock()
        self._ir_outer_ts: Optional[float] = None
        self._ir_inner_ts: Optional[float] = None
        self._GPIO: Any = None

    # ---- DHT22 Init ----

    def _init_dht_inside(self) -> Any:
        if adafruit_dht is None or adafruit_board is None:
            return None
        try:
            pin = getattr(adafruit_board, f"D{self._cfg.dht_inside_gpio_pin}", None)
            if pin is None:
                raise ValueError(f"Invalid GPIO: D{self._cfg.dht_inside_gpio_pin}")
            dht = adafruit_dht.DHT22(pin)
            self._logger.info("SensorReader: 内部DHT22初始化成功 GPIO%d", self._cfg.dht_inside_gpio_pin)
            return dht
        except Exception as e:
            self._logger.warning("SensorReader: 内部DHT22初始化失败: %s", e)
            return None

    def _init_dht_outside(self) -> Any:
        if not self._cfg.dht_outside_enabled:
            return None
        if adafruit_dht is None or adafruit_board is None:
            return None
        try:
            pin = getattr(adafruit_board, f"D{self._cfg.dht_outside_gpio_pin}", None)
            if pin is None:
                raise ValueError(f"Invalid GPIO: D{self._cfg.dht_outside_gpio_pin}")
            dht = adafruit_dht.DHT22(pin)
            self._logger.info("SensorReader: 外部DHT22初始化成功 GPIO%d", self._cfg.dht_outside_gpio_pin)
            return dht
        except Exception as e:
            self._logger.warning("SensorReader: 外部DHT22初始化失败: %s", e)
            return None

    # ---- HX711 Init ----

    def _init_hx711(self) -> Any:
        if not self._cfg.hx711_enabled or _HX711 is None:
            if self._cfg.hx711_enabled:
                self._logger.warning("SensorReader: hx711 library not installed, weight unavailable")
            return None
        try:
            hx = _HX711(dout_pin=self._cfg.hx711_dout_pin, pd_sck_pin=self._cfg.hx711_sck_pin)
            hx.set_reading_format("MSB", "MSB")
            hx.set_reference_unit(self._cfg.hx711_reference_unit)
            hx.reset()
            if self._cfg.hx711_tare_on_start:
                self._logger.info("SensorReader: HX711 归零中...")
                hx.tare()
                self._logger.info("SensorReader: HX711 归零完成")
            self._logger.info("SensorReader: HX711初始化成功 DOUT=GPIO%d SCK=GPIO%d",
                              self._cfg.hx711_dout_pin, self._cfg.hx711_sck_pin)
            return hx
        except Exception as e:
            self._logger.warning("SensorReader: HX711初始化失败: %s", e)
            return None

    # ---- GPS Init ----

    def _init_gps(self) -> Any:
        if pyserial is None:
            return None
        try:
            ser = pyserial.Serial(self._cfg.gps_port, self._cfg.gps_baud, timeout=1)
            self._logger.info("SensorReader: GPS初始化成功 %s@%d", self._cfg.gps_port, self._cfg.gps_baud)
            return ser
        except Exception as e:
            self._logger.warning("SensorReader: GPS初始化失败: %s", e)
            return None

    # ---- IR Bee Counter Init ----

    def _init_ir(self) -> bool:
        if not self._cfg.ir_enabled:
            return False
        try:
            import RPi.GPIO as GPIO  # type: ignore
            self._GPIO = GPIO
            GPIO.setmode(GPIO.BCM)
            pull = GPIO.PUD_UP if self._cfg.ir_active_low else GPIO.PUD_DOWN
            GPIO.setup(self._cfg.ir_outer_pin, GPIO.IN, pull_up_down=pull)
            GPIO.setup(self._cfg.ir_inner_pin, GPIO.IN, pull_up_down=pull)
            edge = GPIO.FALLING if self._cfg.ir_active_low else GPIO.RISING
            bouncetime = max(10, int(self._cfg.ir_debounce_ms))
            GPIO.add_event_detect(self._cfg.ir_outer_pin, edge,
                                  callback=self._on_outer_triggered, bouncetime=bouncetime)
            GPIO.add_event_detect(self._cfg.ir_inner_pin, edge,
                                  callback=self._on_inner_triggered, bouncetime=bouncetime)
            self._logger.info("SensorReader: IR初始化成功 outer=GPIO%d inner=GPIO%d active_low=%s",
                              self._cfg.ir_outer_pin, self._cfg.ir_inner_pin, self._cfg.ir_active_low)
            return True
        except Exception as e:
            self._logger.warning("SensorReader: IR初始化失败: %s", e)
            return False

    def _cleanup_ir(self) -> None:
        try:
            GPIO = self._GPIO
            if GPIO is not None:
                GPIO.remove_event_detect(self._cfg.ir_outer_pin)
                GPIO.remove_event_detect(self._cfg.ir_inner_pin)
                GPIO.cleanup([self._cfg.ir_outer_pin, self._cfg.ir_inner_pin])
        except Exception:
            pass

    # ---- IR Callbacks (BUG-2 FIX: 使用独立 IR 锁，不嵌套 state._lock) ----

    def _on_outer_triggered(self, channel: int) -> None:
        now_ms = time.monotonic() * 1000
        with self._ir_lock:
            self._ir_outer_ts = now_ms
            self._check_direction_locked()

    def _on_inner_triggered(self, channel: int) -> None:
        now_ms = time.monotonic() * 1000
        with self._ir_lock:
            self._ir_inner_ts = now_ms
            self._check_direction_locked()

    def _check_direction_locked(self) -> None:
        """必须在 _ir_lock 持有期间调用。检查方向后写 state（state 有自己的锁）。"""
        outer = self._ir_outer_ts
        inner = self._ir_inner_ts
        if outer is None or inner is None:
            return
        diff = abs(inner - outer)
        if diff > self._cfg.ir_direction_window_ms:
            self._ir_outer_ts = None
            self._ir_inner_ts = None
            return
        if outer < inner:
            # 外侧先触发 → 蜜蜂进入
            with self._state._lock:
                self._state.in_count += 1
                total = self._state.in_count
            if self._diag.enabled:
                self._logger.info("[DIAG][IR] 蜜蜂进入 total_in=%d", total)
            else:
                self._logger.debug("IR: 蜜蜂进入 total_in=%d", total)
        else:
            # 内侧先触发 → 蜜蜂离开
            with self._state._lock:
                self._state.out_count += 1
                total = self._state.out_count
            if self._diag.enabled:
                self._logger.info("[DIAG][IR] 蜜蜂离开 total_out=%d", total)
            else:
                self._logger.debug("IR: 蜜蜂离开 total_out=%d", total)
        self._ir_outer_ts = None
        self._ir_inner_ts = None

    # ---- HX711 Read (Median Filter) ----

    def _read_weight(self, hx: Any) -> Optional[float]:
        try:
            raw = hx.get_weight(5)
            hx.power_down()
            hx.power_up()
            window = max(1, self._cfg.hx711_filter_window)
            self._weight_buf.append(float(raw))
            if len(self._weight_buf) > window:
                self._weight_buf.pop(0)
            return max(0.0, round(sorted(self._weight_buf)[len(self._weight_buf) // 2], 1))
        except Exception as e:
            self._logger.debug("SensorReader: HX711读取异常: %s", e)
            return None

    # ---- Main Worker Loop ----

    def _worker(self) -> None:
        dht_inside = self._init_dht_inside()
        dht_outside = self._init_dht_outside()
        hx = self._init_hx711()
        gps = self._init_gps()
        self._init_ir()

        if self._diag.enabled:
            self._logger.info(
                "[DIAG][SensorReader] 硬件初始化: DHT内=%s DHT外=%s HX711=%s GPS=%s IR=%s",
                "OK" if dht_inside else "—",
                "OK" if dht_outside else "—",
                "OK" if hx else "—",
                "OK" if gps else "—",
                "OK" if self._cfg.ir_enabled else "关",
            )

        last_dht_inside = 0.0
        # [BUG-1 FIX] 外部DHT22独立计时器，避免总是被 inside 的时间跳过
        last_dht_outside = 0.0
        last_hx = 0.0

        while not self._stop.is_set():
            now = time.time()

            # 内部DHT22
            if dht_inside is not None and (now - last_dht_inside) >= self._cfg.dht_read_interval:
                try:
                    t = dht_inside.temperature
                    h = dht_inside.humidity
                    upd: Dict[str, Any] = {}
                    if t is not None:
                        upd["in_temp"] = float(t)
                        upd["temp"] = float(t)      # 兼容字段
                    if h is not None:
                        upd["in_humi"] = float(h)
                        upd["humi"] = float(h)      # 兼容字段
                    if upd:
                        self._state.update_sensors(**upd)
                        if self._diag.enabled:
                            self._logger.info(
                                "[DIAG][DHT内] %.1f°C %.1f%%", float(t or 0), float(h or 0)
                            )
                        else:
                            self._logger.debug("DHT22内: %.1f°C %.1f%%", t or 0, h or 0)
                except Exception as e:
                    self._logger.debug("SensorReader: 内部DHT22读取异常: %s", e)
                last_dht_inside = now

            # [BUG-1 FIX] 外部DHT22使用独立计时器 last_dht_outside
            if dht_outside is not None and (now - last_dht_outside) >= self._cfg.dht_read_interval:
                try:
                    t_out = dht_outside.temperature
                    h_out = dht_outside.humidity
                    upd_out: Dict[str, Any] = {}
                    if t_out is not None:
                        upd_out["out_temp"] = float(t_out)
                    if h_out is not None:
                        upd_out["out_humi"] = float(h_out)
                    if upd_out:
                        self._state.update_sensors(**upd_out)
                        if self._diag.enabled:
                            self._logger.info(
                                "[DIAG][DHT外] %.1f°C %.1f%%",
                                float(t_out or 0),
                                float(h_out or 0),
                            )
                        else:
                            self._logger.debug("DHT22外: %.1f°C %.1f%%", t_out or 0, h_out or 0)
                except Exception as e:
                    self._logger.debug("SensorReader: 外部DHT22读取异常: %s", e)
                last_dht_outside = now

            # HX711
            if hx is not None and (now - last_hx) >= self._cfg.hx711_read_interval:
                w = self._read_weight(hx)
                if w is not None:
                    self._state.update_sensors(weight=w)
                    if self._diag.enabled:
                        self._logger.debug("[DIAG][HX711] weight=%.2f kg (median window)", w)
                last_hx = now

            # GPS（非阻塞）
            if gps is not None:
                try:
                    if gps.in_waiting:
                        line = gps.readline().decode("ascii", errors="ignore")
                        if "$GPGGA" in line and pynmea2 is not None:
                            msg = pynmea2.parse(line)
                            if msg.latitude and msg.longitude:
                                la, lo = float(msg.latitude), float(msg.longitude)
                                self._state.update_sensors(lat=la, lon=lo)
                                if self._diag.enabled:
                                    self._logger.info("[DIAG][GPS] 定位更新 lat=%.6f lon=%.6f", la, lo)
                except Exception as e:
                    self._logger.debug("SensorReader: GPS读取异常: %s", e)

            if self._diag.enabled and self._summary_ticker.should_fire():
                self._logger.info(
                    "[DIAG][SensorReader] %s",
                    format_sensor_snapshot(self._state.get_snapshot()),
                )

            time.sleep(0.05)

    def start(self) -> None:
        self._thread = threading.Thread(target=self._worker, daemon=True, name="sensor-reader")
        self._thread.start()
        self._logger.info("SensorReader 已启动")

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)
        self._cleanup_ir()


# ------------------------------------------------------------------ #
#  MqttTelemetryPublisher — 实时遥测发布
# ------------------------------------------------------------------ #

class MqttTelemetryPublisher:
    def __init__(self, cfg: RuntimeConfig, state: SharedSensorState, logger: logging.Logger) -> None:
        self._cfg = cfg.mqtt
        self._diag = cfg.diagnostics
        self._state = state
        self._logger = logger
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._client: Optional[Any] = None

    def _wrap_payload(self, payload: Dict[str, Any]) -> str:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if not getattr(self._cfg, "compress_payload", False):
            return raw.decode("utf-8")
        compressed = zlib.compress(raw, level=6)
        wrapper = {
            "compressed": True,
            "codec": "zlib+base64",
            "payload": base64.b64encode(compressed).decode("ascii"),
        }
        return json.dumps(wrapper, ensure_ascii=False, separators=(",", ":"))

    def _build_payload(self) -> Dict[str, Any]:
        snap = self._state.get_snapshot()
        sensors: List[Dict[str, Any]] = [
            {"type": "bee_in", "value": int(snap["in_count"]), "unit": "count"},
            {"type": "bee_out", "value": int(snap["out_count"]), "unit": "count"},
        ]
        if snap["inside_updated_at"] > 0:
            sensors.extend([
                {"type": "temperature", "value": round(float(snap["temp"]), 1), "unit": "C"},
                {"type": "humidity", "value": round(float(snap["humi"]), 1), "unit": "%"},
            ])
        if snap["outside_updated_at"] > 0:
            sensors.extend([
                {"type": "out_temp", "value": round(float(snap["out_temp"]), 1), "unit": "C"},
                {"type": "out_humi", "value": round(float(snap["out_humi"]), 1), "unit": "%"},
            ])
        if snap["weight_updated_at"] > 0:
            sensors.append({"type": "weight", "value": round(float(snap["weight"]), 2), "unit": "kg"})
        if snap["gps_updated_at"] > 0:
            sensors.extend([
                {"type": "gps_lat", "value": float(snap["lat"]), "unit": "deg"},
                {"type": "gps_lon", "value": float(snap["lon"]), "unit": "deg"},
            ])
        if snap["vision_updated_at"] > 0:
            sensors.extend([
                {"type": "hornet_count", "value": int(snap["hornet_count"]), "unit": "count"},
                {"type": "fps", "value": round(float(snap["fps"]), 2), "unit": "fps"},
                {"type": "latency_ms", "value": round(float(snap["latency_ms"]), 2), "unit": "ms"},
            ])
        return {
            "deviceId": self._cfg.client_id,
            "timestamp": int(time.time() * 1000),
            "qos": int(getattr(self._cfg, "publish_qos", 1)),
            "sensors": sensors,
            "status": {"online": True},
        }

    def _worker(self) -> None:
        if not getattr(self._cfg, "enabled", False):
            self._logger.info("MqttTelemetryPublisher: 已禁用 (mqtt.enabled=false)")
            return
        if mqtt is None:
            self._logger.warning("MqttTelemetryPublisher: paho-mqtt 不可用")
            return

        client = create_mqtt_client(f"{self._cfg.client_id}-telemetry")
        if getattr(self._cfg, "username", "").strip():
            client.username_pw_set(self._cfg.username, self._cfg.password or None)

        def on_disconnect(_client: Any, *_args: Any) -> None:
            self._logger.warning("MqttTelemetryPublisher: MQTT 已断开，等待自动重连")

        client.on_disconnect = on_disconnect
        self._client = client
        if not connect_mqtt_with_retries(
            client,
            self._cfg.host,
            self._cfg.port,
            30,
            self._stop,
            self._logger,
            label="MqttTelemetryPublisher",
        ):
            return

        interval = max(0.5, float(getattr(self._cfg, "publish_interval_seconds", 2.0)))
        while not self._stop.wait(timeout=interval):
            try:
                payload = self._build_payload()
                if not payload["sensors"]:
                    continue
                body = self._wrap_payload(payload)
                client.publish(
                    self._cfg.data_topic,
                    body,
                    qos=max(0, min(2, int(getattr(self._cfg, "publish_qos", 1)))),
                )
                if self._diag.enabled and getattr(self._diag, "log_mqtt_payload_out", False):
                    self._logger.info("[DIAG][MQTT→sensor] %s", truncate_middle(body, 220))
            except Exception as e:
                self._logger.debug("MqttTelemetryPublisher: 发布失败: %s", e)

    def start(self) -> None:
        self._thread = threading.Thread(target=self._worker, daemon=True, name="mqtt-telemetry")
        self._thread.start()
        self._logger.info("MqttTelemetryPublisher 已启动")

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)
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
#  VisionResultReceiver — 接收视觉进程胡蜂结果
# ------------------------------------------------------------------ #

class VisionResultReceiver:
    TOPIC = "pi5/vision/result"

    def __init__(self, cfg: RuntimeConfig, state: SharedSensorState, logger: logging.Logger) -> None:
        self._cfg = cfg.mqtt
        self._state = state
        self._logger = logger
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._client: Optional[Any] = None

    def _worker(self) -> None:
        if not getattr(self._cfg, "enabled", False):
            self._logger.info("VisionResultReceiver: 已禁用 (mqtt.enabled=false)")
            return
        if mqtt is None:
            self._logger.warning("VisionResultReceiver: paho-mqtt 不可用")
            return

        client = create_mqtt_client(f"{self._cfg.client_id}-vision-rx")
        if getattr(self._cfg, "username", "").strip():
            client.username_pw_set(self._cfg.username, self._cfg.password or None)

        def on_connect(c: Any, *_args: Any) -> None:
            c.subscribe(self.TOPIC, qos=0)
            self._logger.info("VisionResultReceiver: 已订阅 %s", self.TOPIC)

        def on_message(_client: Any, _userdata: Any, msg: Any) -> None:
            try:
                data = json.loads(msg.payload.decode("utf-8"))
            except Exception as e:
                self._logger.debug("VisionResultReceiver: JSON 解析失败: %s", e)
                return
            try:
                self._state.update_sensors(
                    hornet_count=int(data.get("hornet_count", 0)),
                    fps=float(data.get("fps", 0.0)),
                    latency_ms=float(data.get("latency_ms", 0.0)),
                )
            except Exception as e:
                self._logger.debug("VisionResultReceiver: 状态更新失败: %s", e)

        client.on_connect = on_connect
        client.on_message = on_message
        self._client = client
        if not connect_mqtt_with_retries(
            client,
            self._cfg.host,
            self._cfg.port,
            30,
            self._stop,
            self._logger,
            label="VisionResultReceiver",
        ):
            return

        while not self._stop.wait(timeout=1.0):
            pass

    def start(self) -> None:
        self._thread = threading.Thread(target=self._worker, daemon=True, name="vision-result-rx")
        self._thread.start()
        self._logger.info("VisionResultReceiver 已启动")

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)
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
#  HourlyArchiver — 每小时归档 [BUG-4 FIX]
# ------------------------------------------------------------------ #

class HourlyArchiver:
    def __init__(self, cfg: RuntimeConfig, state: SharedSensorState, logger: logging.Logger) -> None:
        self._cfg = cfg.archive
        self._sensor_cfg = cfg.sensor
        self._diag = cfg.diagnostics
        self._arch_diag_ticker = DiagnosticTicker(60.0)
        self._state = state
        self._logger = logger
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._reset()

    def _reset(self) -> None:
        # [BUG-4 FIX] 分别聚合内外温湿度
        self._in_temp_sum = 0.0
        self._in_humi_sum = 0.0
        self._out_temp_sum = 0.0
        self._out_humi_sum = 0.0
        self._out_n = 0           # 外部传感器有效采样次数（可能小于 _n）
        self._weight_sum = 0.0
        self._weight_n = 0
        self._bees_in_peak = 0
        self._bees_out_peak = 0
        self._hornet_events = 0
        self._n = 0
        self._last_lat = 0.0
        self._last_lon = 0.0

    def _is_recent(self, ts: float, max_age_s: float) -> bool:
        return ts > 0 and (time.time() - ts) <= max_age_s

    def tick(self) -> None:
        snap = self._state.get_snapshot()
        if self._diag.enabled and self._arch_diag_ticker.should_fire():
            with self._lock:
                n = self._n
                on = self._out_n
            self._logger.info(
                "[DIAG][HourlyArchiver] 聚合进度 n=%d out_n=%d 当前蜂箱 in/out=%d/%d hornet=%d",
                n,
                on,
                snap["in_count"],
                snap["out_count"],
                snap["hornet_count"],
            )
        with self._lock:
            inside_fresh = self._is_recent(
                float(snap["inside_updated_at"]),
                max(30.0, float(self._sensor_cfg.dht_read_interval) * 3.0),
            )
            outside_fresh = self._is_recent(
                float(snap["outside_updated_at"]),
                max(30.0, float(self._sensor_cfg.dht_read_interval) * 3.0),
            )
            weight_fresh = self._is_recent(
                float(snap["weight_updated_at"]),
                max(10.0, float(self._sensor_cfg.hx711_read_interval) * 3.0),
            )

            if inside_fresh:
                self._in_temp_sum += snap["in_temp"]
                self._in_humi_sum += snap["in_humi"]
                self._n += 1
            if outside_fresh:
                self._out_temp_sum += snap["out_temp"]
                self._out_humi_sum += snap["out_humi"]
                self._out_n += 1
            if weight_fresh:
                self._weight_sum += snap["weight"]
                self._weight_n += 1
            self._bees_in_peak = max(self._bees_in_peak, snap["in_count"])
            self._bees_out_peak = max(self._bees_out_peak, snap["out_count"])
            if snap["hornet_count"] > 0:
                self._hornet_events += 1
            if float(snap["gps_updated_at"]) > 0:
                self._last_lat = snap["lat"]
                self._last_lon = snap["lon"]

    def _snapshot_and_reset(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            if self._n == 0:
                return None
            in_t = round(self._in_temp_sum / self._n, 2)
            in_h = round(self._in_humi_sum / self._n, 2)
            out_t = round(self._out_temp_sum / self._out_n, 2) if self._out_n > 0 else in_t
            out_h = round(self._out_humi_sum / self._out_n, 2) if self._out_n > 0 else in_h
            w = round(self._weight_sum / self._weight_n, 2) if self._weight_n > 0 else 0.0
            rec: Dict[str, Any] = {
                # 兼容字段（优先内部温湿度）
                "temperature": in_t,
                "humidity": in_h,
                # 标准字段
                "insideTemperature": in_t,
                "insideHumidity": in_h,
                "outsideTemperature": out_t,
                "outsideHumidity": out_h,
                "weight": w,
                "beesIn": self._bees_in_peak,
                "beesOut": self._bees_out_peak,
                "hornetsDetected": self._hornet_events,
            }
            if self._last_lat != 0.0:
                rec["latitude"] = self._last_lat
                rec["longitude"] = self._last_lon
            self._reset()
            return rec

    def _post(self, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = Request(self._cfg.beehive_url, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Content-Length", str(len(body)))
        token = (self._cfg.api_token or "").strip()
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        with urlopen(req, timeout=max(2.0, float(self._cfg.timeout_seconds))) as r:
            code = int(getattr(r, "status", r.getcode()))
            if code not in (200, 201, 204):
                raise RuntimeError(f"HTTP {code}")

    def _flush(self) -> None:
        rec = self._snapshot_and_reset()
        if rec is None:
            self._logger.warning("HourlyArchiver: 本小时无有效采样，跳过归档")
            return
        self._logger.info(
            "HourlyArchiver: 归档 in_temp=%.1f out_temp=%.1f weight=%.1f beesIn=%d hornets=%d",
            rec["insideTemperature"], rec["outsideTemperature"],
            rec["weight"], rec["beesIn"], rec["hornetsDetected"]
        )
        for attempt in range(1, self._cfg.max_retries + 1):
            try:
                self._post(rec)
                self._logger.info("HourlyArchiver: 归档成功（第%d次）", attempt)
                return
            except Exception as e:
                self._logger.warning("HourlyArchiver: 第%d次归档失败: %s", attempt, e)
                if attempt < self._cfg.max_retries:
                    self._stop.wait(timeout=30)
        self._logger.error("HourlyArchiver: 重试%d次后放弃，数据已丢弃", self._cfg.max_retries)

    def _next_wait(self) -> float:
        if self._cfg.align_to_hour and self._cfg.interval_seconds == 3600:
            return 3600.0 - (time.time() % 3600.0)
        return float(self._cfg.interval_seconds)

    def _loop(self) -> None:
        wait = self._next_wait()
        self._logger.info("HourlyArchiver: 首次归档将在 %.0f 秒后触发", wait)
        while not self._stop.wait(timeout=wait):
            self._flush()
            wait = self._next_wait()

    def start(self) -> None:
        if not self._cfg.enabled:
            return
        self._thread = threading.Thread(target=self._loop, daemon=True, name="hourly-archiver")
        self._thread.start()
        self._logger.info("HourlyArchiver 已启动 → %s", self._cfg.beehive_url)

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)


# ------------------------------------------------------------------ #
#  HumidifierController — 胡蜂检测触发GPIO25加湿器 [FEAT-1]
# ------------------------------------------------------------------ #

class HumidifierController:
    COOLDOWN_SECONDS = 300

    def __init__(self, cfg: RuntimeConfig, state: SharedSensorState, logger: logging.Logger) -> None:
        self._cfg = cfg.sensor
        self._diag = cfg.diagnostics
        self._hum_ticker = DiagnosticTicker(cfg.diagnostics.summary_interval_seconds)
        self._state = state
        self._logger = logger
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._gpio: Any = None
        self._last_trigger_time: float = 0.0
        self._is_active: bool = False

    def _init_gpio(self) -> bool:
        try:
            import RPi.GPIO as GPIO
            self._gpio = GPIO
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(self._cfg.humidifier_gpio_pin, GPIO.OUT)
            active = GPIO.LOW if self._cfg.humidifier_active_low else GPIO.HIGH
            inactive = GPIO.HIGH if self._cfg.humidifier_active_low else GPIO.LOW
            GPIO.output(self._cfg.humidifier_gpio_pin, inactive)
            self._logger.info("HumidifierController: GPIO%d 初始化完成 (低电平触发=%s)",
                           self._cfg.humidifier_gpio_pin, self._cfg.humidifier_active_low)
            return True
        except ImportError:
            self._logger.warning("HumidifierController: RPi.GPIO 未安装，加湿器功能禁用")
            return False
        except Exception as e:
            self._logger.warning("HumidifierController: GPIO初始化失败: %s", e)
            return False

    def _worker(self) -> None:
        if not self._init_gpio():
            return
        self._logger.info("HumidifierController 已启动，监控 hornet_count...")
        while not self._stop.is_set():
            try:
                snap = self._state.get_snapshot()
                hc = snap.get("hornet_count", 0)
                now = time.time()
                if self._diag.enabled and self._hum_ticker.should_fire():
                    self._logger.info(
                        "[DIAG][加湿器] hornet_count=%d 继电器激活=%s GPIO%d",
                        int(hc),
                        self._is_active,
                        self._cfg.humidifier_gpio_pin,
                    )

                if hc > 0 and (now - self._last_trigger_time) > self.COOLDOWN_SECONDS:
                    self._trigger(now)
                elif self._is_active and (now - self._last_trigger_time) > (self._cfg.humidifier_trigger_duration_ms / 1000.0):
                    self._deactivate()
            except Exception as e:
                self._logger.debug("HumidifierController: 循环错误: %s", e)
            time.sleep(1.0)

    def _trigger(self, now: float) -> None:
        try:
            inactive = self._gpio.HIGH if self._cfg.humidifier_active_low else self._gpio.LOW
            active = self._gpio.LOW if self._cfg.humidifier_active_low else self._gpio.HIGH
            self._gpio.output(self._cfg.humidifier_gpio_pin, active)
            self._is_active = True
            self._last_trigger_time = now
            duration_s = self._cfg.humidifier_trigger_duration_ms / 1000.0
            self._logger.warning("HumidifierController: 🐝 检测到胡蜂! 加湿器已启动 (%.1f秒)", duration_s)
        except Exception as e:
            self._logger.error("HumidifierController: 触发失败: %s", e)

    def _deactivate(self) -> None:
        try:
            inactive = self._gpio.HIGH if self._cfg.humidifier_active_low else self._gpio.LOW
            self._gpio.output(self._cfg.humidifier_gpio_pin, inactive)
            self._is_active = False
            self._logger.info("HumidifierController: 加湿器已关闭")
        except Exception as e:
            self._logger.error("HumidifierController: 关闭失败: %s", e)

    def start(self) -> None:
        if not getattr(self._cfg, 'humidifier_enabled', False):
            self._logger.info("HumidifierController: 已禁用 (humidifier_enabled=false)")
            return
        self._thread = threading.Thread(target=self._worker, daemon=True, name="humidifier")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._is_active:
            try:
                self._deactivate()
            except Exception:
                pass
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        if self._gpio:
            try:
                self._gpio.cleanup()
            except Exception:
                pass


# ------------------------------------------------------------------ #
#  OLEDDisplayService — SSD1306实时温湿度显示 [FEAT-2]
# ------------------------------------------------------------------ #

class OLEDDisplayService:

    def __init__(self, cfg: RuntimeConfig, state: SharedSensorState, logger: logging.Logger) -> None:
        self._cfg = cfg.sensor
        self._diag = cfg.diagnostics
        self._oled_ticker = DiagnosticTicker(max(12.0, cfg.diagnostics.summary_interval_seconds))
        self._state = state
        self._logger = logger
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._oled: Any = None
        self._image: Any = None
        self._draw: Any = None
        self._font: Any = None

    def _init_oled(self) -> bool:
        if not _OLED_AVAILABLE:
            self._logger.warning("OLEDDisplayService: OLED依赖库未安装，显示功能禁用")
            self._logger.warning("请执行: pip install adafruit-circuitpython-ssd1306 pillow")
            return False
        try:
            import board as _b
            import busio
            i2c = busio.I2C(_b.SCL, _b.SDA)
            addr = int(str(self._cfg.oled_i2c_address), 16)
            self._oled = adafruit_ssd1306.SSD1306_I2C(
                self._cfg.oled_width, self._cfg.oled_height, i2c, addr=addr
            )
            from PIL import Image, ImageDraw, ImageFont
            self._image = Image.new('1', (self._cfg.oled_width, self._cfg.oled_height))
            self._draw = ImageDraw.Draw(self._image)
            try:
                self._font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 10)
            except Exception:
                self._font = ImageFont.load_default()
            self._oled.fill(0)
            self._oled.show()
            self._logger.info("OLEDDisplayService: OLED初始化成功 (%dx%d @ 0x%02X)",
                           self._cfg.oled_width, self._cfg.oled_height, addr)
            return True
        except Exception as e:
            self._logger.warning("OLEDDisplayService: 初始化失败: %s", e)
            return False

    def _render_frame(self) -> None:
        try:
            self._image.fill(0)
            self._draw = ImageDraw.Draw(self._image)
            snap = self._state.get_snapshot()

            self._draw.text((0, 0), "SmartHive Monitor", fill=255, font=self._font)
            
            in_temp = snap.get('in_temp', 0)
            in_humi = snap.get('in_humi', 0)
            out_temp = snap.get('out_temp', 0)
            out_humi = snap.get('out_humi', 0)
            weight = snap.get('weight', 0)
            hornets = snap.get('hornet_count', 0)

            self._draw.text((0, 14), f"IN:{in_temp:5.1f}C/{in_humi:5.1f}%", fill=255, font=self._font)
            self._draw.text((0, 26), f"OUT:{out_temp:4.1f}C/{out_humi:4.1f}%", fill=255, font=self._font)
            self._draw.text((0, 38), f"W:{weight:5.1f}kg H:{hornets}", fill=255, font=self._font)
            
            status = "ALERT" if hornets > 0 else "OK"
            self._draw.text((0, 50), f"Status:{status}", fill=255, font=self._font)

            self._oled.image(self._image)
            self._oled.show()
            if self._diag.enabled and self._oled_ticker.should_fire():
                self._logger.debug("[DIAG][OLED] 刷新一帧 OK")
        except Exception as e:
            self._logger.debug("OLEDDisplayService: 渲染失败: %s", e)

    def _worker(self) -> None:
        if not self._init_oled():
            return
        interval = max(0.5, float(getattr(self._cfg, 'oled_refresh_interval', 1.0)))
        self._logger.info("OLEDDisplayService 已启动 (刷新间隔=%.1fs)", interval)
        while not self._stop.is_set():
            self._render_frame()
            self._stop.wait(timeout=interval)

    def start(self) -> None:
        if not getattr(self._cfg, 'oled_enabled', False):
            self._logger.info("OLEDDisplayService: 已禁用 (oled_enabled=false)")
            return
        self._thread = threading.Thread(target=self._worker, daemon=True, name="oled-display")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        if self._oled:
            try:
                self._oled.fill(0)
                self._oled.show()
            except Exception:
                pass


# ------------------------------------------------------------------ #
#  SensorProcess — 主编排器
# ------------------------------------------------------------------ #

class SensorProcess:
    def __init__(self, cfg: RuntimeConfig, logger: logging.Logger) -> None:
        self.cfg = cfg
        self.logger = logger
        self._stop = threading.Event()
        self.state = SharedSensorState()
        self.reader = SensorReader(cfg, self.state, logger)
        self.publisher = MqttTelemetryPublisher(cfg, self.state, logger)
        self.archiver = HourlyArchiver(cfg, self.state, logger)
        self.humidifier = HumidifierController(cfg, self.state, logger)
        self.oled = OLEDDisplayService(cfg, self.state, logger)
        self.vision_rx = VisionResultReceiver(cfg, self.state, logger)

    def start(self) -> None:
        self.reader.start()
        self.publisher.start()
        self.archiver.start()
        self.vision_rx.start()      # 先连好 MQTT 再启动加湿器
        self.humidifier.start()
        self.oled.start()
        self.logger.info("=== SensorProcess 已启动（含加湿器+OLED）===")

    def stop(self) -> None:
        self._stop.set()
        self.oled.stop()
        self.humidifier.stop()
        self.vision_rx.stop()
        self.archiver.stop()
        self.publisher.stop()
        self.reader.stop()
        self.logger.info("=== SensorProcess 已停止 ===")

    def run_forever(self) -> None:
        while not self._stop.is_set():
            self.archiver.tick()
            time.sleep(0.1)
            if int(time.time()) % 60 == 0:
                gc.collect()


def main() -> None:
    parser = argparse.ArgumentParser(description="Hive sensor collection process")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument(
        "--diagnostics",
        action="store_true",
        help="启用各传感器/MQTT/OLED/加湿器/归档的诊断日志（等同 diagnostics.enabled）",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="日志级别设为 DEBUG（非常详细）",
    )
    args = parser.parse_args()

    cfg = RuntimeConfig.from_yaml(args.config)
    apply_env_overrides(cfg)
    if args.diagnostics:
        cfg.diagnostics.enabled = True
    if args.verbose:
        cfg.logging.level = "DEBUG"
    logger = setup_logger(cfg.logging, name="sensor")
    if cfg.diagnostics.enabled:
        logger.info("诊断模式已开启（summary 间隔 %.1fs）", cfg.diagnostics.summary_interval_seconds)
    proc = SensorProcess(cfg, logger)

    def _sig(sig, _frame):
        logger.info("SensorProcess: 收到信号 %s，正在停止...", sig)
        proc.stop()

    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    try:
        proc.start()
        proc.run_forever()
    except Exception as e:
        logger.exception("SensorProcess 异常退出: %s", e)
    finally:
        proc.stop()


if __name__ == "__main__":
    main()
