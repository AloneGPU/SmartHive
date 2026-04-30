# AI数据库查询功能使用说明

更新时间：2026-04-08  
适用版本：`/api/ai/chat`、`/api/ai/query`、`services/qwenService.server.ts`

## 一、功能概述

智能蜂箱系统现已支持AI数据库查询功能，用户可以通过自然语言与AI对话，AI会自动生成SQL查询语句并执行，再基于结果做分析。

当前版本有两个重要变化：

- `/api/ai/query` 默认只返回查询摘要，不再直接暴露原始数据行和字段明细
- `/api/ai/chat` 在最终回答中会尽量隐藏表名、字段名、SQL、JSON 等后端实现细节，只保留业务结论与建议

## 二、功能特点

### 2.1 自然语言查询
- ✅ 支持中文自然语言查询
- ✅ AI自动理解用户意图
- ✅ 自动生成SQL查询语句
- ✅ 自动执行查询并返回结果

### 2.2 安全控制
- ✅ 只允许执行SELECT查询
- ✅ 禁止INSERT、UPDATE、DELETE等危险操作
- ✅ 禁止访问敏感配置表
- ✅ 禁止执行多条SQL语句
- ✅ 自动检测SQL注入风险
- ✅ 自动限制查询返回规模
- ✅ AI回答默认隐藏表名、字段名、SQL和JSON结构

### 2.3 智能分析
- ✅ 基于查询结果进行智能分析
- ✅ 提供专业的养蜂建议
- ✅ 支持数据可视化建议

## 三、使用方法

### 3.1 通过前端聊天界面

1. 打开智能蜂箱系统前端
2. 进入"AI助手"页面
3. 输入自然语言问题，例如：
   - "查询最近24小时的温度数据"
   - "显示最近一周的蜜蜂进出统计"
   - "查询今天检测到多少只胡蜂"
   - "分析最近一个月的蜂箱重量变化"

### 3.2 通过API调用

#### 3.2.1 获取数据库Schema
```bash
curl -X GET http://localhost:3001/api/ai/database-schema \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

#### 3.2.2 执行SQL查询
```bash
curl -X POST http://localhost:3001/api/ai/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -d '{
    "sql": "SELECT * FROM hive_data ORDER BY timestamp DESC LIMIT 10"
  }'
```

返回示例：
```json
{
  "success": true,
  "rowCount": 10,
  "executionTime": 18,
  "summary": {
    "status": "ok",
    "rowCount": 10,
    "columnCount": 13,
    "sampledRows": 10,
    "profile": {
      "numericColumnCount": 8,
      "timeLikeColumnCount": 1,
      "textColumnCount": 0,
      "booleanColumnCount": 0,
      "nullOnlyColumnCount": 0
    },
    "insight": "查询成功，共命中 10 条记录，结果包含 13 个字段，1 个时间维度，8 个数值指标，适合继续做趋势分析。"
  }
}
```

说明：

- 该接口用于调试“查询是否成功、结果大概是什么类型”，不是给前端直接展示原始表数据
- 如果需要最终可读分析，请优先使用 `/api/ai/chat`

#### 3.2.3 获取Schema文档
```bash
curl -X GET http://localhost:3001/api/ai/schema-docs \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

## 四、查询示例

### 4.1 温湿度查询

**用户问题**: "查询最近24小时的温度数据"

**AI生成的SQL**:
```sql
SELECT timestamp, insideTemperature, outsideTemperature 
FROM hive_data 
WHERE timestamp >= (UNIX_TIMESTAMP(NOW()) * 1000 - 86400000)
ORDER BY timestamp DESC
LIMIT 100
```

**AI回答**: 根据查询结果，最近24小时的温度数据如下：
- 内部温度范围：32.5°C - 36.8°C
- 外部温度范围：25.2°C - 30.5°C
- 温度波动正常，蜂箱内部温度保持在适宜范围内

说明：最终回答面向业务阅读，正常情况下不会再显示底层表名、字段名或 SQL 片段。

### 4.2 蜜蜂活动统计

**用户问题**: "统计今天蜜蜂进出总数"

**AI生成的SQL**:
```sql
SELECT SUM(beesIn) as total_in, SUM(beesOut) as total_out
FROM hive_data
WHERE timestamp >= (UNIX_TIMESTAMP(CURDATE()) * 1000)
```

**AI回答**: 根据统计结果：
- 今日蜜蜂进入总数：1,245只
- 今日蜜蜂外出总数：1,198只
- 净增长：+47只
- 蜂群活动正常，采集积极性较高

### 4.3 胡蜂检测查询

**用户问题**: "查询最近检测到的胡蜂记录"

**AI生成的SQL**:
```sql
SELECT timestamp, hornetsDetected 
FROM hive_data 
WHERE hornetsDetected > 0 
ORDER BY timestamp DESC 
LIMIT 10
```

**AI回答**: 最近检测到的胡蜂记录：
- 2026-04-01 14:30: 检测到2只胡蜂
- 2026-04-01 12:15: 检测到1只胡蜂
- 2026-04-01 10:45: 检测到3只胡蜂
- 建议：胡蜂活动较频繁，需要加强防范措施

### 4.4 重量变化分析

**用户问题**: "分析最近一周的蜂箱重量变化"

**AI生成的SQL**:
```sql
SELECT 
  DATE(FROM_UNIXTIME(timestamp/1000)) as date,
  AVG(weight) as avg_weight,
  MIN(weight) as min_weight,
  MAX(weight) as max_weight
FROM hive_data
WHERE timestamp >= (UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 7 DAY)) * 1000)
GROUP BY DATE(FROM_UNIXTIME(timestamp/1000))
ORDER BY date DESC
```

**AI回答**: 最近一周的蜂箱重量变化分析：
- 平均重量：45.2kg
- 重量增长：+2.3kg
- 增长趋势：稳定增长
- 说明：蜜蜂数量增加，蜂蜜产量良好

## 五、数据库Schema参考

### 5.1 主要数据表

#### hive_data（蜂箱核心数据）
| 字段名 | 类型 | 说明 |
|--------|------|------|
| timestamp | BIGINT | 时间戳（毫秒） |
| insideTemperature | DECIMAL(5,2) | 蜂箱内部温度（°C） |
| insideHumidity | DECIMAL(5,2) | 蜂箱内部湿度（%） |
| outsideTemperature | DECIMAL(5,2) | 蜂箱外部温度（°C） |
| outsideHumidity | DECIMAL(5,2) | 蜂箱外部湿度（%） |
| weight | DECIMAL(7,2) | 蜂箱重量 |
| beesIn | INT | 蜜蜂进入计数 |
| beesOut | INT | 蜜蜂出去计数 |
| hornetsDetected | INT | 胡蜂检测数量 |
| latitude | DECIMAL(10,8) | 纬度 |
| longitude | DECIMAL(11,8) | 经度 |

#### iot_telemetry（IoT遥测数据）
| 字段名 | 类型 | 说明 |
|--------|------|------|
| timestamp | BIGINT | 时间戳（毫秒） |
| device_id | VARCHAR(64) | 设备ID |
| sensor_type | VARCHAR(64) | 传感器类型 |
| value | DECIMAL(10,2) | 传感器值 |
| unit | VARCHAR(16) | 单位 |
| qos | TINYINT | 服务质量等级 |

#### iot_device_status（设备状态）
| 字段名 | 类型 | 说明 |
|--------|------|------|
| device_id | VARCHAR(64) | 设备ID |
| online | BOOLEAN | 在线状态 |
| last_seen_at | BIGINT | 最后在线时间 |
| last_rssi | INT | 信号强度 |
| last_ip | VARCHAR(45) | IP地址 |

#### vision_recognition（视觉识别结果）
| 字段名 | 类型 | 说明 |
|--------|------|------|
| image_url | VARCHAR(255) | 图片地址 |
| recognition_result | TEXT | 识别结果文本 |
| timestamp | BIGINT | 识别时间戳（毫秒） |

### 5.2 常用传感器类型

- `inside_temperature` - 内部温度
- `inside_humidity` - 内部湿度
- `outside_temperature` - 外部温度
- `outside_humidity` - 外部湿度
- `weight` - 重量
- `bees_in` - 蜜蜂进入
- `bees_out` - 蜜蜂外出
- `hornet_count` - 胡蜂计数

## 六、注意事项

### 6.1 安全限制
1. 只允许执行SELECT查询
2. 禁止访问系统配置表
3. 禁止执行多条SQL语句
4. `/api/ai/query` 只返回摘要，不返回原始字段明细和数据行
5. AI最终回答默认不展示表名、字段名、SQL和JSON结构

### 6.2 性能优化
1. 使用LIMIT限制结果数量
2. 避免全表扫描
3. 使用索引字段进行查询
4. 时间范围查询使用timestamp字段

### 6.3 最佳实践
1. 明确查询目的，提供具体的时间范围
2. 使用聚合函数进行统计分析
3. 结合多个数据表进行综合分析
4. 定期查询历史数据进行趋势分析

## 七、故障排查

### 7.1 查询失败
**问题**: AI生成的SQL查询失败

**解决方案**:
1. 检查SQL语法是否正确
2. 确认表名和字段名是否正确
3. 检查是否有权限访问该表
4. 查看错误日志获取详细信息

### 7.2 返回数据过多
**问题**: 查询返回大量数据，响应缓慢

**解决方案**:
1. 使用LIMIT限制结果数量
2. 添加WHERE条件缩小查询范围
3. 使用聚合函数减少返回数据量
4. 分页查询大数据集

补充说明：
`/api/ai/query` 当前即使执行成功，也只会返回摘要，这是设计行为，不是接口异常。

### 7.3 AI无法理解问题
**问题**: AI无法正确理解用户问题

**解决方案**:
1. 使用更清晰、具体的描述
2. 提供明确的时间范围
3. 指定需要查询的字段
4. 分步骤提问，逐步细化查询

## 八、API端点总结

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/ai/database-schema` | GET | 获取数据库Schema |
| `/api/ai/query` | POST | 执行SQL查询并返回摘要 |
| `/api/ai/schema-docs` | GET | 获取Schema文档 |
| `/api/ai/chat` | POST | AI对话（支持数据库查询和结果分析） |

## 九、总结

AI数据库查询功能让用户可以通过自然语言轻松查询和分析蜂箱数据，无需掌握SQL语法。系统提供了完善的安全控制和性能优化，确保查询安全高效。

**关键优势**:
- ✅ 自然语言查询，无需SQL知识
- ✅ 智能分析，提供专业建议
- ✅ 安全控制，防止数据泄露
- ✅ 性能优化，快速响应
- ✅ 默认隐藏后端实现细节，前端结果更干净

**适用场景**:
- 📊 历史数据查询和分析
- 📈 趋势分析和预测
- 🔍 异常数据检测
- 📋 报表生成和导出

通过AI数据库查询功能，养蜂人可以更轻松地了解蜂箱状态，做出科学的养殖决策！
