import mysql, { RowDataPacket } from 'mysql2/promise';
import { BeehiveData, IotDeviceStatus, IotTelemetryPoint, VisionRecognitionResult } from '../types';

interface VisionRow extends RowDataPacket {
  id: number;
  image_url: string;
  recognition_result: string | null;
  timestamp: number;
}

interface IotTelemetryRow extends RowDataPacket {
  id: number;
  timestamp: number;
  device_id: string;
  sensor_type: string;
  value: number;
  unit: string | null;
  qos: number | null;
  meta_json: string | null;
}

// 数据库连接池
let pool: mysql.Pool | null = null;
let poolHealthCheckTimer: NodeJS.Timeout | null = null;
let lastPoolHealthCheck = 0;

const normalizeBeehiveRow = (row: any): BeehiveData => {
  const latitude = row?.latitude === null || row?.latitude === undefined ? undefined : Number(row.latitude);
  const longitude = row?.longitude === null || row?.longitude === undefined ? undefined : Number(row.longitude);
  const insideTemperature = row?.insideTemperature === null || row?.insideTemperature === undefined ? undefined : Number(row.insideTemperature);
  const insideHumidity = row?.insideHumidity === null || row?.insideHumidity === undefined ? undefined : Number(row.insideHumidity);
  const outsideTemperature = row?.outsideTemperature === null || row?.outsideTemperature === undefined ? undefined : Number(row.outsideTemperature);
  const outsideHumidity = row?.outsideHumidity === null || row?.outsideHumidity === undefined ? undefined : Number(row.outsideHumidity);
  const result: BeehiveData = {
    timestamp: Number(row?.timestamp ?? 0),
    temperature: Number(row?.temperature ?? 0),
    humidity: Number(row?.humidity ?? 0),
    ...(Number.isFinite(insideTemperature) ? { insideTemperature } : {}),
    ...(Number.isFinite(insideHumidity) ? { insideHumidity } : {}),
    ...(Number.isFinite(outsideTemperature) ? { outsideTemperature } : {}),
    ...(Number.isFinite(outsideHumidity) ? { outsideHumidity } : {}),
    weight: Number(row?.weight ?? 0),
    beesIn: Number(row?.beesIn ?? 0),
    beesOut: Number(row?.beesOut ?? 0),
    hornetsDetected: Number(row?.hornetsDetected ?? 0),
  };
  if (Number.isFinite(latitude)) {
    result.latitude = latitude;
  }
  if (Number.isFinite(longitude)) {
    result.longitude = longitude;
  }
  return result;
};

// 获取数据库连接池（带重试机制）
export const getPool = async (retries = 5, delay = 2000): Promise<mysql.Pool> => {
  if (pool) {
    return pool;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'smarthive',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 10000,
        timezone: '+00:00'
      });

      // 测试连接
      const testConn = await pool.getConnection();
      await testConn.ping();
      testConn.release();
      
      console.log(`数据库连接池创建成功 (尝试 ${attempt}/${retries})`);
      
      // 启动健康检查
      startPoolHealthCheck();
      
      return pool;
    } catch (error) {
      console.error(`数据库连接池创建失败 (尝试 ${attempt}/${retries}):`, error);
      
      if (attempt < retries) {
        console.log(`等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        // 指数退避
        delay = Math.min(delay * 1.5, 10000);
      } else {
        throw new Error(`数据库连接失败，已重试 ${retries} 次: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  throw new Error('数据库连接池创建失败');
};

// 连接池健康检查
const startPoolHealthCheck = () => {
  if (poolHealthCheckTimer) {
    clearInterval(poolHealthCheckTimer);
  }
  
  poolHealthCheckTimer = setInterval(async () => {
    if (!pool) return;
    
    const now = Date.now();
    if (now - lastPoolHealthCheck < 30000) return; // 最少30秒检查一次
    
    lastPoolHealthCheck = now;
    
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
    } catch (error) {
      console.error('数据库连接池健康检查失败:', error);
      // 尝试重建连接池
      pool = null;
      try {
        await getPool(1, 1000);
        console.log('数据库连接池已重建');
      } catch (rebuildError) {
        console.error('数据库连接池重建失败:', rebuildError);
      }
    }
  }, 60000); // 每分钟检查一次
};

// 测试数据库连接
export const testDatabaseConnection = async (): Promise<boolean> => {
  try {
    const pool = await getPool();
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('数据库连接测试成功');
    return true;
  } catch (error) {
    console.error('数据库连接测试失败:', error);
    return false;
  }
};

// 初始化数据库
export const initializeDatabase = async (): Promise<void> => {
  try {
    const pool = await getPool();
    
    // 创建蜂箱数据表
    await pool.execute(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建视觉识别数据表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS vision_recognition (
        id INT AUTO_INCREMENT PRIMARY KEY,
        image_url VARCHAR(255) NOT NULL,
        recognition_result TEXT,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_timestamp (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS iot_device_status (
        device_id VARCHAR(64) PRIMARY KEY,
        online TINYINT(1) NOT NULL DEFAULT 1,
        last_seen_at BIGINT NOT NULL,
        last_rssi INT NULL,
        last_ip VARCHAR(64) NULL,
        packets_received BIGINT NOT NULL DEFAULT 0,
        packets_dropped BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建系统配置表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS system_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_key VARCHAR(50) NOT NULL UNIQUE,
        config_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // 初始化默认配置
    await pool.execute(`
      INSERT IGNORE INTO system_config (config_key, config_value) VALUES 
      ('gaode_api_key', ''),
      ('qwen_api_key', ''),
      ('api_token', ''),
      ('video_stream_url', '/api/vision/stream.mjpg'),
      ('video_stream_mode', 'mjpeg'),
      ('video_stream_source', 'direct'),
      ('vision_device_id', 'pi5-vision-client')
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS stale_cleanup_operations (
        id VARCHAR(64) PRIMARY KEY,
        status ENUM('pending', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
        report_hash VARCHAR(128) NOT NULL,
        report_json LONGTEXT NOT NULL,
        backup_path VARCHAR(1024) NULL,
        confirmation_token VARCHAR(32) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_by VARCHAR(128) NOT NULL DEFAULT 'system',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        error_message TEXT NULL,
        INDEX idx_stale_cleanup_status_created (status, created_at),
        INDEX idx_stale_cleanup_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('数据库初始化成功');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
};

// 获取最新的蜂箱数据
export const fetchLiveHiveDataFromDB = async (): Promise<BeehiveData | null> => {
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(
      'SELECT * FROM hive_data ORDER BY timestamp DESC LIMIT 1'
    );
    
    if (Array.isArray(rows) && rows.length > 0) {
      return normalizeBeehiveRow(rows[0]);
    }
    
    return null;
  } catch (error) {
    console.error('获取最新蜂箱数据失败:', error);
    return null;
  }
};

export const fetchLatestLocationFromIot = async (deviceId?: string): Promise<{
  latitude?: number;
  longitude?: number;
  deviceId?: string;
  timestamp?: number;
} | null> => {
  try {
    const pool = await getPool();
    const latitudeTypes = ['latitude', 'gps_lat', 'gpslatitude', 'gps_latitude'];
    const longitudeTypes = ['longitude', 'gps_lon', 'gps_lng', 'gpslongitude', 'gps_longitude'];
    const allTypes = [...latitudeTypes, ...longitudeTypes];
    const placeholders = allTypes.map(() => '?').join(', ');
    const values: Array<string | number> = [...allTypes];
    let sql = `SELECT device_id, sensor_type, value, timestamp
      FROM iot_telemetry
      WHERE sensor_type IN (${placeholders})`;

    if (deviceId?.trim()) {
      sql += ' AND device_id = ?';
      values.push(deviceId.trim());
    }

    sql += ' ORDER BY timestamp DESC LIMIT 50';

    const [rows] = await pool.execute<RowDataPacket[]>(sql, values);
    if (!Array.isArray(rows) || rows.length === 0) return null;

    let latitude: number | undefined;
    let longitude: number | undefined;
    let matchedDeviceId: string | undefined;
    let latestTs = 0;

    for (const row of rows) {
      const sensorType = String((row as any).sensor_type || '').trim().toLowerCase();
      const value = Number((row as any).value);
      const ts = Number((row as any).timestamp || 0);
      const rowDeviceId = String((row as any).device_id || '').trim() || undefined;
      if (!Number.isFinite(value)) continue;

      if (latitude === undefined && latitudeTypes.includes(sensorType) && value >= -90 && value <= 90) {
        latitude = value;
        matchedDeviceId = matchedDeviceId || rowDeviceId;
        latestTs = Math.max(latestTs, ts);
      } else if (longitude === undefined && longitudeTypes.includes(sensorType) && value >= -180 && value <= 180) {
        longitude = value;
        matchedDeviceId = matchedDeviceId || rowDeviceId;
        latestTs = Math.max(latestTs, ts);
      }

      if (latitude !== undefined && longitude !== undefined) {
        return {
          latitude,
          longitude,
          deviceId: matchedDeviceId,
          timestamp: latestTs || undefined
        };
      }
    }

    if (latitude === undefined && longitude === undefined) return null;
    return {
      latitude,
      longitude,
      deviceId: matchedDeviceId,
      timestamp: latestTs || undefined
    };
  } catch (error) {
    console.error('查询最新 IoT 定位失败:', error);
    return null;
  }
};

export const fetchLatestLocationFromHiveData = async (): Promise<{
  latitude?: number;
  longitude?: number;
  timestamp?: number;
} | null> => {
  try {
    const pool = await getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT timestamp, latitude, longitude
       FROM hive_data
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
       ORDER BY timestamp DESC
       LIMIT 1`
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0] as any;
    const latitude = Number(row?.latitude);
    const longitude = Number(row?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      latitude,
      longitude,
      timestamp: Number(row?.timestamp || 0) || undefined
    };
  } catch (error) {
    console.error('查询 hive_data 最近定位失败:', error);
    return null;
  }
};

// 获取历史数据
export const fetchHistoryDataFromDB = async (limit: number = 40): Promise<BeehiveData[]> => {
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(
      'SELECT * FROM hive_data ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );
    
    return Array.isArray(rows) ? rows.map((r) => normalizeBeehiveRow(r)) : [];
  } catch (error) {
    console.error('获取历史数据失败:', error);
    return [];
  }
};

export const fetchRangeHiveDataFromDB = async (
  startMs: number,
  endMs: number,
  limit: number = 5000,
  offset: number = 0
): Promise<BeehiveData[]> => {
  try {
    const pool = await getPool();
    const safeLimit = Math.min(Math.max(1, limit), 50000);
    const safeOffset = Math.max(0, offset);
    const [rows] = await pool.execute(
      'SELECT * FROM hive_data WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC LIMIT ? OFFSET ?',
      [startMs, endMs, safeLimit, safeOffset]
    );

    return Array.isArray(rows) ? rows.map((r) => normalizeBeehiveRow(r)) : [];
  } catch (error) {
    console.error('范围查询蜂箱数据失败:', error);
    return [];
  }
};

export type CalendarSummaryDayRow = {
  date: string;
  count: number;
  minTs: number;
  maxTs: number;
};

export const fetchCalendarSummaryFromDB = async (
  startMs: number,
  endMs: number,
  tzOffsetMinutes: number
): Promise<CalendarSummaryDayRow[]> => {
  try {
    const pool = await getPool();
    const offsetSeconds = Math.trunc(tzOffsetMinutes * 60);
    const [rows] = await pool.execute(
      `
        SELECT
          DATE_FORMAT(FROM_UNIXTIME((timestamp / 1000) + ?), '%Y-%m-%d') AS date,
          COUNT(*) AS count,
          MIN(timestamp) AS minTs,
          MAX(timestamp) AS maxTs
        FROM hive_data
        WHERE timestamp >= ? AND timestamp < ?
        GROUP BY date
        ORDER BY date ASC
      `,
      [offsetSeconds, startMs, endMs]
    );
    if (!Array.isArray(rows)) return [];
    return rows.map((row: any) => ({
      date: String(row.date),
      count: Number(row.count || 0),
      minTs: Number(row.minTs || 0),
      maxTs: Number(row.maxTs || 0)
    }));
  } catch (error) {
    console.error('按天聚合蜂箱数据失败:', error);
    return [];
  }
};

// 插入蜂箱数据
export const insertBeehiveData = async (data: BeehiveData): Promise<boolean> => {
  try {
    const pool = await getPool();
    await pool.query(
      'INSERT INTO hive_data (timestamp, temperature, humidity, insideTemperature, insideHumidity, outsideTemperature, outsideHumidity, weight, beesIn, beesOut, hornetsDetected, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
      data.timestamp,
      data.temperature,
      data.humidity,
      data.insideTemperature,
      data.insideHumidity,
      data.outsideTemperature,
      data.outsideHumidity,
      data.weight,
      data.beesIn,
      data.beesOut,
      data.hornetsDetected,
      data.latitude,
      data.longitude
      ]
    );
    
    console.log('蜂箱数据插入成功');
    return true;
  } catch (error) {
    console.error('插入蜂箱数据失败:', error);
    return false;
  }
};

// 获取视觉识别图片
export const fetchVisionRecognitionImagesFromDB = async (limit: number = 20): Promise<VisionRecognitionResult[]> => {
  try {
    const pool = await getPool();
    const [rows] = await pool.execute<VisionRow[]>(
      'SELECT * FROM vision_recognition ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );
    
    return Array.isArray(rows) ? rows.map((row) => {
      let result: VisionRecognitionResult['result'] = {
        type: '未知',
        confidence: 0,
        description: ''
      };
      if (row.recognition_result) {
        if (typeof row.recognition_result === 'string') {
          try {
            const parsed = JSON.parse(row.recognition_result) as Partial<VisionRecognitionResult['result']>;
            result = {
              type: String(parsed?.type || '未知'),
              confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed?.confidence) : 0,
              description: String(parsed?.description || '')
            };
          } catch {
            result = {
              type: '未知',
              confidence: 0,
              description: ''
            };
          }
        } else if (typeof row.recognition_result === 'object') {
          const parsed = row.recognition_result as Partial<VisionRecognitionResult['result']>;
          result = {
            type: String(parsed?.type || '未知'),
            confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed?.confidence) : 0,
            description: String(parsed?.description || '')
          };
        }
      }
      return {
        id: String(row.id),
        imageUrl: row.image_url,
        result,
        timestamp: row.timestamp
      };
    }) : [];
  } catch (error) {
    console.error('获取视觉识别数据失败:', error);
    return [];
  }
};

// 获取系统配置
export const getSystemConfig = async (): Promise<Record<string, string>> => {
  try {
    const pool = await getPool();
    const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
    
    const config: Record<string, string> = {};
    if (Array.isArray(rows)) {
      rows.forEach((row: any) => {
        config[row.config_key] = row.config_value;
      });
    }
    return config;
  } catch (error) {
    console.error('获取系统配置失败:', error);
    return {};
  }
};

// 更新系统配置
export const updateSystemConfig = async (key: string, value: string): Promise<boolean> => {
  try {
    const pool = await getPool();
    await pool.execute(
      'INSERT INTO system_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = ?',
      [key, value, value]
    );
    return true;
  } catch (error) {
    console.error(`更新系统配置失败 (${key}):`, error);
    return false;
  }
};

// 插入视觉识别数据
export const insertVisionRecognitionData = async (data: Omit<VisionRecognitionResult, 'id'>): Promise<boolean> => {
  try {
    const pool = await getPool();
    await pool.execute(
      'INSERT INTO vision_recognition (image_url, recognition_result, timestamp) VALUES (?, ?, ?)',
      [
        data.imageUrl,
        JSON.stringify(data.result),
        data.timestamp
      ]
    );
    
    console.log('视觉识别数据插入成功');
    return true;
  } catch (error) {
    console.error('插入视觉识别数据失败:', error);
    return false;
  }
};

export const insertIotTelemetryBatch = async (points: IotTelemetryPoint[]): Promise<number> => {
  if (!points.length) return 0;
  try {
    const pool = await getPool();
    const values = points.map((p) => [
      p.timestamp,
      p.deviceId,
      p.sensorType,
      p.value,
      p.unit || null,
      p.qos ?? 0,
      p.meta ? JSON.stringify(p.meta) : null
    ]);
    await pool.query(
      'INSERT INTO iot_telemetry (timestamp, device_id, sensor_type, value, unit, qos, meta_json) VALUES ?',
      [values]
    );
    return points.length;
  } catch (error) {
    console.error('批量写入 IoT 数据失败:', error);
    return 0;
  }
};

export const upsertIotDeviceStatus = async (status: IotDeviceStatus): Promise<boolean> => {
  try {
    const pool = await getPool();
    await pool.execute(
      `INSERT INTO iot_device_status (device_id, online, last_seen_at, last_rssi, last_ip, packets_received, packets_dropped)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         online = VALUES(online),
         last_seen_at = VALUES(last_seen_at),
         last_rssi = VALUES(last_rssi),
         last_ip = VALUES(last_ip),
         packets_received = VALUES(packets_received),
         packets_dropped = VALUES(packets_dropped)`,
      [
        status.deviceId,
        status.online ? 1 : 0,
        status.lastSeenAt,
        status.lastRssi ?? null,
        status.lastIp ?? null,
        status.packetsReceived,
        status.packetsDropped
      ]
    );
    return true;
  } catch (error) {
    console.error('更新设备状态失败:', error);
    return false;
  }
};

export const fetchIotLatestByDevice = async (deviceId: string): Promise<IotTelemetryPoint[]> => {
  try {
    const pool = await getPool();
    const [rows] = await pool.execute<IotTelemetryRow[]>(
      `SELECT t.*
       FROM iot_telemetry t
       INNER JOIN (
         SELECT sensor_type, MAX(timestamp) AS latest_ts
         FROM iot_telemetry
         WHERE device_id = ?
         GROUP BY sensor_type
       ) m
         ON t.sensor_type = m.sensor_type
        AND t.timestamp = m.latest_ts
       WHERE t.device_id = ?`,
      [deviceId, deviceId]
    );
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => {
      let meta: Record<string, any> | undefined;
      if (r.meta_json) {
        if (typeof r.meta_json === 'string') {
          try {
            meta = JSON.parse(r.meta_json);
          } catch {
            meta = undefined;
          }
        } else if (typeof r.meta_json === 'object') {
          meta = r.meta_json as Record<string, any>;
        }
      }
      return {
        id: r.id,
        timestamp: Number(r.timestamp),
        deviceId: r.device_id,
        sensorType: r.sensor_type,
        value: Number(r.value),
        unit: r.unit || undefined,
        qos: r.qos ?? undefined,
        meta
      };
    });
  } catch (error) {
    console.error('查询设备最新 IoT 数据失败:', error);
    return [];
  }
};

export const fetchIotHistory = async (params: {
  deviceId?: string;
  sensorType?: string;
  startMs?: number;
  endMs?: number;
  limit?: number;
}): Promise<IotTelemetryPoint[]> => {
  try {
    const pool = await getPool();
    const conditions: string[] = [];
    const values: any[] = [];
    if (params.deviceId) {
      conditions.push('device_id = ?');
      values.push(params.deviceId);
    }
    if (params.sensorType) {
      conditions.push('sensor_type = ?');
      values.push(params.sensorType);
    }
    if (Number.isFinite(params.startMs)) {
      conditions.push('timestamp >= ?');
      values.push(params.startMs);
    }
    if (Number.isFinite(params.endMs)) {
      conditions.push('timestamp <= ?');
      values.push(params.endMs);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(params.limit || 1000, 1), 50000);
    const [rows] = await pool.execute<IotTelemetryRow[]>(
      `SELECT * FROM iot_telemetry ${where} ORDER BY timestamp DESC LIMIT ?`,
      [...values, limit]
    );
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => {
        let meta: Record<string, any> | undefined;
        if (r.meta_json) {
          if (typeof r.meta_json === 'string') {
            try {
              meta = JSON.parse(r.meta_json);
            } catch {
              meta = undefined;
            }
          } else if (typeof r.meta_json === 'object') {
            meta = r.meta_json as Record<string, any>;
          }
        }
        return {
          id: r.id,
          timestamp: Number(r.timestamp),
          deviceId: r.device_id,
          sensorType: r.sensor_type,
          value: Number(r.value),
          unit: r.unit || undefined,
          qos: r.qos ?? undefined,
          meta
        };
      })
      .reverse();
  } catch (error) {
    console.error('查询 IoT 历史失败:', error);
    return [];
  }
};

export const fetchIotDeviceStatuses = async (): Promise<IotDeviceStatus[]> => {
  try {
    const pool = await getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM iot_device_status ORDER BY updated_at DESC'
    );
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => ({
      deviceId: String(r.device_id),
      online: Number(r.online) === 1,
      lastSeenAt: Number(r.last_seen_at || 0),
      lastRssi: r.last_rssi === null ? undefined : Number(r.last_rssi),
      lastIp: r.last_ip || undefined,
      packetsReceived: Number(r.packets_received || 0),
      packetsDropped: Number(r.packets_dropped || 0)
    }));
  } catch (error) {
    console.error('查询设备状态失败:', error);
    return [];
  }
};
