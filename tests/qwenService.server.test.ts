import { describe, expect, it } from 'vitest';
import { buildQueryAnalysisSummary, extractSQL, sanitizeAssistantAnswer } from '../services/qwenService.server';
import { aiQueryService, type QueryResult } from '../services/aiQueryService';

describe('qwenService.server helpers', () => {
  it('extractSQL should read sql code block and trim trailing semicolon', () => {
    const sql = extractSQL('```sql\nSELECT timestamp, insideTemperature FROM hive_data LIMIT 10;\n```');
    expect(sql).toBe('SELECT timestamp, insideTemperature FROM hive_data LIMIT 10');
  });

  it('sanitizeAssistantAnswer should hide internal schema and backend details', () => {
    const text = sanitizeAssistantAnswer([
      '我查询了 hive_data 表和 iot_telemetry 表。',
      '```sql',
      'SELECT * FROM hive_data LIMIT 10',
      '```',
      '请访问 /api/ai/query 查看 JSON结构。'
    ].join('\n'));

    expect(text).not.toContain('hive_data');
    expect(text).not.toContain('iot_telemetry');
    expect(text).not.toContain('/api/ai/query');
    expect(text).not.toContain('SELECT *');
    expect(text).toContain('蜂箱历史数据');
  });

  it('buildQueryAnalysisSummary should summarize query result for internal reasoning', () => {
    const queryResult: QueryResult = {
      success: true,
      rowCount: 3,
      columns: ['timestamp', 'insideTemperature', 'weight'],
      data: [
        { timestamp: 1710000000000, insideTemperature: 33.2, weight: 40.5 },
        { timestamp: 1710003600000, insideTemperature: 34.1, weight: 41.1 },
        { timestamp: 1710007200000, insideTemperature: 34.4, weight: 41.6 }
      ]
    };

    const summary = buildQueryAnalysisSummary(queryResult);

    expect(summary).toContain('内部查询状态：成功，共 3 条记录。');
    expect(summary).toContain('insideTemperature');
    expect(summary).toContain('weight');
    expect(summary).toContain('相对首条变化 +1.10');
  });

  it('summarizeQueryResult should only expose public-safe aggregate summary', () => {
    const queryResult: QueryResult = {
      success: true,
      rowCount: 2,
      executionTime: 12,
      columns: ['timestamp', 'insideTemperature', 'online', 'note'],
      data: [
        { timestamp: 1710000000000, insideTemperature: 33.2, online: true, note: 'normal' },
        { timestamp: 1710003600000, insideTemperature: 34.1, online: false, note: 'warning' }
      ]
    };

    const summary = aiQueryService.summarizeQueryResult(queryResult);

    expect(summary.status).toBe('ok');
    expect(summary.rowCount).toBe(2);
    expect(summary.columnCount).toBe(4);
    expect(summary.profile.timeLikeColumnCount).toBe(1);
    expect(summary.profile.numericColumnCount).toBe(1);
    expect(summary.profile.booleanColumnCount).toBe(1);
    expect(summary.profile.textColumnCount).toBe(1);
    expect(summary.insight).toContain('适合继续做趋势分析');
  });

  it('validateQuery should consistently reject repeated forbidden pattern checks', () => {
    const service = aiQueryService as any;
    const badSql = 'SELECT * FROM hive_data -- comment';

    const first = service.validateQuery(badSql);
    const second = service.validateQuery(badSql);

    expect(first.valid).toBe(false);
    expect(second.valid).toBe(false);
    expect(first.error).toContain('SQL包含不允许的语法');
    expect(second.error).toContain('SQL包含不允许的语法');
  });
});
