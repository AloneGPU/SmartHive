#!/usr/bin/env python3
"""
oled_test.py - OLED显示屏测试脚本
用于验证SSD1306 (0.96寸, 128x64) I2C显示屏是否正常工作

用法:
  python3 oled_test.py              # 使用默认I2C地址0x3C
  python3 oled_test.py --addr 0x3D # 指定I2C地址
"""

import argparse
import time
import sys

def main():
    parser = argparse.ArgumentParser(description='OLED Display Test')
    parser.add_argument('--addr', default='0x3C', help='I2C address (default: 0x3C)')
    args = parser.parse_args()

    try:
        import board
        import busio
        import adafruit_ssd1306
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as e:
        print(f"[ERROR] 缺少依赖库: {e}")
        print("请执行: pip install adafruit-circuitpython-ssd1306 pillow")
        sys.exit(1)

    i2c_addr = int(args.addr, 16)

    print(f"[INFO] 初始化 I2C 总线...")
    try:
        i2c = busio.I2C(board.SCL, board.SDA)
    except Exception as e:
        print(f"[ERROR] I2C 初始化失败: {e}")
        print("请确保已启用I2C: sudo raspi-config → Interface Options → I2C")
        sys.exit(1)

    print(f"[INFO] 连接OLED显示屏 (地址: 0x{i2c_addr:02X})...")
    try:
        oled = adafruit_ssd1306.SSD1306_I2C(128, 64, i2c, addr=i2c_addr)
    except Exception as e:
        print(f"[ERROR] OLED连接失败: {e}")
        print(f"请检查: 1) I2C地址是否正确 2) 设备是否连接 3) 执行 i2cdetect -y 1 确认设备存在")
        sys.exit(1)

    print("[SUCCESS] OLED初始化成功!")
    print("[INFO] 开始显示测试内容...")

    width = oled.width
    height = oled.height

    image = Image.new('1', (width, height))
    draw = ImageDraw.Draw(image)

    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 10)
    except:
        font = ImageFont.load_default()

    for i in range(5):
        image = Image.new('1', (width, height))
        draw = ImageDraw.Draw(image)

        draw.text((0, 0), "SmartHive Monitor", fill=255, font=font)
        draw.text((0, 16), f"Test Frame: {i+1}/5", fill=255, font=font)
        
        current_time = time.strftime("%H:%M:%S")
        draw.text((0, 32), f"Time: {current_time}", fill=255, font=font)
        
        progress = (i + 1) * 20
        draw.rectangle([0, 50, progress, 58], fill=255)
        draw.text((105, 48), f"{progress}%", fill=255, font=font)

        oled.image(image)
        oled.show()
        time.sleep(1)

    print("\n[INFO] 显示最终测试画面（保持10秒）...")

    image = Image.new('1', (width, height))
    draw = ImageDraw.Draw(image)
    
    draw.text((0, 0), "--- Test OK ---", fill=255, font=font)
    draw.text((0, 16), "IN: 35.2C / 65.5%", fill=255, font=font)
    draw.text((0, 28), "OUT:28.5C / 75.0%", fill=255, font=font)
    draw.text((0, 40), "Status: ONLINE", fill=255, font=font)
    draw.text((0, 52), "OLED Working!", fill=255, font=font)

    oled.image(image)
    oled.show()
    
    time.sleep(10)

    oled.fill(0)
    oled.show()
    print("[INFO] 测试完成，屏幕已清空")

if __name__ == '__main__':
    main()
