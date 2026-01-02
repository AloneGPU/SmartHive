
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
    const response = await authorizedFetch(`${baseUrl}/api/beehive/history?limit=${limit}`, token);
    if (!response.ok) throw new Error('历史记录加载失败');
    const data: BeehiveData[] = await response.json();
    
    // Transform to chart friendly format and sort by time ascending
    return data.map(item => ({
      ...item,
      time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      temp: item.temperature, // Map temperature to temp for existing charts
    })).reverse();
  } catch (error) {
    return [];
  }
};

/**
 * 测试后端连接连通性
 */
export const testConnection = async (baseUrl: string, token: string, mode: ConnectionMode = 'CLOUD'): Promise<boolean> => {
  try {
    const response = await authorizedFetch(`${baseUrl}/api/health`, token);
    return response.ok;
  } catch (e) {
    return false;
  }
};

// Keep the old function name for backwards compatibility
export const testGatewayConnection = testConnection;
