import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useQuery, type UseQueryResult, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '../context/AppContext';
import { fetchHiveRangeData, fetchLiveHiveData, getFriendlyErrorMessage } from '../services/dataService';
import { dataSyncService } from '../services/dataSyncService';
import type { BeehiveData } from '../types';

// 数据同步配置
const SYNC_CONFIG = {
  // 实时更新间隔（毫秒）- 3秒内
  REALTIME_INTERVAL: 3000,
  // 最大重试次数
  MAX_RETRY_COUNT: 3,
  // 重试延迟（毫秒）
  RETRY_DELAY: 1000,
  // 缓存有效期（毫秒）
  CACHE_TTL: 60000,
  // 数据校验间隔（毫秒）
  VALIDATION_INTERVAL: 10000,
  // 数据一致性检查阈值（毫秒）
  CONSISTENCY_THRESHOLD: 5000,
};

export const useHiveApi = () => {
  const { aiConfig } = useAppContext();
  return {
    baseUrl: aiConfig.apiBaseUrl || '/api',
    token: aiConfig.apiToken,
    isEnabled: Boolean(aiConfig.apiToken)
  };
};

// 蜂箱「最新一条」：仅 React Query 轮询 /beehive/latest，不叠加 dataSync（避免内存缓存旧值 + 双重 HTTP）
export const useLiveHiveQuery = (options: { 
  enabled?: boolean; 
  refetchInterval?: number;
  onError?: (message: string) => void;
} = {}) => {
  const { baseUrl, token, isEnabled } = useHiveApi();

  const query = useQuery({
    queryKey: ['live', baseUrl, token],
    queryFn: () => fetchLiveHiveData(baseUrl, token),
    enabled: isEnabled && (options.enabled ?? true),
    refetchInterval: options.refetchInterval ?? SYNC_CONFIG.REALTIME_INTERVAL,
    refetchIntervalInBackground: true,
    staleTime: 0,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (query.isError && query.error) {
      options.onError?.(getFriendlyErrorMessage(query.error, '实时蜂箱数据加载失败'));
    }
  }, [query.isError, query.error, options.onError]);

  const lastSyncTime = query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null;
  const syncStatus: 'syncing' | 'synced' | 'error' = query.isError
    ? 'error'
    : query.isFetching && query.fetchStatus === 'fetching' && !query.data
      ? 'syncing'
      : 'synced';

  return {
    ...query,
    syncStatus,
    lastSyncTime,
    isStale: lastSyncTime ? Date.now() - lastSyncTime > SYNC_CONFIG.CONSISTENCY_THRESHOLD : false,
  };
};

interface HiveRangeOptions {
  enabled?: boolean;
  id?: string;
  refetchInterval?: number;
  onError?: (message: string) => void;
}

// 增强版范围数据Hook
export const useHiveRangeQuery = (startMs: number, endMs: number, options: HiveRangeOptions = {}) => {
  const { baseUrl, token, isEnabled } = useHiveApi();
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'synced' | 'error'>('syncing');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [dataChecksum, setDataChecksum] = useState<string>('');
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const queryClient = useQueryClient();

  // 计算数据校验和
  const calculateChecksum = useCallback((data: BeehiveData[]): string => {
    const str = JSON.stringify(data.map(d => ({
      ts: d.timestamp,
      temp: d.temperature,
      hum: d.humidity,
      weight: d.weight
    })));
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }, []);

  // 验证数据一致性
  const validateDataConsistency = useCallback((newData: BeehiveData[], oldData?: BeehiveData[]): boolean => {
    if (!oldData || oldData.length === 0) return true;
    
    const newChecksum = calculateChecksum(newData);
    const oldChecksum = calculateChecksum(oldData);
    
    // 检查数据是否发生变化
    if (newChecksum === oldChecksum) {
      return true;
    }

    // 检查数据长度
    if (newData.length !== oldData.length) {
      console.warn(`[useHiveRangeQuery] 数据长度不一致: ${oldData.length} -> ${newData.length}`);
      return false;
    }

    // 检查关键数据点
    const sampleSize = Math.min(5, newData.length);
    for (let i = 0; i < sampleSize; i++) {
      const oldItem = oldData[Math.floor(oldData.length * i / sampleSize)];
      const newItem = newData[Math.floor(newData.length * i / sampleSize)];
      
      if (oldItem.timestamp !== newItem.timestamp) {
        console.warn(`[useHiveRangeQuery] 时间戳不一致`);
        return false;
      }
    }

    return true;
  }, [calculateChecksum]);

  // 使用React Query作为基础
  const query = useQuery({
    queryKey: ['hive-range', baseUrl, token, startMs, endMs, options.id],
    queryFn: async () => {
      const data = await fetchHiveRangeData(baseUrl, token, startMs, endMs, 5000, 0);
      
      // 验证数据一致性
      const currentData = queryClient.getQueryData<BeehiveData[]>(['hive-range', baseUrl, token, startMs, endMs, options.id]);
      if (!validateDataConsistency(data, currentData)) {
        console.warn('[useHiveRangeQuery] 数据一致性警告');
      }
      
      // 更新校验和
      setDataChecksum(calculateChecksum(data));
      
      return data;
    },
    enabled: isEnabled && (options.enabled ?? true),
    refetchInterval: options.refetchInterval ?? SYNC_CONFIG.REALTIME_INTERVAL,
    refetchIntervalInBackground: true,
    staleTime: SYNC_CONFIG.REALTIME_INTERVAL / 2,
  });

  // 集成数据同步服务
  useEffect(() => {
    if (!isEnabled || !(options.enabled ?? true)) return;

    const cacheKey = `hive-range-${startMs}-${endMs}`;
    
    unsubscribeRef.current = dataSyncService.subscribe<BeehiveData[]>(
      cacheKey,
      (data) => {
        if ('_error' in data) {
          setSyncStatus('error');
          options.onError?.(data._message);
        } else {
          setSyncStatus('synced');
          setLastSyncTime(Date.now());
          
          // 验证数据一致性
          const currentData = queryClient.getQueryData<BeehiveData[]>(['hive-range', baseUrl, token, startMs, endMs, options.id]);
          if (!validateDataConsistency(data, currentData)) {
            console.warn(`[useHiveRangeQuery] 数据一致性警告: ${cacheKey}`);
          }
          
          // 更新React Query缓存
          queryClient.setQueryData(['hive-range', baseUrl, token, startMs, endMs, options.id], data);
          setDataChecksum(calculateChecksum(data));
        }
      },
      {
        immediate: true,
        fetchFn: () => fetchHiveRangeData(baseUrl, token, startMs, endMs, 5000, 0),
        interval: SYNC_CONFIG.REALTIME_INTERVAL,
        validateFn: (data) => Array.isArray(data),
      }
    );

    return () => {
      unsubscribeRef.current?.();
    };
  }, [baseUrl, token, isEnabled, options.enabled, options.onError, startMs, endMs, options.id, queryClient, validateDataConsistency, calculateChecksum]);

  // 定期验证数据一致性
  useEffect(() => {
    if (!isEnabled || !(options.enabled ?? true)) return;

    const validateInterval = setInterval(() => {
      const currentData = query.data;
      if (currentData && dataChecksum) {
        const currentChecksum = calculateChecksum(currentData);
        if (currentChecksum !== dataChecksum) {
          console.warn('[useHiveRangeQuery] 数据校验和不匹配，重新获取数据');
          query.refetch();
        }
      }
    }, SYNC_CONFIG.VALIDATION_INTERVAL);

    return () => clearInterval(validateInterval);
  }, [isEnabled, options.enabled, query, dataChecksum, calculateChecksum]);

  return {
    ...query,
    syncStatus,
    lastSyncTime,
    dataChecksum,
    isStale: lastSyncTime ? Date.now() - lastSyncTime > SYNC_CONFIG.CONSISTENCY_THRESHOLD : false,
  };
};

// 使用数据同步服务的通用Hook
export const useSyncedData = <T,>(
  key: string,
  fetchFn: () => Promise<T>,
  options?: {
    enabled?: boolean;
    interval?: number;
    validateFn?: (data: T) => boolean;
    onError?: (message: string) => void;
  }
) => {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!(options?.enabled ?? true)) return;

    setIsLoading(true);
    
    unsubscribeRef.current = dataSyncService.subscribe<T>(
      key,
      (result) => {
        if (result && typeof result === 'object' && '_error' in (result as any)) {
          const err = result as any;
          setError(String(err._message || '数据同步失败'));
          setIsLoading(false);
          options?.onError?.(String(err._message || '数据同步失败'));
        } else {
          setData(result as T);
          setError(null);
          setIsLoading(false);
          setLastSyncTime(Date.now());
        }
      },
      {
        immediate: true,
        fetchFn,
        interval: options?.interval ?? SYNC_CONFIG.REALTIME_INTERVAL,
        validateFn: options?.validateFn,
      }
    );

    return () => {
      unsubscribeRef.current?.();
    };
  }, [key, options?.enabled, options?.interval, options?.validateFn, options?.onError, fetchFn]);

  const forceRefresh = useCallback(() => {
    setIsLoading(true);
    dataSyncService.forceSync(key);
  }, [key]);

  return {
    data,
    isLoading,
    error,
    lastSyncTime,
    isStale: lastSyncTime ? Date.now() - lastSyncTime > SYNC_CONFIG.CONSISTENCY_THRESHOLD : false,
    forceRefresh,
  };
};

export const useQueryError = (query: UseQueryResult<any, any>, defaultMsg: string) => {
  return useMemo(() => {
    if (!query.isError) return '';
    return getFriendlyErrorMessage(query.error, defaultMsg);
  }, [query.isError, query.error, defaultMsg]);
};

export const formatYMD = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDateTime = (timestamp: number) => {
  const d = new Date(timestamp);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const calculateDataQuality = (data: BeehiveData[]): {
  completeness: number;
  freshness: number;
  consistency: number;
  overall: number;
} => {
  if (!data || data.length === 0) {
    return { completeness: 0, freshness: 0, consistency: 0, overall: 0 };
  }

  // 计算数据完整性
  const requiredFields = ['timestamp', 'temperature', 'humidity', 'weight'];
  const completenessScores = data.map(item => {
    const hasFields = requiredFields.filter(field => {
      const value = (item as any)[field];
      return value !== null && value !== undefined && !isNaN(value);
    }).length;
    return hasFields / requiredFields.length;
  });
  const completeness = completenessScores.reduce((a, b) => a + b, 0) / completenessScores.length * 100;

  // 计算数据新鲜度
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5分钟
  const freshnessScores = data.map(item => {
    const age = now - item.timestamp;
    return Math.max(0, 1 - age / maxAge);
  });
  const freshness = freshnessScores.reduce((a, b) => a + b, 0) / freshnessScores.length * 100;

  // 计算数据一致性
  const timestamps = data.map(d => d.timestamp).sort((a, b) => a - b);
  const intervals = timestamps.slice(1).map((ts, i) => ts - timestamps[i]);
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
  const consistency = Math.max(0, 100 - (variance / 1000)); // 简化的一致性计算

  // 综合质量评分
  const overall = (completeness + freshness + consistency) / 3;

  return {
    completeness: Math.round(completeness),
    freshness: Math.round(freshness),
    consistency: Math.round(consistency),
    overall: Math.round(overall),
  };
};
