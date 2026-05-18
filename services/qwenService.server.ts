import { aiQueryService, type QueryResult } from './aiQueryService';
import { logger } from './logger';

const dashscopeUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

type QwenMessage = {
  role: string;
  content: string;
};

interface QwenChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const INTERNAL_TERM_MAP: Record<string, string> = {
  hive_data: '蜂箱历史数据',
  iot_telemetry: '传感器历史数据',
  iot_device_status: '设备状态数据',
  vision_recognition: '视觉识别数据',
  system_config: '系统配置',
  insideTemperature: '内部温度',
  insideHumidity: '内部湿度',
  outsideTemperature: '外部温度',
  outsideHumidity: '外部湿度',
  beesIn: '进蜂数量',
  beesOut: '出蜂数量',
  hornetsDetected: '胡蜂检测数量',
  device_id: '设备编号',
  last_seen_at: '最近在线时间',
  last_rssi: '信号强度'
};

const stripCodeFence = (text: string): string => text
  .replace(/```sql/gi, '')
  .replace(/```json/gi, '')
  .replace(/```/g, '')
  .replace(/\r/g, '')
  .trim();

export const extractSQL = (text: string): string | null => {
  const sqlMatch = text.match(/```sql\s*([\s\S]*?)```/i);
  if (sqlMatch) {
    return stripCodeFence(sqlMatch[1]).replace(/;+$/g, '').trim() || null;
  }

  const selectMatch = text.match(
    /((?:WITH|SELECT)\s+[\s\S]*?(?:LIMIT\s+\d+(?:\s*,\s*\d+|\s+OFFSET\s+\d+)?)?)(?:;|\s*$)/i
  );
  if (selectMatch) return stripCodeFence(selectMatch[1]).replace(/;+$/g, '').trim() || null;

  return null;
};

const summarizeNumericColumn = (name: string, values: number[]): string => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const last = values[values.length - 1];
  const delta = values.length >= 2 ? last - values[0] : 0;
  return `- ${name}: 样本${values.length}条，最小 ${min.toFixed(2)}，最大 ${max.toFixed(2)}，均值 ${avg.toFixed(2)}，最新 ${last.toFixed(2)}，相对首条变化 ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`;
};

export const buildQueryAnalysisSummary = (queryResult: QueryResult): string => {
  const rows = Array.isArray(queryResult.data) ? queryResult.data.slice(0, 12) : [];
  const rowCount = queryResult.rowCount ?? rows.length;
  if (!rowCount) {
    return [
      '内部查询状态：成功，但当前时间范围内没有命中记录。',
      '这意味着不能直接得出趋势结论，需要提醒用户缩小问题范围或确认是否真的有数据。'
    ].join('\n');
  }

  const columns = queryResult.columns?.length ? queryResult.columns : Object.keys(rows[0] || {});
  const numericStats = columns
    .map((column) => {
      const values = rows
        .map((row) => Number(row?.[column]))
        .filter((value) => Number.isFinite(value));
      return values.length > 0 ? summarizeNumericColumn(column, values) : null;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 8);

  const timeColumn = columns.find((column) => /(timestamp|time|date|seen_at)$/i.test(column));
  let timeSummary = '';
  if (timeColumn) {
    const timeValues = rows
      .map((row) => Number(row?.[timeColumn]))
      .filter((value) => Number.isFinite(value));
    if (timeValues.length > 0) {
      timeSummary = `时间覆盖：${timeColumn} 从 ${Math.min(...timeValues)} 到 ${Math.max(...timeValues)}`;
    }
  }

  const sampleRows = JSON.stringify(rows.slice(0, 5), null, 2);
  return [
    `内部查询状态：成功，共 ${rowCount} 条记录。`,
    timeSummary,
    numericStats.length > 0 ? `数值字段摘要：\n${numericStats.join('\n')}` : '当前返回结果以明细记录为主，没有稳定的数值汇总字段。',
    '以下示例记录仅供内部推理，不能在最终回答中原样展示，也不要复述字段名、表名或 JSON 结构：',
    '```json',
    sampleRows,
    '```'
  ].filter(Boolean).join('\n');
};

export const sanitizeAssistantAnswer = (text: string): string => {
  let result = (text || '')
    .replace(/```sql[\s\S]*?```/gi, '')
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\/api\/ai\/[a-z-_/]+/gi, '内部接口')
    .replace(/\bSELECT\b[\s\S]*?(?=\n|$)/gi, '')
    .replace(/\bFROM\b\s+[a-zA-Z0-9_`.,\s]+/gi, '');

  for (const [term, replacement] of Object.entries(INTERNAL_TERM_MAP)) {
    result = result.replace(new RegExp(`\\b${term}\\b`, 'g'), replacement);
  }

  result = result
    .replace(/(数据表|表名|字段名|后端接口|后端数据|SQL语句|SQL查询|JSON结构|代码块)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return result || '抱歉，我暂时无法给出可靠结论，请换一个更明确的问题或缩小时间范围后再试。';
};

const buildPlannerPrompt = (dbSchema: string): string => `你是一位专业的智能蜂箱分析助手，可以使用数据库查询历史数据。

你的任务分两种：
1. 如果用户问题不需要查库，直接给出中文回答。
2. 如果用户问题需要查库，你只能输出一个 \`\`\`sql\`\`\` 代码块，除此之外不要输出任何解释、标题、结论或多余文字。

查询规则：
- 只能使用 SELECT 或 WITH ... SELECT。
- 只查询与用户问题直接相关的数据。
- 优先做聚合、统计、时间范围过滤，避免无意义明细。
- 必须带 LIMIT；如果是趋势分析，优先返回聚合后的时间序列。
- 时间戳字段是毫秒级 Unix 时间戳。

最终面向用户的回答规则：
- 不要泄露内部实现，不要提表名、字段名、SQL、接口、后端、JSON。
- 只说业务结论、关键数据、趋势判断和建议。

数据库 Schema（仅供你内部理解）：
${dbSchema}`;

const buildAnalysisPrompt = (dbSchema: string): string => `你是一位专业的智能蜂箱分析助手。系统已经完成内部查询，你现在只负责把结果转成用户能理解的中文结论。

回答要求：
1. 不要提表名、字段名、SQL、接口、后端、JSON、代码块。
2. 先直接回答结论，再补充关键数据，最后给 1-3 条可执行建议。
3. 涉及风险、异常、健康判断时，要明确严重程度和优先级。
4. 如果数据不足，明确说“当前数据不足以判断”，再说明还需要什么数据。
5. 只根据给定上下文和内部查询摘要作答，不要编造。

Schema 仅供你理解字段含义，不能向用户暴露：
${dbSchema}`;

const formatQwenError = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => '');
  if (response.status === 401) return '通义千问 API Key 无效或无权限。';
  if (response.status === 429) return '通义千问调用频率受限，请稍后重试。';
  return `通义千问请求失败：HTTP ${response.status}${text ? `（${text.slice(0, 120)}）` : ''}`;
};

const callQwenChat = async (
  apiKey: string,
  model: string,
  messages: QwenMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ ok: true; content: string } | { ok: false; error: string }> => {
  const response = await fetch(dashscopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2000
    })
  });

  if (!response.ok) {
    return { ok: false, error: await formatQwenError(response) };
  }

  const payload = (await response.json().catch(() => ({}))) as QwenChatResponse;
  return { ok: true, content: payload?.choices?.[0]?.message?.content || '' };
};

/**
 * 服务端：对话处理，支持生成 SQL -> 执行 -> 回填结果再回答
 */
export const processChatMessage = async (
  message: string,
  context: { apiKey: string; modelName?: string; history?: Array<{ role: string; content: string }> }
): Promise<string> => {
  const apiKey = (context.apiKey || '').trim();
  const model = (context.modelName || 'qwen-flash').trim() || 'qwen-flash';
  if (!apiKey) {
    return '未配置通义千问 API Key，无法使用AI对话功能。';
  }

  const dbSchema = aiQueryService.getSchemaDescription();
  const planningResult = await callQwenChat(
    apiKey,
    model,
    [
      { role: 'system', content: buildPlannerPrompt(dbSchema) },
      ...(context.history || []),
      { role: 'user', content: message }
    ],
    { temperature: 0.2, maxTokens: 1600 }
  );

  if (!planningResult.ok) {
    return planningResult.error;
  }

  const content = planningResult.content || '';

  const sqlQuery = extractSQL(content);
  if (sqlQuery) {
    logger.info('api', 'AI生成SQL查询', { sql: sqlQuery.substring(0, 160) });

    let queryResult = await aiQueryService.executeQuery(sqlQuery);

    // 首次查询失败时，用修正 prompt 重试一次（AI 可能幻觉出不存在的表）
    if (!queryResult.success) {
      logger.info('api', 'AI SQL 首次执行失败，尝试修正重试', { error: queryResult.error });
      const retryResult = await callQwenChat(
        apiKey,
        model,
        [
          { role: 'system', content: buildPlannerPrompt(dbSchema) + '\n\n【重要】你上次生成的 SQL 执行失败，错误信息如下。请严格只使用上述 Schema 中列出的 4 张表（hive_data、iot_telemetry、iot_device_status、vision_recognition），不要使用任何其他表名。只输出修正后的 SQL 代码块。' },
          { role: 'user', content: message },
          { role: 'assistant', content: content },
          { role: 'user', content: `上次 SQL 执行失败：${queryResult.error}\n请修正后重新生成。` }
        ],
        { temperature: 0.1, maxTokens: 1600 }
      );

      if (retryResult.ok) {
        const retrySql = extractSQL(retryResult.content);
        if (retrySql) {
          logger.info('api', 'AI修正SQL查询', { sql: retrySql.substring(0, 160) });
          queryResult = await aiQueryService.executeQuery(retrySql);
        }
      }
    }

    if (!queryResult.success) {
      return sanitizeAssistantAnswer(
        '抱歉，这次查询未能成功。请尝试换一种问法，例如指定更具体的时间范围（”最近24小时””本周”）或明确指标名称（温度、湿度、重量等）。'
      );
    }

    const analysisResult = await callQwenChat(
      apiKey,
      model,
      [
        { role: 'system', content: buildAnalysisPrompt(dbSchema) },
        ...(context.history || []),
        { role: 'user', content: message },
        { role: 'user', content: `【内部数据查询摘要】\n${buildQueryAnalysisSummary(queryResult)}` }
      ],
      { temperature: 0.3, maxTokens: 1800 }
    );

    if (!analysisResult.ok) {
      return analysisResult.error;
    }

    return sanitizeAssistantAnswer(analysisResult.content);
  }

  return sanitizeAssistantAnswer(content || '抱歉，我暂时无法回答这个问题。');
};

/**
 * 服务端：语音转文字（DashScope compatible ASR）
 */
export const transcribeAudioToText = async (
  audioBuffer: Buffer,
  options: { apiKey: string; modelName?: string }
): Promise<string> => {
  const apiKey = (options.apiKey || '').trim();
  const model = (options.modelName || 'paraformer-realtime-v2').trim() || 'paraformer-realtime-v2';
  if (!apiKey) {
    throw new Error('未配置通义千问 API Key');
  }

  const formData = new FormData();
  formData.append('model', model);
  formData.append('file', new Blob([audioBuffer]), 'audio.wav');

  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 401) throw new Error('通义千问 API Key 无效或无权限（401）');
    if (response.status === 429) throw new Error('通义千问调用频率受限（429），请稍后重试');
    throw new Error(`语音识别失败：HTTP ${response.status}${text ? `（${text.slice(0, 160)}）` : ''}`);
  }

  const payload = (await response.json().catch(() => ({}))) as { text?: string };
  return payload.text || '';
};

// 仅用于保持导出形态一致（部分地方可能引用默认导出）
export default {
  processChatMessage,
  transcribeAudioToText
};
