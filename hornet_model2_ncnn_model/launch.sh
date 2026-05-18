#!/bin/bash
# launch.sh - Script to start all three processes at once
# Usage: ./launch.sh [config.yaml]
# Exits entirely if any child process exits (useful for systemd restart)

CONFIG="${1:-config.yaml}"
PYTHON="/home/first/miniconda3/envs/yolo_pi5/bin/python"

echo "[launch] Using config: $CONFIG"

# 启动 pigpiod 守护进程（舵机扫描需要）
if ! pgrep -x pigpiod > /dev/null; then
  if sudo pigpiod; then
    sleep 1
    echo "[launch] pigpiod started"
  else
    echo "[launch] WARNING: pigpiod failed to start; servo may be unavailable"
  fi
else
  echo "[launch] pigpiod already running"
fi

cleanup() {
    echo "[launch] Stopping all child processes..."
    kill "${PIDS[@]}" 2>/dev/null
    wait
    echo "[launch] All processes stopped"
}
trap cleanup SIGINT SIGTERM

PIDS=()

# Get the absolute directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="$DIR/logs"
mkdir -p "$LOG_DIR"

# 可选：与本目录下 .env 注入 SMART_HIVE_*（密钥勿写进 config.yaml）
# Windows 记事本保存常为 CRLF，bash source 会报 $'\r': command not found —— 先去 \r 再加载
if [ -f "$DIR/.env" ]; then
  ENV_CLEAN=$(mktemp)
  tr -d '\r' < "$DIR/.env" > "$ENV_CLEAN"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_CLEAN"
  set +a
  rm -f "$ENV_CLEAN"
  echo "[launch] Loaded environment from $DIR/.env"
fi

$PYTHON "$DIR/sensor_process.py"  --config "$DIR/$CONFIG" 2>&1 | tee "$LOG_DIR/sensor.log"  &
PIDS+=($!)
echo "[launch] sensor_process  PID=$!"

sleep 1   # Wait for sensor_process to establish MQTT connection

$PYTHON "$DIR/vision_process.py"  --config "$DIR/$CONFIG" 2>&1 | tee "$LOG_DIR/vision.log"  &
PIDS+=($!)
echo "[launch] vision_process  PID=$!"

sleep 2   # Wait for inference engine to load the model

$PYTHON "$DIR/transfer_process.py" --config "$DIR/$CONFIG" 2>&1 | tee "$LOG_DIR/transfer.log" &
PIDS+=($!)
echo "[launch] transfer_process PID=$!"

echo "[launch] All processes started, waiting for child processes..."

# Exit entirely if any child process exits
wait -n "${PIDS[@]}"
EXIT_CODE=$?
echo "[launch] A child process exited (code=$EXIT_CODE), stopping remaining processes..."
cleanup
exit $EXIT_CODE
