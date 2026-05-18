"""
config.py - Global configuration definitions
The three sub-processes import from here. Contains no business logic.
"""
from __future__ import annotations

import logging
import logging.handlers
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml


# ------------------------------------------------------------------ #
#  Module configuration dataclasses
# ------------------------------------------------------------------ #

@dataclass
class CameraConfig:
    source: int = 0
    width: int = 640
    height: int = 480
    fps: int = 30
    exposure: int = -1
    backend: str = "opencv"


@dataclass
class ModelConfig:
    param_path: str = "./model.ncnn.param"
    bin_path: str = "./model.ncnn.bin"
    input_size: Tuple[int, int] = (320, 320)
    input_name: str = "in0"
    output_name: str = "out0"
    confidence_threshold: float = 0.45
    nms_threshold: float = 0.45
    mean: List[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])
    std: List[float] = field(default_factory=lambda: [255.0, 255.0, 255.0])
    threads: int = 4
    extractor_pool_size: int = 4
    use_vulkan: bool = True


@dataclass
class QueueConfig:
    frame_queue_depth: int = 8
    result_queue_depth: int = 128


@dataclass
class RoiConfig:
    polygons: List[List[List[int]]] = field(default_factory=list)


@dataclass
class OutputConfig:
    csv_path: str = "./pi5_results.csv"
    websocket_host: str = "0.0.0.0"
    websocket_port: int = 8765
    websocket_enabled: bool = True
    websocket_push_timeout_ms: int = 200


@dataclass
class MqttConfig:
    enabled: bool = False
    host: str = "127.0.0.1"
    port: int = 1883
    # Optional MQTT auth. If empty, connect without username/password.
    username: str = ""
    password: str = ""
    command_topic: str = "pi5/vision/command"
    data_topic: str = "smarthive/pi5/sensors"
    error_topic: str = "pi5/vision/error"
    status_topic: str = "pi5/vision/status"
    client_id: str = "pi5-vision-client"
    publish_interval_seconds: float = 2.0
    publish_qos: int = 1
    cache_file: str = "./runtime/mqtt_cache.jsonl"
    compress_payload: bool = True


@dataclass
class ServerUploadConfig:
    enabled: bool = False
    url: str = "http://127.0.0.1:3001/api/vision/frame"
    token: str = ""
    device_id: str = "pi5-vision-client"
    interval_seconds: float = 0.5
    jpeg_quality: int = 80
    timeout_seconds: float = 2.0
    local_db_path: str = "./runtime/telemetry_cache.db"
    batch_sync_size: int = 20


@dataclass
class TelemetrySyncConfig:
    """
    Hourly telemetry aggregation + offline caching + MQTT catch-up upload.

    This is meant for “断网可采集、联网补传”的历史数据链路（每小时聚合一次）。
    """
    enabled: bool = True
    interval_seconds: int = 3600
    align_to_hour: bool = True

    # Local persistence (SQLite)
    local_db_path: str = "./runtime/telemetry_hourly_cache.db"
    max_pending_records: int = 24 * 7          # default keep 7 days
    max_db_bytes: int = 64 * 1024 * 1024       # 64MB cap (best-effort)
    prune_keep_days: int = 30                  # time-based safety net

    # Cloud MQTT (where backend subscribes to smarthive/+/sensors)
    cloud_enabled: bool = True
    cloud_broker_url: str = "mqtt://127.0.0.1:1883"
    cloud_username: str = ""
    cloud_password: str = ""
    cloud_client_id_suffix: str = "-hourly-sync"
    cloud_topic: str = ""                      # default: cfg.mqtt.data_topic
    publish_qos: int = 1
    publish_timeout_seconds: float = 6.0
    batch_sync_size: int = 50                  # how many cached records to flush per loop
    min_flush_interval_seconds: float = 1.0    # avoid busy loop when offline


@dataclass
class ArchiveConfig:
    enabled: bool = False
    beehive_url: str = "http://127.0.0.1:3001/api/beehive"
    api_token: str = ""
    interval_seconds: int = 3600
    align_to_hour: bool = True
    timeout_seconds: float = 10.0
    max_retries: int = 3


@dataclass
class WatchdogConfig:
    stall_seconds: int = 5
    restart_backoff_seconds: int = 1


@dataclass
class LoggingConfig:
    level: str = "INFO"
    file_path: str = "/var/log/pi5_vision.log"


@dataclass
class VisualizationConfig:
    enabled: bool = True
    host: str = "0.0.0.0"
    port: int = 5001
    stream_fps: int = 15
    stream_jpeg_quality: int = 65


@dataclass
class SensorConfig:
    hx711_enabled: bool = True
    hx711_dout_pin: int = 5
    hx711_sck_pin: int = 6
    hx711_reference_unit: float = 1.0
    hx711_tare_on_start: bool = True
    hx711_read_interval: float = 0.5
    hx711_filter_window: int = 5
    # 内部DHT22传感器（蜂箱内部温湿度）
    dht_inside_gpio_pin: int = 4
    # 外部DHT22传感器（蜂箱外部温湿度）
    dht_outside_gpio_pin: int = 17
    dht_outside_enabled: bool = True
    dht_read_interval: float = 5.0
    gps_port: str = "/dev/serial0"
    gps_baud: int = 9600
    # IR bee counter configuration
    ir_enabled: bool = True
    ir_outer_pin: int = 23        # Outer sensor BCM pin (towards outside)
    ir_inner_pin: int = 24        # Inner sensor BCM pin (towards inside)
    ir_active_low: bool = True    # True=active low, False=active high
    ir_debounce_ms: int = 30      # Debounce time in milliseconds
    ir_direction_window_ms: int = 500  # Max time window for direction detection (ms)
    
    # 加湿器模块配置（高电平触发，识别到胡蜂时启动）
    humidifier_enabled: bool = True
    humidifier_gpio_pin: int = 25   # 加湿器控制引脚
    humidifier_active_low: bool = False  # False=高电平触发，True=低电平触发
    humidifier_trigger_duration_ms: int = 30000  # 触发持续时间（毫秒），默认30秒
    humidifier_cooldown_seconds: float = 10.0  # 关闭后的冷却时间（秒），默认10秒
    
    # OLED显示屏配置（SSD1306驱动，0.96寸，4针I2C接口）
    oled_enabled: bool = True
    oled_i2c_address: str = "0x3C"  # I2C地址（通常为0x3C或0x3D）
    oled_width: int = 128           # 屏幕宽度（像素）
    oled_height: int = 64           # 屏幕高度（像素）
    oled_refresh_interval: float = 1.0  # 刷新间隔（秒）


@dataclass
class ServoConfig:
    enabled: bool = False
    driver: str = "auto"  # auto=pigpio优先失败后gpiozero；pigpio/gpiozero=指定驱动
    gpio_pin: int = 18
    pwm_frequency: int = 50
    pulse_min_us: int = 1000
    pulse_max_us: int = 2000
    angle_min: float = 10.0
    angle_max: float = 170.0
    angle_center: float = 90.0
    scan_speed_dps: float = 12.0
    scan_step_degrees: float = 2.0
    scan_step_interval_seconds: float = 0.12
    lock_lost_seconds: float = 2.0
    track_deadzone_px: int = 40
    track_gain: float = 0.05
    mqtt_command_topic: str = "pi5/servo/command"


@dataclass
class DiagnosticsConfig:
    """各进程统一的硬件/MQTT/视觉调试开关（见 diagnostics_helper + --diagnostics）。"""
    enabled: bool = False
    summary_interval_seconds: float = 15.0
    # 是否打印即将发出的 MQTT 载荷片段（较长，默认关）
    log_mqtt_payload_out: bool = False
    # transfer 收到传感器/视觉 MQTT 时打印摘要
    log_mqtt_in: bool = True
    # 视觉进程：推理帧率与检测数
    log_vision_fps: bool = True


# ------------------------------------------------------------------ #
#  Top-level RuntimeConfig
# ------------------------------------------------------------------ #

@dataclass
class RuntimeConfig:
    camera: CameraConfig = field(default_factory=CameraConfig)
    model: ModelConfig = field(default_factory=ModelConfig)
    queues: QueueConfig = field(default_factory=QueueConfig)
    roi: RoiConfig = field(default_factory=RoiConfig)
    output: OutputConfig = field(default_factory=OutputConfig)
    mqtt: MqttConfig = field(default_factory=MqttConfig)
    server_upload: ServerUploadConfig = field(default_factory=ServerUploadConfig)
    telemetry_sync: TelemetrySyncConfig = field(default_factory=TelemetrySyncConfig)
    archive: ArchiveConfig = field(default_factory=ArchiveConfig)
    watchdog: WatchdogConfig = field(default_factory=WatchdogConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    visualization: VisualizationConfig = field(default_factory=VisualizationConfig)
    sensor: SensorConfig = field(default_factory=SensorConfig)
    servo: ServoConfig = field(default_factory=ServoConfig)
    diagnostics: DiagnosticsConfig = field(default_factory=DiagnosticsConfig)
    uds_path: str = "/tmp/pi5_vision.sock"

    @staticmethod
    def from_yaml(path: str) -> "RuntimeConfig":
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        cfg = RuntimeConfig()

        def _merge(dc_instance, key):
            if key in data:
                return type(dc_instance)(**{**dc_instance.__dict__, **data[key]})
            return dc_instance

        cfg.camera = _merge(cfg.camera, "camera")

        if "model" in data:
            md = {**cfg.model.__dict__, **data["model"]}
            if isinstance(md.get("input_size"), list):
                md["input_size"] = tuple(md["input_size"])
            cfg.model = ModelConfig(**md)

        cfg.queues = _merge(cfg.queues, "queues")
        cfg.roi = _merge(cfg.roi, "roi")
        cfg.output = _merge(cfg.output, "output")
        cfg.mqtt = _merge(cfg.mqtt, "mqtt")
        cfg.server_upload = _merge(cfg.server_upload, "server_upload")
        cfg.telemetry_sync = _merge(cfg.telemetry_sync, "telemetry_sync")
        cfg.archive = _merge(cfg.archive, "archive")
        cfg.watchdog = _merge(cfg.watchdog, "watchdog")
        cfg.logging = _merge(cfg.logging, "logging")
        cfg.visualization = _merge(cfg.visualization, "visualization")
        # 兼容旧版 yaml：dht_gpio_pin → dht_inside_gpio_pin（否则 SensorConfig 会报 unexpected keyword）
        if "sensor" in data and isinstance(data["sensor"], dict):
            sd = {**data["sensor"]}
            if "dht_gpio_pin" in sd:
                legacy = sd.pop("dht_gpio_pin")
                sd.setdefault("dht_inside_gpio_pin", legacy)
            cfg.sensor = type(cfg.sensor)(**{**cfg.sensor.__dict__, **sd})
        else:
            cfg.sensor = _merge(cfg.sensor, "sensor")
        cfg.servo = _merge(cfg.servo, "servo")
        cfg.diagnostics = _merge(cfg.diagnostics, "diagnostics")
        if "uds_path" in data:
            cfg.uds_path = str(data["uds_path"])
        return cfg


def _env_trim(key: str) -> str:
    return (os.environ.get(key) or "").strip()


def _env_bool(key: str) -> Optional[bool]:
    raw = os.environ.get(key)
    if raw is None:
        return None
    return raw.strip().lower() in ("1", "true", "yes", "on")


def apply_env_overrides(cfg: "RuntimeConfig") -> None:
    """
    用环境变量覆盖 config.yaml（便于 systemd / launch.sh 注入密钥，避免明文写在 yaml）。

    SMART_HIVE_MQTT_HOST / PORT / USERNAME / PASSWORD / CLIENT_ID
    SMART_HIVE_API_TOKEN -> archive.api_token 与 server_upload.token
    SMART_HIVE_BEEHIVE_URL / SMART_HIVE_VISION_UPLOAD_URL
    SMART_HIVE_CLOUD_ENABLED / BROKER_URL / USERNAME / PASSWORD
    SMART_HIVE_DIAGNOSTICS=1 -> cfg.diagnostics.enabled
    """
    if v := _env_trim("SMART_HIVE_MQTT_HOST"):
        cfg.mqtt.host = v
    if v := _env_trim("SMART_HIVE_MQTT_PORT"):
        try:
            cfg.mqtt.port = int(v)
        except ValueError:
            pass
    if v := _env_trim("SMART_HIVE_MQTT_USERNAME"):
        cfg.mqtt.username = v
    if v := _env_trim("SMART_HIVE_MQTT_PASSWORD"):
        cfg.mqtt.password = v
    if v := _env_trim("SMART_HIVE_MQTT_CLIENT_ID"):
        cfg.mqtt.client_id = v

    if v := _env_trim("SMART_HIVE_API_TOKEN"):
        cfg.archive.api_token = v
        cfg.server_upload.token = v

    if v := _env_trim("SMART_HIVE_BEEHIVE_URL"):
        cfg.archive.beehive_url = v
    if v := _env_trim("SMART_HIVE_VISION_UPLOAD_URL"):
        cfg.server_upload.url = v

    b = _env_bool("SMART_HIVE_CLOUD_ENABLED")
    if b is not None:
        cfg.telemetry_sync.cloud_enabled = b
    if v := _env_trim("SMART_HIVE_CLOUD_BROKER_URL"):
        cfg.telemetry_sync.cloud_broker_url = v
    if v := _env_trim("SMART_HIVE_CLOUD_USERNAME"):
        cfg.telemetry_sync.cloud_username = v
    if v := _env_trim("SMART_HIVE_CLOUD_PASSWORD"):
        cfg.telemetry_sync.cloud_password = v

    if _env_bool("SMART_HIVE_DIAGNOSTICS") is True:
        cfg.diagnostics.enabled = True


# ------------------------------------------------------------------ #
#  Logger initialization (Shared by all three processes)
# ------------------------------------------------------------------ #

def setup_logger(cfg: LoggingConfig, name: str = "pi5") -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, cfg.level.upper(), logging.INFO))
    logger.handlers.clear()
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(threadName)s %(message)s")

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logger.addHandler(sh)

    log_path = Path(cfg.file_path)
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        fh = logging.handlers.RotatingFileHandler(
            str(log_path), maxBytes=10 * 1024 * 1024, backupCount=3, encoding="utf-8"
        )
    except Exception:
        fh = logging.handlers.RotatingFileHandler(
            "./pi5_vision.log", maxBytes=10 * 1024 * 1024, backupCount=3, encoding="utf-8"
        )
        logger.warning("Log path not writable, fallback to ./pi5_vision.log")
    fh.setFormatter(fmt)
    logger.addHandler(fh)
    return logger
