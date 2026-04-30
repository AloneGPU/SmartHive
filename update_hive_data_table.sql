-- 更新 hive_data 表结构，添加内部和外部温湿度字段
-- 执行此脚本前请备份数据库

-- 1. 添加内部温湿度字段
ALTER TABLE hive_data 
ADD COLUMN IF NOT EXISTS insideTemperature DECIMAL(5,2) COMMENT '蜂箱内部温度（°C）',
ADD COLUMN IF NOT EXISTS insideHumidity DECIMAL(5,2) COMMENT '蜂箱内部湿度（%）';

-- 2. 添加外部温湿度字段
ALTER TABLE hive_data 
ADD COLUMN IF NOT EXISTS outsideTemperature DECIMAL(5,2) COMMENT '蜂箱外部温度（°C）',
ADD COLUMN IF NOT EXISTS outsideHumidity DECIMAL(5,2) COMMENT '蜂箱外部湿度（%）';

-- 3. 将现有的 temperature 和 humidity 数据迁移到 insideTemperature 和 insideHumidity
UPDATE hive_data 
SET insideTemperature = temperature, 
    insideHumidity = humidity 
WHERE insideTemperature IS NULL OR insideHumidity IS NULL;

-- 4. 为新字段添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_hive_data_inside_temp ON hive_data(insideTemperature);
CREATE INDEX IF NOT EXISTS idx_hive_data_inside_humid ON hive_data(insideHumidity);
CREATE INDEX IF NOT EXISTS idx_hive_data_outside_temp ON hive_data(outsideTemperature);
CREATE INDEX IF NOT EXISTS idx_hive_data_outside_humid ON hive_data(outsideHumidity);

-- 5. 查看表结构确认
DESCRIBE hive_data;
