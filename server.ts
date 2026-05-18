import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import { z } from 'zod';
import * as http from 'node:http';
import * as https from 'node:https';
import {
  testDatabaseConnection,
  fetchLiveHiveDataFromDB,
  fetchHistoryDataFromDB,
  fetchRangeHiveDataFromDB,
  fetchCalendarSummaryFromDB,
  fetchLatestLocationFromHiveData,
  fetchLatestLocationFromIot,
  insertBeehiveData,
  initializeDatabase,
  getSystemConfig,
  updateSystemConfig,
  fetchIotDeviceStatuses,
  fetchIotHistory,
  fetchIotLatestByDevice,
  insertIotTelemetryBatch,
  upsertIotDeviceStatus
} from './services/databaseService';
import { loadConfigToEnv, readConfig, writeConfig } from './services/configService';
import { BeehiveData } from './types';
import { realtimeHub } from './services/realtimeHub';
import { getMqttIngestStats, startMqttIngestService } from './services/mqttIngestService';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { timingSafeEqual } from 'node:crypto';
import {
  parseTzOffsetMinutes,
  parseMonthParam,
  parseDateParam,
  toUtcRangeForLocalMonth,
  toUtcRangeForLocalDay,
  hexToAscii,
  parseNmeaFromText,
  downsampleBeehiveData
} from './services/utils';
import { processChatMessage, transcribeAudioToText } from './services/qwenService.server';
import {
  buildIotDeviceStatus,
  getStorageBucketMinutes,
  normalizeSensors,
  selectTelemetryPointsForPersistence
} from './services/iotBridge';
import { logger } from './services/logger';
import { dataConsistencyChecker } from './services/dataConsistencyChecker';
import { dataMappingValidator } from './services/dataMappingValidator';
import { aiQueryService } from './services/aiQueryService';
import {
  createStaleDataReport,
  executeStaleDataCleanup,
  getStaleCleanupOperation
} from './services/staleDataCleanupService';

dotenv.config();
// 加载配置到环境变量
loadConfigToEnv();

/**
 * 限制 /api/vision/proxy 可访问的上游主机，降低 SSRF 风险。
 * - 若设置 VISION_PROXY_ALLOWED_HOSTS（逗号分隔），仅允许列表中的主机名（全小写比对）。
 * - 未设置时：允许 localhost、私网 IPv4、链路本地 169.254.*、*.local、mDNS 常见名。
 */
const isVisionProxyHostnameAllowed = (hostname: string): boolean => {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  const explicit = (process.env.VISION_PROXY_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (explicit.length > 0) {
    return explicit.includes(h);
  }
  if (h === 'localhost' || h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (h.endsWith('.local')) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    const c = Number(ipv4[3]);
    const d = Number(ipv4[4]);
    if ([a, b, c, d].some((n) => n > 255)) return false;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  return false;
};

const timingSafePasswordEqual = (plain: string, expected: string): boolean => {
  try {
    const a = Buffer.from(plain, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

const normalizeGaodeApiKey = (value: unknown): string => {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key) return '';
  const lowered = key.toLowerCase();
  if (
    lowered === 'your-gaode-api-key' ||
    lowered === 'your_amap_key' ||
    key === '你的高德地图API密钥' ||
    key === '你的高德地图API密钥（可选）'
  ) {
    return '';
  }
  return key;
};

const normalizeQwenApiKey = (value: unknown): string => {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key) return '';
  if (key === '你的通义千问API密钥' || key.toLowerCase() === 'your-qwen-api-key') {
    return '';
  }
  return key;
};

const getSystemConfigSnapshot = async () => {
  const fileConfig = readConfig();
  let dbConfig: Record<string, any> = {};
  try {
    dbConfig = await getSystemConfig();
  } catch (error) {
    console.warn('[config] failed to read system config from database, fallback to config.json:', error);
  }

  const gaodeApiKey = normalizeGaodeApiKey(
    dbConfig.gaode_api_key || fileConfig.gaodeApiKey || process.env.GAODE_API_KEY || ''
  );
  const qwenApiKey = normalizeQwenApiKey(
    dbConfig.qwen_api_key || fileConfig.qwenApiKey || process.env.QWEN_API_KEY || ''
  );
  const apiToken = (process.env.API_TOKEN || dbConfig.api_token || fileConfig.apiToken || '').trim();
  const videoStreamModeRaw =
    dbConfig.video_stream_mode || fileConfig.videoStreamMode || process.env.VIDEO_STREAM_MODE || 'mjpeg';
  const videoStreamSourceRaw =
    dbConfig.video_stream_source || fileConfig.videoStreamSource || process.env.VIDEO_STREAM_SOURCE || 'direct';

  return {
    gaodeApiKey,
    qwenApiKey,
    apiToken,
    videoStreamUrl:
      dbConfig.video_stream_url || fileConfig.videoStreamUrl || process.env.VIDEO_STREAM_URL || '/api/vision/stream.mjpg',
    videoStreamMode: videoStreamModeRaw === 'mjpeg' ? 'mjpeg' : 'video',
    videoStreamSource: videoStreamSourceRaw === 'proxy' ? 'proxy' : 'direct',
    visionDeviceId:
      String(
        dbConfig.vision_device_id || fileConfig.visionDeviceId || process.env.VISION_DEVICE_ID || 'pi5-vision-client'
      ).trim() || 'pi5-vision-client'
  };
};

const persistVideoStreamConfig = async (config: {
  videoStreamUrl: string;
  videoStreamMode?: 'video' | 'mjpeg';
  videoStreamSource?: 'direct' | 'proxy';
  visionDeviceId?: string;
}) => {
  const normalized = {
    videoStreamUrl: config.videoStreamUrl.trim(),
    videoStreamMode: config.videoStreamMode === 'video' ? 'video' as const : 'mjpeg' as const,
    videoStreamSource: config.videoStreamSource === 'proxy' ? 'proxy' as const : 'direct' as const,
    visionDeviceId: (config.visionDeviceId || 'pi5-vision-client').trim() || 'pi5-vision-client'
  };

  process.env.VIDEO_STREAM_URL = normalized.videoStreamUrl;
  process.env.VIDEO_STREAM_MODE = normalized.videoStreamMode;
  process.env.VIDEO_STREAM_SOURCE = normalized.videoStreamSource;
  process.env.VISION_DEVICE_ID = normalized.visionDeviceId;
  writeConfig(normalized);

  let databasePersisted = true;
  let databaseError = '';
  try {
    await Promise.all([
      updateSystemConfig('video_stream_url', normalized.videoStreamUrl),
      updateSystemConfig('video_stream_mode', normalized.videoStreamMode),
      updateSystemConfig('video_stream_source', normalized.videoStreamSource),
      updateSystemConfig('vision_device_id', normalized.visionDeviceId)
    ]);
  } catch (error) {
    databasePersisted = false;
    databaseError = error instanceof Error ? error.message : String(error);
    console.warn('[config] failed to persist video stream configuration to database:', error);
  }

  return {
    ...normalized,
    databasePersisted,
    databaseError
  };
};

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

/** 登录失败次数限制（按 IP，防暴力破解） */
const LOGIN_RL_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RL_MAX = 25;
const loginRateState = new Map<string, { fails: number; windowStart: number }>();

const takeLoginRateSlot = (ip: string): boolean => {
  const now = Date.now();
  let s = loginRateState.get(ip);
  if (!s || now - s.windowStart > LOGIN_RL_WINDOW_MS) {
    s = { fails: 0, windowStart: now };
    loginRateState.set(ip, s);
  }
  if (s.fails >= LOGIN_RL_MAX) return false;
  return true;
};

const recordLoginFailure = (ip: string) => {
  const s = loginRateState.get(ip);
  if (s) s.fails += 1;
};

const CLIENT_ERR_WINDOW_MS = 60_000;
const CLIENT_ERR_MAX = 40;
const clientErrorRateState = new Map<string, number[]>();

const isClientErrorRateOk = (ip: string): boolean => {
  const now = Date.now();
  const prev = (clientErrorRateState.get(ip) || []).filter((t) => now - t < CLIENT_ERR_WINDOW_MS);
  if (prev.length >= CLIENT_ERR_MAX) return false;
  prev.push(now);
  clientErrorRateState.set(ip, prev);
  return true;
};

const clientIp = (req: express.Request): string => {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
};

const VISION_PROBE_TIMEOUT_MS = Math.min(
  60000,
  Math.max(2000, parseInt(process.env.VISION_PROBE_TIMEOUT_MS || '8000', 10))
);

/**
 * 从后端进程发起一次真实 HTTP(S) 请求，用于判断「服务器能否访问视频源」（与浏览器能否访问无关）。
 * 相对路径（如 /api/vision/stream.mjpg）会解析为本机 http://127.0.0.1:PORT。
 */
const probeVisionUpstream = (
  rawUrl: string
): Promise<{
  ok: boolean;
  statusCode?: number;
  contentType?: string;
  latencyMs: number;
  error?: string;
  hint?: string;
  targetUrl: string;
}> =>
  new Promise((resolve) => {
    let target: URL;
    try {
      if (rawUrl.startsWith('/')) {
        target = new URL(rawUrl, `http://127.0.0.1:${PORT}`);
      } else {
        target = new URL(rawUrl);
      }
    } catch {
      resolve({ ok: false, latencyMs: 0, error: 'invalid url', targetUrl: rawUrl });
      return;
    }
    if (!rawUrl.startsWith('/') && !isVisionProxyHostnameAllowed(target.hostname)) {
      resolve({
        ok: false,
        latencyMs: 0,
        error: 'host not allowed for vision probe',
        hint: '请在环境变量 VISION_PROXY_ALLOWED_HOSTS 中加入该主机名，或仅使用内网/localhost 地址',
        targetUrl: target.toString()
      });
      return;
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      resolve({ ok: false, latencyMs: 0, error: 'only http/https supported', targetUrl: target.toString() });
      return;
    }

    // 本机 MJPEG 中继接口需要 token，否则探测会得到 401
    if (/\/api\/vision\/stream\.mjpg$/i.test(target.pathname)) {
      const tok = (process.env.API_TOKEN || '').trim();
      if (tok && !target.searchParams.has('token')) {
        target.searchParams.set('token', tok);
      }
    }

    const lib = target.protocol === 'https:' ? https : http;
    const port = target.port || (target.protocol === 'https:' ? 443 : 80);
    const pathWithQuery = target.pathname + target.search;
    const t0 = Date.now();

    let clientReq: http.ClientRequest;
    const timer = setTimeout(() => {
      try {
        clientReq.destroy();
      } catch {
        /* ignore */
      }
      resolve({
        ok: false,
        latencyMs: Date.now() - t0,
        error: `timeout after ${VISION_PROBE_TIMEOUT_MS}ms`,
        hint: '摄像头无响应或网络不可达，请检查端口、防火墙及摄像头是否仅内网可访问',
        targetUrl: target.toString()
      });
    }, VISION_PROBE_TIMEOUT_MS);

    clientReq = lib.request(
      {
        hostname: target.hostname,
        port,
        path: pathWithQuery,
        method: 'GET',
        timeout: VISION_PROBE_TIMEOUT_MS,
        headers: {
          'User-Agent': 'SmartHive-VisionProbe/1.0',
          Connection: 'close',
          Accept: '*/*'
        }
      },
      (pres: http.IncomingMessage) => {
        clearTimeout(timer);
        const latencyMs = Date.now() - t0;
        const code = pres.statusCode || 0;
        const ct = String(pres.headers['content-type'] || '')
          .split(';')[0]
          .trim();
        pres.resume();
        try {
          pres.destroy();
        } catch {
          /* ignore */
        }

        const isStreamMjpg = /\/api\/vision\/stream\.mjpg$/i.test(target.pathname);

        if (code >= 200 && code < 300) {
          resolve({
            ok: true,
            statusCode: code,
            contentType: ct || undefined,
            latencyMs,
            targetUrl: target.toString()
          });
          return;
        }
        if (code === 401 || code === 403) {
          resolve({
            ok: true,
            statusCode: code,
            contentType: ct || undefined,
            latencyMs,
            hint: 'HTTP 已连通，但摄像头返回鉴权/拒绝，请检查账号密码或白名单',
            targetUrl: target.toString()
          });
          return;
        }
        if (code === 503 && isStreamMjpg) {
          resolve({
            ok: true,
            statusCode: code,
            contentType: ct || undefined,
            latencyMs,
            hint: '后端路由可达：暂无 JPEG 帧。请确认树莓派已 POST /api/vision/frame 或改用直连摄像头地址',
            targetUrl: target.toString()
          });
          return;
        }
        if (code >= 300 && code < 400) {
          resolve({
            ok: false,
            statusCode: code,
            contentType: ct || undefined,
            latencyMs,
            error: `HTTP ${code} redirect`,
            hint: '请使用重定向后的最终 URL，或在管理后台填写摄像头直接提供的地址',
            targetUrl: target.toString()
          });
          return;
        }

        resolve({
          ok: false,
          statusCode: code,
          contentType: ct || undefined,
          latencyMs,
          error: `HTTP ${code}`,
          hint:
            code === 404
              ? '路径不存在，请核对视频流 URL'
              : '请核对摄像头服务是否开启、路径是否正确',
          targetUrl: target.toString()
        });
      }
    );

    clientReq.on('error', (err: Error) => {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      resolve({
        ok: false,
        latencyMs: Date.now() - t0,
        error: msg,
        hint: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/i.test(msg)
          ? '后端无法连到该地址：常见于摄像头只在局域网、而服务器在公网（或反之），需端口映射/VPN/公网可访问地址'
          : undefined,
        targetUrl: target.toString()
      });
    });
    clientReq.on('timeout', () => {
      clientReq.destroy();
    });
    clientReq.end();
  });

// Security and Performance Middleware
app.use(helmet());
app.use(compression());

// CORS配置：更加严格
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false) 
    : true,
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 限制请求体大小
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Validation Schemas
const BeehiveDataSchema = z.object({
  temperature: z.number().min(-50).max(100),
  humidity: z.number().min(0).max(100),
  insideTemperature: z.number().min(-50).max(100).optional(),
  insideHumidity: z.number().min(0).max(100).optional(),
  outsideTemperature: z.number().min(-50).max(100).optional(),
  outsideHumidity: z.number().min(0).max(100).optional(),
  weight: z.number().min(0).max(500),
  beesIn: z.number().int().nonnegative().optional(),
  beesOut: z.number().int().nonnegative().optional(),
  hornetsDetected: z.number().int().nonnegative().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  gpsRawText: z.string().optional(),
  gpsRawHex: z.string().optional(),
});

const IotPayloadSchema = z.object({
  deviceId: z.string().min(1).max(64),
  timestamp: z.coerce.number().optional(),
  sensors: z
    .array(
      z.object({
        type: z.string().min(1).max(64),
        value: z.coerce.number(),
        unit: z.string().max(32).optional()
      })
    )
    .optional(),
  sensorValues: z.record(z.string(), z.union([z.coerce.number(), z.string()])).optional(),
  qos: z.coerce.number().int().min(0).max(2).optional(),
  status: z
    .object({
      online: z.boolean().optional(),
      rssi: z.coerce.number().optional(),
      ip: z.string().max(64).optional(),
      packetsReceived: z.coerce.number().int().nonnegative().optional(),
      packetsDropped: z.coerce.number().int().nonnegative().optional()
    })
    .optional()
});

const StaleDataReportSchema = z.object({
  createdBy: z.string().max(128).optional(),
  rules: z
    .array(
      z.object({
        tableName: z.enum(['hive_data', 'iot_telemetry', 'vision_recognition']),
        retentionDays: z.number().int().min(1).max(3650),
        maxDeleteRows: z.number().int().min(100).max(200000).optional()
      })
    )
    .max(10)
    .optional()
});

const StaleDataCleanupSchema = z.object({
  operationId: z.string().min(1),
  reportHash: z.string().min(8),
  confirmationToken: z.string().min(4),
  confirmText: z.string().min(1),
  operator: z.string().max(128).optional()
});

const AuthLoginSchema = z.object({
  role: z.enum(['user', 'admin']),
  password: z.string().max(256).optional(),
  apiToken: z.string().max(512).optional()
});

// Request Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.api(req.method, req.originalUrl, res.statusCode, duration);
  });
  next();
});

// Token verification middleware
export const verifyToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Unauthorized: Missing or invalid Authorization header'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  // Token from env
  const FIXED_TOKEN = process.env.API_TOKEN;
  if (!FIXED_TOKEN) {
    return res.status(500).json({
      message: 'Internal Server Error: API_TOKEN is not configured'
    });
  }
  
  if (token !== FIXED_TOKEN) {
    return res.status(401).json({
      message: 'Unauthorized: Invalid token'
    });
  }
  
  // Add token to request for future use if needed
  (req as any).token = token;
  next();
};

const geocodeCache = new Map<string, { data: any; expiresAt: number }>();
const geocodeCacheTtlMs = 10 * 60 * 1000;
const geocodeCacheMaxSize = 200;
const getGeocodeCacheKey = (lat: number, lon: number) => `${lat.toFixed(6)},${lon.toFixed(6)}`;

// Health check endpoint - no token required
app.get('/api/health', async (_req, res) => {
  try {
    const isConnected = await testDatabaseConnection();
    res.status(200).json({
      status: 'ok',
      databaseConnected: isConnected,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 前端登录：管理员校验 ADMIN_PASSWORD 后下发 API_TOKEN；普通用户可选校验其填写的令牌是否与后端一致。
 * 无需 Bearer；请配合 HTTPS 部署以免密码与令牌被窃听。
 */
app.post('/api/auth/login', (req, res) => {
  const ip = clientIp(req);
  if (!takeLoginRateSlot(ip)) {
    return res.status(429).json({ message: '登录尝试过多，请稍后再试' });
  }

  const parsed = AuthLoginSchema.safeParse(req.body || {});
  if (!parsed.success) {
    recordLoginFailure(ip);
    return res.status(400).json({ message: '请求体无效', details: parsed.error.flatten() });
  }

  const { role, password, apiToken: bodyToken } = parsed.data;
  const apiTok = (process.env.API_TOKEN || '').trim();

  if (role === 'user') {
    if (bodyToken !== undefined && bodyToken !== '') {
      if (!apiTok) {
        return res.status(500).json({ message: '服务器未配置 API_TOKEN' });
      }
      if (bodyToken !== apiTok) {
        recordLoginFailure(ip);
        return res.status(401).json({ message: 'API 令牌无效' });
      }
    }
    return res.json({ ok: true, role: 'user', apiToken: apiTok || undefined });
  }

  const adminPass = (process.env.ADMIN_PASSWORD || '').trim();
  if (!adminPass) {
    return res.status(503).json({
      message: '服务器未配置 ADMIN_PASSWORD，管理员无法登录。请在环境变量中设置强密码后重启服务。'
    });
  }
  const pwd = password ?? '';
  if (!timingSafePasswordEqual(pwd, adminPass)) {
    recordLoginFailure(ip);
    return res.status(401).json({ message: '管理员密码错误' });
  }
  if (!apiTok) {
    return res.status(500).json({ message: '服务器未配置 API_TOKEN，无法下发访问令牌' });
  }
  return res.json({ ok: true, role: 'admin', apiToken: apiTok });
});

app.post('/api/client-error', express.text({ type: '*/*', limit: '1mb' }), (req, res) => {
  if (!isClientErrorRateOk(clientIp(req))) {
    return res.status(429).end();
  }
  const raw = req.body;
  let payload: any = raw;
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { message: raw };
    }
  }
  if (!payload || typeof payload !== 'object') {
    payload = {};
  }
  console.error('ClientErrorReport:', {
    name: payload.name,
    message: payload.message,
    timestamp: payload.timestamp,
    url: payload.url,
    userAgent: payload.userAgent,
    stack: payload.stack,
    componentStack: payload.componentStack
  });
  res.status(204).send();
});

app.get('/api/iot/stream', (req, res) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const token = bearerToken || queryToken;
  const expectedToken = process.env.API_TOKEN || '';
  if (!token || token !== expectedToken) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }

  // 先登记连接，确保连接数满时仍能正常返回 HTTP 503，而不是已经切到 SSE 响应后再报错。
  if (!realtimeHub.addClient(res)) {
    return;
  }
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (res.flushHeaders) {
    res.flushHeaders();
  }

  const requestedDeviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
  const latestTelemetry = realtimeHub.latestTelemetry(requestedDeviceId || undefined);
  if (latestTelemetry) {
    res.write(`event: ${latestTelemetry.type}\ndata: ${JSON.stringify(latestTelemetry)}\n\n`);
  }
  
  const onClose = () => {
    realtimeHub.removeClient(res);
  };
  
  req.on('close', onClose);
  req.on('error', onClose);
});

app.get('/api/iot/latest', verifyToken, async (req, res) => {
  const deviceId = String(req.query.deviceId || '');
  if (!deviceId) return res.status(400).json({ message: 'deviceId is required' });
  const points = await fetchIotLatestByDevice(deviceId);
  return res.status(200).json(points);
});

app.get('/api/iot/realtime-latest', verifyToken, (req, res) => {
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
  const latestTelemetry = realtimeHub.latestTelemetry(deviceId || undefined);
  if (!latestTelemetry) {
    return res.status(200).json(null);
  }
  return res.status(200).json(latestTelemetry);
});

app.get('/api/iot/history', verifyToken, async (req, res) => {
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
  const sensorType = typeof req.query.sensorType === 'string' ? req.query.sensorType : undefined;
  const startMs = Number.isFinite(Number(req.query.start)) ? Number(req.query.start) : undefined;
  const endMs = Number.isFinite(Number(req.query.end)) ? Number(req.query.end) : undefined;
  const limitRaw = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 2000;
  const limit = Math.min(Math.max(limitRaw, 1), 50000);
  const rows = await fetchIotHistory({ deviceId, sensorType, startMs, endMs, limit });
  return res.status(200).json(rows);
});

app.get('/api/iot/export', verifyToken, async (req, res) => {
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
  const sensorType = typeof req.query.sensorType === 'string' ? req.query.sensorType : undefined;
  const startMs = Number.isFinite(Number(req.query.start)) ? Number(req.query.start) : undefined;
  const endMs = Number.isFinite(Number(req.query.end)) ? Number(req.query.end) : undefined;
  const rows = await fetchIotHistory({ deviceId, sensorType, startMs, endMs, limit: 50000 });
  const header = 'timestamp,deviceId,sensorType,value,unit,qos\n';
  const body = rows.map((r) => `${r.timestamp},${r.deviceId},${r.sensorType},${r.value},${r.unit || ''},${r.qos ?? 0}`).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="iot_export_${Date.now()}.csv"`);
  return res.status(200).send(header + body);
});

app.post('/api/iot/ingest', verifyToken, async (req, res) => {
  const parsed = IotPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', errors: parsed.error.issues });
  }
  const body = parsed.data;
  const timestamp = Number.isFinite(Number(body.timestamp)) && Number(body.timestamp) > 0 ? Number(body.timestamp) : Date.now();
  const sensorsFromMap =
    body.sensorValues && typeof body.sensorValues === 'object'
      ? Object.entries(body.sensorValues).map(([type, value]) => ({ type, value: Number(value) }))
      : [];
  const normalizedSensors = normalizeSensors([...(body.sensors || []), ...sensorsFromMap]);
  if (normalizedSensors.length === 0) {
    return res.status(400).json({ message: 'At least one valid sensor is required' });
  }
  const points = normalizedSensors.map((s) => ({
    timestamp,
    deviceId: body.deviceId,
    sensorType: s.type,
    value: s.value,
    unit: s.unit,
    qos: body.qos ?? 1
  }));
  realtimeHub.broadcast({
    type: 'iot.telemetry',
    payload: {
      deviceId: body.deviceId,
      timestamp,
      sensors: normalizedSensors
    },
    ts: Date.now()
  });

  const status = buildIotDeviceStatus(body.deviceId, body.status, timestamp, points.length);
  const pointsToPersist = selectTelemetryPointsForPersistence(points);

  void (async () => {
    try {
      const statusSaved = await upsertIotDeviceStatus(status);
      if (!statusSaved) {
        logger.warn('api', `/api/iot/ingest 设备状态未写入数据库，实时推送已完成: ${body.deviceId}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('api', `/api/iot/ingest 设备状态写入失败，实时推送不受影响: ${message}`);
    }

    try {
      const inserted = pointsToPersist.length > 0 ? await insertIotTelemetryBatch(pointsToPersist) : 0;
      if (pointsToPersist.length > 0 && inserted <= 0) {
        logger.warn('api', `/api/iot/ingest 遥测历史未写入数据库，实时推送已完成: ${body.deviceId}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('api', `/api/iot/ingest 遥测历史写入失败，实时推送不受影响: ${message}`);
    }
  })();

  return res.status(201).json({
    accepted: true,
    realtimePushed: true,
    persistenceQueued: true,
    requestedPoints: points.length,
    persistedPoints: pointsToPersist.length,
    skippedByBucket: points.length - pointsToPersist.length
  });
});

app.get('/api/iot/monitor', verifyToken, async (_req, res) => {
  let statuses: Awaited<ReturnType<typeof fetchIotDeviceStatuses>> = [];
  try {
    statuses = await fetchIotDeviceStatuses();
  } catch (error) {
    logger.warn('api', `IoT 设备状态查询失败，监控接口降级返回 MQTT/SSE 状态: ${error instanceof Error ? error.message : String(error)}`);
  }
  return res.status(200).json({
    mqtt: getMqttIngestStats(),
    stream: realtimeHub.stats(),
    devices: statuses
  });
});

app.get('/api/iot/pipeline-status', verifyToken, async (req, res) => {
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
  if (!deviceId) {
    return res.status(400).json({ message: 'deviceId is required' });
  }
  const now = Date.now();
  const rangeStart = now - 10 * 60 * 1000;
  const [latest, history, hiveRecent] = await Promise.all([
    fetchIotLatestByDevice(deviceId),
    fetchIotHistory({ deviceId, startMs: rangeStart, endMs: now, limit: 5000 }),
    fetchRangeHiveDataFromDB(rangeStart, now, 5000, 0)
  ]);
  return res.status(200).json({
    deviceId,
    rangeMs: 10 * 60 * 1000,
    checkedAt: now,
    storagePolicy: {
      bucketMinutes: getStorageBucketMinutes()
    },
    mqtt: getMqttIngestStats(),
    stream: realtimeHub.stats(),
    iot: {
      latestCount: latest.length,
      historyCount: history.length,
      lastTelemetryTs: history.length ? history[history.length - 1].timestamp : null,
      sensorTypes: Array.from(new Set(latest.map((p) => p.sensorType))).sort()
    },
    beehive: {
      recentCount: hiveRecent.length,
      lastHiveTs: hiveRecent.length ? hiveRecent[hiveRecent.length - 1].timestamp : null
    }
  });
});

app.post('/api/iot/backup', verifyToken, async (_req, res) => {
  const rows = await fetchIotHistory({ limit: 50000 });
  const dir = path.join(process.cwd(), 'runtime', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `iot_backup_${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ createdAt: Date.now(), rows }, null, 2), 'utf-8');
  return res.status(200).json({ filePath, count: rows.length });
});

app.post('/api/iot/restore', verifyToken, async (req, res) => {
  const body = req.body as { filePath?: string };
  if (!body.filePath) return res.status(400).json({ message: 'filePath is required' });
  if (!fs.existsSync(body.filePath)) return res.status(404).json({ message: 'backup file not found' });
  const raw = JSON.parse(fs.readFileSync(body.filePath, 'utf-8'));
  const rows = Array.isArray(raw?.rows) ? raw.rows : [];
  const inserted = await insertIotTelemetryBatch(rows);
  return res.status(200).json({ inserted });
});

// 数据一致性检查 API
app.get('/api/system/consistency-check', verifyToken, async (_req, res) => {
  try {
    const report = await dataConsistencyChecker.runAllChecks();
    return res.status(200).json(report);
  } catch (error) {
    logger.error('api', '数据一致性检查失败', error as Error);
    return res.status(500).json({
      message: '数据一致性检查失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 修复数据一致性问题
app.post('/api/system/consistency-fix', verifyToken, async (req, res) => {
  try {
    const { table, checkType, fixCommand } = req.body as {
      table: string;
      checkType: string;
      fixCommand: string;
    };
    
    if (!table || !checkType || !fixCommand) {
      return res.status(400).json({ message: 'Missing required fields: table, checkType, fixCommand' });
    }
    
    const result = await dataConsistencyChecker.fixIssue(table, checkType, fixCommand);
    
    if (result.success) {
      return res.status(200).json({ success: true, message: result.message });
    } else {
      return res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    logger.error('api', '修复数据一致性问题失败', error as Error);
    return res.status(500).json({
      message: '修复失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 数据映射验证 API
app.get('/api/system/data-mapping', verifyToken, async (_req, res) => {
  try {
    const validation = await dataMappingValidator.validateDataFlow();
    return res.status(200).json(validation);
  } catch (error) {
    logger.error('api', '数据映射验证失败', error as Error);
    return res.status(500).json({
      message: '数据映射验证失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 数据样本验证 API
app.get('/api/system/data-sample/:deviceId', verifyToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const validation = await dataMappingValidator.validateSampleData(deviceId);
    return res.status(200).json(validation);
  } catch (error) {
    logger.error('api', '数据样本验证失败', error as Error);
    return res.status(500).json({
      message: '数据样本验证失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 获取字段映射文档
app.get('/api/system/field-mapping-docs', verifyToken, async (_req, res) => {
  try {
    const doc = dataMappingValidator.getFieldMappingDocumentation();
    return res.status(200).type('text/markdown').send(doc);
  } catch (error) {
    logger.error('api', '获取字段映射文档失败', error as Error);
    return res.status(500).json({
      message: '获取字段映射文档失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 过时数据清理：生成报告（提取 + AI分析）
app.post('/api/system/stale-data/report', verifyToken, async (req, res) => {
  try {
    const parsed = StaleDataReportSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: '参数错误', errors: parsed.error.issues });
    }
    const result = await createStaleDataReport(parsed.data);
    return res.status(200).json({
      operationId: result.operationId,
      confirmationToken: result.confirmationToken,
      expiresAt: result.expiresAt,
      report: result.report
    });
  } catch (error) {
    logger.error('api', '生成过时数据报告失败', error as Error);
    return res.status(500).json({
      message: '生成过时数据报告失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 过时数据清理：确认并执行（含备份）
app.post('/api/system/stale-data/cleanup', verifyToken, async (req, res) => {
  try {
    const parsed = StaleDataCleanupSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: '参数错误', errors: parsed.error.issues });
    }
    const result = await executeStaleDataCleanup(parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('api', '执行过时数据清理失败', error as Error);
    return res.status(400).json({
      message: '执行过时数据清理失败',
      error: message
    });
  }
});

// 过时数据清理：查询任务状态（审计追溯）
app.get('/api/system/stale-data/operation/:operationId', verifyToken, async (req, res) => {
  try {
    const operationId = String(req.params.operationId || '').trim();
    if (!operationId) return res.status(400).json({ message: 'operationId is required' });
    const op = await getStaleCleanupOperation(operationId);
    if (!op) return res.status(404).json({ message: 'operation not found' });
    return res.status(200).json(op);
  } catch (error) {
    logger.error('api', '查询过时数据清理任务失败', error as Error);
    return res.status(500).json({
      message: '查询过时数据清理任务失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// AI数据库查询相关API

// 获取数据库Schema
app.get('/api/ai/database-schema', verifyToken, async (_req, res) => {
  try {
    const schema = await aiQueryService.getDatabaseSchema();
    return res.status(200).json(schema);
  } catch (error) {
    logger.error('api', '获取数据库Schema失败', error as Error);
    return res.status(500).json({
      message: '获取数据库Schema失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 执行SQL查询（仅限SELECT）
app.post('/api/ai/query', verifyToken, async (req, res) => {
  try {
    const { sql, params } = req.body as { sql: string; params?: any[] };
    
    if (!sql) {
      return res.status(400).json({ message: 'SQL查询语句不能为空' });
    }
    
    const result = await aiQueryService.executeQuery(sql, params);
    
    if (result.success) {
      const summary = aiQueryService.summarizeQueryResult(result);
      return res.status(200).json({
        success: true,
        rowCount: result.rowCount ?? 0,
        executionTime: result.executionTime,
        summary
      });
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('api', '执行AI查询失败', error as Error);
    return res.status(500).json({
      success: false,
      message: '执行查询失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 获取数据库Schema描述文档
app.get('/api/ai/schema-docs', verifyToken, async (_req, res) => {
  try {
    const docs = aiQueryService.getSchemaDescription();
    return res.status(200).type('text/markdown').send(docs);
  } catch (error) {
    logger.error('api', '获取Schema文档失败', error as Error);
    return res.status(500).json({
      message: '获取Schema文档失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Protected API endpoints with token verification

// Get latest beehive data
app.get('/api/beehive/latest', verifyToken, async (_req, res) => {
  try {
    const data = await fetchLiveHiveDataFromDB();
    if (data === null) {
      // 数据库无数据时返回 404，不再返回模拟数据
      res.status(404).json({ message: 'No beehive data found in database' });
    } else {
      if (data.latitude === undefined || data.longitude === undefined) {
        const dbConfig = await getSystemConfig();
        const preferredDeviceId =
          String(dbConfig.vision_device_id || process.env.VISION_DEVICE_ID || 'pi5-vision-client').trim() || 'pi5-vision-client';
        const fallbackLocation =
          (await fetchLatestLocationFromHiveData()) ||
          (await fetchLatestLocationFromIot(preferredDeviceId)) ||
          (await fetchLatestLocationFromIot());
        if (fallbackLocation) {
          if (data.latitude === undefined && Number.isFinite(fallbackLocation.latitude)) {
            data.latitude = fallbackLocation.latitude;
          }
          if (data.longitude === undefined && Number.isFinite(fallbackLocation.longitude)) {
            data.longitude = fallbackLocation.longitude;
          }
        }
      }
      res.status(200).json(data);
    }
  } catch (error) {
    // 数据库连接失败时返回错误信息
    console.error('Database connection error:', error);
    res.status(500).json({
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get historical beehive data
app.get('/api/beehive/history', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 40;
    const data = await fetchHistoryDataFromDB(limit);
    if (data.length === 0) {
      // 数据库无数据时返回空数组，不再返回模拟数据
      res.status(200).json([]);
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    // 数据库连接失败时返回错误信息
    console.error('Database connection error:', error);
    res.status(500).json({
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/beehive/range', verifyToken, async (req, res) => {
  try {
    const start = Number(req.query.start);
    const end = Number(req.query.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return res.status(400).json({ message: 'Invalid start or end' });
    }
    const limit = Number.isFinite(Number(req.query.limit)) ? Math.min(Number(req.query.limit), 5000) : 5000;
    const offset = Number.isFinite(Number(req.query.offset)) ? Number(req.query.offset) : 0;
    const data = await fetchRangeHiveDataFromDB(start, end, limit, offset);
    res.status(200).json(data);
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/beehive/export', verifyToken, async (req, res) => {
  try {
    const startMs = Number.isFinite(Number(req.query.start)) ? Number(req.query.start) : 0;
    const endMs = Number.isFinite(Number(req.query.end)) ? Number(req.query.end) : Date.now();
    const rows = await fetchRangeHiveDataFromDB(startMs, endMs, 50000, 0);
    const header = 'timestamp,temperature,humidity,insideTemperature,insideHumidity,outsideTemperature,outsideHumidity,weight,beesIn,beesOut,hornetsDetected,latitude,longitude\n';
    const body = rows.map((r) => 
      `${r.timestamp},${r.temperature},${r.humidity},${r.insideTemperature ?? ''},${r.insideHumidity ?? ''},${r.outsideTemperature ?? ''},${r.outsideHumidity ?? ''},${r.weight},${r.beesIn ?? 0},${r.beesOut ?? 0},${r.hornetsDetected ?? 0},${r.latitude ?? ''},${r.longitude ?? ''}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="beehive_export_${Date.now()}.csv"`);
    return res.status(200).send(header + body);
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({ message: 'Failed to export beehive data' });
  }
});

app.get('/api/beehive/calendar-summary', verifyToken, async (req, res) => {
  try {
    const month = parseMonthParam(req.query.month);
    if (!month) {
      return res.status(400).json({ message: 'Invalid month, expected YYYY-MM' });
    }
    const tzOffsetMinutes = parseTzOffsetMinutes(req.query.tz);
    const range = toUtcRangeForLocalMonth(month.year, month.mon, tzOffsetMinutes);
    const days = await fetchCalendarSummaryFromDB(range.startMs, range.endMs, tzOffsetMinutes);
    return res.status(200).json({
      month: month.text,
      tz: typeof req.query.tz === 'string' ? req.query.tz : 'Asia/Shanghai',
      days,
      version: 'v2'
    });
  } catch (error) {
    console.error('Calendar summary error:', error);
    return res.status(500).json({
      message: 'Failed to fetch calendar summary',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/beehive/day-detail', verifyToken, async (req, res) => {
  try {
    const date = parseDateParam(req.query.date);
    if (!date) {
      return res.status(400).json({ message: 'Invalid date, expected YYYY-MM-DD' });
    }
    const tzOffsetMinutes = parseTzOffsetMinutes(req.query.tz);
    const range = toUtcRangeForLocalDay(date.year, date.mon, date.day, tzOffsetMinutes);
    const raw = await fetchRangeHiveDataFromDB(range.startMs, range.endMs, 50000, 0);
    const sampleMode = typeof req.query.sample === 'string' ? req.query.sample : 'auto';
    const sampled = sampleMode === 'none' ? { points: raw, sample: { mode: 'none' as const, rawCount: raw.length, returnedCount: raw.length } } : downsampleBeehiveData(raw, 1200);
    return res.status(200).json({
      date: date.text,
      tz: typeof req.query.tz === 'string' ? req.query.tz : 'Asia/Shanghai',
      points: sampled.points,
      sample: sampled.sample
    });
  } catch (error) {
    console.error('Day detail error:', error);
    return res.status(500).json({
      message: 'Failed to fetch day detail',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get or update system configuration (API Keys)
app.get('/api/config', verifyToken, async (_req, res) => {
  try {
    const config = await getSystemConfigSnapshot();
    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch configuration',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post('/api/device/video-stream', verifyToken, async (req, res) => {
  try {
    const body = req.body as {
      deviceId?: string;
      streamUrl?: string;
      host?: string;
      port?: number;
      path?: string;
      mode?: 'video' | 'mjpeg';
      source?: 'direct' | 'proxy';
    };
    const deviceId = (String(body.deviceId || process.env.VISION_DEVICE_ID || 'pi5-vision-client').trim() || 'pi5-vision-client');
    const rawPath = typeof body.path === 'string' && body.path.trim() ? body.path.trim() : '/stream';
    const streamPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const streamUrl = (() => {
      const direct = typeof body.streamUrl === 'string' ? body.streamUrl.trim() : '';
      if (direct) return direct;
      const host = typeof body.host === 'string' ? body.host.trim() : '';
      const port = Number.isFinite(Number(body.port)) ? Number(body.port) : 5001;
      if (!host) return '';
      return `http://${host}:${port}${streamPath}`;
    })();

    if (!streamUrl) {
      return res.status(400).json({ message: 'streamUrl or host is required' });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(streamUrl);
    } catch {
      return res.status(400).json({ message: 'Invalid streamUrl' });
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ message: 'streamUrl must use http or https' });
    }

    const result = await persistVideoStreamConfig({
      videoStreamUrl: parsedUrl.toString(),
      videoStreamMode: body.mode === 'video' ? 'video' : 'mjpeg',
      videoStreamSource: body.source === 'proxy' ? 'proxy' : 'direct',
      visionDeviceId: deviceId
    });

    logger.info('api', `设备 ${deviceId} 已注册视频流地址: ${result.videoStreamUrl}`);
    return res.status(200).json({
      ok: true,
      ...result,
      timestamp: Date.now()
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to register device video stream',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Update system configuration (API Keys) - 持久化到数据库
app.post('/api/config', async (req, res) => {
  try {
    // 先获取令牌进行验证
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';
    const expectedToken = process.env.API_TOKEN || '';
    
    if (!token || token !== expectedToken) {
      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
    
    const body = req.body as {
      gaodeApiKey?: string;
      qwenApiKey?: string;
      apiToken?: string;
      corsOrigin?: string;
      videoStreamUrl?: string;
      videoStreamMode?: 'video' | 'mjpeg';
      videoStreamSource?: 'direct' | 'proxy';
      visionDeviceId?: string;
    };

    const normalizedPayload: {
      gaodeApiKey?: string;
      qwenApiKey?: string;
      apiToken?: string;
      corsOrigin?: string;
      videoStreamUrl?: string;
      videoStreamMode?: 'video' | 'mjpeg';
      videoStreamSource?: 'direct' | 'proxy';
      visionDeviceId?: string;
    } = {
      gaodeApiKey: body.gaodeApiKey !== undefined ? normalizeGaodeApiKey(body.gaodeApiKey) : undefined,
      qwenApiKey: body.qwenApiKey !== undefined ? normalizeQwenApiKey(body.qwenApiKey) : undefined,
      apiToken: body.apiToken !== undefined ? String(body.apiToken || '').trim() : undefined,
      corsOrigin: body.corsOrigin !== undefined ? body.corsOrigin : undefined,
      videoStreamUrl: body.videoStreamUrl !== undefined ? body.videoStreamUrl : undefined,
      videoStreamMode: body.videoStreamMode !== undefined ? (body.videoStreamMode === 'mjpeg' ? 'mjpeg' : 'video') : undefined,
      videoStreamSource: body.videoStreamSource !== undefined ? (body.videoStreamSource === 'proxy' ? 'proxy' : 'direct') : undefined,
      visionDeviceId:
        body.visionDeviceId !== undefined
          ? (String(body.visionDeviceId || '').trim() || 'pi5-vision-client')
          : undefined
    };

    const updates = [];

    // 更新数据库配置
    if (normalizedPayload.gaodeApiKey !== undefined) {
      updates.push(updateSystemConfig('gaode_api_key', normalizedPayload.gaodeApiKey));
      process.env.GAODE_API_KEY = normalizedPayload.gaodeApiKey;
    }
    if (normalizedPayload.qwenApiKey !== undefined) {
      updates.push(updateSystemConfig('qwen_api_key', normalizedPayload.qwenApiKey));
      process.env.QWEN_API_KEY = normalizedPayload.qwenApiKey;
    }
    if (normalizedPayload.apiToken !== undefined) {
      updates.push(updateSystemConfig('api_token', normalizedPayload.apiToken));
      process.env.API_TOKEN = normalizedPayload.apiToken;
    }
    const hasVideoConfig =
      normalizedPayload.videoStreamUrl !== undefined ||
      normalizedPayload.videoStreamMode !== undefined ||
      normalizedPayload.videoStreamSource !== undefined ||
      normalizedPayload.visionDeviceId !== undefined;
    let videoDatabasePersisted = true;
    let videoDatabaseError = '';
    if (hasVideoConfig) {
      const current = await getSystemConfigSnapshot();
      const videoResult = await persistVideoStreamConfig({
        videoStreamUrl: normalizedPayload.videoStreamUrl ?? current.videoStreamUrl,
        videoStreamMode: normalizedPayload.videoStreamMode ?? (current.videoStreamMode === 'video' ? 'video' : 'mjpeg'),
        videoStreamSource: normalizedPayload.videoStreamSource ?? (current.videoStreamSource === 'proxy' ? 'proxy' : 'direct'),
        visionDeviceId: normalizedPayload.visionDeviceId ?? current.visionDeviceId
      });
      videoDatabasePersisted = videoResult.databasePersisted;
      videoDatabaseError = videoResult.databaseError;
    }

    // 先写本地配置文件，保证“管理员配置一次后所有人可用”不依赖数据库。
    const filePayload = { ...normalizedPayload };
    if (hasVideoConfig) {
      delete filePayload.videoStreamUrl;
      delete filePayload.videoStreamMode;
      delete filePayload.videoStreamSource;
      delete filePayload.visionDeviceId;
    }
    writeConfig(filePayload);

    // 更新其他环境变量
    if (normalizedPayload.corsOrigin !== undefined) {
      process.env.CORS_ORIGIN = normalizedPayload.corsOrigin;
    }

    let databasePersisted = videoDatabasePersisted;
    let databaseError = '';
    try {
      await Promise.all(updates);
    } catch (error) {
      databasePersisted = false;
      databaseError = error instanceof Error ? error.message : String(error);
      console.warn('[config] failed to persist configuration to database, config.json fallback remains active:', error);
    }
    if (videoDatabaseError && !databaseError) {
      databaseError = videoDatabaseError;
    }

    res.status(200).json({
      message: databasePersisted
        ? 'Configuration updated successfully'
        : 'Configuration saved to config.json; database persistence failed',
      databasePersisted,
      databaseError,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to update configuration',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

const computeRangeFromQuestion = (text: string) => {
  const q = (text || '').trim();
  const now = new Date();

  const startOfTodayLocal = () => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const startOfWeekLocal = () => {
    // Monday as week start (CN common)
    const d = new Date(now);
    const day = d.getDay(); // 0 Sun ... 6 Sat
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const end = Date.now();
  if (/(今天|今日|本日)/.test(q)) return { preset: 'today' as const, start: startOfTodayLocal(), end };
  if (/(本周|这周|这一周|本星期|这星期)/.test(q)) return { preset: 'week' as const, start: startOfWeekLocal(), end };
  if (/(本月|这个月|这一月)/.test(q)) {
    const d = new Date(now);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return { preset: 'month' as const, start: d.getTime(), end };
  }
  // Default: last 24h
  return { preset: '24h' as const, start: end - 864e5, end };
};

const summarizeSeries = (values: number[]) => {
  const list = values.filter((v) => Number.isFinite(v));
  if (list.length === 0) return null;
  let min = list[0];
  let max = list[0];
  let sum = 0;
  for (const v of list) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { count: list.length, min, max, avg: sum / list.length, last: list[list.length - 1] };
};

const isFutureMentioned = (text: string) => /(明天|后天|大后天|下周|下星期|下个月|未来|预测|预报|下一天)/.test((text || '').trim());

// 未来“结果/状态/产量”类：数据库没有未来数据，必须拦截，避免牵强预测
const isFutureDataQuestion = (text: string) => {
  const q = (text || '').trim();
  if (!isFutureMentioned(q)) return false;
  // 关注“结果/状态/是否会发生/产量”这类措辞
  return /(状况|情况|怎么样|会怎样|会不会|是否|能否|产蜜|产量|增重|减重|健康|异常|风险|死亡|分蜂|逃蜂|中蜂|意蜂)/.test(q);
};

// 未来“怎么做/准备什么/管理计划”类：允许回答，但只能给基于现状的数据驱动建议，不给确定预测
const isFutureActionQuestion = (text: string) => {
  const q = (text || '').trim();
  if (!isFutureMentioned(q)) return false;
  return /(怎么做|怎么处理|怎么管理|要做什么|该做什么|准备|预防|措施|建议|安排|计划|注意什么|要不要|是否需要)/.test(q);
};

app.post('/api/ai/chat', verifyToken, async (req, res) => {
  try {
    const body = req.body as { message?: string; deviceId?: string; modelName?: string };
    const message = (body.message || '').trim();
    if (!message) return res.status(400).json({ message: 'message is required' });

    // 未来“结果/状态”类问题：数据库没有未来数据，禁止牵强回答（可给“基于现状的建议/需要补充的数据”）
    if (isFutureDataQuestion(message) && !isFutureActionQuestion(message)) {
      const answer = [
        '我可以帮你看“截至现在”为止的蜂群情况，但**明天/下周的具体状况**数据库里还没有数据，所以我不能给出确定结论（避免瞎猜）。',
        '',
        '你可以这样问，我就能基于真实数据给出建议：',
        '- “截至今天，本周蜂群健康趋势如何？需要注意什么？”',
        '- “按最近24小时/本周的数据，目前最主要的风险点是什么？今天要做哪几件事？”',
        '',
        '如果你想要“预测”，我也可以做**风险预判**（不是确定结果）：需要你补充天气预报、是否补饲/取蜜、是否搬迁、蜂箱通风/保温措施等信息。'
      ].join('\n');
      return res.status(200).json({
        answer,
        context: { timeRange: { preset: 'now', start: Date.now() - 864e5, end: Date.now() }, hivePoints: 0 }
      });
    }

    const deviceId = (body.deviceId || 'pi5-vision-client').trim() || 'pi5-vision-client';
    const range = computeRangeFromQuestion(message);

    // 1) Hive summary from hive_data (overview)
    const hive = await fetchRangeHiveDataFromDB(range.start, range.end, 50000, 0);
    const hiveTemp = summarizeSeries(hive.map((p) => Number(p.temperature)));
    const hiveHum = summarizeSeries(hive.map((p) => Number(p.humidity)));
    const hiveWgt = summarizeSeries(hive.map((p) => Number(p.weight)));
    const hiveHornets = summarizeSeries(hive.map((p) => Number((p as any).hornetsDetected ?? 0)));
    const hiveBeesIn = summarizeSeries(hive.map((p) => Number(p.beesIn ?? 0)));
    const hiveBeesOut = summarizeSeries(hive.map((p) => Number(p.beesOut ?? 0)));

    const hiveLatest = hive.length ? hive[hive.length - 1] : null;
    const honeyEstimateKg = hiveWgt && hiveWgt.count >= 2 ? Math.max(0, Number(hiveWgt.last) - Number(hiveWgt.min)) : null;

    // 2) IoT summary from iot_telemetry (inside/outside environment)
    const sensorTypes = [
      'inside_temperature',
      'inside_humidity',
      'outside_temperature',
      'outside_humidity',
      'weight',
      'bees_in',
      'bees_out',
      'hornet_count'
    ] as const;

    const iotSeries: Record<string, { count: number; min: number; max: number; avg: number; last: number } | null> = {};
    for (const st of sensorTypes) {
      const rows = await fetchIotHistory({ deviceId, sensorType: st, startMs: range.start, endMs: range.end, limit: 50000 });
      iotSeries[st] = summarizeSeries(rows.map((r) => Number(r.value)));
    }

    const context = {
      deviceId,
      timeRange: { preset: range.preset, start: range.start, end: range.end },
      hive: {
        points: hive.length,
        latest: hiveLatest,
        temperature: hiveTemp,
        humidity: hiveHum,
        weight: hiveWgt,
        beesIn: hiveBeesIn,
        beesOut: hiveBeesOut,
        hornetsDetected: hiveHornets,
        honeyEstimateKg
      },
      iot: {
        series: iotSeries
      },
      notes: [
        '产蜜量在本系统中没有直接传感器，只能用“重量变化”做近似估算；重量变化也会包含天气、补饲、箱体潮湿等因素。',
        '若需要更准确产蜜量，请在管理流程中记录“取蜜/加饲”事件，或增加独立产蜜称重方案。',
        ...(isFutureActionQuestion(message)
          ? ['用户问题包含未来时间点：请只给“基于当前数据的操作建议/预防措施”，不要给出明天/下周的确定预测结论。']
          : [])
      ]
    };

    const apiKey = (process.env.QWEN_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(400).json({ message: '未配置 Qwen API Key，请在管理员界面配置后再使用 AI 问答' });
    }

    const answer = await processChatMessage(
      [
        message,
        '',
        '【系统上下文（JSON）】',
        '```json',
        JSON.stringify(context),
        '```'
      ].join('\n'),
      { apiKey, modelName: body.modelName }
    );

    return res.status(200).json({
      answer,
      context: { deviceId, timeRange: context.timeRange, hivePoints: hive.length }
    });
  } catch (error) {
    console.error('AI chat error:', error);
    return res.status(500).json({ message: 'AI 问答失败', error: error instanceof Error ? error.message : String(error) });
  }
});

app.post(
  '/api/ai/transcribe',
  verifyToken,
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '12mb' }),
  async (req, res) => {
    try {
      const audioBuffer = req.body as Buffer;
      if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length <= 0) {
        return res.status(400).json({ message: 'audio body is required' });
      }

      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
      const modelNameRaw = typeof req.query.modelName === 'string' ? req.query.modelName.trim() : '';
      const modelName = modelNameRaw || process.env.QWEN_ASR_MODEL || 'qwen3-asr-flash';
      const apiKey = (process.env.QWEN_API_KEY || '').trim();
      if (!apiKey) {
        return res.status(400).json({ message: '未配置 Qwen API Key，请在管理员界面配置后再使用语音识别' });
      }

      const text = await transcribeAudioToText(audioBuffer, { apiKey, modelName });

      return res.status(200).json({
        text,
        modelName,
        size: audioBuffer.length
      });
    } catch (error) {
      console.error('AI transcribe error:', error);
      return res.status(500).json({
        message: '语音转文字失败',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
);

app.post('/api/vision/probe', (req, res, next) => {
  if (!verifyTokenFromHeaderOrQuery(req)) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
  return next();
}, async (req, res) => {
  const body = req.body as { streamUrl?: string; streamMode?: 'video' | 'mjpeg' };
  const rawUrl = (body.streamUrl || '').trim();
  const streamMode = body.streamMode === 'mjpeg' ? 'mjpeg' : 'video';
  if (!rawUrl) {
    return res.status(400).json({ success: false, message: 'streamUrl is required' });
  }

  const result = await probeVisionUpstream(rawUrl);
  const checkedAt = Date.now();
  if (!result.ok) {
    return res.status(200).json({
      success: false,
      message: result.error || 'probe failed',
      hint: result.hint,
      statusCode: result.statusCode,
      contentType: result.contentType,
      latencyMs: result.latencyMs,
      checkedAt,
      streamMode,
      targetUrl: result.targetUrl
    });
  }

  return res.status(200).json({
    success: true,
    message: result.hint
      ? `后端可访问视频源（${result.latencyMs}ms）。${result.hint}`
      : `后端可访问视频源（${result.latencyMs}ms）`,
    statusCode: result.statusCode,
    contentType: result.contentType,
    latencyMs: result.latencyMs,
    checkedAt,
    streamMode,
    targetUrl: result.targetUrl
  });
});

// ----------------------------
// Vision streaming: Pi -> Server -> Frontend (跨网可用)
// ----------------------------

type VisionFrame = {
  jpeg: Buffer;
  ts: number;
};

const visionFrames = new Map<string, VisionFrame>();
const visionEmitters = new Map<string, EventEmitter>();
const getVisionEmitter = (deviceId: string) => {
  let e = visionEmitters.get(deviceId);
  if (!e) {
    e = new EventEmitter();
    e.setMaxListeners(200);
    visionEmitters.set(deviceId, e);
  }
  return e;
};

const verifyTokenFromHeaderOrQuery = (req: express.Request) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const token = bearerToken || queryToken;
  const expectedToken = process.env.API_TOKEN || '';
  return Boolean(token && expectedToken && token === expectedToken);
};

// Pi 上传“已打框 JPEG 帧”，由后端转发为 MJPEG 给前端
app.post(
  '/api/vision/frame',
  (req, res, next) => {
    if (!verifyTokenFromHeaderOrQuery(req)) {
      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
    return next();
  },
  express.raw({ type: ['image/jpeg', 'application/octet-stream'], limit: '2mb' }),
  async (req, res) => {
    const deviceId = typeof req.query.deviceId === 'string' && req.query.deviceId.trim()
      ? req.query.deviceId.trim()
      : 'pi5-vision-client';
    const buf = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.from([]);
    if (!buf.length) {
      return res.status(400).json({ message: 'Empty frame' });
    }
    if (buf.length > 2 * 1024 * 1024) {
      return res.status(413).json({ message: 'Frame too large' });
    }
    const now = Date.now();
    visionFrames.set(deviceId, { jpeg: buf, ts: now });
    getVisionEmitter(deviceId).emit('frame', now);
    return res.status(204).send();
  }
);

// 前端拉取 MJPEG 流（通过 token= 或 Authorization）
app.get('/api/vision/stream.mjpg', (req, res) => {
  if (!verifyTokenFromHeaderOrQuery(req)) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
  const deviceId = typeof req.query.deviceId === 'string' && req.query.deviceId.trim()
    ? req.query.deviceId.trim()
    : 'pi5-vision-client';
  const first = visionFrames.get(deviceId);
  if (!first) {
    return res.status(503).json({
      message: `No MJPEG frames available for deviceId=${deviceId}. 请启用树莓派 server_upload 或直接配置设备视频流地址。`
    });
  }
  const emitter = getVisionEmitter(deviceId);

  res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const writeJpeg = (jpeg: Buffer, ts: number) => {
    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\nX-Timestamp: ${ts}\r\n\r\n`);
    res.write(jpeg);
    res.write('\r\n');
  };

  // 先发一帧最新的
  try {
    writeJpeg(first.jpeg, first.ts);
  } catch {
  }

  const waitNext = () =>
    new Promise<number | null>((resolve) => {
      const onFrame = (ts: number) => resolve(ts);
      const t = setTimeout(() => resolve(null), 5000);
      emitter.once('frame', onFrame);
      const cleanup = () => {
        clearTimeout(t);
        emitter.off('frame', onFrame);
      };
      // ensure cleanup after resolve
      const originalResolve = resolve;
      resolve = (value: any) => {
        cleanup();
        originalResolve(value);
      };
    });

  (async () => {
    while (!closed) {
      const nextTs = await waitNext();
      if (closed) break;
      if (nextTs === null) {
        continue;
      }
      const frame = visionFrames.get(deviceId);
      if (!frame) continue;
      try {
        writeJpeg(frame.jpeg, frame.ts);
      } catch {
        break;
      }
    }
    try {
      res.end();
    } catch {
    }
  })().catch(() => {
    try {
      res.end();
    } catch {
    }
  });
});

/**
 * 将局域网 HTTP 视频流经后端同域转发，避免「HTTPS 页面无法加载 HTTP 子资源」的 Mixed Content 问题。
 * 测试阶段：管理员配置摄像头原始地址；前端在 HTTPS 下自动改用本接口作为 img/video 的 src。
 * GET /api/vision/proxy?url=<encodeURIComponent(上游完整URL)>&token=...
 */
app.get('/api/vision/proxy', (req, res) => {
  if (!verifyTokenFromHeaderOrQuery(req)) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
  const raw = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!raw) {
    return res.status(400).json({ message: 'url query is required' });
  }
  let upstream: URL;
  try {
    upstream = new URL(raw);
  } catch {
    return res.status(400).json({ message: 'invalid url' });
  }
  if (!isVisionProxyHostnameAllowed(upstream.hostname)) {
    return res.status(403).json({
      message:
        '该视频源主机未被允许。请使用内网地址，或在环境变量 VISION_PROXY_ALLOWED_HOSTS 中添加主机名（逗号分隔）。'
    });
  }
  if (upstream.protocol !== 'http:' && upstream.protocol !== 'https:') {
    return res.status(400).json({ message: 'only http/https upstream is allowed' });
  }

  const lib = upstream.protocol === 'https:' ? https : http;
  const port =
    upstream.port ||
    (upstream.protocol === 'https:' ? '443' : '80');
  const pathWithQuery = upstream.pathname + upstream.search;

  const preq = lib.request(
    {
      hostname: upstream.hostname,
      port,
      path: pathWithQuery,
      method: 'GET',
      timeout: 120000,
      headers: {
        'User-Agent': 'SmartHive-VisionProxy/1.0',
        Connection: 'keep-alive',
        Accept: '*/*'
      }
    },
    (pres: http.IncomingMessage) => {
      const code = pres.statusCode || 502;
      if (code < 200 || code >= 300) {
        let body = '';
        pres.setEncoding('utf8');
        pres.on('data', (c: string) => {
          body += c;
          if (body.length > 4096) pres.destroy();
        });
        pres.on('end', () => {
          if (!res.headersSent) {
            res.status(code >= 400 ? code : 502).json({
              message: 'upstream returned non-2xx',
              statusCode: code,
              detail: body.slice(0, 500)
            });
          }
        });
        pres.on('error', () => {
          if (!res.headersSent) res.status(502).json({ message: 'upstream error while reading response' });
        });
        return;
      }

      res.statusCode = code;
      const ct = pres.headers['content-type'];
      if (ct) res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'no-cache, no-store');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      pres.pipe(res);
      pres.on('error', (err: Error) => {
        console.error('[vision/proxy] upstream read error', err.message);
        try {
          res.end();
        } catch {
          /* ignore */
        }
      });
    }
  );

  preq.on('error', (err: Error) => {
    console.error('[vision/proxy] request error', err.message);
    if (!res.headersSent) {
      res.status(502).json({ message: 'proxy connect failed', error: err.message });
    }
  });
  preq.on('timeout', () => {
    preq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ message: 'upstream timeout' });
    }
  });
  req.on('close', () => {
    if (!preq.destroyed) preq.destroy();
  });
  preq.end();
});

app.get('/api/geocode/reverse', verifyToken, async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ message: 'Invalid latitude or longitude' });
  }
  // 优先使用请求参数中的API Key，如果没有则使用环境变量，最后使用数据库配置
  let amapKey = normalizeGaodeApiKey(req.query.apiKey as string) || normalizeGaodeApiKey(process.env.GAODE_API_KEY);
  if (!amapKey) {
    const config = await getSystemConfigSnapshot();
    amapKey = config.gaodeApiKey;
  }
  
  if (!amapKey) {
    return res.status(500).json({ message: 'GAODE_API_KEY is not configured' });
  }
  const cacheKey = getGeocodeCacheKey(lat, lon);
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.status(200).json(cached.data);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://restapi.amap.com/v3/geocode/regeo?location=${lon},${lat}&key=${amapKey}&radius=1000&extensions=base&batch=false&roadlevel=0`, { 
      signal: controller.signal 
    });
    if (!response.ok) {
      return res.status(502).json({ message: 'Geocode provider error' });
    }
    const data = await response.json() as any;
    if (data?.status !== '1') {
      return res.status(502).json({ message: data?.info || 'Geocode provider error' });
    }
    const addressInfo = data?.regeocode?.addressComponent || {};
    const province = addressInfo.province || '';
    const city = Array.isArray(addressInfo.city) ? '' : addressInfo.city || addressInfo.province || '';
    const district = addressInfo.district || '';
    const road = addressInfo.township || addressInfo.streetNumber?.street || '';
    const rawFormatted = data?.regeocode?.formatted_address;
    const formatted =
      typeof rawFormatted === 'string'
        ? rawFormatted.trim()
        : Array.isArray(rawFormatted)
          ? rawFormatted.filter((v: unknown) => typeof v === 'string').join(' ').trim()
          : '';
    const fromParts = [province, city, district, road].filter(Boolean).join(' ').trim();
    const address = formatted || fromParts || `蜂箱位置 - ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    const payload = {
      address,
      province,
      city,
      district,
      road,
      source: 'gaode'
    };
    geocodeCache.set(cacheKey, { data: payload, expiresAt: Date.now() + geocodeCacheTtlMs });
    if (geocodeCache.size > geocodeCacheMaxSize) {
      const firstKey = geocodeCache.keys().next().value;
      if (firstKey) geocodeCache.delete(firstKey);
    }
    res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ message: 'Geocode request failed', error: message });
  } finally {
    clearTimeout(timeoutId);
  }
});

// Get vision recognition images (马蜂识别照片) - 已禁用，仅使用实时视频流
// app.get('/api/vision/recognition', verifyToken, async (req, res) => {
//   try {
//     const limit = parseInt(req.query.limit as string) || 50;
//     const images = await fetchVisionRecognitionImagesFromDB(limit);
//     if (images.length === 0) {
//       // 数据库无数据时返回空数组，不再返回模拟数据
//       res.status(200).json([]);
//     } else {
//       res.status(200).json(images);
//     }
//   } catch (error) {
//     // 数据库连接失败时返回错误信息
//     console.error('Database connection error:', error);
//     res.status(500).json({
//       message: 'Database connection failed',
//       error: error instanceof Error ? error.message : String(error)
//     });
//   }
// });

// Insert vision recognition result (后端上传识别照片) - 已禁用，仅使用实时视频流
// app.post('/api/vision/recognition', verifyToken, async (req, res) => {
//   try {
//     const body = req.body as any;
//     
//     // 验证必要字段
//     if (!body.imageUrl || !body.result) {
//       return res.status(400).json({
//         message: 'Invalid data format: imageUrl and result are required'
//       });
//     }

//     await insertVisionRecognitionData({
//       imageUrl: body.imageUrl,
//       result: {
//         type: body.result.type || '未知',
//         confidence: body.result.confidence || 0,
//         description: body.result.description || ''
//       },
//       timestamp: body.timestamp || Date.now()
//     });
//     
//     res.status(201).json({ 
//       message: 'Vision recognition data inserted successfully',
//       timestamp: Date.now()
//     });
//   } catch (error) {
//     console.error('Error inserting vision recognition data:', error);
//     res.status(500).json({
//       message: 'Failed to insert vision recognition data',
//       error: error instanceof Error ? error.message : String(error)
//     });
//   }
// });

// Insert new beehive data
app.post('/api/beehive', verifyToken, async (req, res, next) => {
  try {
    // 使用 Zod 进行严格验证
    const validation = BeehiveDataSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Invalid data format',
        errors: validation.error.issues
      });
    }

    const body = validation.data;
    const data: BeehiveData = {
      timestamp: Date.now(),
      temperature: body.temperature,
      humidity: body.humidity,
      insideTemperature: body.insideTemperature,
      insideHumidity: body.insideHumidity,
      outsideTemperature: body.outsideTemperature,
      outsideHumidity: body.outsideHumidity,
      weight: body.weight,
      beesIn: body.beesIn || 0,
      beesOut: body.beesOut || 0,
      hornetsDetected: body.hornetsDetected || 0,
      latitude: body.latitude,
      longitude: body.longitude
    };

    if (data.latitude === undefined || data.longitude === undefined) {
      const decoded = body.gpsRawHex ? hexToAscii(body.gpsRawHex) : '';
      const parsed = parseNmeaFromText(`${body.gpsRawText || ''}\n${decoded}`);
      if (parsed) {
        data.latitude = parsed.lat;
        data.longitude = parsed.lon;
      }
    }

    await insertBeehiveData(data);
    res.status(201).json({ 
      message: 'Beehive data inserted successfully',
      timestamp: data.timestamp
    });
  } catch (error) {
    next(error);
  }
});

// 统一错误处理中间件
const errorHandler = (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  
  // 处理不同类型的错误
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation error',
      error: err.message
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      message: 'Unauthorized',
      error: err.message
    });
  }
  
  // 默认处理
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
};

// 验证环境变量
const validateEnvironment = () => {
  const warnings: string[] = [];
  
  if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === '') {
    warnings.push('⚠️  警告: DB_PASSWORD 未设置，数据库连接可能失败');
  }
  
  if (!process.env.API_TOKEN) {
    warnings.push('⚠️  安全警告: API_TOKEN 未设置，系统将无法正常工作');
  } else if (process.env.API_TOKEN.length < 16) {
    warnings.push('⚠️  安全警告: API_TOKEN 长度不足16位，建议使用更长的随机字符串');
  }

  if (!(process.env.ADMIN_PASSWORD || '').trim()) {
    warnings.push('⚠️  安全警告: ADMIN_PASSWORD 未设置，管理端登录将不可用（请设置强密码并重启）');
  }
  
  if (warnings.length > 0) {
    console.warn('\n环境变量检查:');
    warnings.forEach(warning => console.warn(warning));
    console.warn('');
  }
};

// Initialize database and start server
const startServer = async () => {
  try {
    // 验证环境变量
    validateEnvironment();
    
    // MQTT/SSE 实时链路必须独立于数据库；即使 MySQL 暂时不可用，前端也应能看到实时上报。
    startMqttIngestService();

    // Initialize database table
    try {
        await initializeDatabase();
    } catch (dbError) {
        console.warn('Warning: Database initialization failed. The server will start, but database features may not work.');
        console.warn('Error details:', dbError instanceof Error ? dbError.message : String(dbError));
        console.warn('Please check your .env file and ensure MySQL is running.');
    }

    // 静态文件服务：将前端打包产物 dist 目录设为静态资源根目录
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      // 处理单页应用 (SPA) 路由，将非 API 请求重定向到 index.html
      app.get(/^(?!\/api).*$/, (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
      console.log(`✅ 已启用静态文件服务: ${distPath}`);
    } else {
      console.warn(`⚠️  警告: 未找到前端构建目录 ${distPath}，前端界面可能无法通过该服务器访问。`);
    }

    // 兼容性占位：处理某些工具可能调用的非标准路径（如 /mcp, /sse）以减少 404 日志
    app.all(['/mcp', '/sse'], (_req, res) => res.status(204).end());

    // 应用错误处理中间件 (必须在所有路由之后)
    app.use(errorHandler);
    
    // Start the server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`========================================`);
      console.log(`  智慧蜂场管理系统 - 后端服务器`);
      console.log(`========================================`);
      console.log(`✅ 后端服务器启动成功！`);
      console.log(``);
      console.log(`服务器地址: http://0.0.0.0:${PORT}`);
      console.log(`本地访问: http://localhost:${PORT}`);
      console.log(``);
      console.log(`API 端点:`);
      console.log(`  GET  /api/health (健康检查，无需token)`);
      console.log(`  GET  /api/beehive/latest (获取最新数据，需要token)`);
      console.log(`  GET  /api/beehive/history?limit=40 (获取历史数据，需要token)`);
      console.log(`  POST /api/beehive (插入数据，需要token)`);
      console.log(`  GET  /api/geocode/reverse (地理编码，需要token)`);
      console.log(`  GET  /api/config (获取配置，需要token)`);
      console.log(`  POST /api/config (更新配置，需要token)`);
      console.log(`  POST /api/auth/login (登录，无需 token；管理员需配置 ADMIN_PASSWORD)`);
      console.log(``);
      const tok = (process.env.API_TOKEN || '').trim();
      console.log(
        tok
          ? `API 已配置访问令牌（长度 ${tok.length}，请勿在日志中打印完整值；请求头: Authorization: Bearer <API_TOKEN>）`
          : 'API_TOKEN 未配置，请先设置环境变量'
      );
      console.log(``);
      console.log(`💡 提示: 按 Ctrl+C 可以停止后端服务`);
      console.log(`========================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
