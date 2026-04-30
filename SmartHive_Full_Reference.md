# SmartHive 综合参考手册 (Comprehensive Reference Manual)

**版本**: 1.2.0  
**更新日期**: 2026-04-06  
**适用范围**: 树莓派 5 边缘端、Node.js 云服务端、React Web 前端

---

## 目录
1. [系统总览](#1-系统总览)
2. [硬件架构与接线](#2-硬件架构与接线)
3. [服务端部署指南](#3-服务端部署指南)
4. [树莓派端配置与启动](#4-树莓派端配置与启动)
5. [数据口径与协议](#5-数据口径与协议)
6. [AI 功能参考](#6-ai-功能参考)
7. [API 接口文档](#7-api-接口文档)
8. [运维与故障排查](#8-运维与故障排查)

---

## 1. 系统总览
SmartHive 是一套面向现代养蜂业的智能监控系统。它通过树莓派在蜂场边缘进行环境采集与 AI 视觉推理，将结果实时推送到云端服务器，并通过响应式 Web 页面提供可视化展示。

- **核心流程**: 传感器/摄像头 -> 树莓派推理 -> MQTT -> 云服务器 -> SSE -> 用户浏览器。
- **关键技术**: YOLO ncnn (视觉)、MQTT (传输)、SSE (实时)、通义千问 (AI分析)。

---

## 2. 硬件架构与接线
### 2.1 树莓派 5 引脚定义 (BCM)
| 引脚 | 设备 | 功能 |
| :--- | :--- | :--- |
| GPIO 4 | DHT22 (Inside) | 内部温湿度 |
| GPIO 17 | DHT22 (Outside) | 外部温湿度 |
| GPIO 5/6 | HX711 | 蜂箱重量 (DOUT/SCK) |
| GPIO 18 | Servo | 摄像头水平扫描舵机 |
| GPIO 23/24 | IR Sensors | 蜜蜂流量计数 (进/出) |
| GPIO 25 | Relay | 加湿器控制 (胡蜂驱赶) |
| I2C (2/3) | OLED SSD1306 | 本地实时显示屏 |
| UART (14/15)| GPS | 蜂箱地理位置定位 |

---

## 3. 服务端部署指南
### 3.1 软件要求
- Node.js 20.x LTS
- MySQL 8.0+
- MQTT Broker (Mosquitto 或 EMQX)
- Nginx 1.20+

### 3.2 快速部署流程
1. **构建项目**:
   ```bash
   npm run build
   npm run build:server
   ```
2. **数据库初始化**:
   执行 `sql/create_tables.sql`。
3. **配置环境变量**:
   修改 `.env` 文件，确保 `API_TOKEN` 与树莓派端一致。
4. **启动服务**:
   ```bash
   pm2 start dist-server/server.cjs --name smarthive-backend
   ```

---

## 4. 树莓派端配置与启动
### 4.1 进程架构
- `sensor_process.py`: 负责所有传感器读取与硬件控制。
- `vision_process.py`: 负责摄像头采集、YOLO 推理与视频流发布。
- `transfer_process.py`: 负责两路数据的聚合与云端同步。

### 4.2 核心配置 (config.yaml)
```yaml
mqtt:
  host: "your-server-ip"
  publish_interval_seconds: 3.0
server_upload:
  url: "https://your-domain/api/vision/frame"
  token: "your-api-token"
```

---

## 5. 数据口径与协议
### 5.1 MQTT 消息格式
主题: `smarthive/+/sensors`
```json
{
  "deviceId": "pi5-01",
  "sensors": [
    {"type": "in_temp", "value": 28.5},
    {"type": "hornet_count", "value": 1}
  ]
}
```
### 5.2 视觉数据映射
- `hornet_count`: 映射至 `hornetsDetected` 字段，触发前端红色预警。
- `fps` / `latency_ms`: 视觉引擎性能监控指标。

---

## 6. AI 功能参考
### 6.1 AI 数据库查询
支持自然语言转 SQL。用户可直接提问：“分析上周二的马蜂入侵情况”。
- **安全机制**: 仅限 SELECT 查询，禁止操作敏感表。

### 6.2 数据治理报告
系统定期分析 `iot_telemetry` 表，AI 会自动识别数据异常点并生成清理建议。

---

## 7. API 接口文档
### 7.1 核心端点
- `GET /api/health`: 系统健康状态。
- `GET /api/beehive/latest`: 获取最新汇总数据。
- `POST /api/iot/ingest`: 接收设备端遥测上报。
- `GET /api/vision/stream.mjpg`: 实时视频流中转。

---

## 8. 运维与故障排查
### 8.1 常见问题
- **视频黑屏**: 检查树莓派 `SERVER_UPLOAD_FAIL` 日志，确认 `API_TOKEN` 匹配。
- **数据不更新**: 确认 MQTT Broker 状态及 Nginx SSE 反代配置（需关闭 `proxy_buffering`）。
- **AI 响应慢**: 检查 `QWEN_API_KEY` 有效性及网络连通性。

---
**SmartHive Connect - 让养蜂更智慧。**
