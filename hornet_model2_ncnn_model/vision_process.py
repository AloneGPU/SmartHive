# -*- coding: utf-8 -*-
"""
vision_process.py - Vision Recognition & Streaming Process
=========================================================
Responsibilities:
  - Capture frames from USB Camera (OpenCV VideoCapture)
  - Run YOLO/NCNN inference for hornet detection
  - Control servo pan-tilt for horizontal scanning
  - Stream MJPEG video to frontend
  - Publish detection results via MQTT to transfer_process
  - Handle UDS commands for model switching

No hardware interaction beyond camera, servo, and network.
"""
import argparse
import cv2
import gc
import numpy as np
import threading
import time
import logging
import queue
import json
import socket
import os
import subprocess
from pathlib import Path
from flask import Flask, Response

from config import RuntimeConfig, apply_env_overrides, setup_logger
from diagnostics_helper import DiagnosticTicker
from mqtt_support import connect_mqtt_with_retries, create_mqtt_client

# Picamera2 removed - using USB camera via OpenCV VideoCapture instead
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
        self._frame_count = 0
        self._last_fps_time = time.time()
        self._fps = 0.0
        self._setup_routes()

    def _setup_routes(self):
        @self.app.route('/')
        def index():
            return "<html><body style='background:#111;color:white;text-align:center;'><h1>SmartHive Vision</h1><img src='/stream' style='border:3px solid #444;width:80%'></body></html>"

        @self.app.route('/stream')
        def stream():
            def generate():
                while True:
                    with self._lock:
                        if self.latest_frame is None:
                            time.sleep(0.05)
                            continue
                        # 帧已在捕获时翻转为RGB，直接编码
                        _, buffer = cv2.imencode('.jpg', self.latest_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        frame_bytes = buffer.tobytes()
                        self._frame_count += 1
                        # Calculate FPS every second
                        now = time.time()
                        if now - self._last_fps_time >= 1.0:
                            self._fps = self._frame_count / (now - self._last_fps_time)
                            self._frame_count = 0
                            self._last_fps_time = now
                    yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                    time.sleep(1.0 / 30)  # Support up to 30 FPS streaming
            return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

        @self.app.route('/status')
        def status():
            return {"fps": round(self._fps, 2), "frame_count": self._frame_count}

    def update_frame(self, frame):
        with self._lock:
            self.latest_frame = frame

    def start(self):
        threading.Thread(
            target=lambda: self.app.run(host='0.0.0.0', port=5001, threaded=True, use_reloader=False),
            daemon=True
        ).start()
        self.logger.info("VisionDashboard started on port 5001")


class ServoController:
    """Servo pan-tilt controller for horizontal scanning."""

    PIGPIOD_CONNECT_RETRIES = 8
    PIGPIOD_CONNECT_DELAY_SECONDS = 0.5

    def __init__(self, cfg, logger):
        self.cfg = cfg.servo
        self.logger = logger
        self.pi = None
        self._gpiozero_servo = None
        self._driver = None
        self._current_angle = cfg.servo.angle_center
        self._scan_direction = 1
        self.stop_event = threading.Event()
        self._thread = None
        self._initialized = False

    def _angle_to_pulse(self, angle):
        cfg = self.cfg
        ratio = (angle - cfg.angle_min) / (cfg.angle_max - cfg.angle_min)
        ratio = max(0.0, min(1.0, ratio))
        return int(cfg.pulse_min_us + ratio * (cfg.pulse_max_us - cfg.pulse_min_us))

    def set_angle(self, angle):
        angle = max(self.cfg.angle_min, min(self.cfg.angle_max, angle))
        pulse = self._angle_to_pulse(angle)
        try:
            if self._driver == "pigpio" and self.pi is not None:
                self.pi.set_servo_pulsewidth(self.cfg.gpio_pin, pulse)
            elif self._driver == "gpiozero" and self._gpiozero_servo is not None:
                self._gpiozero_servo.angle = angle
            else:
                return
            self._current_angle = angle
        except Exception as e:
            self.logger.warning("ServoController: set angle failed driver=%s GPIO%d angle=%.1f pulse=%d: %s",
                                self._driver, self.cfg.gpio_pin, angle, pulse, e)

    def _connect_pigpio(self):
        import pigpio

        last_error = None
        for attempt in range(1, self.PIGPIOD_CONNECT_RETRIES + 1):
            try:
                pi = pigpio.pi()
                if pi.connected:
                    if attempt > 1:
                        self.logger.info("ServoController: Connected to pigpiod after %d attempts", attempt)
                    return pi
                last_error = "pigpio.pi().connected is false"
                try:
                    pi.stop()
                except Exception:
                    pass
            except Exception as e:
                last_error = str(e)

            if attempt == 1:
                self.logger.warning("ServoController: pigpiod not ready, trying to start it...")
                try:
                    subprocess.run(
                        ["sudo", "-n", "pigpiod"],
                        check=False,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=3,
                    )
                except Exception as e:
                    self.logger.warning("ServoController: failed to invoke sudo -n pigpiod: %s", e)
            time.sleep(self.PIGPIOD_CONNECT_DELAY_SECONDS)

        self.logger.error(
            "ServoController: Cannot connect to pigpiod after %d attempts (%s). "
            "Run: sudo systemctl start pigpiod",
            self.PIGPIOD_CONNECT_RETRIES,
            last_error,
        )
        return None

    def _initialize_pigpio(self):
        import pigpio

        self.pi = self._connect_pigpio()
        if self.pi is None:
            return False

        self.pi.set_mode(self.cfg.gpio_pin, pigpio.OUTPUT)
        self.pi.set_PWM_frequency(self.cfg.gpio_pin, self.cfg.pwm_frequency)
        self.pi.set_servo_pulsewidth(self.cfg.gpio_pin, 0)
        self._driver = "pigpio"
        self.logger.info(
            "ServoController: Initialized pigpio GPIO%d PWM=%dHz range[%.1f, %.1f] center=%.1f pulse[%d, %d]us",
            self.cfg.gpio_pin,
            self.cfg.pwm_frequency,
            self.cfg.angle_min,
            self.cfg.angle_max,
            self.cfg.angle_center,
            self.cfg.pulse_min_us,
            self.cfg.pulse_max_us,
        )
        return True

    def _initialize_gpiozero(self):
        from gpiozero import AngularServo
        try:
            from gpiozero.pins.lgpio import LGPIOFactory
            pin_factory = LGPIOFactory()
        except Exception:
            pin_factory = None

        self._gpiozero_servo = AngularServo(
            self.cfg.gpio_pin,
            min_angle=self.cfg.angle_min,
            max_angle=self.cfg.angle_max,
            min_pulse_width=self.cfg.pulse_min_us / 1_000_000.0,
            max_pulse_width=self.cfg.pulse_max_us / 1_000_000.0,
            initial_angle=self.cfg.angle_center,
            pin_factory=pin_factory,
        )
        self._driver = "gpiozero"
        self._current_angle = self.cfg.angle_center
        self.logger.info(
            "ServoController: Initialized gpiozero AngularServo GPIO%d range[%.1f, %.1f] center=%.1f pulse[%d, %d]us",
            self.cfg.gpio_pin,
            self.cfg.angle_min,
            self.cfg.angle_max,
            self.cfg.angle_center,
            self.cfg.pulse_min_us,
            self.cfg.pulse_max_us,
        )
        return True

    def _scan_loop(self):
        self.logger.info(
            "ServoController: Scan started GPIO%d range[%.1f°, %.1f°] speed=%.1f°/s",
            self.cfg.gpio_pin, self.cfg.angle_min, self.cfg.angle_max,
            self.cfg.scan_speed_dps
        )
        self.set_angle(self.cfg.angle_center)
        time.sleep(0.5)

        while not self.stop_event.is_set():
            target = self.cfg.angle_max if self._scan_direction > 0 else self.cfg.angle_min
            step_degrees = max(0.5, float(getattr(self.cfg, "scan_step_degrees", 2.0)))
            step_time = max(0.05, float(getattr(self.cfg, "scan_step_interval_seconds", 0.12)))
            start = self._current_angle
            direction = 1 if target > start else -1
            a = start

            while not self.stop_event.is_set() and ((direction > 0 and a < target) or (direction < 0 and a > target)):
                a += direction * min(step_degrees, max(0.5, self.cfg.scan_speed_dps * step_time))
                a = max(self.cfg.angle_min, min(self.cfg.angle_max, a))
                self.set_angle(a)
                time.sleep(step_time)

            self._scan_direction *= -1

    def initialize(self, start_scan: bool = True):
        if not self.cfg.enabled:
            self.logger.info("ServoController: Disabled, skipping initialization")
            return False

        driver = str(getattr(self.cfg, "driver", "auto") or "auto").strip().lower()
        initialized = False

        if driver in ("auto", "pigpio"):
            try:
                initialized = self._initialize_pigpio()
            except ImportError:
                self.logger.warning("ServoController: pigpio library not found")
            except Exception as e:
                self.logger.warning("ServoController: pigpio initialization failed: %s", e)
            if not initialized and driver == "pigpio":
                self.logger.error("ServoController: pigpio driver requested but unavailable")
                return False

        if not initialized and driver in ("auto", "gpiozero"):
            try:
                initialized = self._initialize_gpiozero()
            except ImportError:
                self.logger.error("ServoController: gpiozero/lgpio unavailable. Install with: pip install gpiozero rpi-lgpio")
            except Exception as e:
                self.logger.error("ServoController: gpiozero initialization failed: %s", e)

        if not initialized:
            self.logger.error("ServoController: no usable servo driver, servo will not move")
            return False

        if start_scan:
            self._thread = threading.Thread(target=self._scan_loop, daemon=True)
            self._thread.start()
        self._initialized = True
        return True

    def is_initialized(self):
        return self._initialized

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
        if self._gpiozero_servo is not None:
            try:
                self._gpiozero_servo.detach()
                self._gpiozero_servo.close()
            except Exception:
                pass
            self._gpiozero_servo = None
        self._driver = None
        self._initialized = False
        self.logger.info("ServoController: Cleaned up")


class VisionEngine:
    """Main vision processing engine with multi-threaded architecture."""

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
        self.frame_queue = queue.Queue(maxsize=2)  # 推理专用队列（小队列，丢旧帧）
        self.latest_frame = None  # 最新帧（显示用）
        self._frame_lock = threading.Lock()
        self.dashboard = VisionDashboard(cfg, logger)
        self.servo = ServoController(cfg, logger)
        self.model = None
        self.mqtt_client = None
        self.mqtt_topic = "pi5/vision/result"
        self.uds_path = cfg.uds_path
        self._last_mqtt_pub = 0.0
        self._consecutive_errors = 0
        self._max_consecutive_errors = 10
        # 推理结果（线程共享）
        self._detections = []  # [(x1,y1,x2,y2,label,conf), ...]
        self._det_lock = threading.Lock()
        self._infer_latency_ms = 0.0
        self._infer_hornet_count = 0
        self._max_hornet_since_pub = 0

    def _open_camera(self) -> cv2.VideoCapture:
        """尝试打开USB摄像头，返回VideoCapture对象或None"""
        for idx in range(5):
            cap = cv2.VideoCapture(idx, cv2.CAP_V4L2)  # 强制使用V4L2后端
            if cap.isOpened():
                # 设置分辨率和帧率
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                cap.set(cv2.CAP_PROP_FPS, 30)
                
                # 设置缓冲区大小（减少超时问题）
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
                
                # 设置曝光模式为自动
                cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.25)  # 0.25 = auto
                
                self.logger.info(f"USB Camera opened successfully at index {idx} (640x480 @ 30fps)")
                
                # 摄像头预热：读取几帧丢弃，让摄像头稳定
                self.logger.info("Warming up camera...")
                for _ in range(5):
                    ret, _ = cap.read()
                    if not ret:
                        self.logger.warning(f"Camera warm-up frame {_+1} failed, continuing...")
                    time.sleep(0.1)
                
                self.logger.info("Camera warm-up completed")
                return cap
            cap.release()
        
        self.logger.error("No USB camera found on indices 0-4")
        return None

    def capture_thread(self):
        """Dedicated thread for high-speed camera capture using USB camera with auto-reconnect."""
        cap = None
        reconnect_delay = 1.0  # 初始重连延迟（秒）
        max_reconnect_delay = 30.0  # 最大重连延迟
        reconnect_attempts = 0

        try:
            # 初始打开摄像头
            cap = self._open_camera()
            if cap is None:
                self.logger.error("Failed to initialize USB camera. Retrying...")
                time.sleep(2)
                cap = self._open_camera()
                if cap is None:
                    self.logger.error("USB camera not available after retry. Vision engine cannot start.")
                    return

            self.logger.info("USB Camera capture started successfully")

            while not self.stop_event.is_set():
                try:
                    # 设置超时时间，避免无限等待
                    cap.grab()  # 先抓取帧（不解码，更快）
                    ret, frame = cap.retrieve()  # 再解码
                    
                    if not ret or frame is None:
                        self._consecutive_errors += 1
                        # 对于偶发超时，降低日志级别
                        if self._consecutive_errors < 5:
                            self.logger.warning(f"Capture failed (ret={ret}), error count: {self._consecutive_errors}/{self._max_consecutive_errors}")
                        else:
                            self.logger.error(f"Capture failed (ret={ret}), error count: {self._consecutive_errors}/{self._max_consecutive_errors}")
                        
                        if self._consecutive_errors >= self._max_consecutive_errors:
                            self.logger.error("Too many consecutive errors, attempting camera reconnect...")
                            
                            # 释放当前摄像头
                            if cap:
                                try:
                                    cap.release()
                                except Exception:
                                    pass
                            
                            # 指数退避重连
                            reconnect_delay = min(reconnect_delay * 2, max_reconnect_delay)
                            reconnect_attempts += 1
                            self.logger.info(f"Reconnect attempt {reconnect_attempts}, waiting {reconnect_delay:.1f}s...")
                            time.sleep(reconnect_delay)
                            
                            # 尝试重新打开摄像头
                            cap = self._open_camera()
                            if cap is None:
                                continue
                            
                            # 重连成功，重置状态
                            self.logger.info("USB Camera reconnected successfully")
                            reconnect_delay = 1.0
                            reconnect_attempts = 0
                            self._consecutive_errors = 0
                            continue
                            
                        # 偶发失败，短暂等待后重试
                        time.sleep(0.05)
                        continue

                    # OpenCV 默认是 BGR 格式，保持原样（YOLO 和 imencode 都使用 BGR）
                    # 1. 更新最新帧（显示用）
                    with self._frame_lock:
                        self.latest_frame = frame
                    # 2. 送入推理队列（满则丢旧帧）
                    if self.frame_queue.full():
                        try:
                            self.frame_queue.get_nowait()
                        except queue.Empty:
                            pass
                    self.frame_queue.put(frame)
                    self._consecutive_errors = 0
                    reconnect_delay = 1.0  # 成功捕获后重置重连延迟
                    
                except Exception as e:
                    self._consecutive_errors += 1
                    if self._consecutive_errors < 5:
                        self.logger.warning(f"Capture error ({self._consecutive_errors}/{self._max_consecutive_errors}): {e}")
                    else:
                        self.logger.error(f"Capture error ({self._consecutive_errors}/{self._max_consecutive_errors}): {e}")
                    
                    if self._consecutive_errors >= self._max_consecutive_errors:
                        self.logger.error("Too many consecutive errors, attempting reconnect...")
                        # 释放并触发重连
                        if cap:
                            try:
                                cap.release()
                            except Exception:
                                pass
                            
                            reconnect_delay = min(reconnect_delay * 2, max_reconnect_delay)
                            reconnect_attempts += 1
                            self.logger.info(f"Reconnect attempt {reconnect_attempts}, waiting {reconnect_delay:.1f}s...")
                            time.sleep(reconnect_delay)
                            
                            cap = self._open_camera()
                            if cap is not None:
                                self.logger.info("USB Camera reconnected successfully")
                                reconnect_delay = 1.0
                                reconnect_attempts = 0
                                self._consecutive_errors = 0
                    
                    time.sleep(0.1)

        except Exception as e:
            self.logger.error(f"USB Camera initialization failed: {e}")
        finally:
            if cap:
                try:
                    cap.release()
                    self.logger.info("USB Camera released")
                except Exception:
                    pass

    def _inference_loop(self):
        """独立推理线程：从队列取帧推理，更新共享检测结果。"""
        self.logger.info("Inference thread started")
        while not self.stop_event.is_set():
            try:
                frame = self.frame_queue.get(timeout=1)
            except queue.Empty:
                continue

            t_start = time.monotonic()
            try:
                # YOLO 期望 RGB 格式，OpenCV 读取的是 BGR，需要转换
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                
                results = self.model.predict(
                    frame_rgb,
                    imgsz=tuple(self.cfg.model.input_size),
                    conf=self.cfg.model.confidence_threshold,
                    iou=self.cfg.model.nms_threshold,
                    verbose=False,
                    half=True,
                    device='cpu'  # 强制使用 CPU（树莓派）
                )[0]
                self._infer_count += 1
                latency_ms = (time.monotonic() - t_start) * 1000
            except Exception as e:
                self.logger.error(f"Inference error: {e}")
                self.logger.error(f"Frame shape: {frame.shape if frame is not None else 'None'}")
                continue

            # 解析检测结果
            detections = []
            hornet_count = 0
            if results.boxes is not None:
                hornet_count = len(results.boxes)
                for box in results.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                    label = CLASS_NAMES.get(int(box.cls[0]), "Hornet")
                    conf = float(box.conf[0])
                    detections.append((x1, y1, x2, y2, label, conf))

            # 更新共享状态
            with self._det_lock:
                self._detections = detections
                self._infer_latency_ms = latency_ms
                self._infer_hornet_count = hornet_count
                self._max_hornet_since_pub = max(self._max_hornet_since_pub, hornet_count)

            # 诊断日志
            if self._diag.enabled and self._diag.log_vision_fps and self._vision_fps_ticker.should_fire():
                dt = max(1e-6, time.monotonic() - self._infer_t0)
                fps = self._infer_count / dt
                self.logger.info(
                    "[DIAG][Vision] Inference avg %.2f FPS | Frames=%d | Detections=%d | Latency=%.1fms",
                    fps, self._infer_count, hornet_count, latency_ms
                )
                self._infer_count = 0
                self._infer_t0 = time.monotonic()
            elif hornet_count > 0 and not self._diag.enabled:
                self.logger.info("Detected %d targets", hornet_count)

            # 释放推理结果
            del results
            # 每60次推理做一次gc（而非每次，避免Pi5上gc开销拖慢帧率）
            if self._infer_count % 60 == 0:
                gc.collect()

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
                    if not data:
                        continue
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
        self.logger.info("Initializing Vision Engine...")

        # 1. Model loading（NCNN 模型通过目录加载，包含 .param 和 .bin 文件）
        try:
            raw_param = Path(self.cfg.model.param_path)
            param_abs = (raw_param if raw_param.is_absolute() else Path.cwd() / raw_param).resolve()
            model_dir = param_abs.parent
            
            # 验证模型文件
            if not param_abs.is_file():
                self.logger.error(
                    "模型 .param 文件不存在: %s",
                    param_abs,
                )
                raise FileNotFoundError(f"param file not found: {param_abs}")
            
            bin_path = param_abs.parent / (param_abs.stem.replace('.ncnn', '') + '.ncnn.bin')
            if not bin_path.is_file():
                self.logger.error("模型 .bin 文件不存在: %s", bin_path)
                raise FileNotFoundError(f"bin file not found: {bin_path}")
            
            # YOLO 从目录加载 NCNN 模型
            self.model = YOLO(str(model_dir), task="detect")
            
            self.logger.info("NCNN Model loaded successfully:")
            self.logger.info(f"  - Model directory: {model_dir}")
            self.logger.info(f"  - Param file: {param_abs}")
            self.logger.info(f"  - Bin file: {bin_path}")
            self.logger.info(f"  - Input size: {self.cfg.model.input_size}")
            self.logger.info(f"  - Confidence threshold: {self.cfg.model.confidence_threshold}")
            self.logger.info(f"  - NMS threshold: {self.cfg.model.nms_threshold}")
            
        except Exception as e:
            self.logger.error(f"Model loading failed: {e}")
            import traceback
            self.logger.error(f"Error traceback:\n{traceback.format_exc()}")
            raise

        # 2. MQTT connection with retries
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

        # 3. Start subsystems
        threading.Thread(target=self.uds_server_loop, daemon=True, name="uds-server").start()
        self.dashboard.start()
        self.servo.initialize()
        threading.Thread(target=self.capture_thread, daemon=True, name="capture").start()
        threading.Thread(target=self._inference_loop, daemon=True, name="inference").start()

        # Wait for camera to initialize
        time.sleep(2)

    def run_loop(self):
        """显示主循环：取最新帧 + 最新检测框 → 画框 → 送显 → 发MQTT。不阻塞推理。"""
        self.logger.info("=== Vision Display Loop Running ===")

        while not self.stop_event.is_set():
            # 1. 取最新帧（不复制，直接引用；dashboard.update_frame 内部有锁保护）
            with self._frame_lock:
                frame = self.latest_frame
            if frame is None:
                time.sleep(0.05)
                continue

            # 2. 取最新检测结果
            with self._det_lock:
                detections = list(self._detections)
                latency_ms = self._infer_latency_ms

            # 3. 画框（直接画在帧上，由 dashboard 的锁保护并发访问）
            for (x1, y1, x2, y2, label, conf) in detections:
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(
                    frame,
                    f"{label} {conf:.2f}",
                    (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 0),
                    2
                )

            # 4. 更新显示
            self.dashboard.update_frame(frame)

            # 5. MQTT Publish (Throttled)
            now = time.monotonic()
            if self.mqtt_client and (now - self._last_mqtt_pub >= self.cfg.mqtt.publish_interval_seconds):
                try:
                    with self._det_lock:
                        max_hornet = self._max_hornet_since_pub
                        self._max_hornet_since_pub = 0
                    payload = {
                        "hornet_count": max_hornet,
                        "fps": self._infer_count / max(1e-6, now - self._infer_t0),
                        "latency_ms": latency_ms,
                        "timestamp": int(time.time() * 1000)
                    }
                    self.mqtt_client.publish(self.mqtt_topic, json.dumps(payload), qos=0)
                    self._last_mqtt_pub = now
                except Exception as e:
                    self.logger.error(f"MQTT Publish Error: {e}")

            # 6. 最小间隔，让出CPU（MJPEG推流内部已有帧率控制）
            time.sleep(0.01)

    def cleanup(self):
        self.stop_event.set()
        if self.mqtt_client:
            try:
                self.mqtt_client.loop_stop()
                self.mqtt_client.disconnect()
            except Exception:
                pass
        self.servo.cleanup()
        self.logger.info("VisionEngine cleanup completed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument(
        "--diagnostics",
        action="store_true",
        help="Enable vision inference FPS/detection diagnostics",
    )
    parser.add_argument("--verbose", action="store_true", help="Log level DEBUG")
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
