-- ESP8266 联调专用：测试数据库（与生产库隔离）
-- 执行方式：mysql -u root -p < sql/esp8266_test_db_setup.sql
-- 更新时间：2026-04-02

CREATE DATABASE IF NOT EXISTS smarthive_esp_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 建议单独用户（按需修改密码）
-- CREATE USER IF NOT EXISTS 'smarthive_esp'@'localhost' IDENTIFIED BY '请改为强密码';
-- GRANT ALL PRIVILEGES ON smarthive_esp_test.* TO 'smarthive_esp'@'localhost';
-- FLUSH PRIVILEGES;

-- 说明：表结构由后端首次启动时 `initializeDatabase()` 自动创建（与生产库一致）。
-- 你只需把后端 .env 中 DB_NAME 改为 smarthive_esp_test 并重启即可。

USE smarthive_esp_test;

-- 可选：若希望手工建表而不依赖后端初始化，可取消下面注释（与 databaseService 中定义一致）

/*
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
*/
