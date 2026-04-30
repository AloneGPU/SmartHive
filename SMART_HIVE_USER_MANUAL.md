# SmartHive 用户使用与部署手册（2026-04-02 更新）

更新时间：2026-04-02  
适用代码基线：当前仓库工作目录（`App.tsx` / `server.ts` / `services/*` / `components/*` / `hornet_model2.ncnn/config.yaml`）

---

## 0. 手册覆盖范围

本手册用于两类角色：

1. 普通用户：如何看实时数据、趋势、AI、视频与告警。
2. 管理员/运维：如何配置、部署、接入树莓派、导入测试数据、排查问题。

当前系统核心能力：

- 实时 IoT 监控（SSE）
- 历史数据分析（含日历、抽样渲染）
- AI 问答与语音转文字
- **AI 数据库查询**（自然语言查询历史数据）
- **过时数据治理**（提取分析、AI报告、确认清理、自动备份、操作审计）
- 实时视频流播放
- 胡蜂告警（来自 `hornet_count`）
- 管理后台配置（基础/服务/视频）
- 数据同步与一致性机制（支持离线模式）

---

## 1. 系统链路总览

### 1.1 数据链路（告警）

- 设备（树莓派）上报 IoT 数据（MQTT 或 HTTP）
- 后端写入 `iot_telemetry`，并通过 SSE 广播
- 前端订阅 `/api/iot/stream`，读取 `hornet_count`
- `hornet_count > 0` 时，视觉页显示"检测到马蜂"
- （可选）当 `IOT_MIRROR_TO_BEEHIVE=true` 时，后端会将部分传感器镜像/聚合到 `hive_data` 用于历史展示

### 1.2 视频链路（画面）

支持两种方式：

1. 直连设备视频流（推荐）  
例：`http://设备IP:5001/stream`、`http://设备IP/live.m3u8`

2. 后端中转 MJPEG（`/api/vision/stream.mjpg`）  
说明：树莓派将打框后的 JPEG 帧上传到 `POST /api/vision/frame`，后端再转成 MJPEG 给前端，适合跨网络访问。

结论：

- 视频播放不依赖 MQTT。
- 胡蜂告警依赖 `hornet_count` 数据（默认来源是 MQTT/HTTP IoT 上报）。

---

## 2. 登录与角色

### 2.1 普通用户

- 登录页点击"普通用户"即可进入。
- 查看总览/细分/详情/AI/视觉。

### 2.2 管理员

- 登录页切换"管理员"。
- 演示口令：`admin123`（仅演示，生产务必替换）。
- 可进入管理后台配置系统参数。

---

## 3. 普通用户使用流程（建议）

1. 进入"总览"，确认连接在线。  
2. 看实时监控与告警卡。  
3. 在趋势卡切换 24h/7d/30d。  
4. 进入"细分/详情"做历史分析。  
5. 进入"视觉"确认视频与胡蜂告警是否同步。  
6. 进入"AI问答"获取建议。
7. **使用AI查询历史数据**（新功能）。

---

## 4. 管理后台配置（最重要）

管理后台分三步：基础 -> 服务 -> 视频。

### 4.1 基础配置

- `apiBaseUrl`：后端地址，常用 `/api`（经 Nginx 反代）或 `http://服务器IP:3001/api`
- `apiToken`：后端 `API_TOKEN`
- 点击"测试连接"，需成功再继续。

### 4.2 服务配置

- `Qwen API Key`：AI 能力使用
- `高德 Key`：地理逆编码使用
- `modelName`：选择模型（如 `qwen-flash`）

### 4.3 视频配置字段说明

- `videoStreamUrl`：视频流地址
- `videoStreamMode`：
  - `video`：HLS/MP4 等标准视频流
  - `mjpeg`：MJPEG 连续帧
- `visionDeviceId`：视觉设备 ID，用于绑定胡蜂告警数据源，必须与设备上报的 `deviceId`（通常是 MQTT `client_id`）一致。

### 4.4 推荐配置组合

1. 推荐：后端 MJPEG 中转（跨网优先）
- `videoStreamUrl=/api/vision/stream.mjpg`
- `videoStreamMode=mjpeg`
- `visionDeviceId=pi5-vision-client`（必须与设备上报值一致）

2. 直连设备流（同网或设备已公网暴露）
- `videoStreamUrl=http://设备IP:5001/stream`
- `videoStreamMode=mjpeg`
- `visionDeviceId=pi5-vision-client`（按设备实际值）

3. HLS 场景
- `videoStreamUrl=http://设备IP/live.m3u8`
- `videoStreamMode=video`
- `visionDeviceId` 同上

中转模式下若上传未开始，`/api/vision/stream.mjpg` 会返回 503，这是预期行为。

### 4.5 常见误配

- 视频能播但没告警：`visionDeviceId` 与设备上报 `deviceId` 不一致。
- 告警有变化但视频黑屏：视频地址/模式不匹配或网络不可达。

---

## 5. 数据口径与展示逻辑

### 5.1 温湿度优先级

系统支持双DHT22传感器配置，可同时测量蜂箱内部和外部温湿度：

#### 5.1.1 传感器配置
- **内部传感器** (GPIO4): 测量蜂箱内部温湿度 → `in_temp`, `in_humi`
- **外部传感器** (GPIO17): 测量蜂箱外部温湿度 → `out_temp`, `out_humi`

#### 5.1.2 字段映射
| 树莓派字段 | 数据库字段 | 前端字段 | 描述 |
|-----------|-----------|---------|------|
| `in_temp` | `insideTemperature` | `insideTemperature` | 蜂箱内部温度（°C） |
| `in_humi` | `insideHumidity` | `insideHumidity` | 蜂箱内部湿度（%） |
| `out_temp` | `outsideTemperature` | `outsideTemperature` | 蜂箱外部温度（°C） |
| `out_humi` | `outsideHumidity` | `outsideHumidity` | 蜂箱外部湿度（%） |
| `temp` | `insideTemperature` | `insideTemperature` | 兼容字段（内部温度） |
| `humi` | `insideHumidity` | `insideHumidity` | 兼容字段（内部湿度） |

#### 5.1.3 显示优先级
- **内部温度**: `insideTemperature -> temperature -> outsideTemperature`
- **内部湿度**: `insideHumidity -> humidity -> outsideHumidity`
- **外部温度**: `outsideTemperature`（独立显示）
- **外部湿度**: `outsideHumidity`（独立显示）

#### 5.1.4 向后兼容
- 旧字段 `temp`/`humi` 自动映射到内部温湿度
- 前端适配器支持回退到兼容字段
- 数据库同时存储新字段和兼容字段

### 5.2 计数类口径

- 蜜蜂进出支持"增量"与"累计差分"自动识别。
- 胡蜂告警使用 `hornet_count`（映射至 `hornetsDetected`）。

### 5.3 落库策略

- `MQTT_STORAGE_BUCKET_MINUTES=60` 默认按桶落库（减压）。
- SSE 仍按实时消息推送，不影响实时看板。
- 断网容灾（设备端）：树莓派可启用 `telemetry_sync`（`hornet_model2_ncnn_model/transfer_process.py`），每小时采样落盘（SQLite），网络恢复后通过 MQTT（QoS1）补传，成功后清理本地缓存。
- 补传数据会携带 `status.replay=true`：
  - 后端会按 payload `timestamp` 所在桶参与聚合并落库（必要时到达即落库）
  - 后端跳过 SSE 实时广播（避免历史数据刷屏）
  - 后端跳过设备在线状态更新（不覆盖 `lastSeenAt`）

### 5.4 主表镜像

- `IOT_MIRROR_TO_BEEHIVE=true` 时，IoT 核心值镜像到 `hive_data`，便于统一展示。

---

## 6. API 速查

除 `GET /api/health` 外，默认需要：

- `Authorization: Bearer <API_TOKEN>`

### 6.1 健康与配置

- `GET /api/health`
- `GET /api/config`
- `POST /api/config`

`POST /api/config` 可更新字段：

- `apiToken`
- `gaodeApiKey`
- `qwenApiKey`
- `videoStreamUrl`
- `videoStreamMode`
- `visionDeviceId`

### 6.2 IoT 相关

- `GET /api/iot/stream?token=...`
- `POST /api/iot/ingest`
- `GET /api/iot/latest?deviceId=...`
- `GET /api/iot/history?...`
- `GET /api/iot/monitor`
- `GET /api/iot/pipeline-status?deviceId=...`

### 6.3 视觉相关

- `POST /api/vision/probe`
- `GET /api/vision/stream.mjpg`

说明：`POST /api/vision/frame` 已启用，可用于树莓派上传帧。

### 6.4 AI 数据库查询（新功能）

- `GET /api/ai/database-schema` - 获取数据库结构
- `POST /api/ai/query` - 执行SQL查询（仅SELECT）
- `GET /api/ai/schema-docs` - 获取Schema文档

### 6.5 过时数据清理（新增）

- `POST /api/system/stale-data/report` - 生成过时数据分析报告（含AI洞察）
- `POST /api/system/stale-data/cleanup` - 二次确认后执行安全清理
- `GET /api/system/stale-data/operation/:operationId` - 查询任务状态、备份路径和错误信息

---

## 7. AI 数据库查询功能

### 7.1 功能概述

智能蜂箱系统支持通过自然语言查询数据库中的历史数据，AI会自动生成SQL并执行查询。

### 7.2 使用方法

1. 进入"AI助手"页面
2. 输入自然语言问题，例如：
   - "查询最近24小时的温度数据"
   - "显示最近一周的蜜蜂进出统计"
   - "查询今天检测到多少只胡蜂"
   - "分析最近一个月的蜂箱重量变化"

### 7.3 安全限制

- ✅ 只允许执行SELECT查询
- ✅ 禁止INSERT、UPDATE、DELETE等危险操作
- ✅ 禁止访问敏感配置表
- ✅ 禁止执行多条SQL语句
- ✅ 自动检测SQL注入风险

### 7.4 查询示例

**用户问题**: "查询最近24小时的温度数据"

**AI生成的SQL**:
```sql
SELECT timestamp, insideTemperature, outsideTemperature 
FROM hive_data 
WHERE timestamp >= (UNIX_TIMESTAMP(NOW()) * 1000 - 86400000)
ORDER BY timestamp DESC
LIMIT 100
```

---

## 8. `.env` 配置说明（生产/本地）

建议最小配置：

```env
PORT=3001
NODE_ENV=production

API_TOKEN=请使用长度>=16的随机字符串

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=smarthive
DB_PASSWORD=请改为强密码
DB_NAME=smarthive

QWEN_API_KEY=
GAODE_API_KEY=

CORS_ORIGIN=https://你的域名

VIDEO_STREAM_URL=/api/vision/stream.mjpg
VIDEO_STREAM_MODE=mjpeg
VISION_DEVICE_ID=pi5-vision-client

MQTT_BROKER_URL=mqtt://127.0.0.1:1883
MQTT_SENSOR_TOPIC=smarthive/+/sensors
MQTT_SUB_QOS=1
MQTT_STORAGE_BUCKET_MINUTES=60
IOT_MIRROR_TO_BEEHIVE=true
```

字段关系：

- 管理后台保存配置会写入数据库 `system_config`，并同步到进程环境变量。
- 前端最终以 `/api/config` 下发值为准。

### 8.1 后端中转方案详细配置步骤（推荐照做）

以下步骤适用于"视频跨网络访问"，即树莓派上传帧 -> 后端中转 -> 前端观看。

1. 配置后端 `.env`（不要加引号，不要写空格）

```env
PORT=3001
NODE_ENV=production

API_TOKEN=你的安全随机字符串至少16位

DB_HOST=localhost
DB_PORT=3306
DB_USER=smarthive
DB_PASSWORD=你的数据库密码
DB_NAME=smarthive

CORS_ORIGIN=https://你的域名

VIDEO_STREAM_URL=/api/vision/stream.mjpg
VIDEO_STREAM_MODE=mjpeg
VISION_DEVICE_ID=pi5-vision-client

MQTT_BROKER_URL=mqtt://127.0.0.1:1883
MQTT_SENSOR_TOPIC=smarthive/+/sensors
MQTT_SUB_QOS=1
MQTT_STORAGE_BUCKET_MINUTES=60
IOT_MIRROR_TO_BEEHIVE=true
```

2. （可选）导入演示数据

```powershell
cmd /c "mysql -h localhost -u root -p你的密码 --default-character-set=utf8mb4 < smarthive_demo_seed.sql"
```

3. 重启后端服务（PM2）

```bash
pm2 restart smarthive-backend
pm2 logs smarthive-backend --lines 100
```

4. 管理后台核对视频配置
- `videoStreamUrl=/api/vision/stream.mjpg`
- `videoStreamMode=mjpeg`
- `visionDeviceId=pi5-vision-client`

5. 树莓派端配置 `server_upload`
- `server_upload.enabled=true`
- `server_upload.url=http://<你的域名或公网IP>/api/vision/frame`
- `server_upload.token=<与你后端 API_TOKEN 完全一致>`
- `server_upload.device_id=pi5-vision-client`（需与前端配置一致）

6. 联调验证（最少做这3条）
- `GET /api/health` 成功
- 管理后台"视频 -> 立即探测"成功
- 打开视觉页，能持续出画面

### 8.2 配置格式常见错误

- 错误：`DB USER =root'`  
  正确：`DB_USER=root`
- 错误：`DB_HOST ='Localhost'`  
  正确：`DB_HOST=localhost`
- 错误：值里混用中文引号/多余空格  
  正确：`KEY=value`（仅英文等号，不加引号）

---

## 9. 本地开发与部署

### 9.1 本地启动

```bash
npm install
npm run start
```

### 9.2 常用命令

```bash
npm run dev              # 前端开发模式
npm run dev:server       # 后端开发模式
npm run build            # 构建前端
npm run build:server     # 构建后端
npm run type-check       # TypeScript类型检查
npm run test             # 运行测试
npm run check:iot-link   # 检查IoT链路
```

### 9.3 生产部署 (推荐方案)

我们推荐使用构建后的单文件部署，以获得最佳性能：

```bash
# 1. 安装生产环境依赖
npm ci --production

# 2. 构建前后端
npm run build
npm run build:server

# 3. 使用 PM2 启动后端 (托管前端静态文件)
pm2 start dist-server/server.cjs --name smarthive-backend
```

---

## 10. Nginx 关键配置

目标：

- `/` 走前端静态资源
- `/api` 反代后端
- SSE/MJPEG 关闭缓冲

参考：

```nginx
client_max_body_size 4m;

location / {
  try_files $uri $uri/ /index.html;
}

location = /api/iot/stream {
  proxy_pass http://127.0.0.1:3001;
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 3600s;
  add_header X-Accel-Buffering no;
}

location = /api/vision/stream.mjpg {
  proxy_pass http://127.0.0.1:3001;
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 3600s;
  add_header X-Accel-Buffering no;
}

location /api {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
}
```

### 10.1 中转方案必须满足

1. `/api` 必须正确反代到后端（`127.0.0.1:3001`）。  
2. `POST /api/vision/frame` 必须可达（树莓派上传帧用）。  
3. `GET /api/vision/stream.mjpg` 必须关闭代理缓冲。  
4. `client_max_body_size` 不要太小，建议 `>= 2m`（推荐 `4m`）。  
5. 若用了 CDN/WAF，确认未拦截 `multipart/x-mixed-replace`。

---

## 11. 树莓派接入（`hornet_model2.ncnn`）

### 11.1 必要项

`hornet_model2.ncnn/config.yaml` 重点：

- `mqtt.enabled=true`
- `mqtt.host/port/data_topic`
- `mqtt.client_id=pi5-vision-client`（示例）
- `mqtt.publish_interval_seconds`
- `server_upload.enabled=true`
- `server_upload.url=http://<你的后端域名>/api/vision/frame`
- `server_upload.token=<API_TOKEN>`
- `server_upload.device_id=pi5-vision-client`（与前端 `visionDeviceId` 一致）

### 11.2 传感器命名建议

- `inside_temperature`
- `inside_humidity`
- `outside_temperature`
- `outside_humidity`
- `weight`
- `bees_in`
- `bees_out`
- `hornet_count`

### 11.3 运行

```bash
cd hornet_model2.ncnn
python3 tast.py --config config.yaml
```

### 11.4 树莓派中转上传检查清单

1. 能访问后端上传地址（树莓派上执行）：

```bash
curl -I http://<你的域名>/api/health
```

2. `server_upload.token` 与后端 `API_TOKEN` 完全一致。  
3. `server_upload.device_id` 与管理后台 `visionDeviceId` 一致。  
4. 树莓派运行日志中无连续 `SERVER_UPLOAD_FAIL`。

---

## 12. 测试数据脚本（`smarthive_demo_seed.sql`）

### 12.1 脚本用途

- 重建核心表
- 插入 `2026-02-01` 到执行当天的数据
- `hive_data` 每天固定 24 条（整点）

截至 2026-04-01，预期：

- `60` 天
- `1440` 条

### 12.2 执行命令（PowerShell）

```powershell
cmd /c "mysql -h localhost -u root -p你的密码 --default-character-set=utf8mb4 < smarthive_demo_seed.sql"
```

### 12.3 常见提示

- `Using a password on the command line interface can be insecure.` 是警告，不是失败。
- 只要没有 `ERROR xxxx`，通常表示脚本执行成功。

### 12.4 校验命令

```powershell
mysql -h localhost -u root -p你的密码 -D smarthive -e "SELECT COUNT(*) AS hive_rows, FROM_UNIXTIME(MIN(ts)/1000) AS min_time, FROM_UNIXTIME(MAX(ts)/1000) AS max_time FROM (SELECT timestamp AS ts FROM hive_data) t;"
```

---

## 13. 上线验收清单

1. `GET /api/health` 返回 `databaseConnected=true`
2. `GET /api/iot/pipeline-status?deviceId=<visionDeviceId>` 中 `latestCount/historyCount > 0`
3. 前端验证：
   - 总览实时刷新
   - 细分/详情可用
   - AI 返回正常
   - 视觉页可播视频
   - `hornet_count>0` 时出现告警
4. AI数据库查询功能正常

5. 中转链路专项验证（建议执行）

```bash
curl -H "Authorization: Bearer <API_TOKEN>" -X POST http://<domain>/api/vision/probe \
  -H "Content-Type: application/json" \
  -d "{\"streamUrl\":\"/api/vision/stream.mjpg?deviceId=pi5-vision-client\",\"streamMode\":\"mjpeg\"}"
```

返回 `success=true` 即中转流探测通过。

---

## 14. 常见问题排查

### 14.1 `Unexpected token '<'`

原因：`/api` 被前端路由或错误页接管。  
处理：检查 Nginx 的 `/api` 反代。

### 14.2 `databaseConnected=false`

原因：数据库连接参数错误或权限不足。  
处理：核对 `.env` 的 `DB_*`，确认账号可登录。

### 14.3 视频黑屏

排查顺序：

1. 管理后台"立即探测"是否成功
2. `videoStreamMode` 是否与协议一致
3. 若用 `/api/vision/stream.mjpg`，是否已提供上传帧来源
4. Nginx 是否关闭缓冲
5. 检查树莓派日志是否出现 `SERVER_UPLOAD_FAIL`
6. 检查后端是否出现 `POST /api/vision/frame 401/413`
7. **HTTPS 页面 + HTTP 摄像头（Mixed Content）**：浏览器会阻止在页面内直接嵌入 `http://` 视频流（新标签页单独打开仍可能正常）。当前版本后端提供 **`GET /api/vision/proxy?url=...&token=...`**，由服务端转发流；视觉页在检测到「当前页 HTTPS 且配置地址为 HTTP」时会**自动走代理**，管理后台仍填写摄像头原始地址即可。HLS（`.m3u8`）因分片多为绝对地址，自动代理可能不完整，建议测试阶段优先 **MJPEG** 或给设备/反代配置 HTTPS。

### 14.4 视频有画面但无胡蜂告警

- 核对 `visionDeviceId` 是否与设备上报 `deviceId` 一致。
- 核对设备是否上报 `hornet_count`。

### 14.5 SQL 导入报 `Can't reopen table`

已在新版 `smarthive_demo_seed.sql` 规避该问题；请使用最新版脚本。

### 14.6 AI查询失败

- 检查 `QWEN_API_KEY` 是否配置正确
- 检查SQL语法是否正确
- 确认表名和字段名是否正确
- 查看后端日志获取详细错误信息

---

## 15. 安全与运维建议

1. 生产替换演示管理员认证逻辑。
2. `API_TOKEN` 使用高强度随机串（至少16位）并定期轮换。
3. 强制 HTTPS。
4. 后端 3001 仅内网开放。
5. MQTT 外网场景启用账号密码与 ACL。
6. 定期备份 `hive_data`、`iot_telemetry`、`system_config`。
7. 不要将 `.env` 文件提交到版本控制。

---

## 16. 关键文件索引

- 前端路由：`App.tsx`
- 管理后台：`components/AdminDashboard.tsx`
- 视觉页：`components/VisionRecognitionPage.tsx`
- 实时 Hook：`hooks/useIotRealtime.ts`
- 数据同步服务：`services/dataSyncService.ts`
- 后端入口：`server.ts`
- MQTT 接入：`services/mqttIngestService.ts`
- IoT 桥接：`services/iotBridge.ts`
- 数据库服务：`services/databaseService.ts`
- AI查询服务：`services/aiQueryService.ts`
- 环境变量模板：`.env.example`
- Nginx 示例：`nginx.conf`
- 测试数据脚本：`smarthive_demo_seed.sql`
- 数据同步方案：`数据同步与一致性方案.md`
- 项目落地评估报告：`项目落地评估报告_2026-03-20.md`
- AI数据库查询说明：`AI数据库查询功能使用说明.md`
- 传感器配置说明：`传感器配置说明文档.md`

---

## 17. 部署准备状态

### 17.1 构建状态
- ✅ 前端构建：通过
- ✅ 后端构建：通过
- ✅ TypeScript类型检查：通过
- ✅ 单元测试：通过（30个测试用例）

### 17.2 部署前检查清单
- [ ] 修改 `API_TOKEN` 为至少16位随机字符串
- [ ] 配置真实的 `QWEN_API_KEY`（如需AI功能）
- [ ] 配置真实的 `GAODE_API_KEY`（如需地图功能）
- [ ] 设置 `CORS_ORIGIN` 为生产域名
- [ ] 确保 MySQL 数据库已创建并可访问
- [ ] 执行 `create_tables.sql` 创建数据表
- [ ] 配置 MQTT Broker（如使用树莓派数据采集）
- [ ] 配置 Nginx 反向代理
- [ ] 使用 PM2 启动后端服务
- [ ] 创建 `.gitignore` 文件防止敏感信息泄露
