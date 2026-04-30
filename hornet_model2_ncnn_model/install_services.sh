#!/bin/bash
# install_services.sh
# 安装树莓派智能蜂箱的三个 systemd 开机自启服务
# 用法: sudo bash install_services.sh

set -e

# 确保以 root 权限运行
if [ "$EUID" -ne 0 ]; then
  echo "请使用 sudo 运行此脚本: sudo bash install_services.sh"
  exit 1
fi

# 获取当前脚本所在目录（即代码根目录）
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_NAME="first"
GROUP_NAME="first"
PYTHON_BIN="/home/first/miniconda3/envs/yolo_pi5/bin/python3"

echo "========================================="
echo "开始安装 SmartHive systemd 服务"
echo "代码目录: $APP_DIR"
echo "运行用户: $USER_NAME"
echo "Python: $PYTHON_BIN"
echo "========================================="

# 确保日志目录存在并修改权限
mkdir -p "$APP_DIR/logs"
chown -R $USER_NAME:$GROUP_NAME "$APP_DIR/logs"

# 1. 创建 sensor_process 服务
cat > /etc/systemd/system/hive-sensor.service << EOF
[Unit]
Description=SmartHive Sensor Process
After=network.target mosquitto.service
Wants=mosquitto.service

[Service]
Type=simple
User=$USER_NAME
Group=$GROUP_NAME
WorkingDirectory=$APP_DIR
Environment="PYTHONUNBUFFERED=1"
EnvironmentFile=-$APP_DIR/.env
ExecStart=$PYTHON_BIN $APP_DIR/sensor_process.py --config $APP_DIR/config.yaml
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=hive-sensor

[Install]
WantedBy=multi-user.target
EOF

# 2. 创建 vision_process 服务
cat > /etc/systemd/system/hive-vision.service << EOF
[Unit]
Description=SmartHive Vision Process
After=network.target mosquitto.service hive-sensor.service
Wants=mosquitto.service hive-sensor.service

[Service]
Type=simple
User=$USER_NAME
Group=$GROUP_NAME
WorkingDirectory=$APP_DIR
Environment="PYTHONUNBUFFERED=1"
EnvironmentFile=-$APP_DIR/.env
ExecStart=$PYTHON_BIN $APP_DIR/vision_process.py --config $APP_DIR/config.yaml
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=hive-vision

[Install]
WantedBy=multi-user.target
EOF

# 3. 创建 transfer_process 服务
cat > /etc/systemd/system/hive-transfer.service << EOF
[Unit]
Description=SmartHive Transfer Process
After=network.target mosquitto.service hive-vision.service
Wants=mosquitto.service hive-vision.service

[Service]
Type=simple
User=$USER_NAME
Group=$GROUP_NAME
WorkingDirectory=$APP_DIR
Environment="PYTHONUNBUFFERED=1"
EnvironmentFile=-$APP_DIR/.env
ExecStart=$PYTHON_BIN $APP_DIR/transfer_process.py --config $APP_DIR/config.yaml
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=hive-transfer

[Install]
WantedBy=multi-user.target
EOF

echo "重新加载 systemd 守护进程..."
systemctl daemon-reload

echo "设置开机自启..."
systemctl enable hive-sensor.service
systemctl enable hive-vision.service
systemctl enable hive-transfer.service

echo "启动服务..."
systemctl start hive-sensor.service
# 稍微延迟启动视觉和传输进程，确保顺序正确
sleep 2
systemctl start hive-vision.service
sleep 5
systemctl start hive-transfer.service

echo "========================================="
echo "安装完成！所有服务已启动并设置为开机自启。"
echo ""
echo "你可以使用以下命令查看服务状态："
echo "  sudo systemctl status hive-sensor hive-vision hive-transfer"
echo ""
echo "查看实时日志："
echo "  sudo journalctl -u hive-sensor -f"
echo "  sudo journalctl -u hive-vision -f"
echo "  sudo journalctl -u hive-transfer -f"
echo "========================================="
