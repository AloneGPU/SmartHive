import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  testDatabaseConnection,
  fetchLiveHiveDataFromDB,
  fetchHistoryDataFromDB,
  insertBeehiveData,
  initializeDatabase
} from './services/databaseService';
import { BeehiveData } from './types';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
// CORS配置：生产环境应该限制允许的源
const corsOptions = {
  origin: true, // 允许所有来源，避免 CORS 问题
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 限制请求体大小（防止DoS攻击）
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Token verification middleware
const verifyToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Unauthorized: Missing or invalid Authorization header'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  // Token from env or default
  const FIXED_TOKEN = process.env.API_TOKEN || '123456789';//令牌密码
  
  if (token !== FIXED_TOKEN) {
    return res.status(401).json({
      message: 'Unauthorized: Invalid token'
    });
  }
  
  // Add token to request for future use if needed
  (req as any).token = token;
  next();
};

const hexToAscii = (hex: string) => {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  let result = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isNaN(code)) {
      result += String.fromCharCode(code);
    }
  }
  return result;
};

const parseNmeaCoord = (raw: string, hemi: string, isLat: boolean) => {
  if (!raw || !hemi) return null;
  const degLength = isLat ? 2 : 3;
  const degrees = parseInt(raw.slice(0, degLength), 10);
  const minutes = parseFloat(raw.slice(degLength));
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null;
  let value = degrees + minutes / 60;
  if (hemi === 'S' || hemi === 'W') value = -value;
  return value;
};

const extractNmeaSentences = (text: string) => {
  const results: string[] = [];
  const parts = text.split('$').slice(1);
  for (const part of parts) {
    const line = part.split(/\r?\n/)[0];
    if (line) results.push(`$${line}`);
  }
  return results;
};

const parseNmeaFromText = (text: string) => {
  const sentences = extractNmeaSentences(text);
  const findSentence = (type: 'RMC' | 'GGA' | 'GLL') => {
    return sentences.find(s => s.length > 6 && s.slice(3, 6) === type);
  };
  const tryParse = (type: 'RMC' | 'GGA' | 'GLL') => {
    const line = findSentence(type);
    if (!line) return null;
    const fields = line.split(',');
    if (type === 'RMC') {
      if (fields[2] !== 'A') return null;
      const lat = parseNmeaCoord(fields[3], fields[4], true);
      const lon = parseNmeaCoord(fields[5], fields[6], false);
      if (lat === null || lon === null) return null;
      return { lat, lon };
    }
    if (type === 'GGA') {
      const fix = parseInt(fields[6], 10);
      if (!Number.isFinite(fix) || fix <= 0) return null;
      const lat = parseNmeaCoord(fields[2], fields[3], true);
      const lon = parseNmeaCoord(fields[4], fields[5], false);
      if (lat === null || lon === null) return null;
      return { lat, lon };
    }
    if (type === 'GLL') {
      if (fields[6] !== 'A') return null;
      const lat = parseNmeaCoord(fields[1], fields[2], true);
      const lon = parseNmeaCoord(fields[3], fields[4], false);
      if (lat === null || lon === null) return null;
      return { lat, lon };
    }
    return null;
  };
  return tryParse('RMC') || tryParse('GGA') || tryParse('GLL');
};

const geocodeCache = new Map<string, { data: any; expiresAt: number }>();
const geocodeCacheTtlMs = 10 * 60 * 1000;
const geocodeCacheMaxSize = 200;
const getGeocodeCacheKey = (lat: number, lon: number) => `${lat.toFixed(6)},${lon.toFixed(6)}`;

// Health check endpoint - no token required
app.get('/api/health', async (req, res) => {
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

// Protected API endpoints with token verification

// Get latest beehive data
app.get('/api/beehive/latest', verifyToken, async (req, res) => {
  try {
    const data = await fetchLiveHiveDataFromDB();
    if (data === null) {
      res.status(404).json({
        message: 'No beehive data found in database'
      });
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch live beehive data',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get historical beehive data
app.get('/api/beehive/history', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 40;
    const data = await fetchHistoryDataFromDB(limit);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch historical beehive data',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/geocode/reverse', verifyToken, async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ message: 'Invalid latitude or longitude' });
  }
  const amapKey = process.env.GAODE_API_KEY;
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
    const response = await fetch(`https://restapi.amap.com/v3/geocode/regeo?location=${lon},${lat}&key=${amapKey}&radius=1000&extensions=base&batch=false&roadlevel=0`, { signal: controller.signal });
    if (!response.ok) {
      return res.status(502).json({ message: 'Geocode provider error' });
    }
    const data = await response.json();
    if (data?.status !== '1') {
      return res.status(502).json({ message: data?.info || 'Geocode provider error' });
    }
    const addressInfo = data?.regeocode?.addressComponent || {};
    const province = addressInfo.province || '';
    const city = Array.isArray(addressInfo.city) ? '' : addressInfo.city || addressInfo.province || '';
    const district = addressInfo.district || '';
    const road = addressInfo.township || addressInfo.streetNumber?.street || '';
    const address = data?.regeocode?.formatted_address || [province, city, district, road].filter(Boolean).join(' ');
    const payload = {
      address: address || `蜂箱位置 - ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
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

// Insert new beehive data
app.post('/api/beehive', verifyToken, async (req, res) => {
  try {
    const body = req.body as any;
    const data = body as Omit<BeehiveData, 'timestamp'>;
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
      const rawText = typeof body.gpsRawText === 'string' ? body.gpsRawText : '';
      const rawHex = typeof body.gpsRawHex === 'string' ? body.gpsRawHex : '';
      const decoded = rawHex ? hexToAscii(rawHex) : '';
      const parsed = parseNmeaFromText(`${rawText}\n${decoded}`);
      if (parsed) {
        data.latitude = parsed.lat;
        data.longitude = parsed.lon;
      }
    }
    
    // 基本数据验证
    if (typeof data.temperature !== 'number' || 
        typeof data.humidity !== 'number' || 
        typeof data.weight !== 'number') {
      return res.status(400).json({
        message: 'Invalid data format: temperature, humidity, and weight must be numbers'
      });
    }

    await insertBeehiveData(data);
    res.status(201).json({ 
      message: 'Beehive data inserted successfully',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error inserting beehive data:', error);
    res.status(500).json({
      message: 'Failed to insert beehive data',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 验证环境变量
const validateEnvironment = () => {
  const warnings: string[] = [];
  
  if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === '') {
    warnings.push('⚠️  警告: DB_PASSWORD 未设置，数据库连接可能失败');
  }
  
  if (process.env.API_TOKEN === '123456789' || !process.env.API_TOKEN) {
    warnings.push('⚠️  安全警告: 使用默认 API_TOKEN，生产环境请修改为复杂密码');
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
    
    // Initialize database table
    try {
        await initializeDatabase();
    } catch (dbError) {
        console.warn('Warning: Database initialization failed. The server will start, but database features may not work.');
        console.warn('Error details:', dbError instanceof Error ? dbError.message : String(dbError));
        console.warn('Please check your .env file and ensure MySQL is running.');
    }
    
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
      console.log(``);
      console.log(`Token 格式: Authorization: Bearer ${process.env.API_TOKEN || '123456789'}`);
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
