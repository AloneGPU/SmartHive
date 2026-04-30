import { z } from 'zod';
import { BeehiveData } from '../types';

const AnalysisSchema = z.object({
  healthScore: z.number().min(0).max(100),
  summary: z.string().min(1),
  recommendations: z.array(z.string().min(1)).min(1).max(6),
  events: z.array(z.object({
    type: z.enum(['info', 'warning', 'critical']),
    msg: z.string().min(1),
    timestamp: z.number().optional()
  })).max(20),
  detailedAnalysis: z.object({
    environment: z.string().min(1),
    behavior: z.string().min(1),
    production: z.string().min(1),
    risks: z.string().min(1)
  }).optional(),
  lastUpdated: z.number()
});

export type AIAnalysisResult = z.infer<typeof AnalysisSchema>;

interface QwenChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const toStats = (historyData: BeehiveData[]) => {
  const list = historyData.filter((p) => Number.isFinite(p.timestamp)).slice(-2000);
  if (list.length === 0) return null;
  const first = list[0];
  const last = list[list.length - 1];
  const minMax = (arr: number[]) => {
    let min = arr[0];
    let max = arr[0];
    for (const v of arr) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { min, max };
  };
  const temps = list.map((p) => Number(p.temperature ?? 0));
  const hums = list.map((p) => Number(p.humidity ?? 0));
  const wgts = list.map((p) => Number(p.weight ?? 0));
  return {
    points: list.length,
    range: { start: first.timestamp, end: last.timestamp },
    temperature: { ...minMax(temps), latest: last.temperature },
    humidity: { ...minMax(hums), latest: last.humidity },
    weight: { ...minMax(wgts), latest: last.weight },
    activityLatest: { beesIn: last.beesIn ?? 0, beesOut: last.beesOut ?? 0, hornetsDetected: (last as any).hornetsDetected ?? 0 }
  };
};

const dashscopeUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

const extractJson = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return '';
};

// 浏览器端仅保留 analyzeHiveHealth；对话与语音能力由后端 `/api/ai/*` 提供

export const analyzeHiveHealth = async (
  latest: BeehiveData,
  historyData: BeehiveData[],
  options: { apiKey: string; modelName?: string }
): Promise<AIAnalysisResult> => {
  const apiKey = (options.apiKey || '').trim();
  const model = (options.modelName || 'qwen-flash').trim() || 'qwen-flash';
  if (!apiKey) {
    throw new Error('未配置通义千问 API Key，已禁止使用任何模拟分析结果');
  }

  const stats = toStats(historyData);
  const now = Date.now();
  const prompt = {
    latest,
    stats,
    requirements: {
      language: 'zh-CN',
      output: 'json',
      schema: 'AIAnalysisResult'
    }
  };

  const response = await fetch(dashscopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: [
            '你是一位资深养蜂专家与数据分析师。',
            '只允许输出 JSON，不要输出任何解释文字。',
            '请严格按给定 schema 输出，字段齐全。',
            'healthScore: 0-100（越高越健康）。',
            'events.type 只能是 info/warning/critical。'
          ].join('\n')
        },
        { role: 'user', content: JSON.stringify(prompt) }
      ],
      temperature: 0.2,
      max_tokens: 1200
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 401) throw new Error('通义千问 API Key 无效或无权限（401）');
    if (response.status === 429) throw new Error('通义千问调用频率受限（429），请稍后重试');
    throw new Error(`通义千问请求失败：HTTP ${response.status} ${response.statusText}${text ? `（${text.slice(0, 160)}）` : ''}`);
  }

  const payload = (await response.json().catch(() => ({}))) as QwenChatResponse;
  const content = payload?.choices?.[0]?.message?.content || '';
  const jsonText = extractJson(content);
  if (!jsonText) {
    throw new Error('通义千问未返回可解析的 JSON（已禁止回退到模拟结果）');
  }

  const parsed = AnalysisSchema.safeParse({ ...JSON.parse(jsonText), lastUpdated: now });
  if (!parsed.success) {
    throw new Error(`通义千问返回结构不符合要求（已禁止回退到模拟结果）`);
  }

  return parsed.data;
};

export default {
  analyzeHiveHealth,
  // 服务端能力已迁移到 `qwenService.server.ts`
};
