import { RowDataPacket } from 'mysql2';
import { getPool } from './databaseService';
import { logger } from './logger';

export interface DataMappingValidation {
  source: string;
  target: string;
  status: 'mapped' | 'missing' | 'extra';
  description: string;
}

export interface DataFlowValidation {
  timestamp: string;
  raspberryPiFields: string[];
  databaseFields: string[];
  frontendFields: string[];
  mappings: DataMappingValidation[];
  coverage: {
    raspberryPiToDatabase: number;
    databaseToFrontend: number;
    overall: number;
  };
  issues: string[];
}

export class DataMappingValidator {
  // 树莓派上传的字段列表
  private raspberryPiFields = [
    'temp',
    'humi',
    'in_temp',
    'in_humi',
    'out_temp',
    'out_humi',
    'weight',
    'in_count',
    'out_count',
    'lat',
    'lon',
    'hornet_count',
    'fps',
    'latency_ms'
  ];

  // 数据库 hive_data 表字段
  private hiveDataFields = [
    'timestamp',
    'temperature',
    'humidity',
    'insideTemperature',
    'insideHumidity',
    'outsideTemperature',
    'outsideHumidity',
    'weight',
    'beesIn',
    'beesOut',
    'hornetsDetected',
    'latitude',
    'longitude'
  ];

  // 数据库 iot_telemetry 表字段
  private iotTelemetryFields = [
    'timestamp',
    'device_id',
    'sensor_type',
    'value',
    'unit',
    'qos'
  ];

  // 前端展示字段
  private frontendDisplayFields = [
    'timestamp',
    'temperature',
    'humidity',
    'insideTemperature',
    'insideHumidity',
    'outsideTemperature',
    'outsideHumidity',
    'weight',
    'beesIn',
    'beesOut',
    'hornetsDetected',
    'latitude',
    'longitude',
    'address'
  ];

  // 字段映射关系
  private fieldMappings: Record<string, { database: string; frontend: string; description: string }> = {
    'temp': {
      database: 'insideTemperature',
      frontend: 'insideTemperature',
      description: '蜂箱内部温度（°C）- 兼容字段'
    },
    'humi': {
      database: 'insideHumidity',
      frontend: 'insideHumidity',
      description: '蜂箱内部湿度（%）- 兼容字段'
    },
    'in_temp': {
      database: 'insideTemperature',
      frontend: 'insideTemperature',
      description: '蜂箱内部温度（°C）'
    },
    'in_humi': {
      database: 'insideHumidity',
      frontend: 'insideHumidity',
      description: '蜂箱内部湿度（%）'
    },
    'out_temp': {
      database: 'outsideTemperature',
      frontend: 'outsideTemperature',
      description: '蜂箱外部温度（°C）'
    },
    'out_humi': {
      database: 'outsideHumidity',
      frontend: 'outsideHumidity',
      description: '蜂箱外部湿度（%）'
    },
    'weight': {
      database: 'weight',
      frontend: 'weight',
      description: '蜂箱重量（kg）'
    },
    'in_count': {
      database: 'beesIn',
      frontend: 'beesIn',
      description: '蜜蜂进入计数'
    },
    'out_count': {
      database: 'beesOut',
      frontend: 'beesOut',
      description: '蜜蜂出去计数'
    },
    'lat': {
      database: 'latitude',
      frontend: 'latitude',
      description: '纬度'
    },
    'lon': {
      database: 'longitude',
      frontend: 'longitude',
      description: '经度'
    },
    'hornet_count': {
      database: 'hornetsDetected',
      frontend: 'hornetsDetected',
      description: '胡蜂检测数量'
    },
    'fps': {
      database: 'iot_telemetry.fps',
      frontend: 'fps',
      description: '视觉识别帧率'
    },
    'latency_ms': {
      database: 'iot_telemetry.latency_ms',
      frontend: 'latency_ms',
      description: '推理延迟（ms）'
    }
  };

  async validateDataFlow(): Promise<DataFlowValidation> {
    const timestamp = new Date().toISOString();
    const mappings: DataMappingValidation[] = [];
    const issues: string[] = [];

    // 1. 验证树莓派字段到数据库的映射
    for (const field of this.raspberryPiFields) {
      const mapping = this.fieldMappings[field];
      if (mapping) {
        mappings.push({
          source: `树莓派.${field}`,
          target: `数据库.${mapping.database}`,
          status: 'mapped',
          description: mapping.description
        });
      } else {
        mappings.push({
          source: `树莓派.${field}`,
          target: '数据库.未映射',
          status: 'missing',
          description: '该字段未映射到数据库'
        });
        issues.push(`树莓派字段 "${field}" 未映射到数据库`);
      }
    }

    // 2. 验证数据库字段到前端的映射
    for (const field of this.hiveDataFields) {
      const isMapped = Object.values(this.fieldMappings).some(m => m.database === field);
      if (isMapped || field === 'timestamp') {
        mappings.push({
          source: `数据库.${field}`,
          target: `前端.${field}`,
          status: 'mapped',
          description: '字段已映射到前端'
        });
      } else {
        mappings.push({
          source: `数据库.${field}`,
          target: '前端.未展示',
          status: 'extra',
          description: '数据库字段未在前端展示'
        });
      }
    }

    // 3. 检查实际数据库中的数据
    try {
      const pool = await getPool();
      
      // 检查 hive_data 表结构
      const [hiveColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'hive_data'
      `);
      
      const actualHiveColumns = hiveColumns.map((row: any) => row.COLUMN_NAME);
      const missingHiveColumns = this.hiveDataFields.filter(f => !actualHiveColumns.includes(f));
      
      if (missingHiveColumns.length > 0) {
        issues.push(`hive_data 表缺少字段: ${missingHiveColumns.join(', ')}`);
      }

      // 检查 iot_telemetry 表结构
      const [iotColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'iot_telemetry'
      `);
      
      const actualIotColumns = iotColumns.map((row: any) => row.COLUMN_NAME);
      const missingIotColumns = this.iotTelemetryFields.filter(f => !actualIotColumns.includes(f));
      
      if (missingIotColumns.length > 0) {
        issues.push(`iot_telemetry 表缺少字段: ${missingIotColumns.join(', ')}`);
      }

      // 检查最近的数据记录
      const [recentHive] = await pool.execute<RowDataPacket[]>(`
        SELECT * FROM hive_data 
        ORDER BY timestamp DESC 
        LIMIT 1
      `);

      if (recentHive.length > 0) {
        const latestRecord = recentHive[0];
        const nullFields = Object.keys(latestRecord).filter(key => latestRecord[key] === null);
        
        if (nullFields.length > 0) {
          issues.push(`最新记录中存在空值字段: ${nullFields.join(', ')}`);
        }
      }

    } catch (error) {
      issues.push(`数据库检查失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 4. 计算覆盖率
    const raspberryPiToDatabase = (mappings.filter(m => m.status === 'mapped' && m.source.startsWith('树莓派')).length / this.raspberryPiFields.length) * 100;
    const databaseToFrontend = (mappings.filter(m => m.status === 'mapped' && m.source.startsWith('数据库')).length / this.hiveDataFields.length) * 100;
    const overall = (raspberryPiToDatabase + databaseToFrontend) / 2;

    return {
      timestamp,
      raspberryPiFields: this.raspberryPiFields,
      databaseFields: [...this.hiveDataFields, ...this.iotTelemetryFields],
      frontendFields: this.frontendDisplayFields,
      mappings,
      coverage: {
        raspberryPiToDatabase: Math.round(raspberryPiToDatabase),
        databaseToFrontend: Math.round(databaseToFrontend),
        overall: Math.round(overall)
      },
      issues
    };
  }

  async validateSampleData(deviceId: string): Promise<{
    success: boolean;
    message: string;
    sample?: any;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    try {
      const pool = await getPool();
      
      // 获取最新的IoT数据
      const [iotData] = await pool.execute<RowDataPacket[]>(`
        SELECT sensor_type, value, unit, timestamp 
        FROM iot_telemetry 
        WHERE device_id = ? 
        ORDER BY timestamp DESC 
        LIMIT 20
      `, [deviceId]);

      // 获取最新的hive数据
      const [hiveData] = await pool.execute<RowDataPacket[]>(`
        SELECT * FROM hive_data 
        ORDER BY timestamp DESC 
        LIMIT 1
      `);

      if (iotData.length === 0) {
        issues.push(`设备 ${deviceId} 没有IoT数据记录`);
      }

      if (hiveData.length === 0) {
        issues.push('hive_data 表没有数据记录');
      }

      // 检查数据完整性
      const sensorTypes = new Set(iotData.map((d: any) => d.sensor_type));
      const expectedSensors = [
        'inside_temperature',
        'inside_humidity',
        'weight',
        'bees_in',
        'bees_out',
        'hornet_count'
      ];

      const missingSensors = expectedSensors.filter(s => !sensorTypes.has(s));
      if (missingSensors.length > 0) {
        issues.push(`缺少传感器数据类型: ${missingSensors.join(', ')}`);
      }

      return {
        success: issues.length === 0,
        message: issues.length === 0 ? '数据完整性验证通过' : '发现数据完整性问题',
        sample: {
          iot: iotData.slice(0, 5),
          hive: hiveData[0] || null
        },
        issues
      };

    } catch (error) {
      return {
        success: false,
        message: `验证失败: ${error instanceof Error ? error.message : String(error)}`,
        issues: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  getFieldMappingDocumentation(): string {
    let doc = '# 数据字段映射文档\n\n';
    doc += '## 树莓派 → 数据库 → 前端 字段映射关系\n\n';
    doc += '| 树莓派字段 | 数据库字段 | 前端字段 | 描述 |\n';
    doc += '|-----------|-----------|---------|------|\n';

    for (const [source, mapping] of Object.entries(this.fieldMappings)) {
      doc += `| ${source} | ${mapping.database} | ${mapping.frontend} | ${mapping.description} |\n`;
    }

    doc += '\n## 数据流程\n\n';
    doc += '```\n';
    doc += '树莓派采集 → MQTT上报 → 后端接收 → 数据库存储 → SSE推送 → 前端展示\n';
    doc += '```\n\n';

    doc += '## 数据存储策略\n\n';
    doc += '- **实时数据**: 通过 MQTT 实时上报，后端通过 SSE 推送到前端\n';
    doc += '- **历史数据**: 按时间桶聚合存储（默认60分钟一个桶）\n';
    doc += '- **IoT数据**: 存储到 `iot_telemetry` 表，支持多种传感器类型\n';
    doc += '- **蜂箱数据**: 存储到 `hive_data` 表，包含所有关键指标\n';

    return doc;
  }
}

export const dataMappingValidator = new DataMappingValidator();
