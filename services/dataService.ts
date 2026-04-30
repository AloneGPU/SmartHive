import { BeehiveData, ConnectionMode } from '../types';
import {
  resolveInsideHumidity,
  resolveInsideTemperature,
  resolveOutsideHumidity,
  resolveOutsideTemperature,
  resolvePrimaryHumidity,
  resolvePrimaryTemperature
} from './hiveDataAdapter';

/**
 * 数据服务 - 提供API调用和数据处理功能
 */

/**
 * 带有授权头的数据请求
 */
const authorizedFetch = async (url: string, token: string) => {
  return fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
};

class ApiRequestError extends Error {
  status: number;
  statusText: string;
  detail: string;

  constructor(status: number, statusText: string, detail: string) {
    super(detail);
    this.name = 'ApiRequestError';
    this.status = status;
    this.statusText = statusText;
    this.detail = detail;
  }
}

const parseResponseDetail = async (response: Response) => {
  try {
    const data = await response.clone().json();
    if (data && typeof data === 'object') {
      const d = data as any;
      if (typeof d.message === 'string' && d.message.trim()) {
        return d.message;
      }
      if (typeof d.error === 'string' && d.error.trim()) {
        return d.error;
      }
    }
  } catch {
  }

  try {
    const text = await response.text();
    if (text.trim()) {
      return text;
    }
  } catch {
  }

  return '';
};

const toStatusMessage = (status: number) => {
  if (status === 401) return '登录凭证无效，请重新验证令牌';
  if (status === 403) return '当前账号无权限访问该资源';
  if (status === 404) return '请求资源不存在';
  if (status >= 500) return '服务器异常，请稍后重试';
  return '请求失败，请检查网络或配置';
};

const assertResponseOk = async (response: Response) => {
  if (response.ok) {
    return;
  }
  const detail = await parseResponseDetail(response);
  const friendly = toStatusMessage(response.status);
  const message = detail ? `${friendly}（${detail}）` : friendly;
  throw new ApiRequestError(response.status, response.statusText, message);
};

const assertJsonResponse = async (response: Response, context: string) => {
  const contentType = typeof response?.headers?.get === 'function'
    ? response.headers.get('content-type') || ''
    : '';
  if (!contentType) {
    return;
  }
  if (/application\/json/i.test(contentType)) return;
  // 某些代理/静态站点会把 /api 请求兜底到 index.html（返回200的 text/html）
  // 这里给出更明确的报错，避免 "Unexpected token <"
  const preview = await response.text().catch(() => '');
  const head = preview.replace(/\s+/g, ' ').slice(0, 120);
  const hint = head.includes('<html') || head.includes('<!doctype') || /text\/html/i.test(contentType)
    ? '接口返回了HTML页面，通常是 /api 未正确反向代理到后端（被前端 index.html 或错误页接管）'
    : '接口返回的不是JSON';
  throw new Error(`${context}：${hint}${head ? `（响应片段: ${head}）` : ''}`);
};

export const getFriendlyErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiRequestError) {
    return `${fallback}：${error.detail}`;
  }
  if (error instanceof Error && error.message) {
    return `${fallback}：${error.message}`;
  }
  return fallback;
};

const toFiniteNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
};

// 统一的时间戳规范化函数，处理秒级、毫秒级和异常格式（如YYYYMMDDHHmmss）
const normalizeTimestamp = (value: unknown): number => {
  const now = Date.now();
  
  if (typeof value === 'number') {
    // 1. 如果是秒级时间戳 (小于 1e12，即2001年之前的毫秒数，或者正常的秒数)
    // 一般当前秒级时间戳是 1.7e9 左右
    if (value < 10000000000) { // 小于 100 亿，认为是秒
      return value * 1000;
    }
    
    // 2. 如果是毫秒级时间戳 (正常范围 1.7e12 左右)
    // 3e12 是 2065年，如果小于这个值，认为是正常的毫秒
    if (value < 3000000000000) { 
      return value;
    }

    // 3. 处理 YYYYMMDDHHmmss 格式 (例如 20260108112621)
    // 这种格式通常是 14 位数字，大于 1e13
    if (value > 10000000000000) {
      const str = value.toString();
      if (str.length === 14) {
        const year = parseInt(str.substring(0, 4));
        const month = parseInt(str.substring(4, 6)) - 1; // JS month is 0-indexed
        const day = parseInt(str.substring(6, 8));
        const hour = parseInt(str.substring(8, 10));
        const minute = parseInt(str.substring(10, 12));
        const second = parseInt(str.substring(12, 14));
        const date = new Date(year, month, day, hour, minute, second);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }
    }
    
    // 如果无法识别但数值很大，可能就是未来的时间，原样返回或者返回当前时间？
    // 为了安全，如果偏差太大（比如超过100年），可以回退到当前时间，
    // 但用户可能确实在查看未来预测数据？这里还是保守一点，如果解析失败就返回当前时间。
    return value; 
  }
  
  if (typeof value === 'string') {
    // 尝试解析 ISO 字符串
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  
  return now;
};

export const fetchLiveHiveData = async (baseUrl: string, token: string, _mode: ConnectionMode = 'CLOUD'): Promise<BeehiveData | null> => {
  try {
    const apiUrl = baseUrl || '/api';
    const response = await authorizedFetch(`${apiUrl}/beehive/latest`, token);
    if (response.status === 404) {
      return null;
    }
    await assertResponseOk(response);
    await assertJsonResponse(response, '总览数据加载失败');
    const data = await response.json();
    if (data && (data as any).timestamp) {
        (data as any).timestamp = normalizeTimestamp((data as any).timestamp);
    }
    if (!data) return null;
    const rawLatitude = (data as any).latitude;
    const rawLongitude = (data as any).longitude;
    const latitude = rawLatitude !== null && rawLatitude !== undefined ? Number(rawLatitude) : undefined;
    const longitude = rawLongitude !== null && rawLongitude !== undefined ? Number(rawLongitude) : undefined;
    const insideTemperature = resolveInsideTemperature(data);
    const insideHumidity = resolveInsideHumidity(data);
    const outsideTemperature = resolveOutsideTemperature(data);
    const outsideHumidity = resolveOutsideHumidity(data);
    const temperature = resolvePrimaryTemperature(data);
    const humidity = resolvePrimaryHumidity(data);
    const result: BeehiveData = {
      ...data,
      timestamp: (data as any).timestamp || Date.now(),
      temperature: temperature ?? Number.NaN,
      humidity: humidity ?? Number.NaN,
      insideTemperature: insideTemperature ?? undefined,
      insideHumidity: insideHumidity ?? undefined,
      outsideTemperature: outsideTemperature ?? undefined,
      outsideHumidity: outsideHumidity ?? undefined,
      weight: toFiniteNumber((data as any).weight),
      beesIn: toFiniteNumber((data as any).beesIn),
      beesOut: toFiniteNumber((data as any).beesOut),
      hornetsDetected: toFiniteNumber((data as any).hornetsDetected),
    };
    if (Number.isFinite(latitude)) {
      result.latitude = latitude;
    }
    if (Number.isFinite(longitude)) {
      result.longitude = longitude;
    }
    return result;
  } catch (error) {
    console.error('获取数据失败:', error);
    throw error;
  }
};

export const fetchHistoryData = async (baseUrl: string, token: string, limit: number = 40, _mode: ConnectionMode = 'CLOUD'): Promise<any[]> => {
  try {
    const safeLimit = Math.min(Math.max(1, limit), 1000);
    const apiUrl = baseUrl || '/api';
    const response = await authorizedFetch(`${apiUrl}/beehive/history?limit=${safeLimit}`, token);
    await assertResponseOk(response);
    await assertJsonResponse(response, '历史数据加载失败');
    const data = await response.json() as any[];
    
    if (!data || data.length === 0) {
      return [];
    }

    return data.map(item => {
      const timestamp = normalizeTimestamp(item.timestamp);
      const insideTemperature = resolveInsideTemperature(item);
      const insideHumidity = resolveInsideHumidity(item);
      const outsideTemperature = resolveOutsideTemperature(item);
      const outsideHumidity = resolveOutsideHumidity(item);
      const temperature = resolvePrimaryTemperature(item);
      const humidity = resolvePrimaryHumidity(item);
      return {
        ...item,
        timestamp,
        time: new Date(timestamp).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        timeShort: new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        temp: temperature ?? Number.NaN,
        temperature: temperature ?? Number.NaN,
        humidity: humidity ?? Number.NaN,
        insideTemperature: insideTemperature ?? undefined,
        insideHumidity: insideHumidity ?? undefined,
        outsideTemperature: outsideTemperature ?? undefined,
        outsideHumidity: outsideHumidity ?? undefined,
        weight: toFiniteNumber(item.weight),
        beesIn: toFiniteNumber(item.beesIn),
        beesOut: toFiniteNumber(item.beesOut),
        hornetsDetected: toFiniteNumber(item.hornetsDetected),
      };
    }).reverse();
  } catch (error) {
    console.error('获取历史数据失败:', error);
    throw error;
  }
};

export const fetchHiveRangeData = async (
  baseUrl: string,
  token: string,
  startMs: number,
  endMs: number,
  limit: number = 5000,
  offset: number = 0,
  _mode: ConnectionMode = 'CLOUD'
): Promise<any[]> => {
  try {
    const apiUrl = baseUrl || '/api';
    const safeLimit = Math.min(Math.max(1, limit), 5000);
    const safeOffset = Math.max(0, offset);
    const response = await authorizedFetch(
      `${apiUrl}/beehive/range?start=${encodeURIComponent(String(startMs))}&end=${encodeURIComponent(String(endMs))}&limit=${safeLimit}&offset=${safeOffset}`,
      token
    );
    await assertResponseOk(response);
    await assertJsonResponse(response, '范围数据加载失败');
    const data = await response.json() as any[];
    if (!Array.isArray(data) || data.length === 0) return [];

    return data.map((item) => {
      const timestamp = normalizeTimestamp(item.timestamp);
      const rawLatitude = item.latitude;
      const rawLongitude = item.longitude;
      const latitude = rawLatitude !== null && rawLatitude !== undefined ? Number(rawLatitude) : undefined;
      const longitude = rawLongitude !== null && rawLongitude !== undefined ? Number(rawLongitude) : undefined;
      const insideTemperature = resolveInsideTemperature(item);
      const insideHumidity = resolveInsideHumidity(item);
      const outsideTemperature = resolveOutsideTemperature(item);
      const outsideHumidity = resolveOutsideHumidity(item);
      const temperature = resolvePrimaryTemperature(item);
      const humidity = resolvePrimaryHumidity(item);
      const result: any = {
        ...item,
        timestamp,
        temperature: temperature ?? Number.NaN,
        humidity: humidity ?? Number.NaN,
        insideTemperature: insideTemperature ?? undefined,
        insideHumidity: insideHumidity ?? undefined,
        outsideTemperature: outsideTemperature ?? undefined,
        outsideHumidity: outsideHumidity ?? undefined,
        weight: toFiniteNumber(item.weight),
        beesIn: toFiniteNumber(item.beesIn),
        beesOut: toFiniteNumber(item.beesOut),
        hornetsDetected: toFiniteNumber(item.hornetsDetected),
      };
      if (Number.isFinite(latitude)) {
        result.latitude = latitude;
      }
      if (Number.isFinite(longitude)) {
        result.longitude = longitude;
      }
      return result;
    });
  } catch (error) {
    console.error('获取范围数据失败:', error);
    throw error;
  }
};

export type CalendarSummaryDay = { date: string; count: number; minTs: number; maxTs: number };
export type CalendarSummaryResponse = { month: string; tz: string; days: CalendarSummaryDay[]; version: string };
export type DayDetailResponse = {
  date: string;
  tz: string;
  points: BeehiveData[];
  sample: { mode: 'none' | 'lttb'; rawCount: number; returnedCount: number };
};

export const fetchCalendarSummary = async (baseUrl: string, token: string, month: string, tz: string): Promise<CalendarSummaryResponse> => {
  const apiUrl = baseUrl || '/api';
  const response = await authorizedFetch(
    `${apiUrl}/beehive/calendar-summary?month=${encodeURIComponent(month)}&tz=${encodeURIComponent(tz)}`,
    token
  );
  await assertResponseOk(response);
  const data = (await response.json()) as CalendarSummaryResponse;
  return {
    month: String(data?.month || month),
    tz: String((data as any)?.tz || tz),
    days: Array.isArray((data as any)?.days)
      ? (data as any).days.map((d: any) => ({
          date: String(d?.date || ''),
          count: Number(d?.count || 0),
          minTs: normalizeTimestamp(d?.minTs),
          maxTs: normalizeTimestamp(d?.maxTs)
        }))
      : [],
    version: String((data as any)?.version || 'v2')
  };
};

export const fetchDayDetail = async (baseUrl: string, token: string, date: string, tz: string, sample: 'auto' | 'none' = 'auto'): Promise<DayDetailResponse> => {
  const apiUrl = baseUrl || '/api';
  const response = await authorizedFetch(
    `${apiUrl}/beehive/day-detail?date=${encodeURIComponent(date)}&tz=${encodeURIComponent(tz)}&sample=${encodeURIComponent(sample)}`,
    token
  );
  await assertResponseOk(response);
  const data = (await response.json()) as DayDetailResponse;
  const points = Array.isArray((data as any)?.points) ? (data as any).points : [];
    return {
      date: String((data as any)?.date || date),
      tz: String((data as any)?.tz || tz),
      points: points.map((item: any) => {
        const timestamp = normalizeTimestamp(item.timestamp);
        const latitude = Number(item.latitude);
        const longitude = Number(item.longitude);
        const insideTemperature = resolveInsideTemperature(item);
        const insideHumidity = resolveInsideHumidity(item);
        const outsideTemperature = resolveOutsideTemperature(item);
        const outsideHumidity = resolveOutsideHumidity(item);
        const temperature = resolvePrimaryTemperature(item);
        const humidity = resolvePrimaryHumidity(item);
        return {
          ...item,
          timestamp,
          temperature: temperature ?? Number.NaN,
          humidity: humidity ?? Number.NaN,
          insideTemperature: insideTemperature ?? undefined,
          insideHumidity: insideHumidity ?? undefined,
          outsideTemperature: outsideTemperature ?? undefined,
          outsideHumidity: outsideHumidity ?? undefined,
          weight: toFiniteNumber(item.weight),
          beesIn: toFiniteNumber(item.beesIn),
          beesOut: toFiniteNumber(item.beesOut),
        hornetsDetected: toFiniteNumber(item.hornetsDetected),
        latitude: Number.isFinite(latitude) ? latitude : undefined,
        longitude: Number.isFinite(longitude) ? longitude : undefined
      };
    }),
    sample: {
      mode: (data as any)?.sample?.mode === 'lttb' ? 'lttb' : 'none',
      rawCount: Number((data as any)?.sample?.rawCount || points.length),
      returnedCount: Number((data as any)?.sample?.returnedCount || points.length)
    }
  };
};

const parseServiceErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const data = await response.json();
    const message = typeof data?.message === 'string' ? data.message.trim() : '';
    const detail = typeof data?.error === 'string' ? data.error.trim() : '';
    return [message, detail].filter(Boolean).join(': ') || fallback;
  } catch {
    return fallback;
  }
};

export const reverseGeocode = async (baseUrl: string, token: string, latitude: number, longitude: number): Promise<any | null> => {
  try {
    const apiUrl = baseUrl || '/api';
    const url = `${apiUrl}/geocode/reverse?lat=${latitude}&lon=${longitude}`;
    const response = await authorizedFetch(url, token);
    if (!response.ok) {
      return {
        errorMessage: await parseServiceErrorMessage(response, '地址解析失败')
      };
    }
    return await response.json();
  } catch (error) {
    console.error('定位解析失败:', error);
    return {
      errorMessage: error instanceof Error ? error.message : '地址解析失败'
    };
  }
};

export const fetchWeatherData = async (latitude: number, longitude: number): Promise<any | null> => {
    try {
        // 使用 Open-Meteo 免费天气 API (不需要 Key)
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('天气数据获取失败');
        return await response.json();
    } catch (error) {
        console.error('天气 API 错误:', error);
        return null;
    }
};

/**
 * 测试后端连接连通性（health端点不需要token）
 */
export const testConnection = async (baseUrl: string, token: string, mode: ConnectionMode = 'CLOUD'): Promise<boolean> => {
  void token;
  void mode;
  try {
    const apiUrl = baseUrl || '/api';
    const response = await fetch(`${apiUrl}/health`);
    return response.ok;
  } catch (e) {
    return false;
  }
};

// Keep the old function name for backwards compatibility
export const testGatewayConnection = testConnection;

export type IotSensorPoint = {
  timestamp: number;
  deviceId: string;
  sensorType: string;
  value: number;
  unit?: string;
  qos?: number;
};

export type IotMonitorSnapshot = {
  mqtt: {
    connected: boolean;
    reconnects: number;
    receivedMessages: number;
    persistedPoints: number;
    skippedPointsByBucket?: number;
    droppedMessages: number;
    startedAt: number;
    storageBucketMinutes?: number;
    lastError?: string;
  };
  stream: {
    connectedClients: number;
  };
  devices: Array<{
    deviceId: string;
    online: boolean;
    lastSeenAt: number;
    packetsReceived: number;
    packetsDropped: number;
  }>;
};

export type StaleDataRuleInput = {
  tableName: 'hive_data' | 'iot_telemetry' | 'vision_recognition';
  retentionDays: number;
  maxDeleteRows?: number;
};

export type StaleDataReportResponse = {
  operationId: string;
  confirmationToken: string;
  expiresAt: number;
  report: {
    reportId: string;
    createdAt: number;
    reportHash: string;
    summary: {
      totalCandidateRows: number;
      totalPlannedDeleteRows: number;
      estimatedBackupBytes: number;
    };
    tableSummaries: Array<{
      tableName: string;
      retentionDays: number;
      cutoffTs: number;
      candidateRows: number;
      plannedDeleteRows: number;
      estimatedBytes: number;
      riskLevel: 'low' | 'medium' | 'high';
    }>;
    aiInsights: {
      dataScale: string;
      typeDistribution: string;
      potentialValue: string;
      recommendation: string;
      confidence: number;
    };
  };
};

export type StaleCleanupExecuteResponse = {
  operationId: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  backupPath: string;
  deletedByTable: Record<string, number>;
};

export type StaleCleanupOperation = {
  operationId: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  reportHash: string;
  backupPath: string | null;
  expiresAt: number;
  createdBy: string;
  createdAt: number;
  completedAt: number | null;
  errorMessage: string | null;
};

export const fetchIotLatest = async (baseUrl: string, token: string, deviceId: string): Promise<IotSensorPoint[]> => {
  const apiUrl = baseUrl || '/api';
  const response = await authorizedFetch(`${apiUrl}/iot/latest?deviceId=${encodeURIComponent(deviceId)}`, token);
  await assertResponseOk(response);
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((r: any) => ({
    timestamp: normalizeTimestamp(r.timestamp),
    deviceId: String(r.deviceId || ''),
    sensorType: String(r.sensorType || ''),
    value: toFiniteNumber(r.value),
    unit: r.unit ? String(r.unit) : undefined,
    qos: Number.isFinite(Number(r.qos)) ? Number(r.qos) : undefined
  }));
};

export const fetchIotHistory = async (baseUrl: string, token: string, params: {
  deviceId?: string;
  sensorType?: string;
  start?: number;
  end?: number;
  limit?: number;
}): Promise<IotSensorPoint[]> => {
  const apiUrl = baseUrl || '/api';
  const search = new URLSearchParams();
  if (params.deviceId) search.set('deviceId', params.deviceId);
  if (params.sensorType) search.set('sensorType', params.sensorType);
  if (Number.isFinite(params.start)) search.set('start', String(params.start));
  if (Number.isFinite(params.end)) search.set('end', String(params.end));
  if (Number.isFinite(params.limit)) search.set('limit', String(params.limit));
  const response = await authorizedFetch(`${apiUrl}/iot/history?${search.toString()}`, token);
  await assertResponseOk(response);
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((r: any) => ({
    timestamp: normalizeTimestamp(r.timestamp),
    deviceId: String(r.deviceId || ''),
    sensorType: String(r.sensorType || ''),
    value: toFiniteNumber(r.value),
    unit: r.unit ? String(r.unit) : undefined,
    qos: Number.isFinite(Number(r.qos)) ? Number(r.qos) : undefined
  }));
};

export const fetchIotMonitor = async (baseUrl: string, token: string): Promise<IotMonitorSnapshot> => {
  const apiUrl = baseUrl || '/api';
  const response = await authorizedFetch(`${apiUrl}/iot/monitor`, token);
  await assertResponseOk(response);
  await assertJsonResponse(response, '监控状态加载失败');
  return await response.json() as IotMonitorSnapshot;
};

export const createStaleDataReport = async (
  baseUrl: string,
  token: string,
  payload?: { createdBy?: string; rules?: StaleDataRuleInput[] }
): Promise<StaleDataReportResponse> => {
  const apiUrl = baseUrl || '/api';
  const response = await fetch(`${apiUrl}/system/stale-data/report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });
  await assertResponseOk(response);
  await assertJsonResponse(response, '生成过时数据报告失败');
  return (await response.json()) as StaleDataReportResponse;
};

export const executeStaleDataCleanup = async (
  baseUrl: string,
  token: string,
  payload: {
    operationId: string;
    reportHash: string;
    confirmationToken: string;
    confirmText: string;
    operator?: string;
  }
): Promise<StaleCleanupExecuteResponse> => {
  const apiUrl = baseUrl || '/api';
  const response = await fetch(`${apiUrl}/system/stale-data/cleanup`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  await assertResponseOk(response);
  await assertJsonResponse(response, '执行过时数据清理失败');
  return (await response.json()) as StaleCleanupExecuteResponse;
};

export const fetchStaleCleanupOperation = async (
  baseUrl: string,
  token: string,
  operationId: string
): Promise<StaleCleanupOperation> => {
  const apiUrl = baseUrl || '/api';
  const response = await authorizedFetch(`${apiUrl}/system/stale-data/operation/${encodeURIComponent(operationId)}`, token);
  await assertResponseOk(response);
  await assertJsonResponse(response, '获取清理任务状态失败');
  return (await response.json()) as StaleCleanupOperation;
};

export const exportIotHistoryCsv = async (baseUrl: string, token: string, params: {
  deviceId?: string;
  sensorType?: string;
  start?: number;
  end?: number;
}) => {
  const apiUrl = baseUrl || '/api';
  const search = new URLSearchParams();
  if (params.deviceId) search.set('deviceId', params.deviceId);
  if (params.sensorType) search.set('sensorType', params.sensorType);
  if (Number.isFinite(params.start)) search.set('start', String(params.start));
  if (Number.isFinite(params.end)) search.set('end', String(params.end));
  const response = await authorizedFetch(`${apiUrl}/iot/export?${search.toString()}`, token);
  await assertResponseOk(response);
  return await response.blob();
};

export const exportBeehiveHistoryCsv = async (baseUrl: string, token: string, params: {
  start?: number;
  end?: number;
}) => {
  const apiUrl = baseUrl || '/api';
  const search = new URLSearchParams();
  if (Number.isFinite(params.start)) search.set('start', String(params.start));
  if (Number.isFinite(params.end)) search.set('end', String(params.end));
  const response = await authorizedFetch(`${apiUrl}/beehive/export?${search.toString()}`, token);
  await assertResponseOk(response);
  return await response.blob();
};

export const normalizeBeehiveData = (dataRaw: any): BeehiveData => {
  if (!dataRaw) {
    throw new Error('No data to normalize');
  }

  // Type assertion to bypass strict typing for normalization logic
  const data = dataRaw as Record<string, any>;

  // Handle nested format
  if (data.status && typeof data.status === 'object') {
    return normalizeBeehiveData(data.status);
  }

  if (data && (data as any).timestamp) {
    (data as any).timestamp = normalizeTimestamp((data as any).timestamp);
  }

  const rawLatitude = (data as any).latitude;
  const rawLongitude = (data as any).longitude;

  const insideTemperature = resolveInsideTemperature(data);
  const insideHumidity = resolveInsideHumidity(data);
  const outsideTemperature = resolveOutsideTemperature(data);
  const outsideHumidity = resolveOutsideHumidity(data);
  const temperature = resolvePrimaryTemperature(data);
  const humidity = resolvePrimaryHumidity(data);

  const result: BeehiveData = {
    ...data,
    timestamp: (data as any).timestamp || Date.now(),
    temperature: temperature ?? Number.NaN,
    humidity: humidity ?? Number.NaN,
    insideTemperature: insideTemperature ?? undefined,
    insideHumidity: insideHumidity ?? undefined,
    outsideTemperature: outsideTemperature ?? undefined,
    outsideHumidity: outsideHumidity ?? undefined,
    weight: toFiniteNumber((data as any).weight),
    beesIn: toFiniteNumber((data as any).beesIn),
    beesOut: toFiniteNumber((data as any).beesOut),
    hornetsDetected: toFiniteNumber((data as any).hornetsDetected),
  };

  // Convert coordinate strings to numbers if they exist
  if (rawLatitude !== undefined && rawLatitude !== null && rawLatitude !== '') {
    const parsedLat = Number(rawLatitude);
    if (Number.isFinite(parsedLat)) {
      result.latitude = parsedLat;
    }
  }

  if (rawLongitude !== undefined && rawLongitude !== null && rawLongitude !== '') {
    const parsedLon = Number(rawLongitude);
    if (Number.isFinite(parsedLon)) {
      result.longitude = parsedLon;
    }
  }

  return result;
};
