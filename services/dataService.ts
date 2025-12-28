
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

export const fetchLiveHiveData = async (baseUrl: string, token: string, mode: ConnectionMode = 'CLOUD'): Promise<BeehiveData> => {
  try {
    const response = await authorizedFetch(`${baseUrl}/api/beehive/latest`, token);
    if (!response.ok) throw new Error('网关响应异常');
    return await response.json();
  } catch (error) {
    console.warn('正在使用演示数据模式...', error);
    return {
      timestamp: Date.now(),
      temperature: 34.8,
      humidity: 52,
      weight: 25.1,
      beesIn: 1350,
      beesOut: 1200,
      batteryLevel: 98,
      hornetsDetected: 0,
    };
  }
};

export const fetchHistoryData = async (baseUrl: string, token: string, limit: number = 40, mode: ConnectionMode = 'CLOUD'): Promise<any[]> => {
  try {
    const response = await authorizedFetch(`${baseUrl}/api/beehive/history?limit=${limit}`, token);
    if (!response.ok) throw new Error('历史记录加载失败');
    return await response.json();
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
