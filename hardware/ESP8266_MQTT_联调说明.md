# ESP8266 温湿度 → MQTT → 后端 MySQL 联调说明

更新时间：2026-04-03\
适用项目：本仓库 `services/mqttIngestService.ts`（订阅 `smarthive/+/sensors`）、`services/iotBridge.ts`（字段映射）

***

## 1. 思路说明

1. **ESP8266** 连接 WiFi，按固定 **JSON** 格式向 EMQX 发布消息。
2. **后端**（跑在服务器上）订阅同一 Broker，解析后写入 **MySQL** 的 `iot_telemetry`、`iot_device_status` 等表。
3. 为与生产数据隔离，联调时使用**独立测试库** `smarthive_esp_test`，通过环境变量 `DB_NAME` 切换。

数据不会经过 HTTP，全程 **MQTT**。

***

## 2. 在 MySQL 中建测试库

在服务器执行（或把 `sql/esp8266_test_db_setup.sql` 导入）：

```bash
mysql -u root -p < sql/esp8266_test_db_setup.sql
```

然后修改后端 `.env`（联调阶段）：

```env
DB_NAME=smarthive_esp_test
DB_USER=你的用户
DB_PASSWORD=你的密码
```

重启后端。首次启动会执行 `initializeDatabase()`，在 `smarthive_esp_test` 下自动建表（含 `iot_telemetry`）。

联调结束后，把 `DB_NAME` 改回生产库名即可。

***

## 3. EMQX / MQTT 与后端一致

后端需要（与 `MQTT_EMQX_树莓派到MySQL全流程配置指南.md` 相同）：

```env
MQTT_BROKER_URL=mqtt://127.0.0.1:1883
MQTT_SENSOR_TOPIC=smarthive/+/sensors
MQTT_USERNAME=...
MQTT_PASSWORD=...
```

ESP8266 发布的 **Topic** 必须为：

`smarthive/<deviceId>/sensors`

示例：`smarthive/esp8266-test/sensors`（与示例代码中 `DEVICE_ID` 一致）

**Payload** 必须包含：

- `deviceId`（字符串）
- `timestamp`（毫秒；建议 NTP 同步后填写）
- `sensors`：数组，每项含 `type`、`value`（数字）

温湿度建议使用字段名 `in_temp`、`in_humi`（会映射为内部温湿度），与树莓派文档一致。

***

## 4. 烧录示例程序

1. 安装 **Arduino IDE**，板卡选 **NodeMCU 1.0 (ESP-12E)** 或你的模块对应项。
2. 库管理器安装：**PubSubClient**、**DHT sensor library**、**Adafruit Unified Sensor**。
3. 打开 `hardware/esp8266_mqtt_dht/esp8266_mqtt_dht.ino`。
4. 修改文件顶部：`WIFI_*`、`MQTT_HOST`、`MQTT_USER`/`MQTT_PASS`、`DEVICE_ID`、`DHTPIN`/`DHTTYPE`。
5. 编译上传，打开串口监视器（115200），应看到周期性 `MQTT publish OK`。

无 DHT 时读数失败会打印失败并使用占位温湿度，仍可先**打通链路**。

***

## 5. 验证数据是否进库

```sql
USE smarthive_esp_test;

SELECT id, timestamp, device_id, sensor_type, value, created_at
FROM iot_telemetry
WHERE device_id = 'esp8266-test'
ORDER BY id DESC
LIMIT 20;
```

同时可调用后端（需 `API_TOKEN`）：

```bash
curl -H "Authorization: Bearer <API_TOKEN>" \
  http://127.0.0.1:3001/api/iot/monitor
```

查看 `mqtt.receivedMessages` 是否增长。

***

## 6. 常见问题

| 现象       | 处理                                                                  |
| -------- | ------------------------------------------------------------------- |
| MQTT 连不上 | 检查服务器防火墙是否放行 1883；`MQTT_HOST` 是否为本机局域网 IP（手机热点时注意网段）                |
| 后端收不到    | 确认 Topic 为 `smarthive/xxx/sensors`；JSON 里必须有 `deviceId` 与 `sensors` |
| 库无数据     | 确认 `DB_NAME=smarthive_esp_test` 且后端已重启；查 `iot_telemetry`            |
| 时间戳异常    | 确保 ESP8266 已 NTP 同步；路由器需能访问外网 NTP                                   |

***

## 7. 与生产环境切换

- 联调：`DB_NAME=smarthive_esp_test`
- 上线（或切到树莓派）：改回生产库（你的生产库名以实际为准），并保证树莓派 payload 中 `deviceId` 为 `pi5-vision-client`

生产环境的验证建议（查 IoT 明细落库）：

```sql
USE fengxiang;

SELECT device_id, sensor_type, value, unit, created_at
FROM iot_telemetry
WHERE device_id='pi5-vision-client'
ORDER BY id DESC
LIMIT 20;
```

