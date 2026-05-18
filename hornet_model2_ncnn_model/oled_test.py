#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartHive Sensor Test Program
Features:
- Read two DHT22 temperature/humidity sensors (GPIO17 and GPIO4)
- Read two infrared counter sensors (GPIO23 and GPIO24) with proper debounce
- Display all data on SSD1306 OLED screen

Usage:
1. Install dependencies:
   pip install adafruit-circuitpython-dht adafruit-circuitpython-ssd1306 pillow gpiozero

2. Start the program:
   python3 sensor_display_test.py

3. Press Ctrl+C to exit
"""

import argparse
import time
import signal
import sys
import math
from typing import Optional, Tuple, List

# Global variables
STOP = False

class SensorDisplay:
    def __init__(self, oled_addr: str = '0x3C'):
        self.oled_addr = int(oled_addr, 16)
        self.init_oled()
        self.init_sensors()
        self.init_counters()
        self.last_update = 0

    def init_oled(self):
        """Initialize OLED display"""
        print("[INFO] Initializing I2C bus...")
        try:
            self.i2c = busio.I2C(board.SCL, board.SDA)
        except Exception as e:
            print(f"[ERROR] I2C initialization failed: {e}")
            print("Please ensure I2C is enabled: sudo raspi-config -> Interface Options -> I2C")
            raise

        print(f"[INFO] Connecting to OLED display (address: 0x{self.oled_addr:02X})...")
        try:
            self.oled = adafruit_ssd1306.SSD1306_I2C(128, 64, self.i2c, addr=self.oled_addr)
        except Exception as e:
            print(f"[ERROR] OLED connection failed: {e}")
            print(f"Please check: 1) I2C address is correct 2) Device is connected 3) Run 'i2cdetect -y 1' to confirm")
            raise

        self.oled.fill(0)
        self.oled.show()
        print("[SUCCESS] OLED initialized successfully!")

        # Prepare font
        try:
            self.font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 10)
        except:
            self.font = ImageFont.load_default()

    def init_sensors(self):
        """Initialize temperature/humidity sensors"""
        print("[INFO] Initializing temperature/humidity sensors...")
        try:
            # GPIO17 - external temperature/humidity sensor
            self.dht_outside = adafruit_dht.DHT22(getattr(board, 'D17'), use_pulseio=False)
            # GPIO4 - internal temperature/humidity sensor
            self.dht_inside = adafruit_dht.DHT22(getattr(board, 'D4'), use_pulseio=False)
            print("[SUCCESS] Temperature/humidity sensors initialized")
        except Exception as e:
            print(f"[ERROR] Temperature/humidity sensor initialization failed: {e}")
            raise

    def init_counters(self):
        """Initialize infrared counter sensors with proper debounce for accurate counting"""
        print("[INFO] Initializing infrared counter sensors...")
        try:
            # Debounce time in seconds - prevents multiple counts from sensor bounce/noise
            self.debounce_time = 0.3  # 300ms debounce

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
            raise

    def increment_counter(self, counter_id: int):
        """Increment counter value with debounce - called on each valid beam break"""
        current_time = time.time()

        if counter_id == 1:
            # Check if enough time has passed since last count (debounce)
            if current_time - self.counter1_last_time >= self.debounce_time:
                self.counter1_count += 1
                self.counter1_last_time = current_time
                print(f"[INFO] Counter1 (Outside): {self.counter1_count}")
        else:
            # Check if enough time has passed since last count (debounce)
            if current_time - self.counter2_last_time >= self.debounce_time:
                self.counter2_count += 1
                self.counter2_last_time = current_time
                print(f"[INFO] Counter2 (Inside): {self.counter2_count}")

    def read_dht22_with_retry(self, sensor, retries: int = 3, delay: float = 2.0) -> Tuple[Optional[float], Optional[float]]:
        """Read DHT22 sensor data with retry"""
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

    def format_sensor_data(self) -> dict:
        """Get all sensor data"""
        data = {
            'inside_temp': None,
            'inside_humidity': None,
            'outside_temp': None,
            'outside_humidity': None,
            'counter1': self.counter1_count,
            'counter2': self.counter2_count,
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

    def draw_display(self, data: dict):
        """Display data on OLED"""
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
        """Main run loop"""
        print("\n[INFO] Starting sensor data reading...")
        print("[INFO] Press Ctrl+C to exit")

        last_time = 0
        update_interval = 2.0  # Update every 2 seconds

        while not STOP:
            try:
                current_time = time.time()
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
        """Cleanup resources"""
        print("\n[INFO] Cleaning up resources...")
        try:
            self.dht_inside.exit()
            self.dht_outside.exit()
            self.counter1.close()
            self.counter2.close()
        except:
            pass
        self.oled.fill(0)
        self.oled.show()
        print("[INFO] Program exited")


def handle_signal(signum, frame):
    """Handle exit signal"""
    global STOP
    STOP = True


def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='SmartHive Sensor Test Program')
    parser.add_argument('--addr', default='0x3C', help='OLED I2C address (default: 0x3C)')
    parser.add_argument('--debounce', type=float, default=0.3, help='Debounce time in seconds (default: 0.3)')
    args = parser.parse_args()

    # Import required libraries here so we can show better error messages
    global board, busio, adafruit_dht, adafruit_ssd1306, gpiozero, DigitalInputDevice, Image, ImageDraw, ImageFont

    try:
        import board
        import busio
        import adafruit_dht
        import adafruit_ssd1306
        from gpiozero import DigitalInputDevice
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as e:
        print(f"[ERROR] Missing dependency library: {e}")
        print("Please run: pip install adafruit-circuitpython-dht adafruit-circuitpython-ssd1306 pillow gpiozero")
        sys.exit(1)

    # Set signal handling
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        # Create and run sensor display
        display = SensorDisplay(args.addr)
        # Override debounce time if specified
        if args.debounce:
            display.debounce_time = args.debounce
        display.run()
    except Exception as e:
        print(f"[ERROR] Program failed: {e}")
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())