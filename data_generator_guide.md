# 数据生成与导入脚本使用说明

更新时间：2026-04-02  
适用版本：`data_generator.js` + 当前 MySQL 表结构（`hive_data` / `iot_telemetry`）

## 1. 环境依赖

### 1.1 系统要求
- Node.js 14.0 或更高版本
- MySQL 5.7 或更高版本
- 操作系统：Windows、Linux 或 macOS

### 1.2 依赖包
- mysql2：用于数据库连接和操作

## 2. 安装依赖

在脚本所在目录执行以下命令安装所需依赖：

```bash
npm install mysql2
```

## 3. 数据库配置

### 3.1 数据库连接信息
脚本默认连接请改为你自己的环境变量配置：
- 数据库主机(DB_HOST)：localhost
- 数据库用户名(DB_USER)：`<your_db_user>`
- 数据库密码(DB_PASSWORD)：`<your_db_password>`
- 数据库名称(DB_NAME)：smarthive

如需修改配置，请编辑 `data_generator.js` 文件中的 `dbConfig` 对象。

### 3.2 数据库表结构
脚本需要以下两个表结构：

#### hive_data 表
```sql
CREATE TABLE IF NOT EXISTS hive_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  temperature DECIMAL(5,2) NOT NULL,
  humidity DECIMAL(5,2) NOT NULL,
  weight DECIMAL(7,2) NOT NULL,
  beesIn INT NOT NULL,
  beesOut INT NOT NULL,
  hornetsDetected INT NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  created_at DATETIME NOT NULL
);

-- 创建索引以提高查询性能
CREATE INDEX idx_hive_data_timestamp ON hive_data(timestamp);
```

#### iot_telemetry 表
```sql
CREATE TABLE IF NOT EXISTS iot_telemetry (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  sensor_type VARCHAR(64) NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  unit VARCHAR(16) NOT NULL,
  qos TINYINT NOT NULL,
  meta_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以提高查询性能
CREATE INDEX idx_iot_telemetry_timestamp ON iot_telemetry(timestamp);
CREATE INDEX idx_iot_telemetry_device_sensor ON iot_telemetry(device_id, sensor_type);
```

## 4. 运行步骤

### 4.1 准备工作
1. 确保 MySQL 服务已启动
2. 确保 `smarthive` 数据库已创建
3. 确保 `hive_data` 和 `iot_telemetry` 表已创建
4. 安装好所需依赖

### 4.2 执行脚本
在脚本所在目录执行以下命令：

```bash
node data_generator.js
```

### 4.3 执行过程
脚本执行过程中会输出以下信息：
1. 数据库表结构检查
2. 日期范围信息
3. 数据生成进度
4. 数据插入进度
5. 执行结果统计

## 5. 验证方法

### 5.1 数据验证

#### 验证数据数量
```sql
-- 验证hive_data表数据量
SELECT COUNT(*) AS total_records FROM hive_data;

-- 验证iot_telemetry表数据量
SELECT COUNT(*) AS total_records FROM iot_telemetry;

-- 验证每天的数据量
SELECT DATE(FROM_UNIXTIME(timestamp/1000)) AS date, COUNT(*) AS records_per_day
FROM hive_data
GROUP BY DATE(FROM_UNIXTIME(timestamp/1000))
ORDER BY date;
```

#### 验证数据范围
```sql
-- 验证温度范围
SELECT MIN(temperature) AS min_temp, MAX(temperature) AS max_temp FROM hive_data;

-- 验证湿度范围
SELECT MIN(humidity) AS min_humidity, MAX(humidity) AS max_humidity FROM hive_data;

-- 验证重量范围
SELECT MIN(weight) AS min_weight, MAX(weight) AS max_weight FROM hive_data;

-- 验证经纬度是否正确
SELECT DISTINCT latitude, longitude FROM hive_data;
```

#### 验证数据分布
```sql
-- 查看温度分布
SELECT 
  FLOOR(temperature/5)*5 AS temp_range,
  COUNT(*) AS count
FROM hive_data
GROUP BY temp_range
ORDER BY temp_range;

-- 查看湿度分布
SELECT 
  FLOOR(humidity/10)*10 AS humidity_range,
  COUNT(*) AS count
FROM hive_data
GROUP BY humidity_range
ORDER BY humidity_range;
```

### 5.2 前端验证

1. 启动前端应用
2. 进入总览页面，查看实时数据和历史趋势
3. 进入细分页面，查看不同时间范围的数据
4. 验证图表是否正常显示，数据是否合理

## 6. 数据样本

脚本执行过程中会生成 `data_sample.json` 文件，包含一天的示例数据，用于验证数据格式和质量。

## 7. 注意事项

1. **数据量**：从2月1日到当前日期的所有数据都会被生成，数据量可能较大，请确保数据库有足够的存储空间。
2. **执行时间**：数据生成和插入可能需要一定时间，具体取决于数据量和系统性能。
3. **网络连接**：确保数据库连接稳定，避免在执行过程中网络中断。
4. **权限**：确保数据库用户有足够的权限执行插入操作。
5. **重复执行**：如果重复执行脚本，会插入重复数据。如需重新生成数据，请先清空表数据。

## 8. 故障排除

### 8.1 常见错误

#### 数据库连接错误
- 检查数据库服务是否启动
- 检查数据库连接配置是否正确
- 检查数据库用户权限是否足够

#### 表不存在错误
- 确保已创建必要的表结构
- 检查表名是否正确

#### 插入失败错误
- 检查数据格式是否正确
- 检查数据库存储空间是否足够
- 检查数据库连接是否稳定

### 8.2 日志信息
脚本执行过程中会输出详细的日志信息，可根据日志信息定位问题。

## 9. 性能优化

1. **批量插入**：脚本使用批量插入方式，每批次插入100条数据，提高插入效率。
2. **索引**：建议为 `hive_data` 和 `iot_telemetry` 表创建适当的索引，提高查询性能。
3. **连接池**：脚本使用连接池管理数据库连接，提高连接效率。

## 10. 总结

本脚本实现了以下功能：
- 生成从2月1日到当前日期的模拟数据
- 每天生成24条记录（每小时一条）
- 数据符合实际业务场景，避免夸张值
- 数据分布呈现自然随机性，无明显规律
- 所有记录使用固定坐标(25.23448900, 103.00859700)
- 支持批量插入，提高效率
- 生成数据样本文件，便于验证数据格式和质量
- 提供详细的执行日志和错误处理机制

脚本执行完成后，数据库中将包含完整的模拟数据，可用于前端可视化界面的测试和展示。