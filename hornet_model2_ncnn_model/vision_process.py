# -*- coding: utf-8 -*-
import argparse
import cv2
import numpy as np
import threading
import time
import logging
import gc
import queue
import json
import socket
import os
from pathlib import Path
from flask import Flask, Response

from config import RuntimeConfig, apply_env_overrides, setup_logger
from diagnostics_helper import DiagnosticTicker
from mqtt_support import connect_mqtt_with_retries, create_mqtt_client

try:
    from picamera2 import Picamera2
except ImportError:
    Picamera2 = None
try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

CLASS_NAMES = {0: "Vespa_velutina", 1: "Vespa_crabro", 2: "Vespula_sp"}

class VisionDashboard:
    """High-performance MJPEG streaming dashboard."""
    def __init__(self, cfg, logger):
        self.app = Flask(__name__)
        self.cfg = cfg.visualization
        self.logger = logger
        self.latest_frame = None
        self._lock = threading.Lock()
        self._setup_routes()

    def _setup_routes(self):
        @self.app.route('/')
        def index():
            return "<html><body style='background:#111;color:white;text-align:center;'><h1>SmartHive Pro</h1><img src='/stream' style='border:3px solid #444;width:80%'></body></html>"

        @self.app.route('/stream')
        def stream():
            def generate():
                while True:
                    with self._lock:
                        if self.latest_frame is None:
                            time.sleep(0.05)
                            continue
                        # Use higher JPEG quality (85) for better clarity
                        _, buffer = cv2.imencode('.jpg', self.latest_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        frame_bytes = buffer.tobytes()
                    yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                    time.sleep(1.0 / 30) # Support up to 30 FPS streaming
            return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

    def update_frame(self, frame):
        with self._lock:
            self.latest_frame = frame

    def start(self):
        threading.Thread(target=lambda: self.app.run(host='0.0.0.0', port=5001, threaded=True, use_reloader=False), daemon=True).start()
        self.logger.info("Dashboard started on port 5001")

class ServoController:
    def __init__(self, cfg, logger):
        self.cfg = cfg.servo
        self.logger = logger
        self.pi = None
        self._current_angle = cfg.servo.angle_center
        self._scan_direction = 1
        self.stop_event = threading.Event()
        self._thread = None

    def _angle_to_pulse(self, angle):
        cfg = self.cfg
        ratio = (angle - cfg.angle_min) / (cfg.angle_max - cfg.angle_min)
        ratio = max(0.0, min(1.0, ratio))
        return int(cfg.pulse_min_us + ratio * (cfg.pulse_max_us - cfg.pulse_min_us))

    def set_angle(self, angle):
        if self.pi is None:
            return
        angle = max(self.cfg.angle_min, min(self.cfg.angle_max, angle))
        pulse = self._angle_to_pulse(angle)
        self.pi.set_servo_pulsewidth(self.cfg.gpio_pin, pulse)
        self._current_angle = angle

    def _scan_loop(self):
        self.logger.info("ServoController: 扫描启动 GPIO%d 范围[%.1f°, %.1f°] 速度%.1f°/s",
                         self.cfg.gpio_pin, self.cfg.angle_min, self.cfg.angle_max,
                         self.cfg.scan_speed_dps)
        self.set_angle(self.cfg.angle_center)
        time.sleep(0.5)
        while not self.stop_event.is_set():
            target = self.cfg.angle_max if self._scan_direction > 0 else self.cfg.angle_min
            step_time = 1.0 / max(1, self.cfg.scan_speed_dps)
            start = self._current_angle
            direction = 1 if target > start else -1
            a = start
            while not self.stop_event.is_set() and ((direction > 0 and a < target) or (direction < 0 and a > target)):
                a += direction * self.cfg.scan_speed_dps * step_time
                a = max(self.cfg.angle_min, min(self.cfg.angle_max, a))
                self.set_angle(a)
                time.sleep(step_time)
            self._scan_direction *= -1

    def initialize(self):
        if not self.cfg.enabled:
            self.logger.info("ServoController: 已禁用，跳过初始化")
            return False
        try:
            import pigpio
            self.pi = pigpio.pi()
            if not self.pi.connected:
                self.logger.error("ServoController: 无法连接pigpiod守护进程，请运行 sudo systemctl start pigpiod")
                self.pi = None
                return False
            self.pi.set_mode(self.cfg.gpio_pin, pigpio.OUTPUT)
            self.pi.set_PWM_frequency(self.cfg.gpio_pin, self.cfg.pwm_frequency)
            self.logger.info("ServoController: 初始化成功 GPIO%d PWM=%dHz",
                             self.cfg.gpio_pin, self.cfg.pwm_frequency)
            self._thread = threading.Thread(target=self._scan_loop, daemon=True)
            self._thread.start()
            return True
        except ImportError:
            self.logger.error("ServoController: 缺少pigpio库，请执行 pip install pigpio 并确保已安装系统包")
            return False
        except Exception as e:
            self.logger.error("ServoController: 初始化失败: %s", e)
            return False

    def cleanup(self):
        self.stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=3)
        if self.pi is not None:
            try:
                self.pi.set_servo_pulsewidth(self.cfg.gpio_pin, 0)
            except Exception:
                pass
            try:
                self.pi.stop()
            except Exception:
                pass
            self.pi = None
        self.logger.info("ServoController: 已清理")

class VisionEngine:
    def __init__(self, cfg, logger):
        self.cfg = cfg
        self.logger = logger
        self._diag = cfg.diagnostics
        self._vision_fps_ticker = DiagnosticTicker(
            max(5.0, cfg.diagnostics.summary_interval_seconds)
        )
        self._infer_count = 0
        self._infer_t0 = time.monotonic()
        self.stop_event = threading.Event()
        self.frame_queue = queue.Queue(maxsize=1)
        self.dashboard = VisionDashboard(cfg, logger)
        self.servo = ServoController(cfg, logger)
        self.model = None
        self.picam2 = None
        self.mqtt_client = None
        self.mqtt_topic = "pi5/vision/result"
        self.uds_path = cfg.uds_path
        self._last_mqtt_pub = 0.0

    def capture_thread(self):
        """Dedicated thread for high-speed camera capture."""
        if Picamera2 is None:
            self.logger.error("Picamera2 not installed, vision engine cannot start.")
            return
        self.picam2 = Picamera2()
        # Capture at 640x480 for better balance of quality and speed
        config = self.picam2.create_preview_configuration(main={"format": "BGR888", "size": (640, 480)})
        self.picam2.configure(config)
        self.picam2.start()
        
        while not self.stop_event.is_set():
            try:
                frame = self.picam2.capture_array()
                if frame is not None:
                    # Memory contiguous fix
                    frame = np.ascontiguousarray(frame[:, :, ::-1])
                    # Put in queue, if full, replace with new one
                    if self.frame_queue.full():
                        try: self.frame_queue.get_nowait()
                        except queue.Empty: pass
                    self.frame_queue.put(frame)
            except Exception as e:
                self.logger.error(f"Capture Error: {e}")
                time.sleep(1)
        self.picam2.stop()

    def uds_server_loop(self):
        """Unix Domain Socket server to handle commands from transfer_process."""
        if os.path.exists(self.uds_path):
            os.remove(self.uds_path)
        
        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server.bind(self.uds_path)
        server.listen(1)
        server.settimeout(1.0)
        self.logger.info(f"UDS server listening on {self.uds_path}")

        while not self.stop_event.is_set():
            try:
                conn, _ = server.accept()
                with conn:
                    data = conn.recv(1024)
                    if not data: continue
                    cmd = json.loads(data.decode('utf-8'))
                    self.logger.info(f"Received UDS command: {cmd}")
                    
                    if cmd.get("action") == "switch_model":
                        model_path = cmd.get("model_path")
                        if model_path and os.path.exists(model_path):
                            self.logger.info(f"Switching model to {model_path}")
                            # YOLO can load from .pt or .ncnn directory
                            self.model = YOLO(model_path, task='detect')
                            conn.sendall(json.dumps({"ok": True}).encode('utf-8'))
                        else:
                            conn.sendall(json.dumps({"ok": False, "error": "Invalid path"}).encode('utf-8'))
                    else:
                        conn.sendall(json.dumps({"ok": False, "error": "Unknown action"}).encode('utf-8'))
            except socket.timeout:
                continue
            except Exception as e:
                self.logger.error(f"UDS Error: {e}")
        
        server.close()
        if os.path.exists(self.uds_path):
            os.remove(self.uds_path)

    def initialize(self):
        self.logger.info("Initializing High-Performance Engine...")
        # 1. Model
        model_dir = Path(self.cfg.model.param_path).parent
        self.model = YOLO(str(model_dir), task='detect')
        
        # 2. MQTT
        if self.cfg.mqtt.enabled:
            self.mqtt_client = create_mqtt_client(f"{self.cfg.mqtt.client_id}-vision")
            if self.cfg.mqtt.username:
                self.mqtt_client.username_pw_set(self.cfg.mqtt.username, self.cfg.mqtt.password)
            connect_mqtt_with_retries(
                self.mqtt_client, 
                self.cfg.mqtt.host, 
                self.cfg.mqtt.port, 
                30, 
                self.stop_event, 
                self.logger, 
                label="VisionMQTT"
            )
        
        # 3. UDS & Capture & Dashboard & Servo
        threading.Thread(target=self.uds_server_loop, daemon=True, name="uds-server").start()
        self.dashboard.start()
        self.servo.initialize()
        threading.Thread(target=self.capture_thread, daemon=True, name="capture").start()

    def run_loop(self):
        self.logger.info("=== Vision Main Loop (Multi-Threaded) Running ===")
        while not self.stop_event.is_set():
            try:
                frame = self.frame_queue.get(timeout=1)
            except queue.Empty: continue
            
            t_start = time.monotonic()
            
            # 1. Faster Inference
            # imgsz=320 is the sweet spot for Pi 5
            results = self.model.predict(frame, imgsz=320, conf=self.cfg.model.confidence_threshold, verbose=False, half=True)[0]
            self._infer_count += 1
            latency_ms = (time.monotonic() - t_start) * 1000
            
            # 2. Draw detections on the frame
            hornet_count = 0
            if results.boxes is not None:
                hornet_count = len(results.boxes)
                for box in results.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                    label = CLASS_NAMES.get(int(box.cls[0]), "Hornet")
                    conf = float(box.conf[0])
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(frame, f"{label} {conf:.2f}", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

            # 3. Update Stream
            self.dashboard.update_frame(frame)
            
            # 4. MQTT Publish (Throttled)
            now = time.monotonic()
            if self.mqtt_client and (now - self._last_mqtt_pub >= self.cfg.mqtt.publish_interval_seconds):
                try:
                    payload = {
                        "hornet_count": hornet_count,
                        "fps": self._infer_count / max(1e-6, now - self._infer_t0),
                        "latency_ms": latency_ms,
                        "timestamp": int(time.time() * 1000)
                    }
                    self.mqtt_client.publish(self.mqtt_topic, json.dumps(payload), qos=0)
                    self._last_mqtt_pub = now
                except Exception as e:
                    self.logger.error(f"MQTT Publish Error: {e}")

            # 5. Diagnostics
            if self._diag.enabled and self._diag.log_vision_fps and self._vision_fps_ticker.should_fire():
                dt = max(1e-6, time.monotonic() - self._infer_t0)
                fps = self._infer_count / dt
                self.logger.info(
                    "[DIAG][Vision] 推理平均 %.2f FPS | 本周期帧=%d | 当前框数=%d | 延迟=%.1fms",
                    fps,
                    self._infer_count,
                    hornet_count,
                    latency_ms
                )
                self._infer_count = 0
                self._infer_t0 = time.monotonic()
            elif hornet_count > 0 and not self._diag.enabled:
                self.logger.info("Detected %d targets", hornet_count)

    def cleanup(self):
        self.stop_event.set()
        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
        self.servo.cleanup()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument(
        "--diagnostics",
        action="store_true",
        help="启用视觉推理 FPS/检测数等诊断日志",
    )
    parser.add_argument("--verbose", action="store_true", help="日志级别 DEBUG")
    args = parser.parse_args()
    cfg = RuntimeConfig.from_yaml(args.config)
    apply_env_overrides(cfg)
    if args.diagnostics:
        cfg.diagnostics.enabled = True
    if args.verbose:
        cfg.logging.level = "DEBUG"
    logger = setup_logger(cfg.logging, name="vision")
    engine = VisionEngine(cfg, logger)
    try:
        engine.initialize()
        engine.run_loop()
    except Exception as e:
        logger.error(f"Fatal Error: {e}")
    finally:
        engine.cleanup()

if __name__ == "__main__":
    main()