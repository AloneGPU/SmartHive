#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
transfer_process.py — 树莓派侧「数据传输 / 汇聚」主程序
======================================================
本文件是蜂箱边缘端数据链路的枢纽（与 launch.sh 中第三个进程一致），负责：

  - 订阅 sensor_process、vision_process 发布的 MQTT 数据
  - 汇聚温湿度、重量、进出蜂、胡蜂检测、视觉 FPS/延迟 等
  - 经 HTTP（/api/iot/ingest、/api/beehive 等）上报后端 MySQL
  - 可选：断网时 SQLite 离线缓存、恢复后自动补传

数据流（概念）::

  sensor_process ──MQTT──► transfer_process ──HTTP(/api/iot/ingest 等)──► 后端
  vision_process  ──MQTT──►      │                                      │
                                 │                                      ├── 入库
                                 │                                      └── realtimeHub → 浏览器 SSE

说明：
  - ``hardware/pi_dht22_mqtt_test.py`` 仅为独立 DHT MQTT 测试脚本，不属于本目录三进程流水线。
  - 正式联调请使用 ``launch.sh``：sensor → vision → **transfer**（本程序）。

离线缓存（Checkpoint/Resume）：
  网络不可用时写入本地 SQLite，恢复后按服务端确认再删缓存。

Usage:
  python3 transfer_process.py --config config.yaml

Dependencies:
  pip install paho-mqtt requests pyyaml sqlite3（sqlite3 为内置）
"""
import argparse
import time
import json
import threading
import logging
import signal
import socket
import queue
import os
import zlib
import base64
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from contextlib import contextmanager

try:
    from paho.mqtt.enums import CallbackAPIVersion as _CBVersion
    from paho.mqtt.client import Client as _MqttClient
    _PAHO_V2 = True
except Exception:
    _PAHO_V2 = False
    import paho.mqtt.client as mqtt

try:
    import requests
except ImportError:
    print("[ERROR] requests library not found. Install with: pip install requests")
    exit(1)

try:
    import sqlite3
except ImportError:
    print("[ERROR] sqlite3 library not found (should be built-in)")
    exit(1)

# Global shutdown flag
STOP = False


def _normalize_backend_base_url(url: str) -> str:
    """
    archive.beehive_url / SMART_HIVE_BEEHIVE_URL 可能为：
    - 根地址 http://host:3001（transfer 会拼 /api/beehive、/api/iot/ingest）
    - 完整 http://host:3001/api/beehive（与 sensor_process HourlyArchiver 一致）
    统一成根地址，避免 /api/beehive/api/beehive 双路径错误。
    """
    u = (url or "").strip().rstrip("/")
    if u.endswith("/api/beehive"):
        return u[: -len("/api/beehive")].rstrip("/")
    return u


def _get_lan_ip() -> str:
    """Best-effort LAN IP used by browsers to reach the Pi video dashboard."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
    except Exception:
        pass
    try:
        ip = socket.gethostbyname(socket.gethostname())
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass
    return ""

# ============================================================================
# SQLite-based Offline Cache (Checkpoint/Resume)
# ============================================================================

class OfflineCache:
    """
    SQLite-based offline cache for checkpoint/resume functionality.
    Stores unsent data locally and automatically resumes upload when network recovers.
    """

    def __init__(self, db_path: str = "transfer_cache.db", logger: logging.Logger = None):
        self.db_path = db_path
        self.logger = logger or logging.getLogger(__name__)
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self):
        """Initialize SQLite database with cache table."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS data_cache (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        data_type TEXT NOT NULL,
                        payload TEXT NOT NULL,
                        timestamp INTEGER NOT NULL,
                        retry_count INTEGER DEFAULT 0,
                        created_at TEXT NOT NULL,
                        UNIQUE(data_type, timestamp)
                    )
                """)
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_timestamp
                    ON data_cache(timestamp ASC)
                """)
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_data_type
                    ON data_cache(data_type ASC)
                """)
                conn.commit()
                self.logger.info(f"OfflineCache initialized: {self.db_path}")
        except Exception as e:
            self.logger.error(f"Failed to initialize database: {e}")
            raise

    @contextmanager
    def _get_connection(self):
        """Get SQLite connection with thread safety."""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def store(self, data_type: str, payload: dict) -> bool:
        """
        Store data in cache for later upload.
        Returns True if stored successfully.
        """
        try:
            with self._lock:
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        INSERT OR REPLACE INTO data_cache
                        (data_type, payload, timestamp, retry_count, created_at)
                        VALUES (?, ?, ?, 0, ?)
                    """, (
                        data_type,
                        json.dumps(payload, ensure_ascii=False),
                        payload.get('timestamp', int(time.time() * 1000)),
                        datetime.now().isoformat()
                    ))
                    conn.commit()
                    self.logger.debug(f"Cached {data_type} data, timestamp={payload.get('timestamp')}")
                    return True
        except Exception as e:
            self.logger.error(f"Failed to store cache: {e}")
            return False

    def get_pending(self, data_type: str = None, limit: int = 100) -> List[Dict]:
        """
        Get pending cached data for upload.
        Returns list of cached records ordered by timestamp.
        """
        try:
            with self._lock:
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    if data_type:
                        cursor.execute("""
                            SELECT * FROM data_cache
                            WHERE data_type = ?
                            ORDER BY timestamp ASC
                            LIMIT ?
                        """, (data_type, limit))
                    else:
                        cursor.execute("""
                            SELECT * FROM data_cache
                            ORDER BY timestamp ASC
                            LIMIT ?
                        """, (limit,))
                    rows = cursor.fetchall()
                    return [dict(row) for row in rows]
        except Exception as e:
            self.logger.error(f"Failed to get pending cache: {e}")
            return []

    def mark_sent(self, record_id: int) -> bool:
        """
        Mark a cached record as successfully sent (delete from cache).
        Returns True if deleted successfully.
        """
        try:
            with self._lock:
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM data_cache WHERE id = ?", (record_id,))
                    conn.commit()
                    self.logger.debug(f"Cache marked as sent, id={record_id}")
                    return True
        except Exception as e:
            self.logger.error(f"Failed to mark sent: {e}")
            return False

    def increment_retry(self, record_id: int) -> int:
        """Increment retry count for a cached record. Returns new retry count."""
        try:
            with self._lock:
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        UPDATE data_cache
                        SET retry_count = retry_count + 1
                        WHERE id = ?
                    """, (record_id,))
                    conn.commit()
                    cursor.execute("SELECT retry_count FROM data_cache WHERE id = ?", (record_id,))
                    row = cursor.fetchone()
                    return row['retry_count'] if row else 0
        except Exception as e:
            self.logger.error(f"Failed to increment retry: {e}")
            return 0

    def get_stats(self) -> Dict[str, int]:
        """Get cache statistics."""
        try:
            with self._lock:
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT COUNT(*) as total FROM data_cache")
                    total = cursor.fetchone()['total']
                    cursor.execute("SELECT COUNT(*) as pending FROM data_cache WHERE retry_count < 5")
                    pending = cursor.fetchone()['pending']
                    cursor.execute("SELECT COUNT(*) as failed FROM data_cache WHERE retry_count >= 5")
                    failed = cursor.fetchone()['failed']
                    return {
                        'total': total,
                        'pending': pending,
                        'failed': failed
                    }
        except Exception as e:
            self.logger.error(f"Failed to get stats: {e}")
            return {'total': 0, 'pending': 0, 'failed': 0}

    def cleanup_old_records(self, max_age_days: int = 7) -> int:
        """Delete records older than max_age_days. Returns count of deleted records."""
        try:
            cutoff = datetime.now() - timedelta(days=max_age_days)
            with self._lock:
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        DELETE FROM data_cache
                        WHERE created_at < ?
                        AND retry_count >= 5
                    """, (cutoff.isoformat(),))
                    deleted = cursor.rowcount
                    conn.commit()
                    if deleted > 0:
                        self.logger.info(f"Cleaned up {deleted} old failed records")
                    return deleted
        except Exception as e:
            self.logger.error(f"Failed to cleanup: {e}")
            return 0

    def clear_all(self) -> bool:
        """Clear all cached data (use with caution)."""
        try:
            with self._lock:
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM data_cache")
                    conn.commit()
                    self.logger.warning("All cache cleared")
                    return True
        except Exception as e:
            self.logger.error(f"Failed to clear cache: {e}")
            return False


# ============================================================================
# Data Aggregator - Hourly Bucket Management
# ============================================================================

class DataAggregator:
    """Aggregate sensor data into hourly buckets for efficient storage."""

    def __init__(self, bucket_interval: int = 3600):
        self.bucket_interval = bucket_interval
        self.current_bucket_start = self._get_bucket_start()
        self.bucket_data: Dict[str, List[float]] = {
            'inside_temp': [],
            'inside_humidity': [],
            'outside_temp': [],
            'outside_humidity': [],
            'weight': [],
            'bee_in': [],
            'bee_out': [],
            'hornet_count': [],
        }
        self.bucket_stats = {
            'sample_count': 0,
            'hornet_max': 0,
            'fps_sum': 0.0,
            'latency_sum': 0.0,
        }
        self._lock = threading.Lock()
        self._last_flush_time = time.time()

    def _get_bucket_start(self) -> int:
        """Get the start time of current bucket."""
        return int(time.time()) // self.bucket_interval * self.bucket_interval

    def add_sensor_reading(self, sensor_type: str, value: float):
        """Add a sensor reading to current bucket."""
        with self._lock:
            if sensor_type in self.bucket_data:
                self.bucket_data[sensor_type].append(value)
            self.bucket_stats['sample_count'] += 1

    def add_vision_data(self, hornet_count: int, fps: float, latency_ms: float):
        """Add vision processing data to current bucket."""
        with self._lock:
            self.bucket_data['hornet_count'].append(hornet_count)
            if hornet_count > self.bucket_stats['hornet_max']:
                self.bucket_stats['hornet_max'] = hornet_count
            self.bucket_stats['fps_sum'] += fps
            self.bucket_stats['latency_sum'] += latency_ms

    def should_flush(self) -> bool:
        """Check if bucket should be flushed (hour has changed)."""
        current_bucket = self._get_bucket_start()
        return current_bucket > self.current_bucket_start

    def get_and_reset_bucket(self) -> Optional[dict]:
        """Get aggregated bucket data and reset for next bucket."""
        with self._lock:
            if not self.should_flush():
                return None

            bucket_start = self.current_bucket_start
            self.current_bucket_start = self._get_bucket_start()

            result = {
                'timestamp': bucket_start,
                'inside_temperature': self._avg(self.bucket_data['inside_temp']),
                'inside_humidity': self._avg(self.bucket_data['inside_humidity']),
                'outside_temperature': self._avg(self.bucket_data['outside_temp']),
                'outside_humidity': self._avg(self.bucket_data['outside_humidity']),
                'weight': self.bucket_data['weight'][-1] if self.bucket_data['weight'] else None,
                'bees_in': sum(self.bucket_data['bee_in']),
                'bees_out': sum(self.bucket_data['bee_out']),
                'hornets_detected': self.bucket_stats['hornet_max'],
                'vision_fps_avg': self.bucket_stats['fps_sum'] / max(1, self.bucket_stats['sample_count']),
                'vision_latency_avg': self.bucket_stats['latency_sum'] / max(1, self.bucket_stats['sample_count']),
                'sample_count': self.bucket_stats['sample_count'],
            }

            for key in self.bucket_data:
                self.bucket_data[key] = []
            self.bucket_stats = {
                'sample_count': 0,
                'hornet_max': 0,
                'fps_sum': 0.0,
                'latency_sum': 0.0,
            }

            return result

    def _avg(self, values: List[float]) -> Optional[float]:
        """Calculate average, return None if empty."""
        return sum(values) / len(values) if values else None


# ============================================================================
# HTTP Backend Client with Checkpoint/Resume
# ============================================================================

class BackendClient:
    """HTTP client for backend database operations with retry and cache support."""

    def __init__(self, base_url: str, api_token: str, logger: logging.Logger, cache: OfflineCache = None):
        self.base_url = base_url.rstrip('/')
        self.api_token = api_token
        self.logger = logger
        self.cache = cache
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {api_token}',
            'Content-Type': 'application/json'
        })
        self._network_available = True

    def is_network_available(self) -> bool:
        """Check if network is currently available."""
        return self._network_available

    def post_beehive_data(self, data: dict) -> bool:
        """Post aggregated beehive data to backend."""
        try:
            resp = self.session.post(
                f"{self.base_url}/api/beehive",
                json=data,
                timeout=10
            )
            if resp.status_code == 200 or resp.status_code == 201:
                self._network_available = True
                self.logger.info(f"Data posted successfully: timestamp={data.get('timestamp')}")
                return True
            else:
                self._network_available = False
                self.logger.warning(f"Data post failed: {resp.status_code} {resp.text}")
                return False
        except requests.exceptions.ConnectionError:
            self._network_available = False
            self.logger.warning("Network unavailable, data will be cached")
            return False
        except requests.exceptions.Timeout:
            self._network_available = False
            self.logger.warning("Request timeout, data will be cached")
            return False
        except Exception as e:
            self._network_available = False
            self.logger.error(f"Data post error: {e}")
            return False

    def post_iot_ingest(self, data: dict) -> bool:
        """Post real-time data to /api/iot/ingest (triggers SSE push to frontend)."""
        url = f"{self.base_url}/api/iot/ingest"
        try:
            resp = self.session.post(
                url,
                json=data,
                timeout=10
            )
            if resp.status_code in (200, 201):
                self._network_available = True
                return True
            else:
                self._network_available = False
                self.logger.warning(f"IoT ingest failed: {resp.status_code} {resp.text[:500]} url={url}")
                return False
        except requests.exceptions.ConnectionError:
            self._network_available = False
            self.logger.warning(f"IoT ingest: network unavailable url={url}")
            return False
        except requests.exceptions.Timeout:
            self._network_available = False
            self.logger.warning(f"IoT ingest: timeout url={url}")
            return False
        except Exception as e:
            self._network_available = False
            self.logger.error(f"IoT ingest error: {e} url={url}")
            return False

    def register_video_stream(self, stream_url: str, device_id: str, mode: str = "mjpeg", source: str = "direct") -> bool:
        """Register current Pi MJPEG stream URL to backend config."""
        url = f"{self.base_url}/api/device/video-stream"
        payload = {
            "deviceId": device_id,
            "streamUrl": stream_url,
            "mode": mode,
            "source": source,
        }
        try:
            resp = self.session.post(url, json=payload, timeout=8)
            if resp.status_code in (200, 201):
                self._network_available = True
                self.logger.info(f"[VIDEO] 已注册视频流地址到后端: {stream_url}")
                return True
            self.logger.warning(f"[VIDEO] 注册视频流失败: {resp.status_code} {resp.text[:500]} url={url}")
            return False
        except requests.exceptions.ConnectionError:
            self._network_available = False
            self.logger.warning(f"[VIDEO] 注册视频流失败，网络不可用 url={url}")
            return False
        except requests.exceptions.Timeout:
            self._network_available = False
            self.logger.warning(f"[VIDEO] 注册视频流超时 url={url}")
            return False
        except Exception as e:
            self._network_available = False
            self.logger.error(f"[VIDEO] 注册视频流异常: {e} url={url}")
            return False

    def post_with_cache(self, data: dict, data_type: str = "beehive") -> bool:
        """
        Post data with automatic caching on failure (checkpoint/resume).
        If network is available, try to post immediately.
        If network fails, cache the data locally.
        Returns True if posted or cached successfully.
        """
        # Try to post immediately
        if self.post_beehive_data(data):
            return True

        # Network failed, cache the data
        if self.cache:
            cache_data = {
                **data,
                'timestamp': data.get('timestamp', int(time.time() * 1000))
            }
            if self.cache.store(data_type, cache_data):
                self.logger.info(f"Data cached for later upload: {data_type}")
                return True
            else:
                self.logger.error("Failed to cache data")
                return False
        return False

    def health_check(self) -> bool:
        """Check backend health."""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/health",
                timeout=5
            )
            self._network_available = resp.status_code == 200
            return resp.status_code == 200
        except Exception:
            self._network_available = False
            return False


# ============================================================================
# MQTT Subscriber
# ============================================================================

class MQTTSubscriber:
    """MQTT subscriber for receiving sensor and vision data."""

    def __init__(
        self,
        broker_host: str,
        broker_port: int,
        topics: List[str],
        username: Optional[str] = None,
        password: Optional[str] = None,
        logger: logging.Logger = None
    ):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.topics = topics
        self.username = username
        self.password = password
        self.logger = logger or logging.getLogger(__name__)

        client_id = f"transfer-{socket.gethostname()}-{int(time.time())}"
        if _PAHO_V2:
            self.client = _MqttClient(_CBVersion.VERSION1, client_id=client_id)
        else:
            self.client = mqtt.Client(client_id=client_id)

        if username and password:
            self.client.username_pw_set(username, password)

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        self.connected = False
        self._data_callback = None
        self._last_reconnect = 0
        self._reconnect_delay = 1
        self._loop_started = False

    def set_data_callback(self, callback):
        """Set callback for received data."""
        self._data_callback = callback

    def _on_connect(self, client, userdata, flags, *args):
        # paho-mqtt v1: (flags, rc), v2: (flags, reason_code, properties)
        reason_code = args[0] if args else -1
        code = getattr(reason_code, 'value', reason_code)
        if code == 0:
            self.logger.info(f"MQTT connected to {self.broker_host}:{self.broker_port}")
            self.connected = True
            self._reconnect_delay = 1
            for topic in self.topics:
                result = client.subscribe(topic, qos=1)
                if result[0] == 0:  # MQTT_ERR_SUCCESS
                    self.logger.info(f"Subscribed to: {topic}")
                else:
                    self.logger.warning(f"Failed to subscribe to {topic}")
        else:
            self.logger.error(f"MQTT connection failed, code={code}")

    def _on_disconnect(self, client, userdata, *args):
        self.connected = False
        # paho-mqtt v1: (rc,), v2: (disconnect_flags, reason_code, properties)
        reason_code = args[-1] if args else "unknown"
        code = getattr(reason_code, 'value', reason_code)
        self.logger.warning(f"MQTT disconnected, reason={code}")

    def _on_message(self, client, userdata, message):
        try:
            raw_payload = message.payload.decode('utf-8')
            data = json.loads(raw_payload)
            topic = message.topic

            if isinstance(data, dict) and data.get('compressed') and data.get('codec') == 'zlib+base64':
                try:
                    compressed = base64.b64decode(data['payload'])
                    decompressed = zlib.decompress(compressed)
                    payload = json.loads(decompressed.decode('utf-8'))
                except Exception as e:
                    self.logger.error(f"Failed to decompress payload from {topic}: {e}")
                    return
            else:
                payload = data

            if self._data_callback:
                self._data_callback(topic, payload)

        except json.JSONDecodeError as e:
            self.logger.error(f"Invalid JSON from {message.topic}: {e}")
        except Exception as e:
            self.logger.error(f"Message processing error: {e}")

    def connect(self) -> bool:
        """Connect to MQTT broker."""
        self._start_loop_once()
        try:
            self.client.connect(self.broker_host, self.broker_port, keepalive=30)
            return True
        except Exception as e:
            self.logger.error(f"MQTT connect error: {e}")
            return False

    def _start_loop_once(self):
        """Start paho network loop once, even if the first broker connect fails."""
        if self._loop_started:
            return
        self.client.loop_start()
        self._loop_started = True

    def reconnect_if_needed(self):
        """Attempt reconnection if disconnected."""
        if not self.connected and (time.time() - self._last_reconnect) > self._reconnect_delay:
            self._last_reconnect = time.time()
            self._reconnect_delay = min(self._reconnect_delay * 2, 60)
            self._start_loop_once()
            self.logger.info(
                f"Attempting MQTT reconnection to {self.broker_host}:{self.broker_port}..."
            )
            try:
                self.client.reconnect()
            except Exception as e:
                self.logger.warning(f"MQTT reconnect failed: {e}; trying fresh connect")
                try:
                    self.client.connect(self.broker_host, self.broker_port, keepalive=30)
                except Exception as connect_error:
                    self.logger.error(f"MQTT fresh connect failed: {connect_error}")

    def stop(self):
        """Stop MQTT client."""
        self.connected = False
        try:
            if self._loop_started:
                self.client.loop_stop()
            self.client.disconnect()
        except Exception:
            pass


# ============================================================================
# Transfer Process Main Class with Checkpoint/Resume
# ============================================================================

class TransferProcess:
    """Main data collection and distribution hub with checkpoint/resume support."""

    def __init__(self, config: dict, logger: logging.Logger):
        self.config = config
        self.logger = logger
        self.stop_event = threading.Event()

        # Initialize components
        self.mqtt_sub = None
        self.backend_client = None
        self.aggregator = None
        self.cache = None

        # Network state
        self._network_available = True
        self._last_network_check = 0
        self._network_check_interval = 30  # Check network every 30 seconds

        # Real-time data upload
        self._last_realtime_upload = time.time()  # 延迟首次上传，等待 MQTT 数据到达
        self._realtime_upload_interval = 5.0   # 初始化后按 MQTT 发布间隔覆盖
        self._mqtt_data_received = False     # 标记是否收到过 MQTT 数据
        _mqtt = self.config.get('mqtt', {}) or {}
        self._device_id = _mqtt.get('client_id', f"pi5-{socket.gethostname()}")
        self._current_realtime_data = {
            'temperature': 0.0,
            'humidity': 0.0,
            'insideTemperature': 0.0,
            'insideHumidity': 0.0,
            'outsideTemperature': 0.0,
            'outsideHumidity': 0.0,
            'weight': 0.0,
            'beesIn': 0,
            'beesOut': 0,
            'hornetsDetected': 0,
            'latitude': 0.0,
            'longitude': 0.0,
        }

        # Statistics
        self.stats = {
            'mqtt_received': 0,
            'db_saved': 0,
            'db_failed': 0,
            'db_cached': 0,
            'cache_resumed': 0,
            'errors': 0,
        }
        self._stats_lock = threading.Lock()

    def initialize(self):
        """Initialize all components."""
        self.logger.info("Initializing Transfer Process with Checkpoint/Resume...")

        # Apply environment variable overrides (same as sensor/vision processes)
        self._apply_env_overrides()

        # Initialize offline cache
        cache_path = self.config.get('cache_db_path', 'transfer_cache.db')
        self.cache = OfflineCache(cache_path, self.logger)

        # Backend client - use archive configuration if available
        archive_config = self.config.get('archive', {})
        raw_backend = archive_config.get('beehive_url', self.config.get('backend_url', 'http://localhost:3001'))
        backend_url = _normalize_backend_base_url(str(raw_backend))
        api_token = archive_config.get('api_token', self.config.get('api_token', ''))
        self.backend_client = BackendClient(backend_url, api_token, self.logger, self.cache)
        self._video_stream_registered = False
        self._video_register_interval = 300.0
        self._last_video_register_attempt = 0.0

        # Data aggregator
        telemetry_sync = self.config.get('telemetry_sync', {}) or {}
        bucket_interval = int(
            self.config.get('bucket_interval_seconds')
            or telemetry_sync.get('interval_seconds')
            or 3600
        )
        self.aggregator = DataAggregator(bucket_interval=bucket_interval)

        # MQTT Subscriber - support both config.yaml key formats
        mqtt_config = self.config.get('mqtt', {})
        mqtt_host = mqtt_config.get('host', mqtt_config.get('broker_host', 'localhost'))
        mqtt_port = mqtt_config.get('port', mqtt_config.get('broker_port', 1883))
        self._device_id = mqtt_config.get('client_id', self._device_id)
        try:
            self._realtime_upload_interval = max(
                1.0,
                float(mqtt_config.get('publish_interval_seconds', self._realtime_upload_interval))
            )
        except (TypeError, ValueError):
            self._realtime_upload_interval = 2.0
        mqtt_topics = [
            mqtt_config.get('data_topic', 'smarthive/pi5/sensors'),
            'pi5/vision/result',
        ]
        self.mqtt_sub = MQTTSubscriber(
            broker_host=mqtt_host,
            broker_port=mqtt_port,
            topics=mqtt_topics,
            username=mqtt_config.get('username'),
            password=mqtt_config.get('password'),
            logger=self.logger
        )
        self.mqtt_sub.set_data_callback(self._handle_mqtt_data)

        if not self.mqtt_sub.connect():
            self.logger.error("Failed to connect to MQTT broker")

        self.logger.info(
            "Realtime path: local MQTT %s:%s topics=%s -> HTTP %s/api/iot/ingest deviceId=%s interval=%ss",
            mqtt_host,
            mqtt_port,
            mqtt_topics,
            backend_url,
            self._device_id,
            self._realtime_upload_interval,
        )
        self.logger.info("Hourly archive bucket interval: %ss", bucket_interval)
        self.logger.info("Transfer Process initialized successfully")
        self._register_video_stream(force=True)

    def _apply_env_overrides(self):
        """Apply SMART_HIVE_* environment variables to config dict."""
        import os
        def _env(key):
            return (os.environ.get(key) or "").strip()

        if v := _env("SMART_HIVE_MQTT_HOST"):
            self.config.setdefault('mqtt', {})['host'] = v
        if v := _env("SMART_HIVE_MQTT_PORT"):
            try:
                self.config.setdefault('mqtt', {})['port'] = int(v)
            except ValueError:
                pass
        if v := _env("SMART_HIVE_MQTT_USERNAME"):
            self.config.setdefault('mqtt', {})['username'] = v
        if v := _env("SMART_HIVE_MQTT_PASSWORD"):
            self.config.setdefault('mqtt', {})['password'] = v
        if v := _env("SMART_HIVE_MQTT_CLIENT_ID"):
            self.config.setdefault('mqtt', {})['client_id'] = v

        if v := _env("SMART_HIVE_API_TOKEN"):
            self.config.setdefault('archive', {})['api_token'] = v
        if v := _env("SMART_HIVE_BEEHIVE_URL"):
            self.config.setdefault('archive', {})['beehive_url'] = v

    def _build_video_stream_url(self) -> str:
        visualization = self.config.get('visualization', {}) or {}
        port = visualization.get('port', 5001)
        try:
            port = int(port)
        except (TypeError, ValueError):
            port = 5001
        ip = _get_lan_ip()
        if not ip:
            return ""
        return f"http://{ip}:{port}/stream"

    def _register_video_stream(self, force: bool = False):
        now = time.time()
        if not force and (now - self._last_video_register_attempt) < self._video_register_interval:
            return
        if self._video_stream_registered and not force:
            return
        self._last_video_register_attempt = now
        stream_url = self._build_video_stream_url()
        if not stream_url:
            self.logger.warning("[VIDEO] 无法获取树莓派局域网 IP，跳过视频流自动注册")
            return
        if self.backend_client.register_video_stream(stream_url, self._device_id, mode="mjpeg", source="direct"):
            self._video_stream_registered = True

    def _handle_mqtt_data(self, topic: str, payload: dict):
        """Handle incoming MQTT data."""
        with self._stats_lock:
            self.stats['mqtt_received'] += 1

        try:
            if 'vision' in topic:
                self._handle_vision_data(payload)
            else:
                self._handle_sensor_data(payload)

        except Exception as e:
            with self._stats_lock:
                self.stats['errors'] += 1
            self.logger.error(f"Data handling error: {e}")

    def _handle_sensor_data(self, payload: dict):
        """Process sensor data and add to aggregator."""
        sensors = payload.get('sensors', [])
        if not sensors:
            self.logger.warning(f"[DATA] 收到空传感器列表, payload keys={list(payload.keys())}")
            return

        self.logger.debug(f"收到传感器数据: {sensors}")

        updated_fields = []
        for sensor in sensors:
            sensor_type = str(sensor.get('type', '')).strip()
            value = sensor.get('value')

            if value is None:
                continue

            # 尝试转为数值（防止字符串 "18.8" 无法被 float 比较匹配）
            try:
                num_value = float(value)
            except (TypeError, ValueError):
                self.logger.warning(f"[DATA] 传感器值无法转为数值: type='{sensor_type}' value='{value}'")
                continue

            mapping = {
                'in_temp': 'inside_temp',
                'in_humi': 'inside_humidity',
                'out_temp': 'outside_temp',
                'out_humi': 'outside_humidity',
                'temperature': 'inside_temp',
                'humidity': 'inside_humidity',
                'weight': 'weight',
                'bee_in': 'bee_in',
                'bee_out': 'bee_out',
            }

            agg_key = mapping.get(sensor_type)
            if agg_key:
                self.aggregator.add_sensor_reading(agg_key, num_value)

            # Update real-time data for frequent upload
            if sensor_type in ['temperature', 'in_temp']:
                self._current_realtime_data['temperature'] = num_value
                self._current_realtime_data['insideTemperature'] = num_value
                updated_fields.append(f"内温={num_value}")
            elif sensor_type in ['humidity', 'in_humi']:
                self._current_realtime_data['humidity'] = num_value
                self._current_realtime_data['insideHumidity'] = num_value
                updated_fields.append(f"内湿={num_value}")
            elif sensor_type == 'out_temp':
                self._current_realtime_data['outsideTemperature'] = num_value
                updated_fields.append(f"外温={num_value}")
            elif sensor_type == 'out_humi':
                self._current_realtime_data['outsideHumidity'] = num_value
                updated_fields.append(f"外湿={num_value}")
            elif sensor_type == 'weight':
                self._current_realtime_data['weight'] = num_value
                updated_fields.append(f"重量={num_value}")
            elif sensor_type == 'bee_in':
                self._current_realtime_data['beesIn'] = int(num_value)
                updated_fields.append(f"蜂入={int(num_value)}")
            elif sensor_type == 'bee_out':
                self._current_realtime_data['beesOut'] = int(num_value)
                updated_fields.append(f"蜂出={int(num_value)}")
            elif sensor_type == 'hornet_count':
                self._current_realtime_data['hornetsDetected'] = int(num_value)
                updated_fields.append(f"胡蜂={int(num_value)}")
            elif sensor_type == 'gps_lat':
                self._current_realtime_data['latitude'] = num_value
                updated_fields.append(f"纬度={num_value}")
            elif sensor_type == 'gps_lon':
                self._current_realtime_data['longitude'] = num_value
                updated_fields.append(f"经度={num_value}")
            else:
                self.logger.debug(f"[DATA] 未匹配的传感器类型: '{sensor_type}' value={num_value}")

        if updated_fields:
            self._mqtt_data_received = True
            self.logger.info(f"[DATA] MQTT→实时缓存已更新 ({len(updated_fields)}项): {', '.join(updated_fields)}")
        elif sensors:
            types = [str(s.get('type', '?')) for s in sensors]
            self.logger.warning(f"[DATA] 收到 {len(sensors)} 个传感器但无字段匹配: {types}")

    def _handle_vision_data(self, payload: dict):
        """Process vision detection data."""
        self.logger.debug(f"收到视觉数据: {payload}")
        hornet_count = payload.get('hornet_count', 0)
        fps = payload.get('fps', 0.0)
        latency_ms = payload.get('latency_ms', 0.0)

        self.aggregator.add_vision_data(hornet_count, fps, latency_ms)

        # Update real-time hornet data
        self._current_realtime_data['hornetsDetected'] = hornet_count
        self.logger.debug(f"更新胡蜂数: {hornet_count}")

    def _upload_realtime_data(self):
        """Upload real-time data to backend via /api/iot/ingest (triggers SSE push to frontend)."""
        now = time.time()
        if now - self._last_realtime_upload < self._realtime_upload_interval:
            return

        # 如果还没收到过 MQTT 数据，跳过本次上传（避免发送全零初始值）
        if not self._mqtt_data_received:
            self.logger.debug("[UPLOAD] 尚未收到 MQTT 数据，跳过上传")
            self._last_realtime_upload = now
            return

        rt = self._current_realtime_data

        # 构建 /api/iot/ingest 的 sensors（字段名与 sensor_process MQTT 载荷一致，便于后端 iotBridge 规范化）
        sensors = [
            {"type": "temperature", "value": round(float(rt['temperature']), 1), "unit": "C"},
            {"type": "humidity", "value": round(float(rt['humidity']), 1), "unit": "%"},
            {"type": "out_temp", "value": round(float(rt['outsideTemperature']), 1), "unit": "C"},
            {"type": "out_humi", "value": round(float(rt['outsideHumidity']), 1), "unit": "%"},
            {"type": "weight", "value": round(float(rt['weight']), 2), "unit": "kg"},
            {"type": "bee_in", "value": int(rt['beesIn']), "unit": "count"},
            {"type": "bee_out", "value": int(rt['beesOut']), "unit": "count"},
            {"type": "hornet_count", "value": int(rt['hornetsDetected']), "unit": "count"},
        ]
        if rt.get('latitude') is not None and rt['latitude'] != 0:
            sensors.append({"type": "gps_lat", "value": float(rt['latitude']), "unit": "deg"})
        if rt.get('longitude') is not None and rt['longitude'] != 0:
            sensors.append({"type": "gps_lon", "value": float(rt['longitude']), "unit": "deg"})

        # 打印实际上传的传感器值（便于排查）
        sensor_summary = ', '.join(f"{s['type']}={s['value']}" for s in sensors)
        self.logger.info(f"[UPLOAD] 准备上报 {len(sensors)} 个传感器: {sensor_summary}")

        realtime_payload = {
            'deviceId': self._device_id,
            'timestamp': int(time.time() * 1000),
            'sensors': sensors,
        }

        # 通过 /api/iot/ingest 上报（会触发 SSE 推送给前端）
        if self.backend_client.post_iot_ingest(realtime_payload):
            self.logger.info(f"[UPLOAD] 成功上传实时数据到后端: {len(sensors)}个传感器")
        else:
            self.logger.warning("[UPLOAD] 上传实时数据失败，已缓存待恢复，不写入小时归档接口")
            if self.cache and self.cache.store("realtime_iot", realtime_payload):
                self.logger.info("[UPLOAD] 实时数据已缓存，网络恢复后补传 /api/iot/ingest")
            else:
                self.logger.error("[UPLOAD] 实时数据缓存失败")

        self._last_realtime_upload = now

    def _check_network_and_resume_cache(self):
        """
        Check network availability and resume cached data.
        This is the core checkpoint/resume logic.
        """
        now = time.time()
        if now - self._last_network_check < self._network_check_interval:
            return

        self._last_network_check = now

        # Check network
        network_ok = self.backend_client.health_check()
        was_unavailable = not self._network_available
        self._network_available = network_ok

        if network_ok and was_unavailable:
            self.logger.info("Network recovered! Starting cache resume...")
            self._register_video_stream(force=True)
            self._resume_cached_data()

        elif network_ok:
            self._register_video_stream(force=False)
            # Network is available, try to resume any pending cached data
            self._resume_cached_data()

    def _resume_cached_data(self):
        """
        Resume upload of cached data (checkpoint/resume).
        This is called when network becomes available.
        """
        if not self.cache:
            return

        pending = self.cache.get_pending(limit=10)
        if not pending:
            return

        self.logger.info(f"Resuming {len(pending)} cached records...")

        for record in pending:
            record_id = record['id']
            data_type = record['data_type']
            retry_count = record['retry_count']

            if retry_count >= 5:
                self.logger.warning(f"Skipping record {record_id}, too many retries")
                continue

            try:
                payload = json.loads(record['payload'])

                if data_type == "realtime_iot":
                    success = self.backend_client.post_iot_ingest(payload)
                elif data_type in ("beehive", "realtime"):
                    success = self.backend_client.post_beehive_data(payload)
                else:
                    success = self.backend_client.post_beehive_data(payload)

                if success:
                    self.cache.mark_sent(record_id)
                    with self._stats_lock:
                        self.stats['cache_resumed'] += 1
                    self.logger.info(f"Cache record {record_id} uploaded successfully")
                else:
                    new_retry = self.cache.increment_retry(record_id)
                    self.logger.warning(f"Cache record {record_id} upload failed, retry {new_retry}")

            except Exception as e:
                self.logger.error(f"Error resuming cache record {record_id}: {e}")
                self.cache.increment_retry(record_id)

    def _flush_bucket_to_db(self):
        """Flush aggregated bucket data to database with cache support."""
        bucket_data = self.aggregator.get_and_reset_bucket()
        if not bucket_data:
            return

        # Use latest real-time values as fallback for required fields
        rt = self._current_realtime_data
        db_payload = {
            'timestamp': int(time.time() * 1000),
            'temperature': bucket_data.get('inside_temperature') or rt.get('temperature') or 0,
            'humidity': bucket_data.get('inside_humidity') or rt.get('humidity') or 0,
            'insideTemperature': bucket_data.get('inside_temperature') or rt.get('insideTemperature'),
            'insideHumidity': bucket_data.get('inside_humidity') or rt.get('insideHumidity'),
            'outsideTemperature': bucket_data.get('outside_temperature') or rt.get('outsideTemperature'),
            'outsideHumidity': bucket_data.get('outside_humidity') or rt.get('outsideHumidity'),
            'weight': bucket_data.get('weight') or rt.get('weight') or 0,
            'beesIn': bucket_data.get('bees_in') or 0,
            'beesOut': bucket_data.get('bees_out') or 0,
            'hornetsDetected': bucket_data.get('hornets_detected') or 0,
            'latitude': rt.get('latitude'),
            'longitude': rt.get('longitude'),
        }

        # Post with automatic caching on failure
        if self.backend_client.post_with_cache(db_payload, "beehive"):
            with self._stats_lock:
                self.stats['db_saved'] += 1
            self.logger.info(f"Bucket saved: samples={bucket_data.get('sample_count')}")
        else:
            with self._stats_lock:
                self.stats['db_cached'] += 1
            self.logger.info(f"Bucket cached for later upload")

    def _print_stats(self):
        """Print current statistics."""
        with self._stats_lock:
            stats = self.stats.copy()
        cache_stats = self.cache.get_stats() if self.cache else {'total': 0, 'pending': 0, 'failed': 0}

        self.logger.info(
            f"[STATS] MQTT={stats['mqtt_received']} "
            f"DB_ok={stats['db_saved']} DB_cached={stats['db_cached']} "
            f"Cache_resumed={stats['cache_resumed']} "
            f"Cache_total={cache_stats['total']} pending={cache_stats['pending']} "
            f"Errors={stats['errors']}"
        )

    def run(self):
        """Main run loop."""
        self.logger.info("Transfer Process running with Checkpoint/Resume...")
        last_stats_time = time.time()
        stats_interval = 60
        last_cache_cleanup = time.time()

        while not STOP and not self.stop_event.is_set():
            try:
                # Check MQTT reconnection
                self.mqtt_sub.reconnect_if_needed()

                # Check network and resume cached data
                self._check_network_and_resume_cache()

                # Keep backend video stream URL in sync when Pi IP changes.
                self._register_video_stream(force=False)

                # Upload real-time data frequently
                self._upload_realtime_data()

                # Flush bucket if hour has passed
                self._flush_bucket_to_db()

                # Periodic stats
                now = time.time()
                if now - last_stats_time >= stats_interval:
                    self._print_stats()
                    last_stats_time = now

                # Daily cache cleanup (delete old failed records)
                if now - last_cache_cleanup >= 86400:
                    if self.cache:
                        self.cache.cleanup_old_records(max_age_days=7)
                    last_cache_cleanup = now

                time.sleep(1)

            except Exception as e:
                self.logger.error(f"Run loop error: {e}")
                time.sleep(5)

    def cleanup(self):
        """Cleanup resources."""
        self.logger.info("Cleaning up Transfer Process...")

        # Final flush before exit
        self.logger.info("Final flush before exit...")
        self._flush_bucket_to_db()

        if self.mqtt_sub:
            self.mqtt_sub.stop()

        self._print_stats()

        cache_stats = self.cache.get_stats() if self.cache else {'total': 0}
        if cache_stats['total'] > 0:
            self.logger.warning(
                f"Exit with {cache_stats['total']} cached records pending. "
                f"They will be resumed on next startup."
            )

        self.logger.info("Transfer Process cleanup completed")


# ============================================================================
# Configuration Loader
# ============================================================================

def load_config(config_path: str = 'config.yaml') -> dict:
    """Load configuration from YAML file."""
    try:
        import yaml
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        return config
    except ImportError:
        print("[ERROR] PyYAML not found. Install with: pip install pyyaml")
        exit(1)
    except FileNotFoundError:
        print(f"[ERROR] Config file not found: {config_path}")
        exit(1)
    except Exception as e:
        print(f"[ERROR] Config loading failed: {e}")
        exit(1)


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    global STOP

    parser = argparse.ArgumentParser(description='SmartHive Transfer Process')
    parser.add_argument('--config', default='config.yaml', help='Config file path')
    parser.add_argument('--backend-url', default='http://localhost:3001', help='Backend URL')
    parser.add_argument('--api-token', default='', help='API token for backend')
    parser.add_argument('--mqtt-host', default='localhost', help='MQTT broker host')
    parser.add_argument('--mqtt-port', type=int, default=1883, help='MQTT broker port')
    parser.add_argument('--mqtt-username', default='', help='MQTT username')
    parser.add_argument('--mqtt-password', default='', help='MQTT password')
    parser.add_argument('--cache-db-path', default='transfer_cache.db', help='Cache database path')
    parser.add_argument('--log-level', default='INFO', help='Log level')
    args = parser.parse_args()

    # Setup logging
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
    )
    logger = logging.getLogger('transfer')

    # Load config
    try:
        config = load_config(args.config)
    except SystemExit:
        config = {
            'backend_url': args.backend_url,
            'api_token': args.api_token,
            'mqtt': {
                'host': args.mqtt_host,
                'port': args.mqtt_port,
                'username': args.mqtt_username,
                'password': args.mqtt_password,
            }
        }

    # Override with command line args
    if args.backend_url != 'http://localhost:3001':
        config['backend_url'] = args.backend_url
    if args.api_token:
        config['api_token'] = args.api_token
    if args.mqtt_host != 'localhost':
        config.setdefault('mqtt', {})['host'] = args.mqtt_host
    if args.mqtt_port != 1883:
        config.setdefault('mqtt', {})['port'] = args.mqtt_port
    if args.mqtt_username:
        config.setdefault('mqtt', {})['username'] = args.mqtt_username
    if args.mqtt_password:
        config.setdefault('mqtt', {})['password'] = args.mqtt_password
    if args.cache_db_path:
        config['cache_db_path'] = args.cache_db_path

    # Signal handlers
    def handle_signal(signum, frame):
        global STOP
        STOP = True
        transfer.stop_event.set()
        logger.info("Shutdown signal received...")

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # Create and run transfer process
    transfer = TransferProcess(config, logger)

    try:
        transfer.initialize()
        transfer.run()
    except Exception as e:
        logger.error(f"Fatal error: {e}")
    finally:
        transfer.cleanup()

    logger.info("Transfer Process exited")


if __name__ == '__main__':
    main()
