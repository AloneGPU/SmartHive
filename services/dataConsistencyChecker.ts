import { RowDataPacket } from 'mysql2';
import { getPool } from './databaseService';
import { logger } from './logger';

interface ConsistencyCheckResult {
  table: string;
  checkType: string;
  status: 'pass' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
  fixable?: boolean;
  fixCommand?: string;
}

interface DataConsistencyReport {
  timestamp: string;
  duration: number;
  checks: ConsistencyCheckResult[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    errors: number;
  };
}

export class DataConsistencyChecker {
  private checks: Array<() => Promise<ConsistencyCheckResult[]>> = [];

  constructor() {
    this.registerChecks();
  }

  private registerChecks() {
    this.checks.push(
      this.checkDuplicateTimestamps.bind(this),
      this.checkOrphanedRecords.bind(this),
      this.checkTimeGaps.bind(this),
      this.checkSensorValueRanges.bind(this),
      this.checkDeviceConsistency.bind(this),
      this.checkIndexHealth.bind(this)
    );
  }

  async runAllChecks(): Promise<DataConsistencyReport> {
    const startTime = Date.now();
    const results: ConsistencyCheckResult[] = [];

    logger.info('system', '开始数据一致性检查');

    for (const check of this.checks) {
      try {
        const checkResults = await check();
        results.push(...checkResults);
      } catch (error) {
        logger.error('system', '检查执行失败', error as Error);
        results.push({
          table: 'unknown',
          checkType: 'execution',
          status: 'error',
          message: `检查执行失败: ${error instanceof Error ? error.message : String(error)}`,
          fixable: false
        });
      }
    }

    const duration = Date.now() - startTime;
    const summary = {
      total: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      warnings: results.filter(r => r.status === 'warning').length,
      errors: results.filter(r => r.status === 'error').length
    };

    logger.time('system', '数据一致性检查完成', startTime, { summary });

    return {
      timestamp: new Date().toISOString(),
      duration,
      checks: results,
      summary
    };
  }

  private async checkDuplicateTimestamps(): Promise<ConsistencyCheckResult[]> {
    const pool = await getPool();
    const results: ConsistencyCheckResult[] = [];

    // 检查 hive_data 表的重复时间戳
    const [hiveDupes] = await pool.execute<RowDataPacket[]>(`
      SELECT timestamp, COUNT(*) as count
      FROM hive_data
      GROUP BY timestamp
      HAVING count > 1
      LIMIT 10
    `);

    if (hiveDupes.length > 0) {
      results.push({
        table: 'hive_data',
        checkType: 'duplicate_timestamps',
        status: 'warning',
        message: `发现 ${hiveDupes.length} 个重复时间戳`,
        details: { duplicates: hiveDupes },
        fixable: true,
        fixCommand: 'DELETE t1 FROM hive_data t1 INNER JOIN hive_data t2 WHERE t1.id > t2.id AND t1.timestamp = t2.timestamp'
      });
    } else {
      results.push({
        table: 'hive_data',
        checkType: 'duplicate_timestamps',
        status: 'pass',
        message: '无重复时间戳'
      });
    }

    // 检查 iot_telemetry 表的重复记录
    const [iotDupes] = await pool.execute<RowDataPacket[]>(`
      SELECT device_id, sensor_type, timestamp, COUNT(*) as count
      FROM iot_telemetry
      GROUP BY device_id, sensor_type, timestamp
      HAVING count > 1
      LIMIT 10
    `);

    if (iotDupes.length > 0) {
      results.push({
        table: 'iot_telemetry',
        checkType: 'duplicate_records',
        status: 'warning',
        message: `发现 ${iotDupes.length} 个重复的IoT记录`,
        details: { duplicates: iotDupes },
        fixable: true,
        fixCommand: 'DELETE t1 FROM iot_telemetry t1 INNER JOIN iot_telemetry t2 WHERE t1.id > t2.id AND t1.device_id = t2.device_id AND t1.sensor_type = t2.sensor_type AND t1.timestamp = t2.timestamp'
      });
    } else {
      results.push({
        table: 'iot_telemetry',
        checkType: 'duplicate_records',
        status: 'pass',
        message: '无重复IoT记录'
      });
    }

    return results;
  }

  private async checkOrphanedRecords(): Promise<ConsistencyCheckResult[]> {
    const pool = await getPool();
    const results: ConsistencyCheckResult[] = [];

    // 检查 iot_telemetry 中没有对应设备状态的记录
    const [orphanedTelemetry] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) as count
      FROM iot_telemetry t
      LEFT JOIN iot_device_status s ON t.device_id = s.device_id
      WHERE s.device_id IS NULL
    `);

    const orphanedCount = orphanedTelemetry[0]?.count || 0;
    if (orphanedCount > 0) {
      results.push({
        table: 'iot_telemetry',
        checkType: 'orphaned_records',
        status: 'warning',
        message: `发现 ${orphanedCount} 条孤立遥测记录（无对应设备状态）`,
        fixable: false
      });
    } else {
      results.push({
        table: 'iot_telemetry',
        checkType: 'orphaned_records',
        status: 'pass',
        message: '无孤立记录'
      });
    }

    return results;
  }

  private async checkTimeGaps(): Promise<ConsistencyCheckResult[]> {
    const pool = await getPool();
    const results: ConsistencyCheckResult[] = [];

    // 检查 hive_data 表的时间间隔
    const [gaps] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        t1.timestamp as gap_start,
        t2.timestamp as gap_end,
        (t2.timestamp - t1.timestamp) as gap_duration_ms
      FROM hive_data t1
      INNER JOIN hive_data t2 ON t2.timestamp > t1.timestamp
      WHERE t2.timestamp = (
        SELECT MIN(timestamp) 
        FROM hive_data 
        WHERE timestamp > t1.timestamp
      )
      AND (t2.timestamp - t1.timestamp) > 7200000
      ORDER BY gap_duration_ms DESC
      LIMIT 10
    `);

    if (gaps.length > 0) {
      results.push({
        table: 'hive_data',
        checkType: 'time_gaps',
        status: 'warning',
        message: `发现 ${gaps.length} 个超过2小时的数据间隔`,
        details: { gaps: gaps.map(g => ({
          start: new Date(g.gap_start).toISOString(),
          end: new Date(g.gap_end).toISOString(),
          duration: `${Math.round(g.gap_duration_ms / 3600000)}小时`
        }))}
      });
    } else {
      results.push({
        table: 'hive_data',
        checkType: 'time_gaps',
        status: 'pass',
        message: '数据时间连续性良好'
      });
    }

    return results;
  }

  private async checkSensorValueRanges(): Promise<ConsistencyCheckResult[]> {
    const pool = await getPool();
    const results: ConsistencyCheckResult[] = [];

    // 检查温度范围
    const [tempOutliers] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) as count
      FROM hive_data
      WHERE temperature < -20 OR temperature > 60
    `);

    const tempOutlierCount = tempOutliers[0]?.count || 0;
    if (tempOutlierCount > 0) {
      results.push({
        table: 'hive_data',
        checkType: 'temperature_range',
        status: 'warning',
        message: `发现 ${tempOutlierCount} 条温度异常记录（超出-20°C到60°C范围）`,
        fixable: false
      });
    } else {
      results.push({
        table: 'hive_data',
        checkType: 'temperature_range',
        status: 'pass',
        message: '温度数据范围正常'
      });
    }

    // 检查湿度范围
    const [humidOutliers] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) as count
      FROM hive_data
      WHERE humidity < 0 OR humidity > 100
    `);

    const humidOutlierCount = humidOutliers[0]?.count || 0;
    if (humidOutlierCount > 0) {
      results.push({
        table: 'hive_data',
        checkType: 'humidity_range',
        status: 'error',
        message: `发现 ${humidOutlierCount} 条湿度异常记录（超出0-100%范围）`,
        fixable: true,
        fixCommand: 'UPDATE hive_data SET humidity = LEAST(GREATEST(humidity, 0), 100) WHERE humidity < 0 OR humidity > 100'
      });
    } else {
      results.push({
        table: 'hive_data',
        checkType: 'humidity_range',
        status: 'pass',
        message: '湿度数据范围正常'
      });
    }

    // 检查重量范围
    const [weightOutliers] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) as count
      FROM hive_data
      WHERE weight < 0 OR weight > 500
    `);

    const weightOutlierCount = weightOutliers[0]?.count || 0;
    if (weightOutlierCount > 0) {
      results.push({
        table: 'hive_data',
        checkType: 'weight_range',
        status: 'warning',
        message: `发现 ${weightOutlierCount} 条重量异常记录（超出0-500kg范围）`,
        fixable: false
      });
    } else {
      results.push({
        table: 'hive_data',
        checkType: 'weight_range',
        status: 'pass',
        message: '重量数据范围正常'
      });
    }

    return results;
  }

  private async checkDeviceConsistency(): Promise<ConsistencyCheckResult[]> {
    const pool = await getPool();
    const results: ConsistencyCheckResult[] = [];

    // 检查设备状态与遥测数据的一致性
    const [inconsistentDevices] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        s.device_id,
        s.last_seen_at,
        (SELECT MAX(timestamp) FROM iot_telemetry WHERE device_id = s.device_id) as last_telemetry
      FROM iot_device_status s
      HAVING ABS(last_seen_at - last_telemetry) > 300000
    `);

    if (inconsistentDevices.length > 0) {
      results.push({
        table: 'iot_device_status',
        checkType: 'device_consistency',
        status: 'warning',
        message: `发现 ${inconsistentDevices.length} 个设备状态与遥测时间不一致`,
        details: { devices: inconsistentDevices }
      });
    } else {
      results.push({
        table: 'iot_device_status',
        checkType: 'device_consistency',
        status: 'pass',
        message: '设备状态一致'
      });
    }

    return results;
  }

  private async checkIndexHealth(): Promise<ConsistencyCheckResult[]> {
    const pool = await getPool();
    const results: ConsistencyCheckResult[] = [];

    // 检查索引使用情况
    const [indexStats] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        TABLE_NAME,
        INDEX_NAME,
        CARDINALITY
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('hive_data', 'iot_telemetry', 'iot_device_status')
      ORDER BY TABLE_NAME, INDEX_NAME
    `);

    // 检查是否有索引基数过低的情况（可能需要优化）
    const lowCardinalityIndexes = indexStats.filter(idx => 
      idx.CARDINALITY !== null && idx.CARDINALITY < 100 && idx.INDEX_NAME !== 'PRIMARY'
    );

    if (lowCardinalityIndexes.length > 0) {
      results.push({
        table: 'multiple',
        checkType: 'index_health',
        status: 'warning',
        message: `发现 ${lowCardinalityIndexes.length} 个低基数索引，可能影响查询性能`,
        details: { indexes: lowCardinalityIndexes }
      });
    } else {
      results.push({
        table: 'multiple',
        checkType: 'index_health',
        status: 'pass',
        message: '索引健康状态良好'
      });
    }

    return results;
  }

  async fixIssue(table: string, checkType: string, fixCommand: string): Promise<{ success: boolean; message: string }> {
    try {
      const pool = await getPool();
      await pool.execute(fixCommand);
      
      logger.info('system', `已修复问题: ${table}.${checkType}`);
      
      return {
        success: true,
        message: `已成功修复 ${table} 表的 ${checkType} 问题`
      };
    } catch (error) {
      logger.error('system', `修复失败: ${table}.${checkType}`, error as Error);
      
      return {
        success: false,
        message: `修复失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

export const dataConsistencyChecker = new DataConsistencyChecker();
