"""
树莓派端 MQTT 公共逻辑：paho-mqtt 1.x / 2.x 兼容、断线后自动重连退避参数。
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any


def create_mqtt_client(client_id: str) -> Any:
    """创建 MQTT 客户端；首次 connect 成功后，paho 会在断线时按退避策略自动重连。"""
    try:
        from paho.mqtt.enums import CallbackAPIVersion
        from paho.mqtt.client import Client

        client = Client(CallbackAPIVersion.VERSION1, client_id=client_id)
    except Exception:
        import paho.mqtt.client as mqtt

        client = mqtt.Client(client_id=client_id)
    try:
        client.reconnect_delay_set(min_delay=1, max_delay=120)
    except Exception:
        pass
    return client


def connect_mqtt_with_retries(
    client: Any,
    host: str,
    port: int,
    keepalive: int,
    stop_event: threading.Event,
    logger: logging.Logger,
    *,
    label: str = "MQTT",
    initial_backoff_s: float = 3.0,
    max_backoff_s: float = 60.0,
) -> bool:
    """
    阻塞式首次连接；失败则退避重试直到成功或 stop_event 被设置。
    成功时已调用 loop_start()。
    """
    backoff = initial_backoff_s
    while not stop_event.is_set():
        try:
            client.connect(host, int(port), keepalive=keepalive)
            client.loop_start()
            logger.info("%s: 已连接 %s:%s", label, host, port)
            return True
        except Exception as e:
            logger.warning("%s: 连接失败 %s，%.0f 秒后重试", label, e, backoff)
            stop_event.wait(timeout=backoff)
            backoff = min(max_backoff_s, backoff * 1.5)
    return False
