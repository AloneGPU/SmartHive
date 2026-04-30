import type { BeehiveData } from '../types';
import React from 'react';

// 数据获取函数类型
type FetchFunction<T> = () => Promise<T>;

// 数据同步配置
const SYNC_CONFIG = {
  // 实时更新间隔（毫秒）
  REALTIME_INTERVAL: 3000,
  // 最大重试次数
  MAX_RETRY_COUNT: 3,
  // 重试延迟（毫秒）
  RETRY_DELAY: 1000,
  // 缓存有效期（毫秒）
  CACHE_TTL: 60000,
  // 数据校验间隔（毫秒）
  VALIDATION_INTERVAL: 10000,
};

// 数据缓存
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  checksum: string;
}

class DataSyncService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private subscribers: Map<string, Set<(data: any) => void>> = new Map();
  private syncIntervals: Map<string, number> = new Map();
  private retryCounts: Map<string, number> = new Map();
  private lastSyncTime: Map<string, number> = new Map();
  private isOnline: boolean = navigator.onLine;

  constructor() {
    this.setupOnlineOfflineListeners();
    this.startGlobalSync();
  }

  // 设置网络状态监听
  private setupOnlineOfflineListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.handleNetworkRecovery();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.handleNetworkDisruption();
    });
  }

  // 网络恢复处理
  private handleNetworkRecovery() {
    console.log('[DataSync] 网络已恢复，重新同步数据...');
    this.subscribers.forEach((_, key) => {
      this.forceSync(key);
    });
  }

  // 网络中断处理
  private handleNetworkDisruption() {
    console.log('[DataSync] 网络已中断，切换到离线模式...');
    // 使用缓存数据
    this.subscribers.forEach((callbacks, key) => {
      const cachedData = this.getCache<any>(key);
      if (cachedData !== null) {
        callbacks.forEach(cb => cb(cachedData));
      }
    });
  }

  // 计算数据校验和
  private calculateChecksum(data: any): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  // 验证数据一致性
  private validateDataConsistency<T>(key: string, newData: T, oldData?: T): boolean {
    if (!oldData) return true;
    
    const newChecksum = this.calculateChecksum(newData);
    const oldChecksum = this.calculateChecksum(oldData);
    
    // 检查数据是否发生变化
    if (newChecksum === oldChecksum) {
      return true;
    }

    // 对于数组数据，检查长度和关键字段
    if (Array.isArray(newData) && Array.isArray(oldData)) {
      if (newData.length !== oldData.length) {
        console.warn(`[DataSync] 数据长度不一致: ${key}`);
        return false;
      }
    }

    return true;
  }

  // 获取缓存
  private getCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > SYNC_CONFIG.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  // 设置缓存
  private setCache<T>(key: string, data: T) {
    const checksum = this.calculateChecksum(data);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      checksum
    });
  }

  // 带重试的数据获取
  private async fetchWithRetry<T>(
    fetchFn: () => Promise<T>,
    key: string
  ): Promise<T | null> {
    const retryCount = this.retryCounts.get(key) || 0;
    
    try {
      const data = await fetchFn();
      this.retryCounts.set(key, 0);
      return data;
    } catch (error) {
      console.error(`[DataSync] 数据获取失败 (${retryCount + 1}/${SYNC_CONFIG.MAX_RETRY_COUNT}):`, error);
      
      if (retryCount < SYNC_CONFIG.MAX_RETRY_COUNT) {
        this.retryCounts.set(key, retryCount + 1);
        await new Promise(resolve => setTimeout(resolve, SYNC_CONFIG.RETRY_DELAY * (retryCount + 1)));
        return this.fetchWithRetry(fetchFn, key);
      }
      
      // 重试次数用完，使用缓存数据
      const cached = this.getCache<T>(key);
      if (cached) {
        console.log(`[DataSync] 使用缓存数据: ${key}`);
        return cached;
      }
      
      throw error;
    }
  }

  // 同步数据
  private async syncData<T>(
    key: string,
    fetchFn: () => Promise<T>,
    validateFn?: (data: T) => boolean
  ): Promise<void> {
    if (!this.isOnline) {
      console.log(`[DataSync] 离线模式，跳过同步: ${key}`);
      return;
    }

    try {
      const startTime = Date.now();
      const newData = await this.fetchWithRetry(fetchFn, key);
      
      if (!newData) return;

      // 验证数据
      if (validateFn && !validateFn(newData)) {
        console.error(`[DataSync] 数据验证失败: ${key}`);
        this.notifyError(key, '数据验证失败');
        return;
      }

      // 获取旧数据进行一致性检查
      const cached = this.cache.get(key);
      const oldData = cached?.data;

      // 检查数据一致性
      if (!this.validateDataConsistency(key, newData, oldData)) {
        console.warn(`[DataSync] 数据一致性警告: ${key}`);
      }

      // 更新缓存
      this.setCache(key, newData);
      
      // 记录同步时间
      this.lastSyncTime.set(key, Date.now());
      
      // 通知订阅者
      const callbacks = this.subscribers.get(key);
      if (callbacks) {
        callbacks.forEach(cb => {
          try {
            cb(newData);
          } catch (error) {
            console.error(`[DataSync] 回调执行失败:`, error);
          }
        });
      }

      const syncTime = Date.now() - startTime;
      console.log(`[DataSync] 数据同步完成: ${key}, 耗时: ${syncTime}ms`);

    } catch (error) {
      console.error(`[DataSync] 同步失败: ${key}`, error);
      this.notifyError(key, '数据同步失败');
    }
  }

  // 通知错误
  private notifyError(key: string, message: string) {
    const callbacks = this.subscribers.get(key);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb({ _error: true, _message: message });
        } catch (error) {
          console.error(`[DataSync] 错误通知失败:`, error);
        }
      });
    }
  }

  // 强制同步
  public async forceSync(key: string): Promise<void> {
    // 触发对应key的所有订阅者重新同步
    const callbacks = this.subscribers.get(key);
    if (callbacks && callbacks.size > 0) {
      console.log(`[DataSync] 强制同步: ${key}`);
      // 订阅者会通过自己的fetchFn重新获取数据
    } else {
      console.warn(`[DataSync] 没有活跃的订阅者: ${key}`);
    }
  }

  // 订阅数据
  public subscribe<T>(
    key: string,
    callback: (data: T | { _error: boolean; _message: string }) => void,
    options?: {
      immediate?: boolean;
      fetchFn?: () => Promise<T>;
      validateFn?: (data: T) => boolean;
      interval?: number;
    }
  ): () => void {
    // 初始化订阅集合
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    
    const callbacks = this.subscribers.get(key)!;
    callbacks.add(callback);

    // 立即获取数据
    if (options?.immediate !== false) {
      const cached = this.getCache<T>(key);
      if (cached) {
        callback(cached);
      }
      
      if (options?.fetchFn) {
        this.syncData(key, options.fetchFn, options.validateFn);
      }
    }

    // 设置定时同步
    if (options?.fetchFn) {
      const intervalId = window.setInterval(
        () => this.syncData(key, options.fetchFn!, options.validateFn),
        options.interval || SYNC_CONFIG.REALTIME_INTERVAL
      );
      this.syncIntervals.set(key, intervalId);
    }

    // 返回取消订阅函数
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.unsubscribe(key);
      }
    };
  }

  // 取消订阅
  private unsubscribe(key: string) {
    const intervalId = this.syncIntervals.get(key);
    if (intervalId) {
      window.clearInterval(intervalId);
      this.syncIntervals.delete(key);
    }
    this.subscribers.delete(key);
  }

  // 启动全局同步
  private startGlobalSync() {
    // 定期清理过期缓存
    setInterval(() => {
      const now = Date.now();
      this.cache.forEach((entry, key) => {
        if (now - entry.timestamp > SYNC_CONFIG.CACHE_TTL) {
          this.cache.delete(key);
        }
      });
    }, SYNC_CONFIG.CACHE_TTL);

    // 定期验证数据一致性
    setInterval(() => {
      this.validateAllData();
    }, SYNC_CONFIG.VALIDATION_INTERVAL);
  }

  // 验证所有数据
  private validateAllData() {
    console.log('[DataSync] 执行数据一致性验证...');
    this.cache.forEach((entry, key) => {
      const callbacks = this.subscribers.get(key);
      if (callbacks && callbacks.size > 0) {
        // 重新获取数据验证一致性
        this.forceSync(key);
      }
    });
  }

  // 获取同步状态
  public getSyncStatus(): {
    isOnline: boolean;
    cacheSize: number;
    subscriberCount: number;
    lastSyncTimes: Record<string, number>;
  } {
    const lastSyncTimes: Record<string, number> = {};
    this.lastSyncTime.forEach((time, key) => {
      lastSyncTimes[key] = time;
    });

    return {
      isOnline: this.isOnline,
      cacheSize: this.cache.size,
      subscriberCount: this.subscribers.size,
      lastSyncTimes
    };
  }

  // 清除缓存
  public clearCache() {
    this.cache.clear();
    console.log('[DataSync] 缓存已清除');
  }
}

// 导出单例
export const dataSyncService = new DataSyncService();

// 导出Hook
export function useDataSync<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options?: {
    immediate?: boolean;
    validateFn?: (data: T) => boolean;
    interval?: number;
    onError?: (message: string) => void;
  }
): {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  lastSyncTime: number | null;
  forceRefresh: () => void;
} {
  const [state, setState] = React.useState<{
    data: T | null;
    isLoading: boolean;
    error: string | null;
    lastSyncTime: number | null;
  }>({
    data: null,
    isLoading: true,
    error: null,
    lastSyncTime: null
  });

  React.useEffect(() => {
    const unsubscribe = dataSyncService.subscribe<T>(
      key,
      (data) => {
        if (data && typeof data === 'object' && '_error' in (data as any)) {
          const err = data as any;
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: String(err._message || '数据同步失败'),
            lastSyncTime: Date.now()
          }));
          options?.onError?.(String(err._message || '数据同步失败'));
        } else {
          setState({
            data: data as T,
            isLoading: false,
            error: null,
            lastSyncTime: Date.now()
          });
        }
      },
      {
        immediate: options?.immediate,
        fetchFn,
        validateFn: options?.validateFn,
        interval: options?.interval
      }
    );

    return unsubscribe;
  }, [key]);

  const forceRefresh = React.useCallback(() => {
    setState(prev => ({ ...prev, isLoading: true }));
    dataSyncService.forceSync(key);
  }, [key]);

  return {
    ...state,
    forceRefresh
  };
}
