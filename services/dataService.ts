
import { BeehiveData, ConnectionMode } from '../types';

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

export const fetchLiveHiveData = async (baseUrl: string, token: string, mode: ConnectionMode = 'CLOUD'): Promise<BeehiveData | null> => {
  try {
    const response = await authorizedFetch(`${baseUrl}/api/beehive/latest`, token);
    if (!response.ok) {
      if (response.status === 404) {
        // 返回 null 表示数据库中没有数据
        return null;
      }
      throw new Error('网关响应异常');
    }
    const data = await response.json();
    if (data && data.timestamp) {
        data.timestamp = normalizeTimestamp(data.timestamp);
    }
    return data;
  } catch (error) {
    // No longer return mock data when database has no data
    console.error('获取数据失败:', error);
    return null;
  }
};

export const fetchHistoryData = async (baseUrl: string, token: string, limit: number = 40, mode: ConnectionMode = 'CLOUD'): Promise<any[]> => {
  try {
    // 限制查询数量，防止过大请求
    const safeLimit = Math.min(Math.max(1, limit), 1000);
    const response = await authorizedFetch(`${baseUrl}/api/beehive/history?limit=${safeLimit}`, token);
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('认证失败，请检查Token');
      }
      throw new Error('历史记录加载失败');
    }
    const data: BeehiveData[] = await response.json();
    
    if (!data || data.length === 0) {
      return [];
    }

    return data.map(item => {
      const timestamp = normalizeTimestamp(item.timestamp);
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
        temp: item.temperature || 0,
        weight: item.weight || 0,
        humidity: item.humidity || 0,
        beesIn: item.beesIn || 0,
        beesOut: item.beesOut || 0,
      };
    }).reverse();
  } catch (error) {
    console.error('获取历史数据失败:', error);
    return [];
  }
};

export const reverseGeocode = async (baseUrl: string, token: string, latitude: number, longitude: number): Promise<any | null> => {
  try {
    const response = await authorizedFetch(`${baseUrl}/api/geocode/reverse?lat=${latitude}&lon=${longitude}`, token);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('定位解析失败:', error);
    return null;
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
  try {
    // health端点不需要token，直接访问
    const response = await fetch(`${baseUrl}/api/health`);
    return response.ok;
  } catch (e) {
    return false;
  }
};

// Keep the old function name for backwards compatibility
export const testGatewayConnection = testConnection;
