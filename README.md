# SmartHive Connect - 智能蜂箱综合管理系统

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/your-repo/smarthive)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

SmartHive Connect 是一套集成了 **树莓派边缘计算**、**AI 视觉识别** 与 **云端实时监控** 的智能蜂场管理解决方案。系统通过树莓派 5 采集环境温湿度、蜂箱重量、蜜蜂进出流量，并利用 YOLO 算法实时监测胡蜂入侵，为养蜂人提供科学的决策支持。

## 🚀 核心功能

- **实时 IoT 监控**：通过 SSE 技术实现毫秒级数据延迟，实时掌握蜂箱内外温湿度、重量及蜜蜂活动。
- **AI 视觉识别**：基于 YOLO ncnn 优化，在树莓派 5 上实现高性能胡蜂检测与自动预警。
- **智能硬件联动**：检测到胡蜂时自动触发加湿器驱赶，并支持 OLED 屏幕本地实时显示。
- **AI 数据助手**：内置通义千问大模型，支持自然语言查询历史数据、生成分析报告及养蜂建议。
- **数据治理系统**：自动清理过时冗余数据，提供 AI 驱动的数据洞察与备份方案。
- **全端适配**：完美适配手机端与 PC 端，提供丝滑的可视化图表交互体验。

## 🛠️ 系统架构

```
┌─────────────┐      MQTT       ┌─────────────┐      SSE       ┌─────────────┐
│  树莓派 5    │ ────────────>  │  Node.js    │ <────────────> │  React 前端  │
│ (边缘推理)    │  (数据/指令)    │ (核心服务)   │  (实时推送)    │ (可视化交互) │
└─────────────┘                └─────────────┘                └─────────────┘
       │                              │
       │ MJPEG                        │ 存储/查询
       ▼                              ▼
┌─────────────┐                ┌─────────────┐
│ 实时视频流   │                │   MySQL     │
└─────────────┘                └─────────────┘
```

## 📦 快速开始

### 1. 前端构建 (React + Vite)
```bash
npm install
npm run build
```

### 2. 后端构建 (Node.js + esbuild)
```bash
npm run build:server
# 产物位于 dist-server/server.cjs
```

### 3. 运行服务
```bash
# 启动生产环境
node dist-server/server.cjs
```

## 📖 详细文档

为了方便不同角色的开发者与用户，我们准备了详尽的文档手册：

- **[部署指南](部署指南.md)**：涵盖服务器环境安装、Nginx 配置、MySQL 初始化及生产环境上线流程。
- **[用户使用与参考手册](SMART_HIVE_USER_MANUAL.md)**：**最全面**的参考资料，包含 API 速查、数据口径、AI 功能使用及运维建议。
- **[树莓派端配置手册](hornet_model2_ncnn_model/startup_guide.md)**：树莓派 5 硬件接线、YOLO 模型部署、多进程架构说明。
- **[传感器配置说明](传感器配置说明文档.md)**：详细的 GPIO 引脚定义与传感器校准步骤。
- **[AI 数据库查询说明](AI数据库查询功能使用说明.md)**：如何利用自然语言与蜂箱数据对话。

## ⚙️ 环境变量 (.env)

| 变量名 | 说明 | 示例 |
| :--- | :--- | :--- |
| `API_TOKEN` | 通信鉴权 Token | `your_secure_token_16char` |
| `DB_HOST` | MySQL 地址 | `127.0.0.1` |
| `QWEN_API_KEY` | 通义千问 API 密钥 | `sk-xxxx...` |
| `MQTT_BROKER_URL` | MQTT Broker 地址 | `mqtt://localhost:1883` |

## 🤝 贡献与反馈

如果您在部署或使用过程中遇到任何问题，请查阅 [常见问题排查](SMART_HIVE_USER_MANUAL.md#14-常见问题排查)。

---
© 2026 SmartHive Team. 保留所有权利。
