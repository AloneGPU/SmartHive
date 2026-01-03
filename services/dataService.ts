
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
    return await response.json();
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
    
    // Transform to chart friendly format and sort by time ascending
    return data.map(item => ({
      ...item,
      time: new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      temp: item.temperature || 0, // Map temperature to temp for existing charts
      weight: item.weight || 0,
      humidity: item.humidity || 0,
      beesIn: item.beesIn || 0,
      beesOut: item.beesOut || 0,
    })).reverse();
  } catch (error) {
    console.error('获取历史数据失败:', error);
    return [];
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
