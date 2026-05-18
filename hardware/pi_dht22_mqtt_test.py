#!/usr/bin/env python3
"""
Raspberry Pi dual DHT22(GPIO4 + GPIO17) -> MQTT -> SmartHive backend test publisher.

（说明）正式蜂箱「数据传输」主程序在仓库 ``hornet_model2_ncnn_model/transfer_process.py``，
由 ``launch.sh`` 与 ``sensor_process.py`` / ``vision_process.py`` 一起跑；本文件仅作独立 MQTT 联调/演示。

Default behavior:
- Read inside DHT22 from BCM GPIO4
- Read outside DHT22 from BCM GPIO17
- Publish to topic: smarthive/<device_id>/sensors
- Use payload fields: in_temp / in_humi / out_temp / out_humi

Dependencies:
  pip install adafruit-circuitpython-dht paho-mqtt
  sudo apt install libgpiod2

默认连接信息写在下方常量里，直接 ``python3 hardware/pi_dht22_mqtt_test.py`` 即可运行；
仍可用命令行参数覆盖任意一项。

Example:
  python3 hardware/pi_dht22_mqtt_test.py --once
"""

from __future__ import annotations

import argparse
import json
import logging
import signal
import socket
import sys
import time
from typing import Optional, Tuple

try:
    import board
except ImportError as exc:  # pragma: no cover - runtime dependency
    raise SystemExit(
        "Missing dependency: board. Install with `pip install adafruit-circuitpython-dht`."
    ) from exc

try:
    import adafruit_dht
except ImportError as exc:  # pragma: no cover - runtime dependency
    raise SystemExit(
        "Missing dependency: adafruit_dht. Install with `pip install adafruit-circuitpython-dht`."
    ) from exc

try:
    import paho.mqtt.client as mqtt
except ImportError as exc:  # pragma: no cover - runtime dependency
    raise SystemExit(
        "Missing dependency: paho-mqtt. Install with `pip install paho-mqtt`."
    ) from exc


LOGGER = logging.getLogger("pi-dht22-mqtt-test")
STOP = False

# ---------- MQTT / 设备：按需改这里（勿提交到公开仓库时可改用本地私有库）----------
MQTT_HOST = "121.196.155.132"
MQTT_PORT = 1883
MQTT_USERNAME = "123456"
MQTT_PASSWORD = "226886"
# 须与网页「IoT 设备 ID / visionDeviceId」一致，否则总览实时面板可能收不到 SSE
MQTT_DEVICE_ID = "pi5-dht22-test"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read inside/outside DHT22 sensors on Raspberry Pi and publish to SmartHive via MQTT."
    )
    parser.add_argument(
        "--host",
        default=MQTT_HOST,
        help="MQTT broker host or IP（默认见文件顶部 MQTT_HOST）",
    )
    parser.add_argument("--port", type=int, default=MQTT_PORT, help="MQTT broker port")
    parser.add_argument("--username", default=MQTT_USERNAME, help="MQTT 用户名（默认见 MQTT_USERNAME）")
    parser.add_argument("--password", default=MQTT_PASSWORD, help="MQTT 密码（默认见 MQTT_PASSWORD）")
    parser.add_argument("--device-id", default=MQTT_DEVICE_ID, help="SmartHive deviceId（默认见 MQTT_DEVICE_ID）")
    parser.add_argument("--client-id", default="", help="MQTT client id")
    parser.add_argument(
        "--topic",
        default="",
        help="MQTT topic, default: smarthive/<device-id>/sensors",
    )
    parser.add_argument(
        "--inside-pin",
        default="D4",
        help="Inside DHT22 board pin name, default D4 (BCM GPIO4)",
    )
    parser.add_argument(
        "--outside-pin",
        default="D17",
        help="Outside DHT22 board pin name, default D17 (BCM GPIO17)",
    )
    parser.add_argument("--interval", type=float, default=10.0, help="Publish interval in seconds")
    parser.add_argument("--qos", type=int, choices=(0, 1, 2), default=1, help="MQTT QoS")
    parser.add_argument("--retain", action="store_true", help="Publish with retain flag")
    parser.add_argument("--once", action="store_true", help="Read and publish one message, then exit")
    parser.add_argument(
        "--log-level",
        choices=("DEBUG", "INFO", "WARNING", "ERROR"),
        default="INFO",
        help="Log level",
    )
    return parser.parse_args()


def setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )


def handle_signal(_signum: int, _frame) -> None:
    global STOP
    STOP = True
    LOGGER.info("Stopping...")


def resolve_board_pin(pin_name: str):
    try:
        return getattr(board, pin_name)
    except AttributeError as exc:
        raise SystemExit(
            f"Invalid pin '{pin_name}'. Example values: D17, D4, D18."
        ) from exc


def get_local_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        sock.close()


def read_dht22_with_retry(sensor, retries: int = 3, delay_seconds: float = 2.0) -> Tuple[float, float]:
    last_error: Optional[Exception] = None
    for _ in range(retries):
        try:
            temperature = sensor.temperature
            humidity = sensor.humidity
            if temperature is None or humidity is None:
                raise RuntimeError("Empty DHT22 reading")
            return float(temperature), float(humidity)
        except RuntimeError as exc:
            last_error = exc
            time.sleep(delay_seconds)
    raise RuntimeError(f"DHT22 read failed after {retries} retries: {last_error}")


def build_payload(
    device_id: str,
    inside_temperature: float,
    inside_humidity: float,
    outside_temperature: float,
    outside_humidity: float,
) -> dict:
    return {
        "deviceId": device_id,
        "timestamp": int(time.time() * 1000),
        "sensors": [
            {"type": "in_temp", "value": round(inside_temperature, 2), "unit": "C"},
            {"type": "in_humi", "value": round(inside_humidity, 2), "unit": "%"},
            {"type": "out_temp", "value": round(outside_temperature, 2), "unit": "C"},
            {"type": "out_humi", "value": round(outside_humidity, 2), "unit": "%"},
        ],
        "status": {
            "online": True,
            "ip": get_local_ip(),
        },
    }


def build_mqtt_client(args: argparse.Namespace) -> mqtt.Client:
    client_id = args.client_id or f"{args.device_id}-mqtt-test"
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
    except (AttributeError, TypeError):
        client = mqtt.Client(client_id=client_id)
    if args.username:
        client.username_pw_set(args.username, args.password)
    client.reconnect_delay_set(min_delay=1, max_delay=10)

    def on_connect(_client, _userdata, _flags, reason_code, _properties=None):
        code = getattr(reason_code, "value", reason_code)
        if code == 0:
            LOGGER.info("MQTT connected: %s:%s", args.host, args.port)
        else:
            LOGGER.error("MQTT connect failed, reason=%s", code)

    def on_disconnect(_client, _userdata, *callback_args):
        if STOP:
            return
        if len(callback_args) >= 2:
            disconnect_flags = callback_args[0]
            reason_code = callback_args[1]
        elif len(callback_args) == 1:
            disconnect_flags = None
            reason_code = callback_args[0]
        else:
            disconnect_flags = None
            reason_code = "unknown"
        code = getattr(reason_code, "value", reason_code)
        LOGGER.warning(
            "MQTT disconnected, reason=%s disconnect_flags=%s; client will retry",
            code,
            disconnect_flags,
        )

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    return client


def main() -> int:
    args = parse_args()
    setup_logging(args.log_level)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    inside_pin = resolve_board_pin(args.inside_pin)
    outside_pin = resolve_board_pin(args.outside_pin)
    topic = args.topic or f"smarthive/{args.device_id}/sensors"
    inside_dht_device = adafruit_dht.DHT22(inside_pin, use_pulseio=False)
    outside_dht_device = adafruit_dht.DHT22(outside_pin, use_pulseio=False)
    mqtt_client = build_mqtt_client(args)

    try:
        LOGGER.info(
            "Using DHT22 inside=board.%s outside=board.%s topic=%s",
            args.inside_pin,
            args.outside_pin,
            topic,
        )
        mqtt_client.connect(args.host, args.port, keepalive=30)
        mqtt_client.loop_start()

        while not STOP:
            try:
                inside_temperature, inside_humidity = read_dht22_with_retry(inside_dht_device)
                outside_temperature, outside_humidity = read_dht22_with_retry(outside_dht_device)
                payload = build_payload(
                    args.device_id,
                    inside_temperature,
                    inside_humidity,
                    outside_temperature,
                    outside_humidity,
                )
                payload_text = json.dumps(payload, ensure_ascii=True)
                result = mqtt_client.publish(topic, payload_text, qos=args.qos, retain=args.retain)
                result.wait_for_publish()

                if result.rc != mqtt.MQTT_ERR_SUCCESS:
                    LOGGER.error("Publish failed, rc=%s", result.rc)
                else:
                    LOGGER.info(
                        "Published OK: inside=%.2fC/%.2f%% outside=%.2fC/%.2f%% deviceId=%s",
                        inside_temperature,
                        inside_humidity,
                        outside_temperature,
                        outside_humidity,
                        args.device_id,
                    )
                    LOGGER.debug("Payload: %s", payload_text)
            except Exception as exc:  # pragma: no cover - hardware/network runtime path
                LOGGER.exception("Read or publish failed: %s", exc)

            if args.once:
                break

            deadline = time.time() + max(1.0, args.interval)
            while not STOP and time.time() < deadline:
                time.sleep(0.2)
    finally:
        try:
            mqtt_client.loop_stop()
            mqtt_client.disconnect()
        except Exception:
            pass
        try:
            inside_dht_device.exit()
        except Exception:
            pass
        try:
            outside_dht_device.exit()
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
