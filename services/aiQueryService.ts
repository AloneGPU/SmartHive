import { RowDataPacket } from 'mysql2';
import { getPool } from './databaseService';
import { logger } from './logger';

export interface DatabaseSchema {
  tables: TableSchema[];
  relationships: string[];
}

export interface TableSchema {
  name: string;
  description: string;
  columns: ColumnSchema[];
  rowCount?: number;
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  key: string;
  default: string | null;
  extra: string;
  description: string;
}

export interface QueryResult {
  success: boolean;
  data?: any[];
  rowCount?: number;
  columns?: string[];
  error?: string;
  executionTime?: number;
}

export interface QuerySummaryPayload {
  status: 'ok' | 'empty';
  rowCount: number;
  columnCount: number;
  sampledRows: number;
  profile: {
    numericColumnCount: number;
    timeLikeColumnCount: number;
    textColumnCount: number;
    booleanColumnCount: number;
    nullOnlyColumnCount: number;
  };
  insight: string;
}

interface QueryValidationResult {
  valid: boolean;
  error?: string;
  normalizedSql?: string;
}

export class AIQueryService {
  private static instance: AIQueryService;
  private readonly allowedTables = [
    'hive_data',
    'iot_telemetry',
    'iot_device_status',
    'vision_recognition'
  ];

  private readonly maxQueryRows = 200;

  private readonly forbiddenKeywords = [
    'DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE',
    'INSERT', 'UPDATE', 'GRANT', 'REVOKE', 'EXEC', 'CALL'
  ];

  private readonly forbiddenPatterns = [
    /--/,
    /\/\*/,
    /#(?![0-9a-f]{3,6}\b)/,
    /\bINTO\s+OUTFILE\b/i,
    /\bINTO\s+DUMPFILE\b/i,
    /\bLOAD_FILE\s*\(/i,
    /\bINFORMATION_SCHEMA\b/i,
    /\bPERFORMANCE_SCHEMA\b/i,
    /\bMYSQL\./i,
    /\bSYS\./i
  ];

  static getInstance(): AIQueryService {
    if (!AIQueryService.instance) {
      AIQueryService.instance = new AIQueryService();
    }
    return AIQueryService.instance;
  }

  async getDatabaseSchema(): Promise<DatabaseSchema> {
    const pool = await getPool();
    
    const tables: TableSchema[] = [];
    
    for (const tableName of this.allowedTables) {
      try {
        const [columns] = await pool.execute<RowDataPacket[]>(`
          SELECT 
            COLUMN_NAME,
            COLUMN_TYPE,
            IS_NULLABLE,
            COLUMN_KEY,
            COLUMN_DEFAULT,
            EXTRA,
            COLUMN_COMMENT
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `, [tableName]);
        
        const [countResult] = await pool.execute<RowDataPacket[]>(`
          SELECT COUNT(*) as count FROM ${tableName}
        `);
        
        const tableSchema: TableSchema = {
          name: tableName,
          description: this.getTableDescription(tableName),
          columns: columns.map((col: any) => ({
            name: col.COLUMN_NAME,
            type: col.COLUMN_TYPE,
            nullable: col.IS_NULLABLE === 'YES',
            key: col.COLUMN_KEY,
            default: col.COLUMN_DEFAULT,
            extra: col.EXTRA,
            description: col.COLUMN_COMMENT || this.getColumnDescription(tableName, col.COLUMN_NAME)
          })),
          rowCount: countResult[0]?.count || 0
        };
        
        tables.push(tableSchema);
      } catch (error) {
        logger.error('database', `获取表 ${tableName} 结构失败`, error as Error);
      }
    }
    
    return {
      tables,
      relationships: this.getRelationships()
    };
  }

  async executeQuery(sql: string, params: any[] = []): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      const validation = this.validateQuery(sql);
      if (!validation.valid || !validation.normalizedSql) {
        return {
          success: false,
          error: validation.error
        };
      }
      
      const pool = await getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(validation.normalizedSql, params);
      const executionTime = Date.now() - startTime;
      
      const data = Array.isArray(rows) ? rows : [rows];
      const columns = data.length > 0 ? Object.keys(data[0]) : [];
      
      logger.info('database', 'AI执行SQL查询成功', {
        sql: validation.normalizedSql.substring(0, 160),
        rowCount: data.length,
        executionTime
      });
      
      return {
        success: true,
        data,
        rowCount: data.length,
        columns,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('database', 'AI执行SQL查询失败', error as Error, { sql: sql.substring(0, 160) });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime
      };
    }
  }

  summarizeQueryResult(result: QueryResult): QuerySummaryPayload {
    const rows = Array.isArray(result.data) ? result.data : [];
    const rowCount = result.rowCount ?? rows.length;
    const columns = result.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
    const sampleRows = rows.slice(0, 20);

    if (rowCount === 0) {
      return {
        status: 'empty',
        rowCount: 0,
        columnCount: columns.length,
        sampledRows: 0,
        profile: {
          numericColumnCount: 0,
          timeLikeColumnCount: 0,
          textColumnCount: 0,
          booleanColumnCount: 0,
          nullOnlyColumnCount: columns.length
        },
        insight: '查询执行成功，但当前条件下没有命中数据。'
      };
    }

    const profile = columns.reduce((acc, column) => {
      let numericCount = 0;
      let booleanCount = 0;
      let stringCount = 0;
      let nullCount = 0;

      for (const row of sampleRows) {
        const value = row?.[column];
        if (value === null || value === undefined) {
          nullCount += 1;
        } else if (typeof value === 'boolean') {
          booleanCount += 1;
        } else if (typeof value === 'number') {
          numericCount += 1;
        } else if (typeof value === 'string') {
          stringCount += 1;
        } else if (typeof value === 'bigint') {
          numericCount += 1;
        }
      }

      if (nullCount === sampleRows.length) {
        acc.nullOnlyColumnCount += 1;
        return acc;
      }

      if (/(timestamp|time|date|seen_at)$/i.test(column)) {
        acc.timeLikeColumnCount += 1;
      } else if (numericCount > 0) {
        acc.numericColumnCount += 1;
      } else if (booleanCount > 0) {
        acc.booleanColumnCount += 1;
      } else if (stringCount > 0) {
        acc.textColumnCount += 1;
      }

      return acc;
    }, {
      numericColumnCount: 0,
      timeLikeColumnCount: 0,
      textColumnCount: 0,
      booleanColumnCount: 0,
      nullOnlyColumnCount: 0
    });

    const parts = [
      `查询成功，共命中 ${rowCount} 条记录`,
      `结果包含 ${columns.length} 个字段`
    ];

    if (profile.timeLikeColumnCount > 0) {
      parts.push(`${profile.timeLikeColumnCount} 个时间维度`);
    }
    if (profile.numericColumnCount > 0) {
      parts.push(`${profile.numericColumnCount} 个数值指标`);
    }
    if (profile.textColumnCount > 0) {
      parts.push(`${profile.textColumnCount} 个文本维度`);
    }
    if (profile.booleanColumnCount > 0) {
      parts.push(`${profile.booleanColumnCount} 个布尔状态字段`);
    }

    const trendHint = profile.timeLikeColumnCount > 0 && profile.numericColumnCount > 0
      ? '，适合继续做趋势分析。'
      : profile.numericColumnCount > 0
        ? '，适合继续做统计分析。'
        : '。';

    return {
      status: 'ok',
      rowCount,
      columnCount: columns.length,
      sampledRows: sampleRows.length,
      profile,
      insight: `${parts.join('，')}${trendHint}`
    };
  }

  private validateQuery(sql: string): QueryValidationResult {
    const normalizedSql = this.normalizeSql(sql);
    if (!normalizedSql) {
      return {
        valid: false,
        error: 'SQL查询语句不能为空'
      };
    }

    const upperSQL = normalizedSql.toUpperCase();

    if (!/^(SELECT|WITH)\b/.test(upperSQL)) {
      return {
        valid: false,
        error: '只允许执行SELECT查询'
      };
    }

    if (upperSQL.includes(';')) {
      return {
        valid: false,
        error: '禁止执行多条SQL语句'
      };
    }

    for (const keyword of this.forbiddenKeywords) {
      if (upperSQL.includes(keyword)) {
        return {
          valid: false,
          error: `禁止使用关键字: ${keyword}`
        };
      }
    }

    for (const pattern of this.forbiddenPatterns) {
      if (pattern.test(normalizedSql)) {
        return {
          valid: false,
          error: 'SQL包含不允许的语法或敏感系统对象'
        };
      }
    }

    const tableNames = this.extractTableNames(normalizedSql);
    for (const tableName of tableNames) {
      if (!this.allowedTables.includes(tableName)) {
        return {
          valid: false,
          error: `禁止访问表: ${tableName}`
        };
      }
    }

    return {
      valid: true,
      normalizedSql: this.enforceLimit(normalizedSql)
    };
  }

  private normalizeSql(sql: string): string {
    return (sql || '')
      .replace(/```sql/gi, '')
      .replace(/```/g, '')
      .replace(/\r/g, '')
      .trim()
      .replace(/;+$/g, '')
      .trim();
  }

  private extractTableNames(sql: string): string[] {
    const matches = [...sql.matchAll(/\b(?:FROM|JOIN)\s+`?([a-zA-Z0-9_.]+)`?/gi)];
    return [...new Set(matches
      .map((match) => match[1]?.split('.').pop()?.toLowerCase())
      .filter((name): name is string => Boolean(name)))];
  }

  private enforceLimit(sql: string): string {
    const commaLimitPattern = /\bLIMIT\s+(\d+)\s*,\s*(\d+)\s*$/i;
    const offsetLimitPattern = /\bLIMIT\s+(\d+)\s+OFFSET\s+(\d+)\s*$/i;
    const simpleLimitPattern = /\bLIMIT\s+(\d+)\s*$/i;

    const commaMatch = sql.match(commaLimitPattern);
    if (commaMatch) {
      const offset = Number(commaMatch[1]);
      const count = Number(commaMatch[2]);
      if (count > this.maxQueryRows) {
        return sql.replace(commaLimitPattern, `LIMIT ${offset}, ${this.maxQueryRows}`);
      }
      return sql;
    }

    const offsetMatch = sql.match(offsetLimitPattern);
    if (offsetMatch) {
      const count = Number(offsetMatch[1]);
      const offset = Number(offsetMatch[2]);
      if (count > this.maxQueryRows) {
        return sql.replace(offsetLimitPattern, `LIMIT ${this.maxQueryRows} OFFSET ${offset}`);
      }
      return sql;
    }

    const simpleMatch = sql.match(simpleLimitPattern);
    if (simpleMatch) {
      const count = Number(simpleMatch[1]);
      if (count > this.maxQueryRows) {
        return sql.replace(simpleLimitPattern, `LIMIT ${this.maxQueryRows}`);
      }
      return sql;
    }

    return `${sql}\nLIMIT ${this.maxQueryRows}`;
  }

  private getTableDescription(tableName: string): string {
    const descriptions: Record<string, string> = {
      'hive_data': '蜂箱核心数据表，包含温度、湿度、重量、蜜蜂计数、胡蜂检测等关键指标',
      'iot_telemetry': 'IoT遥测数据表，存储所有传感器的原始数据',
      'iot_device_status': 'IoT设备状态表，记录设备在线状态、信号强度等信息',
      'vision_recognition': '视觉识别结果表，存储识别结果摘要和时间信息'
    };
    return descriptions[tableName] || '';
  }

  private getColumnDescription(tableName: string, columnName: string): string {
    const descriptions: Record<string, Record<string, string>> = {
      'hive_data': {
        'timestamp': '数据采集时间戳（毫秒）',
        'temperature': '蜂箱温度（°C）- 兼容字段',
        'humidity': '蜂箱湿度（%）- 兼容字段',
        'insideTemperature': '蜂箱内部温度（°C）',
        'insideHumidity': '蜂箱内部湿度（%）',
        'outsideTemperature': '蜂箱外部温度（°C）',
        'outsideHumidity': '蜂箱外部湿度（%）',
        'weight': '蜂箱重量',
        'beesIn': '蜜蜂进入计数',
        'beesOut': '蜜蜂出去计数',
        'hornetsDetected': '胡蜂检测数量',
        'latitude': '纬度',
        'longitude': '经度'
      },
      'iot_telemetry': {
        'timestamp': '数据采集时间戳（毫秒）',
        'device_id': '设备ID',
        'sensor_type': '传感器类型',
        'value': '传感器值',
        'unit': '单位',
        'qos': '服务质量等级'
      },
      'iot_device_status': {
        'device_id': '设备ID',
        'online': '在线状态',
        'last_seen_at': '最后在线时间',
        'last_rssi': '信号强度',
        'last_ip': 'IP地址',
        'packets_received': '接收包数',
        'packets_dropped': '丢包数'
      },
      'vision_recognition': {
        'image_url': '识别图片地址',
        'recognition_result': '识别结果文本',
        'timestamp': '识别时间戳（毫秒）'
      }
    };
    
    return descriptions[tableName]?.[columnName] || '';
  }

  private getRelationships(): string[] {
    return [
      'hive_data 表包含蜂箱的核心数据，每条记录代表一个时间点的数据快照',
      'iot_telemetry 表通过 device_id 关联到 iot_device_status 表',
      'iot_telemetry 表的 sensor_type 字段对应不同的传感器类型（如 inside_temperature, outside_humidity 等）',
      'hive_data 表的数据通常由 iot_telemetry 表聚合而来',
      'vision_recognition 表记录视觉识别结果，可辅助分析胡蜂等异常事件',
      '所有表的时间戳字段都是毫秒级Unix时间戳'
    ];
  }

  getSchemaDescription(): string {
    return `
# 智能蜂箱数据库Schema

## 数据表说明

### 1. hive_data 表（蜂箱核心数据）
存储蜂箱的关键指标数据，包括：
- 温度数据：insideTemperature（内部温度）、outsideTemperature（外部温度）
- 湿度数据：insideHumidity（内部湿度）、outsideHumidity（外部湿度）
- 重量数据：weight（蜂箱重量，单位kg）
- 蜜蜂计数：beesIn（进入计数）、beesOut（出去计数）
- 胡蜂检测：hornetsDetected（检测到的胡蜂数量）
- 位置信息：latitude（纬度）、longitude（经度）
- 时间戳：timestamp（毫秒级Unix时间戳）

### 2. iot_telemetry 表（IoT遥测数据）
存储所有传感器的原始数据：
- device_id：设备ID
- sensor_type：传感器类型（如 inside_temperature, outside_humidity, weight 等）
- value：传感器值
- unit：单位
- timestamp：时间戳

### 3. iot_device_status 表（设备状态）
记录IoT设备的在线状态：
- device_id：设备ID
- online：在线状态（true/false）
- last_seen_at：最后在线时间
- last_rssi：信号强度
- last_ip：IP地址

### 4. vision_recognition 表（视觉识别结果）
记录视觉识别结果：
- image_url：图片地址
- recognition_result：识别结果文本
- timestamp：识别时间戳

## 常用查询示例

1. 查询最近24小时的温度数据：
\`\`\`sql
SELECT timestamp, insideTemperature, outsideTemperature 
FROM hive_data 
WHERE timestamp >= (UNIX_TIMESTAMP(NOW()) * 1000 - 86400000)
ORDER BY timestamp DESC
LIMIT 100
\`\`\`

2. 查询设备在线状态：
\`\`\`sql
SELECT device_id, online, last_seen_at, last_ip 
FROM iot_device_status
\`\`\`

3. 查询最近的胡蜂检测记录：
\`\`\`sql
SELECT timestamp, hornetsDetected 
FROM hive_data 
WHERE hornetsDetected > 0 
ORDER BY timestamp DESC 
LIMIT 10
\`\`\`

4. 统计今日蜜蜂进出总数：
\`\`\`sql
SELECT SUM(beesIn) as total_in, SUM(beesOut) as total_out
FROM hive_data
WHERE timestamp >= (UNIX_TIMESTAMP(CURDATE()) * 1000)
\`\`\`

## 注意事项
- 所有时间戳都是毫秒级Unix时间戳
- 温度单位：°C
- 湿度单位：%
- 重量单位：kg
- 只允许执行SELECT查询
- 系统配置属于敏感信息，禁止访问
    `;
  }
}

export const aiQueryService = AIQueryService.getInstance();
