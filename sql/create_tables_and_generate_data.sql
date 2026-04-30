-- MySQL数据库配置与模拟数据生成脚本
-- 数据库连接信息：
-- 数据库主机(DB_HOST)：'Localhost'
-- 数据库用户名(DB_USER)：'root'
-- 数据库密码(DB_PASSWORD)：'2006520Zlt'
-- 数据库名称(DB_NAME)：'ceshi'

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS ceshi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用指定数据库
USE ceshi;

-- 1. 创建蜂箱数据表
CREATE TABLE IF NOT EXISTS hive_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  temperature DECIMAL(5,2),
  humidity DECIMAL(5,2),
  insideTemperature DECIMAL(5,2),
  insideHumidity DECIMAL(5,2),
  outsideTemperature DECIMAL(5,2),
  outsideHumidity DECIMAL(5,2),
  weight DECIMAL(6,2),
  beesIn INT,
  beesOut INT,
  hornetsDetected INT DEFAULT 0,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timestamp (timestamp),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 创建视觉识别数据表
CREATE TABLE IF NOT EXISTS vision_recognition (
  id INT AUTO_INCREMENT PRIMARY KEY,
  image_url VARCHAR(255) NOT NULL,
  recognition_result TEXT,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 创建物联网遥测数据表
CREATE TABLE IF NOT EXISTS iot_telemetry (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  sensor_type VARCHAR(64) NOT NULL,
  value DOUBLE NOT NULL,
  unit VARCHAR(32),
  qos TINYINT DEFAULT 0,
  meta_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_iot_ts (timestamp),
  INDEX idx_iot_device_ts (device_id, timestamp),
  INDEX idx_iot_device_sensor_ts (device_id, sensor_type, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 创建物联网设备状态表
CREATE TABLE IF NOT EXISTS iot_device_status (
  device_id VARCHAR(64) PRIMARY KEY,
  online TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at BIGINT NOT NULL,
  last_rssi INT NULL,
  last_ip VARCHAR(64) NULL,
  packets_received BIGINT NOT NULL DEFAULT 0,
  packets_dropped BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 创建系统配置表
CREATE TABLE IF NOT EXISTS system_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(50) NOT NULL UNIQUE,
  config_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 6. 初始化默认配置
INSERT IGNORE INTO system_config (config_key, config_value) VALUES 
('gaode_api_key', ''),
('qwen_api_key', ''),
('video_stream_url', ''),
('video_stream_mode', 'video');

-- 7. 清空现有数据
TRUNCATE TABLE hive_data;
TRUNCATE TABLE iot_telemetry;
TRUNCATE TABLE vision_recognition;
TRUNCATE TABLE iot_device_status;

-- 8. 生成蜂箱数据
INSERT INTO hive_data (timestamp, temperature, humidity, insideTemperature, insideHumidity, outsideTemperature, outsideHumidity, weight, beesIn, beesOut, hornetsDetected, latitude, longitude)
SELECT 
  UNIX_TIMESTAMP(DATE_ADD('2026-02-01', INTERVAL (days.day + hours.hour/24) DAY)) * 1000 AS timestamp,
  15 + RAND() * 20 AS temperature,
  40 + RAND() * 50 AS humidity,
  17 + RAND() * 23 AS insideTemperature,
  45 + RAND() * 55 AS insideHumidity,
  15 + RAND() * 20 AS outsideTemperature,
  40 + RAND() * 50 AS outsideHumidity,
  10 + RAND() * 40 + days.day * 0.5 AS weight,
  CASE 
    WHEN hours.hour BETWEEN 6 AND 18 THEN FLOOR(50 + RAND() * 150)
    ELSE FLOOR(0 + RAND() * 20)
  END AS beesIn,
  CASE 
    WHEN hours.hour BETWEEN 6 AND 18 THEN FLOOR(40 + RAND() * 140)
    ELSE FLOOR(0 + RAND() * 15)
  END AS beesOut,
  CASE WHEN RAND() < 0.1 THEN FLOOR(1 + RAND() * 3) ELSE 0 END AS hornetsDetected,
  25.234489 AS latitude,
  103.008597 AS longitude
FROM 
  (SELECT 0 AS day UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29) AS days,
  (SELECT 0 AS hour UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23) AS hours
WHERE 
  DATE_ADD('2026-02-01', INTERVAL days.day DAY) <= CURRENT_DATE();

-- 9. 生成物联网遥测数据
INSERT INTO iot_telemetry (timestamp, device_id, sensor_type, value, unit, qos, meta_json)
SELECT 
  UNIX_TIMESTAMP(DATE_ADD('2026-02-01', INTERVAL (days.day + hours.hour/24) DAY)) * 1000 AS timestamp,
  sensors.device_id,
  sensors.sensor_type,
  CASE 
    WHEN sensors.sensor_type = 'temperature' THEN 15 + RAND() * 20
    WHEN sensors.sensor_type = 'humidity' THEN 40 + RAND() * 50
    WHEN sensors.sensor_type = 'weight' THEN 10 + RAND() * 40 + days.day * 0.5
    WHEN sensors.sensor_type = 'bees_in' THEN CASE 
      WHEN hours.hour BETWEEN 6 AND 18 THEN FLOOR(50 + RAND() * 150)
      ELSE FLOOR(0 + RAND() * 20)
    END
    WHEN sensors.sensor_type = 'bees_out' THEN CASE 
      WHEN hours.hour BETWEEN 6 AND 18 THEN FLOOR(40 + RAND() * 140)
      ELSE FLOOR(0 + RAND() * 15)
    END
    WHEN sensors.sensor_type = 'hornets' THEN CASE WHEN RAND() < 0.1 THEN FLOOR(1 + RAND() * 3) ELSE 0 END
    ELSE 0
  END AS value,
  sensors.unit,
  1 AS qos,
  sensors.meta_json
FROM 
  (SELECT 0 AS day UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29) AS days,
  (SELECT 0 AS hour UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23) AS hours,
  (SELECT 'sensor-001' AS device_id, 'temperature' AS sensor_type, '°C' AS unit, '{"battery": 85, "signal": -65}' AS meta_json
   UNION ALL SELECT 'sensor-002' AS device_id, 'humidity' AS sensor_type, '%' AS unit, '{"battery": 80, "signal": -70}' AS meta_json
   UNION ALL SELECT 'sensor-003' AS device_id, 'weight' AS sensor_type, 'kg' AS unit, '{"battery": 90, "signal": -60}' AS meta_json
   UNION ALL SELECT 'sensor-004' AS device_id, 'bees_in' AS sensor_type, 'count' AS unit, '{"battery": 75, "signal": -75}' AS meta_json
   UNION ALL SELECT 'sensor-004' AS device_id, 'bees_out' AS sensor_type, 'count' AS unit, '{"battery": 75, "signal": -75}' AS meta_json
   UNION ALL SELECT 'sensor-005' AS device_id, 'hornets' AS sensor_type, 'count' AS unit, '{"battery": 80, "signal": -68}' AS meta_json) AS sensors
WHERE 
  DATE_ADD('2026-02-01', INTERVAL days.day DAY) <= CURRENT_DATE();

-- 10. 生成设备状态数据
INSERT IGNORE INTO iot_device_status (device_id, online, last_seen_at, last_rssi, last_ip, packets_received, packets_dropped) VALUES 
('sensor-001', 1, UNIX_TIMESTAMP() * 1000, -65, '192.168.1.101', 1000, 5),
('sensor-002', 1, UNIX_TIMESTAMP() * 1000, -70, '192.168.1.102', 1000, 3),
('sensor-003', 1, UNIX_TIMESTAMP() * 1000, -60, '192.168.1.103', 1000, 2),
('sensor-004', 1, UNIX_TIMESTAMP() * 1000, -75, '192.168.1.104', 1000, 4),
('sensor-005', 1, UNIX_TIMESTAMP() * 1000, -68, '192.168.1.105', 1000, 1);

-- 11. 生成视觉识别数据
INSERT INTO vision_recognition (image_url, recognition_result, timestamp)
SELECT 
  CONCAT('vision_', DATE_FORMAT(DATE_ADD('2026-02-01', INTERVAL days.day DAY), '%Y%m%d'), '_0900') AS image_url,
  '{"bees": 120, "queen": true, "honey": 3, "pests": 0}' AS recognition_result,
  UNIX_TIMESTAMP(DATE_ADD(DATE_ADD('2026-02-01', INTERVAL days.day DAY), INTERVAL 9 HOUR)) * 1000 AS timestamp
FROM 
  (SELECT 0 AS day UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29) AS days
WHERE 
  DATE_ADD('2026-02-01', INTERVAL days.day DAY) <= CURRENT_DATE()
UNION ALL
SELECT 
  CONCAT('vision_', DATE_FORMAT(DATE_ADD('2026-02-01', INTERVAL days.day DAY), '%Y%m%d'), '_1500') AS image_url,
  '{"bees": 150, "queen": true, "honey": 4, "pests": 0}' AS recognition_result,
  UNIX_TIMESTAMP(DATE_ADD(DATE_ADD('2026-02-01', INTERVAL days.day DAY), INTERVAL 15 HOUR)) * 1000 AS timestamp
FROM 
  (SELECT 0 AS day UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29) AS days
WHERE 
  DATE_ADD('2026-02-01', INTERVAL days.day DAY) <= CURRENT_DATE();

-- 12. 数据统计
SELECT 
  'hive_data' AS table_name, 
  COUNT(*) AS total_records,
  MIN(DATE(FROM_UNIXTIME(timestamp/1000))) AS start_date,
  MAX(DATE(FROM_UNIXTIME(timestamp/1000))) AS end_date,
  COUNT(*) / (DATEDIFF(MAX(DATE(FROM_UNIXTIME(timestamp/1000))), MIN(DATE(FROM_UNIXTIME(timestamp/1000)))) + 1) AS avg_records_per_day
FROM hive_data
UNION ALL
SELECT 
  'iot_telemetry' AS table_name, 
  COUNT(*) AS total_records,
  MIN(DATE(FROM_UNIXTIME(timestamp/1000))) AS start_date,
  MAX(DATE(FROM_UNIXTIME(timestamp/1000))) AS end_date,
  COUNT(*) / (DATEDIFF(MAX(DATE(FROM_UNIXTIME(timestamp/1000))), MIN(DATE(FROM_UNIXTIME(timestamp/1000)))) + 1) AS avg_records_per_day
FROM iot_telemetry
UNION ALL
SELECT 
  'vision_recognition' AS table_name, 
  COUNT(*) AS total_records,
  MIN(DATE(FROM_UNIXTIME(timestamp/1000))) AS start_date,
  MAX(DATE(FROM_UNIXTIME(timestamp/1000))) AS end_date,
  COUNT(*) / (DATEDIFF(MAX(DATE(FROM_UNIXTIME(timestamp/1000))), MIN(DATE(FROM_UNIXTIME(timestamp/1000)))) + 1) AS avg_records_per_day
FROM vision_recognition
UNION ALL
SELECT 
  'iot_device_status' AS table_name, 
  COUNT(*) AS total_records,
  NULL AS start_date,
  NULL AS end_date,
  NULL AS avg_records_per_day
FROM iot_device_status
UNION ALL
SELECT 
  'system_config' AS table_name, 
  COUNT(*) AS total_records,
  NULL AS start_date,
  NULL AS end_date,
  NULL AS avg_records_per_day
FROM system_config;