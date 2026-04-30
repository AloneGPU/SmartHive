import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RowDataPacket } from 'mysql2/promise';
import { getPool } from './databaseService';
import { logger } from './logger';

type CleanupStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface StaleRuleInput {
  tableName: 'hive_data' | 'iot_telemetry' | 'vision_recognition';
  retentionDays: number;
  maxDeleteRows?: number;
}

type TableRule = {
  tableName: StaleRuleInput['tableName'];
  timestampColumn: string;
  idColumn: string;
  retentionDays: number;
  maxDeleteRows: number;
};

type TableSummary = {
  tableName: string;
  retentionDays: number;
  cutoffTs: number;
  candidateRows: number;
  plannedDeleteRows: number;
  earliestTimestamp: number | null;
  latestTimestamp: number | null;
  estimatedBytes: number;
  riskLevel: 'low' | 'medium' | 'high';
};

type AiInsights = {
  dataScale: string;
  typeDistribution: string;
  potentialValue: string;
  recommendation: string;
  confidence: number;
};

export interface CleanupReport {
  reportId: string;
  createdAt: number;
  reportHash: string;
  rules: TableRule[];
  summary: {
    totalCandidateRows: number;
    totalPlannedDeleteRows: number;
    estimatedBackupBytes: number;
  };
  tableSummaries: TableSummary[];
  aiInsights: AiInsights;
}

export interface CreateReportResult {
  operationId: string;
  confirmationToken: string;
  expiresAt: number;
  report: CleanupReport;
}

type OperationRow = RowDataPacket & {
  id: string;
  status: CleanupStatus;
  report_hash: string;
  report_json: string;
  backup_path: string | null;
  confirmation_token: string;
  expires_at: string;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
};

const DEFAULT_RULES: TableRule[] = [
  { tableName: 'hive_data', timestampColumn: 'timestamp', idColumn: 'id', retentionDays: 180, maxDeleteRows: 20000 },
  { tableName: 'iot_telemetry', timestampColumn: 'timestamp', idColumn: 'id', retentionDays: 90, maxDeleteRows: 50000 },
  { tableName: 'vision_recognition', timestampColumn: 'timestamp', idColumn: 'id', retentionDays: 60, maxDeleteRows: 10000 }
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const normalizeRules = (rules?: StaleRuleInput[]): TableRule[] => {
  if (!Array.isArray(rules) || rules.length === 0) return DEFAULT_RULES;
  const map = new Map(DEFAULT_RULES.map((r) => [r.tableName, r]));
  const normalized: TableRule[] = [];
  for (const r of rules) {
    const base = map.get(r.tableName);
    if (!base) continue;
    normalized.push({
      ...base,
      retentionDays: clamp(Number(r.retentionDays || base.retentionDays), 1, 3650),
      maxDeleteRows: clamp(Number(r.maxDeleteRows || base.maxDeleteRows), 100, 200000)
    });
  }
  return normalized.length > 0 ? normalized : DEFAULT_RULES;
};

const hashReport = (report: Omit<CleanupReport, 'reportHash'>): string => {
  return crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
};

const estimateRisk = (plannedDeleteRows: number): 'low' | 'medium' | 'high' => {
  if (plannedDeleteRows >= 50000) return 'high';
  if (plannedDeleteRows >= 10000) return 'medium';
  return 'low';
};

const parseJsonSafely = <T>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const queryAiInsights = async (report: Omit<CleanupReport, 'reportHash'>): Promise<AiInsights> => {
  const apiKey = (process.env.QWEN_API_KEY || '').trim();
  if (!apiKey) {
    return {
      dataScale: '未配置Qwen API Key，使用本地规则分析。',
      typeDistribution: '按业务表分布（hive_data / iot_telemetry / vision_recognition）统计。',
      potentialValue: '建议先备份并抽样复核，避免误删可用于长期趋势建模的数据。',
      recommendation: '建议先执行一次较小批次清理并观察业务报表影响。',
      confidence: 0.5
    };
  }

  const prompt = [
    '你是数据库治理专家。请针对以下过时数据清理报告输出严格JSON。',
    '字段要求: dataScale, typeDistribution, potentialValue, recommendation, confidence(0-1)。',
    '只输出JSON对象，不要markdown。',
    JSON.stringify(report)
  ].join('\n');

  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: (process.env.QWEN_MODEL || 'qwen-flash').trim(),
      messages: [
        { role: 'system', content: '你是严谨的数据治理顾问。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1200
    })
  });

  if (!response.ok) {
    throw new Error(`AI分析失败: HTTP ${response.status}`);
  }
  const payload = (await response.json().catch(() => ({}))) as any;
  const content = String(payload?.choices?.[0]?.message?.content || '').trim();
  const parsed = parseJsonSafely<Partial<AiInsights>>(content, {});
  return {
    dataScale: String(parsed.dataScale || 'AI返回缺失，采用默认分析。'),
    typeDistribution: String(parsed.typeDistribution || '按表维度分布统计。'),
    potentialValue: String(parsed.potentialValue || '潜在价值需结合业务归档策略评估。'),
    recommendation: String(parsed.recommendation || '建议分批清理并保留备份。'),
    confidence: clamp(Number(parsed.confidence || 0.6), 0, 1)
  };
};

const getTableEstimatedBytesPerRow = async (tableName: string): Promise<number> => {
  const pool = await getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT DATA_LENGTH, INDEX_LENGTH, TABLE_ROWS
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  if (!Array.isArray(rows) || rows.length === 0) return 256;
  const row = rows[0] as any;
  const tableRows = Number(row.TABLE_ROWS || 0);
  const bytes = Number(row.DATA_LENGTH || 0) + Number(row.INDEX_LENGTH || 0);
  if (tableRows <= 0 || bytes <= 0) return 256;
  return Math.max(64, Math.round(bytes / tableRows));
};

export const createStaleDataReport = async (input: {
  rules?: StaleRuleInput[];
  createdBy?: string;
}): Promise<CreateReportResult> => {
  const pool = await getPool();
  const rules = normalizeRules(input.rules);
  const tableSummaries: TableSummary[] = [];

  for (const rule of rules) {
    const cutoffTs = Date.now() - rule.retentionDays * 24 * 60 * 60 * 1000;
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt, MIN(${rule.timestampColumn}) AS minTs, MAX(${rule.timestampColumn}) AS maxTs
       FROM ${rule.tableName}
       WHERE ${rule.timestampColumn} < ?`,
      [cutoffTs]
    );
    const item = Array.isArray(rows) && rows[0] ? (rows[0] as any) : {};
    const candidateRows = Number(item.cnt || 0);
    const plannedDeleteRows = Math.min(candidateRows, rule.maxDeleteRows);
    const estBytesPerRow = await getTableEstimatedBytesPerRow(rule.tableName);
    tableSummaries.push({
      tableName: rule.tableName,
      retentionDays: rule.retentionDays,
      cutoffTs,
      candidateRows,
      plannedDeleteRows,
      earliestTimestamp: Number.isFinite(Number(item.minTs)) ? Number(item.minTs) : null,
      latestTimestamp: Number.isFinite(Number(item.maxTs)) ? Number(item.maxTs) : null,
      estimatedBytes: plannedDeleteRows * estBytesPerRow,
      riskLevel: estimateRisk(plannedDeleteRows)
    });
  }

  const draftReport: Omit<CleanupReport, 'reportHash'> = {
    reportId: makeId('stale_report'),
    createdAt: Date.now(),
    rules,
    summary: {
      totalCandidateRows: tableSummaries.reduce((sum, t) => sum + t.candidateRows, 0),
      totalPlannedDeleteRows: tableSummaries.reduce((sum, t) => sum + t.plannedDeleteRows, 0),
      estimatedBackupBytes: tableSummaries.reduce((sum, t) => sum + t.estimatedBytes, 0)
    },
    tableSummaries,
    aiInsights: {
      dataScale: '分析中',
      typeDistribution: '分析中',
      potentialValue: '分析中',
      recommendation: '分析中',
      confidence: 0
    }
  };

  try {
    draftReport.aiInsights = await queryAiInsights(draftReport);
  } catch (error) {
    logger.warn('system', 'AI分析失败，使用降级方案', {
      error: error instanceof Error ? error.message : String(error)
    });
    draftReport.aiInsights = {
      dataScale: 'AI暂不可用，采用本地统计结果。',
      typeDistribution: '按业务表分布统计。',
      potentialValue: '建议保留统计摘要并归档备份以备审计。',
      recommendation: '先小批量试运行后再全量清理。',
      confidence: 0.45
    };
  }

  const reportHash = hashReport(draftReport);
  const report: CleanupReport = { ...draftReport, reportHash };
  const operationId = makeId('stale_cleanup');
  const confirmationToken = crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

  await pool.execute(
    `INSERT INTO stale_cleanup_operations
      (id, status, report_hash, report_json, confirmation_token, expires_at, created_by)
     VALUES (?, 'pending', ?, ?, ?, FROM_UNIXTIME(? / 1000), ?)`,
    [operationId, reportHash, JSON.stringify(report), confirmationToken, expiresAt, input.createdBy || 'system']
  );

  logger.info('database', '创建过时数据清理报告', {
    operationId,
    reportHash,
    totalPlannedDeleteRows: report.summary.totalPlannedDeleteRows
  });

  return { operationId, confirmationToken, expiresAt, report };
};

export const executeStaleDataCleanup = async (input: {
  operationId: string;
  confirmationToken: string;
  reportHash: string;
  confirmText: string;
  operator?: string;
}): Promise<{
  operationId: string;
  status: CleanupStatus;
  backupPath: string;
  deletedByTable: Record<string, number>;
}> => {
  const pool = await getPool();
  const [rows] = await pool.execute<OperationRow[]>(
    'SELECT * FROM stale_cleanup_operations WHERE id = ? LIMIT 1',
    [input.operationId]
  );
  const op = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!op) {
    throw new Error('清理任务不存在');
  }
  if (op.status !== 'pending') {
    throw new Error(`清理任务状态不可执行: ${op.status}`);
  }
  if (String(op.report_hash) !== input.reportHash) {
    throw new Error('报告哈希不一致，拒绝执行');
  }
  if (String(op.confirmation_token).toUpperCase() !== String(input.confirmationToken || '').toUpperCase()) {
    throw new Error('确认令牌错误');
  }
  if (String(input.confirmText || '').trim().toUpperCase() !== 'CONFIRM_CLEANUP') {
    throw new Error('确认文本错误，请传入 CONFIRM_CLEANUP');
  }
  if (new Date(op.expires_at).getTime() < Date.now()) {
    throw new Error('清理任务已过期，请重新生成报告');
  }

  const report = parseJsonSafely<CleanupReport>(String(op.report_json || '{}'), {} as CleanupReport);
  if (!report?.tableSummaries || !Array.isArray(report.tableSummaries)) {
    throw new Error('报告数据损坏，无法执行');
  }

  const backupRoot = path.join(process.cwd(), 'runtime', 'backups', 'stale-cleanup');
  fs.mkdirSync(backupRoot, { recursive: true });
  const backupPath = path.join(backupRoot, `${input.operationId}.json`);
  const backupPayload: any = {
    operationId: input.operationId,
    reportHash: input.reportHash,
    createdAt: Date.now(),
    operator: input.operator || 'system',
    tables: {}
  };
  const idsByTable: Record<string, Array<string | number>> = {};

  const deletedByTable: Record<string, number> = {};
  try {
    // 先冻结待删除数据并写备份，再执行删除，避免“删了但没备份”的风险
    for (const table of report.tableSummaries) {
      const rule = report.rules.find((r) => r.tableName === table.tableName);
      if (!rule || table.plannedDeleteRows <= 0) {
        deletedByTable[table.tableName] = 0;
        idsByTable[table.tableName] = [];
        continue;
      }

      const [staleRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM ${rule.tableName}
         WHERE ${rule.timestampColumn} < ?
         ORDER BY ${rule.timestampColumn} ASC
         LIMIT ?`,
        [table.cutoffTs, table.plannedDeleteRows]
      );
      const pickedRows = Array.isArray(staleRows) ? staleRows : [];
      const ids = pickedRows.map((r: any) => r[rule.idColumn]).filter((v) => v !== null && v !== undefined);
      backupPayload.tables[table.tableName] = pickedRows;
      idsByTable[table.tableName] = ids;
      deletedByTable[table.tableName] = 0;
    }

    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf-8');

    for (const table of report.tableSummaries) {
      const rule = report.rules.find((r) => r.tableName === table.tableName);
      const ids = idsByTable[table.tableName] || [];
      if (!rule || ids.length === 0) {
        continue;
      }
      const chunkSize = 1000;
      let deleted = 0;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => '?').join(',');
        const [result] = await pool.execute(
          `DELETE FROM ${rule.tableName} WHERE ${rule.idColumn} IN (${placeholders})`,
          chunk
        );
        deleted += Number((result as any)?.affectedRows || 0);
      }
      deletedByTable[table.tableName] = deleted;
    }

    await pool.execute(
      `UPDATE stale_cleanup_operations
       SET status = 'completed',
           backup_path = ?,
           completed_at = NOW(),
           created_by = ?
       WHERE id = ?`,
      [backupPath, input.operator || 'system', input.operationId]
    );

    logger.info('database', '过时数据清理完成', {
      operationId: input.operationId,
      backupPath,
      deletedByTable
    });

    return {
      operationId: input.operationId,
      status: 'completed',
      backupPath,
      deletedByTable
    };
  } catch (error) {
    const err = error as Error;
    await pool.execute(
      `UPDATE stale_cleanup_operations
       SET status = 'failed',
           error_message = ?,
           completed_at = NOW()
       WHERE id = ?`,
      [err.message, input.operationId]
    );
    logger.error('database', '过时数据清理失败', err, { operationId: input.operationId });
    throw err;
  }
};

export const getStaleCleanupOperation = async (operationId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<OperationRow[]>(
    `SELECT id, status, report_hash, backup_path, expires_at, created_by, created_at, completed_at, error_message
     FROM stale_cleanup_operations
     WHERE id = ? LIMIT 1`,
    [operationId]
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  return {
    operationId: r.id,
    status: r.status,
    reportHash: r.report_hash,
    backupPath: r.backup_path,
    expiresAt: new Date(r.expires_at).getTime(),
    createdBy: r.created_by,
    createdAt: new Date(r.created_at).getTime(),
    completedAt: r.completed_at ? new Date(r.completed_at).getTime() : null,
    errorMessage: r.error_message || null
  };
};
