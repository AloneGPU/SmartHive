#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartHive Complete Sensor & Display Test Program
=================================================
Features:
- Read two DHT22 temperature/humidity sensors (GPIO17 and GPIO4)
- Read two infrared counter sensors (GPIO23 and GPIO24) with proper debounce
- Display all data on SSD1306 OLED screen
- Publish sensor data to MQTT broker for backend ingestion
- Support both local display and cloud upload (dual upload mechanism)

Usage:
1. Install dependencies:
   pip install adafruit-circuitpython-dht adafruit-circuitpython-ssd1306 pillow gpiozero paho-mqtt

2. Start the program with default settings:
   python3 sensor_display_test.py

3. Start with MQTT publishing enabled:
   python3 sensor_display_test.py --mqtt-host 121.196.155.132 --mqtt-port 1883 --device-id pi5-sensor-test

4. Press Ctrl+C to exit
"""

import argparse
import time
import signal
import sys
import socket
import json
import threading
from typing import Optional, Tuple

# Global variables for graceful shutdown
STOP = False

class SensorDisplay:
    """Main class handling OLED display, sensors, counters, and optional MQTT publishing."""

    def __init__(self, oled_addr: str = '0x3C', mqtt_config: dict = None):
        self.oled_addr = int(oled_addr, 16)
        self.debounce_time = 0.3  # Default 300ms debounce

        # MQTT configuration
        self.mqtt_config = mqtt_config or {}
        self.mqtt_client = None
        self.mqtt_connected = False
        self.mqtt_lock = threading.Lock()

        # Initialize subsystems
        self.init_oled()
        self.init_sensors()
        self.init_counters()

        # Statistics
        self.last_update = 0
        self.publish_count = 0
        self.error_count = 0

    def init_oled(self):
        """Initialize OLED display."""
        print("[INFO] Initializing I2C bus...")
        try:
            self.i2c = busio.I2C(board.SCL, board.SDA)
        except Exception as e:
            print(f"[ERROR] I2C initialization failed: {e}")
            print("Please ensure I2C is enabled: sudo raspi-config -> Interface Options -> I2C")
            self.oled = None
            return

        print(f"[INFO] Connecting to OLED display (address: 0x{self.oled_addr:02X})...")
        try:
            self.oled = adafruit_ssd1306.SSD1306_I2C(128, 64, self.i2c, addr=self.oled_addr)
            self.oled.fill(0)
            self.oled.show()
            print("[SUCCESS] OLED initialized successfully!")
        except Exception as e:
            print(f"[ERROR] OLED connection failed: {e}")
            print(f"Please check: 1) I2C address is correct 2) Device is connected 3) Run 'i2cdetect -y 1' to confirm")
            self.oled = None
            return

        # Prepare font
        try:
            self.font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 10)
        except:
            self.font = ImageFont.load_default()

    def init_sensors(self):
        """Initialize temperature/humidity sensors."""
        print("[INFO] Initializing temperature/humidity sensors...")
        try:
            # GPIO17 - external temperature/humidity sensor
            self.dht_outside = adafruit_dht.DHT22(getattr(board, 'D17'), use_pulseio=False)
            # GPIO4 - internal temperature/humidity sensor
            self.dht_inside = adafruit_dht.DHT22(getattr(board, 'D4'), use_pulseio=False)
            print("[SUCCESS] Temperature/humidity sensors initialized")
        except Exception as e:
            print(f"[ERROR] Temperature/humidity sensor initialization failed: {e}")
            self.dht_outside = None
            self.dht_inside = None

    def init_counters(self):
        """Initialize infrared counter sensors with proper debounce for accurate counting."""
        print("[INFO] Initializing infrared counter sensors...")
        try:
            # GPIO23 - counter 1 (outside - IR beam sensor)
            self.counter1 = DigitalInputDevice(23, pull_up=False)
            self.counter1_count = 0
            self.counter1_last_time = 0
            self.counter1.when_activated = lambda: self.increment_counter(1)

            # GPIO24 - counter 2 (inside - IR beam sensor)
            self.counter2 = DigitalInputDevice(24, pull_up=False)
            self.counter2_count = 0
            self.counter2_last_time = 0
            self.counter2.when_activated = lambda: self.increment_counter(2)

            print("[SUCCESS] Infrared counter sensors initialized")
            print("[INFO] Break IR beam to count (one break = one count, 300ms debounce)")
        except Exception as e:
            print(f"[ERROR] Infrared counter sensor initialization failed: {e}")
            self.counter1 = None
            self.counter2 = None

    def increment_counter(self, counter_id: int):
        """Increment counter value with debounce - called on each valid beam break."""
        current_time = time.time()

        if counter_id == 1 and self.counter1:
            # Check if enough time has passed since last count (debounce)
            if current_time - self.counter1_last_time >= self.debounce_time:
                self.counter1_count += 1
                self.counter1_last_time = current_time
                print(f"[INFO] Counter1 (Outside): {self.counter1_count}")
        elif counter_id == 2 and self.counter2:
            # Check if enough time has passed since last count (debounce)
            if current_time - self.counter2_last_time >= self.debounce_time:
                self.counter2_count += 1
                self.counter2_last_time = current_time
                print(f"[INFO] Counter2 (Inside): {self.counter2_count}")

    def read_dht22_with_retry(self, sensor, retries: int = 3, delay: float = 2.0) -> Tuple[Optional[float], Optional[float]]:
        """Read DHT22 sensor data with retry."""
        if sensor is None:
            return None, None

        last_error = None
        for _ in range(retries):
            try:
                temp = sensor.temperature
                humi = sensor.humidity
                if temp is not None and humi is not None:
                    return float(temp), float(humi)
                time.sleep(delay)
            except Exception as e:
                last_error = e
                time.sleep(delay)
        return None, None

    def get_local_ip(self) -> str:
        """Get local IP address for status reporting."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except OSError:
            try:
                return socket.gethostbyname(socket.gethostname())
            except OSError:
                return "127.0.0.1"

    def format_sensor_data(self) -> dict:
        """Get all sensor data."""
        data = {
            'inside_temp': None,
            'inside_humidity': None,
            'outside_temp': None,
            'outside_humidity': None,
            'counter1': self.counter1_count if self.counter1 else 0,
            'counter2': self.counter2_count if self.counter2 else 0,
            'status': 'OK'
        }

        # Read internal sensor data
        temp, humi = self.read_dht22_with_retry(self.dht_inside)
        if temp is not None and humi is not None:
            data['inside_temp'] = temp
            data['inside_humidity'] = humi
        else:
            data['status'] = 'ERROR: Inside sensor'

        # Read external sensor data
        temp, humi = self.read_dht22_with_retry(self.dht_outside)
        if temp is not None and humi is not None:
            data['outside_temp'] = temp
            data['outside_humidity'] = humi
        else:
            data['status'] = 'ERROR: Outside sensor'

        return data

    def build_mqtt_payload(self, data: dict) -> dict:
        """Build MQTT payload for sensor data."""
        sensors = []

        if data['inside_temp'] is not None:
            sensors.append({
                "type": "in_temp",
                "value": round(data['inside_temp'], 2),
                "unit": "C"
            })
            sensors.append({
                "type": "in_humi",
                "value": round(data['inside_humidity'], 2),
                "unit": "%"
            })

        if data['outside_temp'] is not None:
            sensors.append({
                "type": "out_temp",
                "value": round(data['outside_temp'], 2),
                "unit": "C"
            })
            sensors.append({
                "type": "out_humi",
                "value": round(data['outside_humidity'], 2),
                "unit": "%"
            })

        if data['counter1'] is not None:
            sensors.append({
                "type": "bee_in",
                "value": data['counter1'],
                "unit": "count"
            })

        if data['counter2'] is not None:
            sensors.append({
                "type": "bee_out",
                "value": data['counter2'],
                "unit": "count"
            })

        return {
            "deviceId": self.mqtt_config.get('device_id', 'pi5-sensor-test'),
            "timestamp": int(time.time() * 1000),
            "sensors": sensors,
            "status": {
                "online": True,
                "ip": self.get_local_ip(),
            }
        }

    def publish_to_mqtt(self, data: dict) -> bool:
        """Publish sensor data to MQTT broker."""
        if not self.mqtt_client or not self.mqtt_connected:
            return False

        try:
            payload = self.build_mqtt_payload(data)
            topic = self.mqtt_config.get('topic', 'smarthive/pi5/sensors')
            payload_text = json.dumps(payload, ensure_ascii=False)

            result = self.mqtt_client.publish(
                topic,
                payload_text,
                qos=self.mqtt_config.get('qos', 1)
            )

            if result.rc == 0:
                self.publish_count += 1
                return True
            else:
                self.error_count += 1
                return False
        except Exception as e:
            self.error_count += 1
            print(f"[ERROR] MQTT publish failed: {e}")
            return False

    def draw_display(self, data: dict):
        """Display data on OLED."""
        if self.oled is None:
            return

        # Create new image
        image = Image.new('1', (self.oled.width, self.oled.height))
        draw = ImageDraw.Draw(image)

        # Clear screen
        draw.rectangle((0, 0, self.oled.width, self.oled.height), fill=0)

        # Title
        draw.text((0, 0), "SmartHive Monitor", fill=255, font=self.font)

        y = 16
        # Internal temp/humidity
        if data['inside_temp'] is not None:
            draw.text((0, y), f"IN: {data['inside_temp']:.1f}C/{data['inside_humidity']:.0f}%",
                     fill=255, font=self.font)
        else:
            draw.text((0, y), "IN: --/--", fill=255, font=self.font)

        # External temp/humidity
        y += 12
        if data['outside_temp'] is not None:
            draw.text((0, y), f"OUT: {data['outside_temp']:.1f}C/{data['outside_humidity']:.0f}%",
                     fill=255, font=self.font)
        else:
            draw.text((0, y), "OUT: --/--", fill=255, font=self.font)

        # Counter display
        y += 12
        draw.text((0, y), f"C1: {data['counter1']}  C2: {data['counter2']}",
                 fill=255, font=self.font)

        # Status
        y += 12
        if data['status'] == 'OK':
            draw.text((0, y), "Status: ONLINE", fill=255, font=self.font)
        else:
            draw.text((0, y), "Status: ERROR!", fill=255, font=self.font)

        # Time
        current_time = time.strftime("%H:%M:%S")
        y += 12
        draw.text((70, y), current_time, fill=255, font=self.font)

        # Display to OLED
        self.oled.image(image)
        self.oled.show()

    def run(self):
        """Main run loop."""
        print("\n[INFO] Starting sensor data reading...")
        print("[INFO] Press Ctrl+C to exit")

        last_time = 0
        last_mqtt_publish = 0
        update_interval = 2.0  # Update display every 2 seconds
        mqtt_publish_interval = max(5.0, self.mqtt_config.get('publish_interval', 10.0))

        while not STOP:
            try:
                current_time = time.time()

                # Update display
                if current_time - last_time >= update_interval:
                    data = self.format_sensor_data()
                    self.draw_display(data)

                    # Print log
                    if data['status'] == 'OK':
                        print(f"[{time.strftime('%H:%M:%S')}] IN: {data['inside_temp']:.1f}C/{data['inside_humidity']:.0f}% | "
                              f"OUT: {data['outside_temp']:.1f}C/{data['outside_humidity']:.0f}% | "
                              f"Counters: {data['counter1']}/{data['counter2']}")
                    else:
                        print(f"[{time.strftime('%H:%M:%S')}] {data['status']}")

                    # Publish to MQTT
                    if self.mqtt_connected and (current_time - last_mqtt_publish >= mqtt_publish_interval):
                        self.publish_to_mqtt(data)
                        last_mqtt_publish = current_time

                    last_time = current_time

                time.sleep(0.1)

            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"[ERROR] Runtime error: {e}")
                time.sleep(1)

        # Cleanup resources
        self.cleanup()

    def cleanup(self):
        """Cleanup resources."""
        print("\n[INFO] Cleaning up resources...")

        # Cleanup sensors
        try:
            if self.dht_inside:
                self.dht_inside.exit()
        except:
            pass
        try:
            if self.dht_outside:
                self.dht_outside.exit()
        except:
            pass

        # Cleanup counters
        try:
            if self.counter1:
                self.counter1.close()
        except:
            pass
        try:
            if self.counter2:
                self.counter2.close()
        except:
            pass

        # Cleanup OLED
        if self.oled:
            self.oled.fill(0)
            self.oled.show()

        # Cleanup MQTT
        if self.mqtt_client:
            try:
                self.mqtt_client.loop_stop()
                self.mqtt_client.disconnect()
            except:
                pass

        print("[INFO] Program exited")
        print(f"[STATS] MQTT publishes: {self.publish_count}, Errors: {self.error_count}")


def handle_signal(signum, frame):
    """Handle exit signal."""
    global STOP
    STOP = True


def on_mqtt_connect(client, userdata, flags, reason_code, properties=None):
    """MQTT connection callback."""
    if reason_code == 0:
        print(f"[SUCCESS] MQTT connected: {userdata.get('host', 'unknown')}:{userdata.get('port', 1883)}")
        userdata['connected'] = True
    else:
        print(f"[ERROR] MQTT connection failed, reason={reason_code}")
        userdata['connected'] = False


def on_mqtt_disconnect(client, userdata, reason_code, properties=None):
    """MQTT disconnection callback."""
    userdata['connected'] = False
    if reason_code != 0:
        print(f"[WARNING] MQTT disconnected unexpectedly, reason={reason_code}")


def main():
    """Main entry point."""
    global STOP

    # Parse command line arguments
    parser = argparse.ArgumentParser(description='SmartHive Complete Sensor Test Program')
    parser.add_argument('--addr', default='0x3C', help='OLED I2C address (default: 0x3C)')
    parser.add_argument('--debounce', type=float, default=0.3, help='Debounce time in seconds (default: 0.3)')

    # MQTT arguments
    parser.add_argument('--mqtt-host', default='121.196.155.132', help='MQTT broker host')
    parser.add_argument('--mqtt-port', type=int, default=1883, help='MQTT broker port')
    parser.add_argument('--mqtt-username', default='123456', help='MQTT username')
    parser.add_argument('--mqtt-password', default='226886', help='MQTT password')
    parser.add_argument('--device-id', default='pi5-sensor-test', help='Device ID for MQTT')
    parser.add_argument('--mqtt-topic', default='smarthive/pi5/sensors', help='MQTT topic')
    parser.add_argument('--publish-interval', type=float, default=10.0, help='MQTT publish interval in seconds')
    parser.add_argument('--qos', type=int, default=1, choices=[0, 1, 2], help='MQTT QoS level')

    args = parser.parse_args()

    # Import required libraries
    global board, busio, adafruit_dht, adafruit_ssd1306, gpiozero, DigitalInputDevice, Image, ImageDraw, ImageFont
    global mqtt

    try:
        import board
        import busio
        import adafruit_dht
        import adafruit_ssd1306
        from gpiozero import DigitalInputDevice
        from PIL import Image, ImageDraw, ImageFont
        import paho.mqtt.client as mqtt
    except ImportError as e:
        print(f"[ERROR] Missing dependency library: {e}")
        print("Please run: pip install adafruit-circuitpython-dht adafruit-circuitpython-ssd1306 pillow gpiozero paho-mqtt")
        sys.exit(1)

    # Prepare MQTT configuration
    mqtt_config = {
        'host': args.mqtt_host,
        'port': args.mqtt_port,
        'username': args.mqtt_username,
        'password': args.mqtt_password,
        'device_id': args.device_id,
        'topic': args.mqtt_topic,
        'publish_interval': args.publish_interval,
        'qos': args.qos,
        'connected': False
    }

    # Create and configure display
    display = SensorDisplay(args.addr, mqtt_config)
    display.debounce_time = args.debounce

    # Setup MQTT if host is provided
    if mqtt_config['host']:
        print(f"[INFO] Setting up MQTT connection to {mqtt_config['host']}:{mqtt_config['port']}")
        try:
            client_id = f"{mqtt_config['device_id']}-sensor-test"
            display.mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id, userdata=mqtt_config)

            if mqtt_config['username']:
                display.mqtt_client.username_pw_set(mqtt_config['username'], mqtt_config['password'])

            display.mqtt_client.on_connect = on_mqtt_connect
            display.mqtt_client.on_disconnect = on_mqtt_disconnect
            display.mqtt_client.reconnect_delay_set(min_delay=1, max_delay=10)

            display.mqtt_client.connect(mqtt_config['host'], mqtt_config['port'], keepalive=30)
            display.mqtt_client.loop_start()
            display.mqtt_connected = True

        except Exception as e:
            print(f"[ERROR] Failed to connect to MQTT broker: {e}")
            display.mqtt_connected = False

    # Set signal handling
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        display.run()
    except Exception as e:
        print(f"[ERROR] Program failed: {e}")
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())