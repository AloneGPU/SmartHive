-- 创建hive_data表
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

-- 创建iot_telemetry表
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
