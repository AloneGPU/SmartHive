# MQTT数据存储与传输方案

更新时间：2026-04-02  
适用版本：当前仓库 `server.ts` + `services/mqttIngestService.ts` + `services/iotBridge.ts`

## 一、系统架构

### 1. 整体架构
```
树莓派 → MQTT消息 → 后端服务 → SSE → 前端界面
                                    ↓ 每小时存储
                                 MySQL数据库
```

### 2. 组件说明
- **树莓派**：物联网设备，采集传感器数据并通过MQTT发送
- **MQTT Broker**：接收和转发MQTT消息
- **后端服务**：处理MQTT数据，实时推送到前端，每小时存储到数据库
- **SSE**：实时数据传输通道，将数据推送到前端（`/api/iot/stream`）
- **MySQL**：持久化存储聚合后的传感器数据和设备状态

## 二、后端MQTT处理

### 1. MQTT服务配置
- **主题订阅**：`smarthive/+/sensors`
- **QoS级别**：1（至少传递一次）
- **连接配置**：自动重连，心跳间隔30秒

### 2. 数据处理流程
1. 接收MQTT消息
2. 解析消息 payload
3. 实时推送到前端（SSE）
4. 更新设备在线状态（补传 replay 数据会跳过此步骤）
5. 按时间桶缓存数据用于聚合（桶默认 60 分钟，可用 `MQTT_STORAGE_BUCKET_MINUTES` 调整）
6. 存储“已结束桶”的聚合数据到数据库
7. 断网补传：设备端可按小时落盘（SQLite）并在网络恢复后通过 MQTT 补传（QoS1），补传数据用 `status.replay=true` 标记

### 3. 核心代码
```typescript
// MQTT消息处理
client.on('message', async (_topic, payload, packet) => {
  // 解析消息
  const parsed = parseMqttPayload(payload);
  if (!parsed) return;
  
  // 1. 实时推送到前端（补传 replay 会跳过，避免历史数据刷屏）
  const isReplay = Boolean((parsed.status as any)?.replay);
  if (!isReplay) {
    realtimeHub.broadcast({
      type: 'iot.telemetry',
      payload: {
        deviceId: parsed.deviceId,
        timestamp: parsed.timestamp,
        sensors: parsed.sensors
      },
      ts: Date.now()
    });
  }

  // 2. 更新设备状态（补传 replay 不更新，避免覆盖 lastSeenAt）
  if (!isReplay) {
    const status = buildIotDeviceStatus(parsed.deviceId, parsed.status, parsed.timestamp, points.length);
    await upsertIotDeviceStatus(status);
  }

  // 3. 添加到“按桶缓存”（桶由消息 timestamp 决定）
  const bucketKey = String(Math.floor(parsed.timestamp / bucketMs));
  // deviceId -> bucketKey -> sensorType -> {values,timestamps}
  // ...（详见 services/mqttIngestService.ts 实现）
});

// 定时扫描并存储“已结束桶”
setInterval(() => {
  // ...（详见 services/mqttIngestService.ts 实现）
}, 5 * 60 * 1000); // 每5分钟检查一次
```

## 三、前端实时接收

### 1. WebSocket连接
- **连接方式**：SSE（EventSource）
- **连接地址**：`/api/iot/stream`
- **认证方式**：Token参数
- **事件监听**：`iot.telemetry` 事件

### 2. 实时数据处理
- **useIotRealtime Hook**：处理实时数据和连接状态
- **数据质量评估**：计算数据新鲜度和完整性
- **错误处理**：自动重连和错误提示

### 3. 核心代码
```typescript
// useIotRealtime Hook
const { 
  latest, 
  history, 
  streamConnected, 
  lastUpdated, 
  dataQuality 
} = useIotRealtime(
  'pi5-vision-client', 
  600000, // 10分钟范围
  {
    onStreamStatusChange: (connected) => console.log('Stream status:', connected),
    onDataUpdate: (data) => console.log('Data updated:', data.length)
  }
);
```

## 四、数据库存储

### 1. 存储策略
- **存储频率**：每小时一次
- **数据聚合**：
  - 温度、湿度：计算每小时平均值
  - 马蜂检测、蜜蜂进出：计算每小时累计值
- **存储内容**：只存储聚合后的数据，减少存储压力

### 2. 数据表结构

#### `iot_telemetry` 表
| 字段名 | 数据类型 | 描述 |
|--------|----------|------|
| `id` | `BIGINT` | 自增主键 |
| `timestamp` | `BIGINT` | 时间戳（毫秒） |
| `device_id` | `VARCHAR(64)` | 设备ID |
| `sensor_type` | `VARCHAR(64)` | 传感器类型 |
| `value` | `DOUBLE` | 传感器值 |
| `unit` | `VARCHAR(32)` | 单位 |
| `qos` | `TINYINT` | QoS级别 |
| `meta_json` | `JSON` | 元数据 |
| `created_at` | `TIMESTAMP` | 创建时间 |

#### `iot_device_status` 表
| 字段名 | 数据类型 | 描述 |
|--------|----------|------|
| `device_id` | `VARCHAR(64)` | 设备ID（主键） |
| `online` | `TINYINT(1)` | 在线状态 |
| `last_seen_at` | `BIGINT` | 最后seen时间 |
| `last_rssi` | `INT` | 信号强度 |
| `last_ip` | `VARCHAR(64)` | IP地址 |
| `packets_received` | `BIGINT` | 接收数据包数 |
| `packets_dropped` | `BIGINT` | 丢包数 |
| `updated_at` | `TIMESTAMP` | 更新时间 |

#### `hive_data` 表
| 字段名 | 数据类型 | 描述 |
|--------|----------|------|
| `id` | `INT` | 自增主键 |
| `timestamp` | `BIGINT` | 时间戳（毫秒） |
| `temperature` | `DECIMAL(5,2)` | 温度 |
| `humidity` | `DECIMAL(5,2)` | 湿度 |
| `insideTemperature` | `DECIMAL(5,2)` | 内部温度 |
| `insideHumidity` | `DECIMAL(5,2)` | 内部湿度 |
| `outsideTemperature` | `DECIMAL(5,2)` | 外部温度 |
| `outsideHumidity` | `DECIMAL(5,2)` | 外部湿度 |
| `weight` | `DECIMAL(6,2)` | 重量 |
| `beesIn` | `INT` | 蜜蜂进入数 |
| `beesOut` | `INT` | 蜜蜂离开数 |
| `hornetsDetected` | `INT` | 马蜂检测数 |
| `latitude` | `DECIMAL(10,8)` | 纬度 |
| `longitude` | `DECIMAL(11,8)` | 经度 |
| `created_at` | `TIMESTAMP` | 创建时间 |

## 五、数据流转详细流程

### 1. 树莓派端
1. 采集传感器数据（温度、湿度、重量等）
2. 构建MQTT消息
3. 发布到 `smarthive/{deviceId}/sensors` 主题

### 2. 后端服务端
1. 接收MQTT消息
2. 解析消息内容
3. 实时推送到前端（WebSocket）
4. 更新设备状态
5. 缓存数据到每小时缓存
6. 每小时聚合数据并存储到数据库

### 3. 前端端
1. 建立WebSocket连接
2. 接收实时数据
3. 更新界面显示
4. 监控连接状态
5. 处理错误和重连

### 4. 数据库端
1. 存储每小时聚合数据
2. 更新设备状态
3. 提供历史数据查询

## 六、消息格式

### 1. MQTT消息格式
```json
{
  "deviceId": "pi5-vision-client",
  "timestamp": 1679846400000,
  "sensors": [
    {"type": "temperature", "value": 25.5, "unit": "°C"},
    {"type": "humidity", "value": 60, "unit": "%"},
    {"type": "weight", "value": 12.5, "unit": "kg"}
  ],
  "status": {
    "online": 1,
    "rssi": -65,
    "ip": "192.168.1.100",
    "packetsReceived": 100,
    "packetsDropped": 0
  }
}
```

### 2. WebSocket消息格式
```json
{
  "type": "iot.telemetry",
  "payload": {
    "deviceId": "pi5-vision-client",
    "timestamp": 1679846400000,
    "sensors": [
      {"type": "temperature", "value": 25.5, "unit": "°C"},
      {"type": "humidity", "value": 60, "unit": "%"},
      {"type": "weight", "value": 12.5, "unit": "kg"}
    ]
  },
  "ts": 1679846400000
}
```

## 七、错误处理与可靠性

### 1. 错误处理
- **MQTT连接**：自动重连，最多3次，指数退避
- **WebSocket连接**：自动重连，错误通知前端
- **数据处理**：异常捕获，错误日志记录
- **数据存储**：事务处理，确保数据一致性

### 2. 可靠性保障
- **QoS级别**：使用QoS 1确保消息至少传递一次
- **离线处理**：网络中断时缓存数据，恢复后重传
- **数据校验**：验证数据格式和完整性
- **监控告警**：异常情况及时告警

### 3. 数据质量保障
- **数据新鲜度**：实时推送，确保数据及时性
- **数据完整性**：验证必填字段，确保数据完整
- **数据一致性**：定期校验，确保数据准确
- **数据可靠性**：多重备份，确保数据安全

## 八、监控与维护

### 1. 监控指标
- **MQTT连接状态**：设备在线/离线
- **消息统计**：接收消息数、错误数
- **数据流量**：传输数据量
- **存储状态**：存储次数、成功/失败
- **系统性能**：CPU、内存、网络使用

### 2. 维护建议
- **定期清理**：清理过期数据，优化存储空间
- **索引优化**：定期优化数据库索引
- **日志分析**：分析错误日志，及时发现问题
- **备份策略**：定期备份数据库，确保数据安全
- **系统更新**：及时更新依赖库和系统组件

## 九、扩展与未来规划

### 1. 扩展方向
- **支持更多设备**：扩展设备类型和数量
- **增加传感器类型**：支持更多传感器数据
- **添加数据分析**：实现数据统计和分析
- **集成告警系统**：基于阈值的告警
- **支持多区域部署**：实现分布式系统

### 2. 技术升级
- **使用MQTT 5.0**：利用新特性，如消息过期、共享订阅等
- **实现边缘计算**：在树莓派端进行初步数据处理
- **采用时序数据库**：优化时间序列数据存储和查询
- **集成AI分析**：实现智能分析和预测
- **使用容器化部署**：提高系统可扩展性和可靠性

## 十、总结

本方案实现了从树莓派到前端的完整数据流转，包括：
- MQTT消息的实时接收和处理
- 数据的实时推送和显示
- 每小时聚合存储到数据库
- 设备状态的管理和监控
- 系统的可靠性和可扩展性

通过WebSocket实时推送和每小时存储的架构，确保了数据的实时性和存储效率，为智能蜂箱系统提供了高效、可靠的数据基础。同时，完善的错误处理和监控机制，确保了系统的稳定性和可靠性。

该方案不仅满足了当前的业务需求，也为未来的功能扩展和技术升级奠定了坚实的基础。

补充：MQTT链路负责实时/历史遥测采集；数据库“过时数据”治理（报告生成、人工确认、备份清理、审计追溯）由后端 `/api/system/stale-data/*` 接口独立处理，避免与实时通道耦合。