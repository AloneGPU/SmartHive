#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Standalone servo test for GPIO18.

Usage:
  python3 servo_test.py --config config.yaml --driver auto
"""
from __future__ import annotations

import argparse
import time

from config import RuntimeConfig, apply_env_overrides, setup_logger
from vision_process import ServoController


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--driver", choices=("auto", "pigpio", "gpiozero"), default=None)
    parser.add_argument("--cycles", type=int, default=2)
    parser.add_argument("--delay", type=float, default=0.8)
    args = parser.parse_args()

    cfg = RuntimeConfig.from_yaml(args.config)
    apply_env_overrides(cfg)
    if args.driver:
        cfg.servo.driver = args.driver
    cfg.servo.enabled = True
    cfg.logging.level = "INFO"

    logger = setup_logger(cfg.logging, name="servo-test")
    servo = ServoController(cfg, logger)
    if not servo.initialize(start_scan=False):
        raise SystemExit("Servo init failed. Check logs, wiring, power supply, and GPIO18.")

    try:
        angles = [cfg.servo.angle_min, cfg.servo.angle_center, cfg.servo.angle_max, cfg.servo.angle_center]
        for _ in range(max(1, args.cycles)):
            for angle in angles:
                logger.info("Servo test: angle %.1f", angle)
                servo.set_angle(angle)
                time.sleep(max(0.1, args.delay))
    finally:
        servo.cleanup()


if __name__ == "__main__":
    main()
