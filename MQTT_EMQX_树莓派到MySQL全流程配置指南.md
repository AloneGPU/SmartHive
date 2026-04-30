# MQTT + EMQX + 树莓派 到 MySQL 全流程配置指南（结合本项目）

更新时间：2026-04-02  
适用项目：`zhinengfengxiang源代码` 当前代码基线（`server.ts`、`services/mqttIngestService.ts`、`services/iotBridge.ts`、`services/databaseService.ts`）

---

## 1. 这份文档解决什么问题

你当前场景是：

- EMQX 已部署在服务器 Docker 容器（容器名示例：`emqx_8WSj`）
- 树莓派采集传感器数据
- 希望通过 MQTT 传到后端服务器
- 后端最终写入 MySQL（`iot_telemetry` / `iot_device_status` / `hive_data`）

本指南按“零基础可执行”方式，提供从 0 到通的完整步骤和排错方法。

---

## 2. 先理解你项目里的真实数据链路

本项目（按代码）链路如下：

1. 树莓派发布 MQTT 消息到 EMQX
2. 后端 `startMqttIngestService()` 连接 Broker 并订阅主题
3. 后端解析 payload（`parseMqttPayload`）
4. 后端写入：
   - `iot_telemetry`（遥测明细）
   - `iot_device_status`（设备在线状态）
   - `hive_data`（按桶聚合镜像，默认 60 分钟）
5. 同时通过 SSE 推送到前端（`/api/iot/stream`）

关键文件：

- `services/mqttIngestService.ts`：MQTT 接入、订阅、落库
- `services/iotBridge.ts`：字段别名映射和聚合策略
- `server.ts`：服务启动时调用 `startMqttIngestService()`
- `services/databaseService.ts`：MySQL 表结构初始化和写入函数

---

## 3. 部署前准备清单

你需要准备：

1. 一台服务器（能跑 Docker、Node、MySQL）
2. EMQX Docker 容器（已运行）
3. MySQL 可连接
4. 后端 `.env` 可编辑
5. 树莓派可联网访问服务器（至少能到 MQTT 端口）

建议先确认：

- 服务器公网/内网 IP
- 防火墙是否放行 1883（MQTT）
- MySQL 是否可用

---

## 4. 配置 EMQX（Docker 容器）

## 4.1 确认容器和端口映射

在服务器执行：

```bash
docker ps
```

你应该看到容器 `emqx_8WSj`，并且端口至少有：

- `1883`（MQTT）
- `18083`（EMQX 控制台）

如果没有映射 1883，需要重新运行容器（或修改编排）：

```bash
docker run -d --name emqx_8WSj \
  -p 1883:1883 \
  -p 18083:18083 \
  emqx/emqx:latest
```

## 4.2 进入 EMQX 控制台

浏览器打开：

`http://<服务器IP>:18083`

登录后建议新建 MQTT 用户（Authentication / Built-in DB）：

- 用户名：`smarthive_iot`
- 密码：`<强密码>`

---

## 5. 配置后端 `.env`（核心）

你的后端会读取以下 MQTT 变量（代码在 `services/mqttIngestService.ts`）：

```env
# 数据库
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=smarthive
DB_PASSWORD=<your_db_password>
DB_NAME=smarthive

# 后端鉴权
API_TOKEN=<至少16位随机串>

# MQTT（按你的EMQX实际地址改）
MQTT_BROKER_URL=mqtt://127.0.0.1:1883
MQTT_SENSOR_TOPIC=smarthive/+/sensors
MQTT_SUB_QOS=1
MQTT_CLIENT_ID=smarthive-server-main
MQTT_USERNAME=smarthive_iot
MQTT_PASSWORD=<your_emqx_password>

# 存储策略（默认60分钟，0=全量落库）
MQTT_STORAGE_BUCKET_MINUTES=60
IOT_MIRROR_TO_BEEHIVE=true
```

注意：

- 若 EMQX 不在本机，把 `MQTT_BROKER_URL` 改成 `mqtt://<EMQX服务器IP>:1883`
- `MQTT_SENSOR_TOPIC` 建议保持默认 `smarthive/+/sensors`

---

## 6. 启动后端并确认 MQTT 已连接

启动后端：

```bash
npm run server
```

健康检查：

```bash
curl http://127.0.0.1:3001/api/health
```

查看 MQTT 状态（需要 token）：

```bash
curl -H "Authorization: Bearer <API_TOKEN>" \
  http://127.0.0.1:3001/api/iot/monitor
```

重点看返回中的：

- `mqtt.connected` 应为 `true`
- `mqtt.receivedMessages` 后续应随上报增长
- `mqtt.lastError` 应为空或无严重错误

---

## 7. 先手动发布一条 MQTT 测试消息（强烈推荐）

不要一上来就接树莓派，先用“测试消息”验证全链路。

## 7.1 主题要求（必须匹配）

你的后端订阅是：`smarthive/+/sensors`  
所以发布主题应类似：

`smarthive/pi5-vision-client/sensors`

## 7.2 payload 要求（按项目代码）

至少包含：

- `deviceId`（字符串）
- `timestamp`（毫秒时间戳）
- `sensors`（数组，每项有 `type` + `value`）

示例：

```json
{
  "deviceId": "pi5-vision-client",
  "timestamp": 1760000000000,
  "qos": 1,
  "sensors": [
    { "type": "in_temp", "value": 35.2, "unit": "C" },
    { "type": "in_humi", "value": 64.1, "unit": "%" },
    { "type": "out_temp", "value": 28.7, "unit": "C" },
    { "type": "out_humi", "value": 73.5, "unit": "%" },
    { "type": "weight", "value": 46.3, "unit": "kg" },
    { "type": "in_count", "value": 120 },
    { "type": "out_count", "value": 115 },
    { "type": "hornet_count", "value": 1 }
  ],
  "status": {
    "online": true,
    "rssi": -55,
    "ip": "192.168.1.88",
    "packetsReceived": 100,
    "packetsDropped": 0
  }
}
```

---

## 8. MySQL 验证（确认确实入库）

登录 MySQL 后执行：

```sql
SELECT id, timestamp, device_id, sensor_type, value, created_at
FROM iot_telemetry
ORDER BY id DESC
LIMIT 30;
```

设备状态表：

```sql
SELECT device_id, online, last_seen_at, updated_at
FROM iot_device_status
ORDER BY updated_at DESC
LIMIT 10;
```

蜂箱镜像表（聚合）：

```sql
SELECT id, timestamp, insideTemperature, insideHumidity, weight, hornetsDetected
FROM hive_data
ORDER BY id DESC
LIMIT 20;
```

说明：

- `iot_telemetry` 是主要实时明细落库
- `hive_data` 默认按时间桶聚合，不一定每条 MQTT 都立即写入
- 想更“实时”看到镜像，可临时设 `MQTT_STORAGE_BUCKET_MINUTES=0`

---

## 9. 树莓派正式接入（上线步骤）

在树莓派配置中设置：

1. Broker 地址：`<服务器IP>:1883`
2. 用户名/密码：与 EMQX 用户一致
3. Topic：`smarthive/<deviceId>/sensors`
   - 你的树莓派 `config.yaml` 中 `mqtt.data_topic`（默认 `smarthive/pi5/sensors`）决定实际 Topic
4. `deviceId`：默认使用 `pi5-vision-client`（来自树莓派 `mqtt.client_id`）
   - 后端写入 MySQL 时的 `iot_telemetry.device_id` 就是这个值
5. Payload 格式与第 7 节一致（树莓派 payload 中 `sensors` 会包含 `temperature/humidity` 等字段）
6. 发布间隔建议 3-10 秒（按网络和数据库压力调整）

建议先小频率（10 秒）运行，确认稳定后再调快。

---

## 10. 你项目支持的字段别名（可直接用）

按 `services/iotBridge.ts`，后端会自动标准化：

- 温度：`in_temp` / `temp` / `temperature` / `inside_temperature` -> `inside_temperature`
- 湿度：`in_humi` / `humi` / `humidity` / `inside_humidity` -> `inside_humidity`
- 外部温湿：`out_temp` / `out_humi` -> `outside_*`
- 蜜蜂计数：`in_count` -> `bees_in`，`out_count` -> `bees_out`
- 胡蜂：`hornet_count` -> `hornet_count`
- GPS：`lat` / `lon` -> `latitude` / `longitude`

---

## 11. 常见问题与排错（新手必看）

## 11.1 后端显示 MQTT 未连接

检查：

1. `MQTT_BROKER_URL` 是否正确
2. EMQX 容器是否运行
3. 1883 端口是否映射并放行
4. 用户名密码是否正确

## 11.2 收到消息但数据库没数据

检查：

1. topic 是否匹配 `smarthive/+/sensors`
2. payload 是否包含 `deviceId + sensors`
3. `sensors` 里 `value` 是否为数字
4. MySQL 是否正常连接（`/api/health`）

## 11.3 前端没变化但数据库有数据

检查：

1. 前端 token 是否正确
2. SSE 接口 `/api/iot/stream` 是否可连
3. Nginx 是否关闭缓冲（SSE 需要）

## 11.4 `hive_data` 长时间没数据

这是最常见误解：

- 默认是按桶聚合镜像（60 分钟）
- 不代表 MQTT 失败
- 看 `iot_telemetry` 才是实时主依据

---

## 12. 生产建议（结合你的项目）

1. `API_TOKEN` 使用 16 位以上随机串  
2. EMQX 用户不要用默认密码  
3. `MQTT_STORAGE_BUCKET_MINUTES` 生产建议 15~60，平衡实时性与写入压力  
4. 保留 `iot_telemetry` 索引（项目已创建）  
5. 使用你新增的过时数据治理能力定期清理历史数据（管理端可操作）  
6. 做数据库定时备份（至少每日一次）

---

## 13. 一键验收清单（上线前照着勾）

- [ ] `docker ps` 能看到 `emqx_8WSj` 且 1883/18083 已映射  
- [ ] 后端 `.env` MQTT 参数已配置  
- [ ] `/api/health` 返回数据库正常  
- [ ] `/api/iot/monitor` 中 `mqtt.connected=true`  
- [ ] 手动发布测试消息后 `receivedMessages` 增长  
- [ ] `iot_telemetry` 查到新记录  
- [ ] 树莓派接入后持续有新记录  
- [ ] 前端页面可看到实时变化  

---

如果你希望，我可以在下一步再给你补一份“服务器命令版速查”（从容器检查到 SQL 验证全是命令，直接复制执行）。

---

## 14. 服务器命令版速查（可直接复制）

以下命令按“最少步骤跑通链路”设计。请先替换尖括号变量：

- `<API_TOKEN>`
- `<DB_USER>` `<DB_PASSWORD>`
- `<EMQX_USER>` `<EMQX_PASSWORD>`
- `<SERVER_IP>`

### 14.1 检查 EMQX 容器与端口

```bash
docker ps | grep emqx
```

如果没有 1883/18083 映射，可重新启动：

```bash
docker rm -f emqx_8WSj
docker run -d --name emqx_8WSj -p 1883:1883 -p 18083:18083 emqx/emqx:latest
```

### 14.2 配置后端环境变量（示例）

```bash
cat > .env <<'EOF'
PORT=3001
API_TOKEN=<API_TOKEN>

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=<DB_USER>
DB_PASSWORD=<DB_PASSWORD>
DB_NAME=smarthive

MQTT_BROKER_URL=mqtt://127.0.0.1:1883
MQTT_SENSOR_TOPIC=smarthive/+/sensors
MQTT_SUB_QOS=1
MQTT_CLIENT_ID=smarthive-server-main
MQTT_USERNAME=<EMQX_USER>
MQTT_PASSWORD=<EMQX_PASSWORD>

MQTT_STORAGE_BUCKET_MINUTES=60
IOT_MIRROR_TO_BEEHIVE=true
EOF
```

### 14.3 启动后端

```bash
npm run server
```

新开一个终端继续验证：

### 14.4 健康检查 + MQTT 状态检查

```bash
curl http://127.0.0.1:3001/api/health
curl -H "Authorization: Bearer <API_TOKEN>" http://127.0.0.1:3001/api/iot/monitor
```

确认 `mqtt.connected=true`。

### 14.5 用 MQTT 客户端手工发测试消息

如果服务器装了 mosquitto 客户端：

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 -u "<EMQX_USER>" -P "<EMQX_PASSWORD>" \
  -t "smarthive/pi5-vision-client/sensors" \
  -m '{"deviceId":"pi5-vision-client","timestamp":1760000000000,"sensors":[{"type":"in_temp","value":35.2,"unit":"C"},{"type":"in_humi","value":64.1,"unit":"%"},{"type":"weight","value":46.3,"unit":"kg"},{"type":"hornet_count","value":1}],"status":{"online":true,"rssi":-55,"ip":"192.168.1.88"}}'
```

### 14.6 再查后端监控计数

```bash
curl -H "Authorization: Bearer <API_TOKEN>" http://127.0.0.1:3001/api/iot/monitor
```

确认 `receivedMessages` 增长。

### 14.7 查 MySQL 是否入库

```bash
mysql -u <DB_USER> -p<DB_PASSWORD> -D smarthive -e "SELECT id,timestamp,device_id,sensor_type,value,created_at FROM iot_telemetry ORDER BY id DESC LIMIT 20;"
mysql -u <DB_USER> -p<DB_PASSWORD> -D smarthive -e "SELECT device_id,online,last_seen_at,updated_at FROM iot_device_status ORDER BY updated_at DESC LIMIT 10;"
```

### 14.8 树莓派网络连通性自测（在树莓派执行）

```bash
ping -c 4 <SERVER_IP>
nc -zv <SERVER_IP> 1883
```

通过后再启用树莓派真实发布程序。
