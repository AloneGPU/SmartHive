SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET time_zone = '+08:00';

-- 当前默认写入库：ceshi
CREATE DATABASE IF NOT EXISTS ceshi
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE ceshi;

DROP TABLE IF EXISTS hive_data;
DROP TABLE IF EXISTS vision_recognition;
DROP TABLE IF EXISTS system_config;
DROP TABLE IF EXISTS iot_telemetry;
DROP TABLE IF EXISTS iot_device_status;

CREATE TABLE hive_data (
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

CREATE TABLE vision_recognition (
  id INT AUTO_INCREMENT PRIMARY KEY,
  image_url VARCHAR(255) NOT NULL,
  recognition_result TEXT,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE system_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(50) NOT NULL UNIQUE,
  config_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE iot_telemetry (
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

CREATE TABLE iot_device_status (
  device_id VARCHAR(64) PRIMARY KEY,
  online TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at BIGINT NOT NULL,
  last_rssi INT NULL,
  last_ip VARCHAR(64) NULL,
  packets_received BIGINT NOT NULL DEFAULT 0,
  packets_dropped BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO system_config (config_key, config_value) VALUES
('gaode_api_key', ''),
('qwen_api_key', ''),
('video_stream_url', '/api/vision/stream.mjpg'),
('video_stream_mode', 'mjpeg'),
('vision_device_id', 'pi5-vision-client');

-- 固定起始日期：2026-02-01；结束日期：执行当天
SET @start_date := DATE('2026-02-01');
SET @end_date := CURDATE();
SET @effective_end := IF(@end_date < @start_date, @start_date, @end_date);
SET @day_count := DATEDIFF(@effective_end, @start_date) + 1;

-- 生成小时 0-23
DROP TEMPORARY TABLE IF EXISTS tmp_hours;
CREATE TEMPORARY TABLE tmp_hours (hour_idx INT PRIMARY KEY);
INSERT INTO tmp_hours (hour_idx) VALUES
(0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),
(12),(13),(14),(15),(16),(17),(18),(19),(20),(21),(22),(23);

-- 生成天序列 0..@day_count-1（最多支持约27年）
DROP TEMPORARY TABLE IF EXISTS tmp_days;
CREATE TEMPORARY TABLE tmp_days (day_idx INT PRIMARY KEY);
INSERT INTO tmp_days (day_idx)
SELECT t.day_idx
FROM (
  SELECT @day_idx := @day_idx + 1 AS day_idx
  FROM information_schema.COLUMNS c1
  CROSS JOIN information_schema.COLUMNS c2
  CROSS JOIN (SELECT @day_idx := -1) init
) t
WHERE t.day_idx < @day_count
ORDER BY t.day_idx;

-- 生成 hive_data：每天 24 条（整点）
INSERT INTO hive_data (
  timestamp,
  temperature,
  humidity,
  insideTemperature,
  insideHumidity,
  outsideTemperature,
  outsideHumidity,
  weight,
  beesIn,
  beesOut,
  hornetsDetected,
  latitude,
  longitude
)
SELECT
  UNIX_TIMESTAMP(TIMESTAMP(DATE_ADD(@start_date, INTERVAL x.day_idx DAY), MAKETIME(x.hour_idx, 0, 0))) * 1000 AS timestamp,
  ROUND(x.inside_temp, 2) AS temperature,
  ROUND(x.inside_humidity, 2) AS humidity,
  ROUND(x.inside_temp, 2) AS insideTemperature,
  ROUND(x.inside_humidity, 2) AS insideHumidity,
  ROUND(x.outside_temp, 2) AS outsideTemperature,
  ROUND(x.outside_humidity, 2) AS outsideHumidity,
  ROUND(x.weight_kg, 2) AS weight,
  x.bees_in AS beesIn,
  x.bees_out AS beesOut,
  x.hornets AS hornetsDetected,
  24.84230000 AS latitude,
  103.30500000 AS longitude
FROM (
  SELECT
    d.day_idx,
    h.hour_idx,
    -- 室外温度：日周期 + 缓慢季节变化
    (16 + 9 * SIN(2 * PI() * h.hour_idx / 24) + d.day_idx * 0.03 + (MOD(d.day_idx, 6) - 2) * 0.08) AS outside_temp,
    -- 室内温度：比室外高，白天偏高
    (16 + 9 * SIN(2 * PI() * h.hour_idx / 24) + d.day_idx * 0.03 + (MOD(d.day_idx, 6) - 2) * 0.08
      + 2.2 + CASE WHEN h.hour_idx BETWEEN 6 AND 18 THEN 0.8 ELSE 0.2 END) AS inside_temp,
    -- 室外湿度：与温度反相
    GREATEST(35, LEAST(92,
      68 - 16 * SIN(2 * PI() * h.hour_idx / 24) + MOD(d.day_idx, 4)
    )) AS outside_humidity,
    -- 室内湿度：略高于室外
    GREATEST(40, LEAST(96,
      68 - 16 * SIN(2 * PI() * h.hour_idx / 24) + MOD(d.day_idx, 4)
      + 5 + CASE WHEN h.hour_idx BETWEEN 0 AND 5 THEN 4 ELSE 1 END
    )) AS inside_humidity,
    -- 重量：总体缓慢增长 + 日内小幅波动
    (22 + d.day_idx * 0.06 + 0.8 * SIN(2 * PI() * h.hour_idx / 24) + (MOD(d.day_idx, 7) - 3) * 0.03) AS weight_kg,
    -- 进蜂：白天高，夜间低
    CASE
      WHEN h.hour_idx BETWEEN 6 AND 18
        THEN FLOOR(80 + 90 * ABS(SIN(PI() * (h.hour_idx - 6) / 12)) + MOD(d.day_idx, 15))
      ELSE FLOOR(2 + MOD(d.day_idx + h.hour_idx, 5))
    END AS bees_in,
    -- 出蜂：白天高，夜间低
    CASE
      WHEN h.hour_idx BETWEEN 6 AND 18
        THEN FLOOR(70 + 85 * ABS(SIN(PI() * (h.hour_idx - 5) / 12)) + MOD(d.day_idx, 13))
      ELSE FLOOR(1 + MOD(d.day_idx + h.hour_idx + 2, 4))
    END AS bees_out,
    -- 马蜂：下午时段偶发
    CASE
      WHEN h.hour_idx BETWEEN 13 AND 17 AND MOD(d.day_idx + h.hour_idx, 11) = 0 THEN 1 + MOD(d.day_idx, 3)
      WHEN h.hour_idx = 15 AND MOD(d.day_idx, 29) = 0 THEN 2
      ELSE 0
    END AS hornets
  FROM tmp_days d
  CROSS JOIN tmp_hours h
) x
ORDER BY x.day_idx, x.hour_idx;

-- 视觉识别示例数据（每天 2 条）
INSERT INTO vision_recognition (image_url, recognition_result, timestamp)
SELECT
  CONCAT('https://picsum.photos/seed/hive_', d.day_idx, '_', s.slot, '/640/360') AS image_url,
  CONCAT(
    '{"type":"',
    CASE WHEN MOD(d.day_idx + s.slot, 5) = 0 THEN '马蜂' ELSE '蜜蜂' END,
    '","confidence":',
    ROUND(0.72 + (MOD(d.day_idx * 7 + s.slot * 13, 20) / 100), 2),
    ',"description":"',
    CASE WHEN MOD(d.day_idx + s.slot, 5) = 0 THEN '检测到疑似马蜂靠近，建议关注防御状态。' ELSE '蜂群活动正常。' END,
    '"}'
  ) AS recognition_result,
  UNIX_TIMESTAMP(TIMESTAMP(DATE_ADD(@start_date, INTERVAL d.day_idx DAY), MAKETIME(CASE s.slot WHEN 0 THEN 10 ELSE 16 END, 0, 0))) * 1000 AS timestamp
FROM tmp_days d
CROSS JOIN (
  SELECT 0 AS slot UNION ALL SELECT 1
) s
ORDER BY d.day_idx, s.slot;

-- 设备状态示例
INSERT INTO iot_device_status (
  device_id,
  online,
  last_seen_at,
  last_rssi,
  last_ip,
  packets_received,
  packets_dropped
)
VALUES
('pi5-vision-client', 1, UNIX_TIMESTAMP(NOW()) * 1000, -62, '192.168.1.50', @day_count * 24 * 6, FLOOR(@day_count / 3));

-- 结果校验：应为 @day_count * 24 条
SELECT
  @start_date AS start_date,
  @effective_end AS end_date,
  @day_count AS total_days,
  (@day_count * 24) AS expected_rows,
  COUNT(*) AS actual_rows
FROM hive_data;

DROP TEMPORARY TABLE IF EXISTS tmp_days;
DROP TEMPORARY TABLE IF EXISTS tmp_hours;

SET FOREIGN_KEY_CHECKS = 1;
