"""
树莓派三进程共用的诊断工具：按时间间隔节流，避免刷屏。
"""
from __future__ import annotations

import threading
import time
from typing import Any, Dict


class DiagnosticTicker:
    """线程安全的周期触发器（秒）。"""

    def __init__(self, interval_s: float):
        self._interval = max(0.5, float(interval_s))
        self._last = 0.0
        self._lock = threading.Lock()

    def should_fire(self) -> bool:
        now = time.time()
        with self._lock:
            if now - self._last < self._interval:
                return False
            self._last = now
            return True


def format_sensor_snapshot(snap: Dict[str, Any]) -> str:
    return (
        f"in_T={float(snap.get('in_temp', 0) or 0):.1f}°C in_RH={float(snap.get('in_humi', 0) or 0):.1f}% | "
        f"out_T={float(snap.get('out_temp', 0) or 0):.1f}°C out_RH={float(snap.get('out_humi', 0) or 0):.1f}% | "
        f"W={float(snap.get('weight', 0) or 0):.2f}kg | bee in/out={int(snap.get('in_count', 0) or 0)}"
        f"/{int(snap.get('out_count', 0) or 0)} | "
        f"GPS=({float(snap.get('lat', 0) or 0):.5f},{float(snap.get('lon', 0) or 0):.5f}) | "
        f"hornet={int(snap.get('hornet_count', 0) or 0)} "
        f"fps={float(snap.get('fps', 0) or 0):.1f} lat_ms={float(snap.get('latency_ms', 0) or 0):.1f}"
    )


def truncate_middle(text: str, max_len: int = 240) -> str:
    if len(text) <= max_len:
        return text
    head = max_len // 2 - 6
    tail = max_len - head - 10
    return text[:head] + " ...<snip>... " + text[-tail:]
