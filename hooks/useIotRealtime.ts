import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { fetchIotHistory, fetchIotLatest, fetchIotMonitor, type IotMonitorSnapshot, type IotSensorPoint } from '../services/dataService';

type RealtimeState = {
  latest: IotSensorPoint[];
  history: IotSensorPoint[];
  monitor: IotMonitorSnapshot | null;
  streamConnected: boolean;
  lastUpdated: number | null;
  reconnectAttempts: number;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
};

type UseIotRealtimeOptions = {
  baseUrl?: string;
  token?: string;
  enabled?: boolean;
  onError?: (error: unknown) => void;
  onStreamStatusChange?: (connected: boolean) => void;
  onDataUpdate?: (data: IotSensorPoint[]) => void;
  maxReconnectAttempts?: number;
  initialReconnectDelay?: number;
  maxReconnectDelay?: number;
};

const toMap = (rows: IotSensorPoint[]) => {
  const m = new Map<string, IotSensorPoint>();
  for (const row of rows) m.set(row.sensorType, row);
  return m;
};

const toFiniteNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const useIotRealtime = (
  deviceId: string,
  rangeMs: number,
  options: UseIotRealtimeOptions = {}
) => {
  const [state, setState] = useState<RealtimeState>({
    latest: [],
    history: [],
    monitor: null,
    streamConnected: false,
    lastUpdated: null,
    reconnectAttempts: 0,
    connectionStatus: 'disconnected'
  });

  const baseUrl = options.baseUrl || '/api';
  const token = options.token || '';
  const enabled = options.enabled ?? Boolean(token);
  const { 
    onError, 
    onStreamStatusChange, 
    onDataUpdate,
    maxReconnectAttempts = 10,
    initialReconnectDelay = 1000,
    maxReconnectDelay = 30000
  } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const closedRef = useRef(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (closedRef.current || !token || !deviceId) return;

    // 清理旧连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setState(prev => ({ ...prev, connectionStatus: 'connecting' }));

    const url = `${baseUrl}/iot/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      if (closedRef.current) return;
      
      reconnectAttemptsRef.current = 0;
      setState(prev => ({ 
        ...prev, 
        streamConnected: true, 
        connectionStatus: 'connected',
        reconnectAttempts: 0 
      }));
      onStreamStatusChange?.(true);
      console.log('[IoT Stream] 连接已建立');
    };

    es.onerror = (event) => {
      if (closedRef.current) return;
      
      console.error('[IoT Stream] 连接错误:', event);
      setState(prev => ({ 
        ...prev, 
        streamConnected: false, 
        connectionStatus: 'disconnected' 
      }));
      onStreamStatusChange?.(false);
      
      // 关闭当前连接
      es.close();
      eventSourceRef.current = null;

      // 指数退避重连
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(
          initialReconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
          maxReconnectDelay
        );
        
        reconnectAttemptsRef.current++;
        setState(prev => ({ 
          ...prev, 
          connectionStatus: 'reconnecting',
          reconnectAttempts: reconnectAttemptsRef.current 
        }));
        
        console.log(`[IoT Stream] 将在 ${delay}ms 后重连 (尝试 ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
        
        reconnectTimerRef.current = setTimeout(() => {
          if (!closedRef.current) {
            connect();
          }
        }, delay);
      } else {
        console.error(`[IoT Stream] 已达到最大重连次数 ${maxReconnectAttempts}`);
        setState(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        onError?.(new Error('连接失败，已达到最大重连次数'));
      }
    };

    // 接收实时数据
    es.addEventListener('iot.telemetry', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        const payload = data?.payload;
        
        if (!payload || payload.deviceId !== deviceId || !Array.isArray(payload.sensors)) return;
        
        const points: IotSensorPoint[] = payload.sensors
          .map((s: any) => {
            const value = toFiniteNumber(s.value);
            if (value === null) return null;
            return {
              timestamp: Number(payload.timestamp || Date.now()),
              deviceId: payload.deviceId,
              sensorType: String(s.type || ''),
              value,
              unit: s.unit ? String(s.unit) : undefined
            } as IotSensorPoint;
          })
          .filter((p: IotSensorPoint | null): p is IotSensorPoint => Boolean(p && p.sensorType));
        
        if (points.length === 0) return;

        if (closedRef.current) return;
        
        setState((prev) => {
          const latestMap = toMap(prev.latest);
          for (const p of points) latestMap.set(p.sensorType, p);
          const mergedLatest = Array.from(latestMap.values())
            .sort((a, b) => b.timestamp - a.timestamp);
          
          const mergedHistory = [...prev.history, ...points]
            .filter((p) => p.timestamp >= Date.now() - rangeMs)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(-5000);
          
          const updatedState = {
            ...prev,
            latest: mergedLatest,
            history: mergedHistory,
            lastUpdated: Date.now()
          };
          
          onDataUpdate?.(mergedLatest);
          return updatedState;
        });
        
      } catch (error) {
        console.error('[IoT Stream] 数据处理错误:', error);
        onError?.(error);
      }
    });

    // 处理心跳
    es.addEventListener('ping', () => {
      // 收到心跳，更新活动时间
      setState(prev => ({ ...prev, lastUpdated: Date.now() }));
    });

  }, [baseUrl, deviceId, token, maxReconnectAttempts, initialReconnectDelay, maxReconnectDelay, onError, onStreamStatusChange, onDataUpdate, rangeMs]);

  // 手动重连
  const reconnect = useCallback(() => {
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect, clearReconnectTimer]);

  useEffect(() => {
    if (!enabled || !token || !deviceId) {
      setState({
        latest: [],
        history: [],
        monitor: null,
        streamConnected: false,
        lastUpdated: null,
        reconnectAttempts: 0,
        connectionStatus: 'disconnected'
      });
      onStreamStatusChange?.(false);
      return;
    }

    closedRef.current = false;

    // 初始化数据
    const bootstrap = async () => {
      try {
        const [latest, history, monitor] = await Promise.all([
          fetchIotLatest(baseUrl, token, deviceId),
          fetchIotHistory(baseUrl, token, { deviceId, start: Date.now() - rangeMs, end: Date.now(), limit: 3000 }),
          fetchIotMonitor(baseUrl, token)
        ]);
        if (closedRef.current) return;
        setState((prev) => ({
          ...prev,
          latest,
          history,
          monitor,
          lastUpdated: Date.now()
        }));
        onDataUpdate?.(latest);
      } catch (error) {
        console.error('[useIotRealtime] 初始化失败:', error);
        onError?.(error);
      }
    };
    bootstrap();

    // 定期更新监控数据
    const monitorTimer = setInterval(() => {
      fetchIotMonitor(baseUrl, token)
        .then((monitor) => {
          if (closedRef.current) return;
          setState((prev) => ({ ...prev, monitor }));
        })
        .catch((error) => {
          console.error('[useIotRealtime] 监控数据更新失败:', error);
          onError?.(error);
        });
    }, 5000);

    // 检查EventSource支持
    if (typeof EventSource === 'undefined') {
      console.warn('[useIotRealtime] EventSource not supported');
      onStreamStatusChange?.(false);
      return () => {
        closedRef.current = true;
        clearInterval(monitorTimer);
        clearReconnectTimer();
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
      };
    }

    // 建立SSE连接
    connect();

    return () => {
      closedRef.current = true;
      clearInterval(monitorTimer);
      clearReconnectTimer();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      onStreamStatusChange?.(false);
      console.log('[IoT Stream] 连接已关闭');
    };
  }, [baseUrl, deviceId, enabled, rangeMs, token, onError, onStreamStatusChange, onDataUpdate, connect, clearReconnectTimer]);

  const sensorMap = useMemo(() => toMap(state.latest), [state.latest]);

  const dataQuality = useMemo(() => {
    const now = Date.now();
    const dataAge = state.lastUpdated ? now - state.lastUpdated : Infinity;
    const dataCount = state.latest.length;
    
    return {
      freshness: Math.max(0, 100 - (dataAge / 10000) * 100),
      completeness: Math.min(100, (dataCount / 10) * 100),
      overall: Math.round((Math.max(0, 100 - (dataAge / 10000) * 100) + Math.min(100, (dataCount / 10) * 100)) / 2)
    };
  }, [state.lastUpdated, state.latest.length]);

  const summary = useMemo(() => {
    const sensors = new Map<string, { last: number; min: number; max: number; sum: number; count: number }>();
    for (const point of state.history) {
      const current = sensors.get(point.sensorType) || { last: 0, min: Infinity, max: -Infinity, sum: 0, count: 0 };
      sensors.set(point.sensorType, {
        last: point.value,
        min: Math.min(current.min, point.value),
        max: Math.max(current.max, point.value),
        sum: current.sum + point.value,
        count: current.count + 1
      });
    }
    const result: Record<string, { last: number; min: number; max: number; avg: number }> = {};
    for (const [type, data] of sensors) {
      result[type] = {
        last: data.last,
        min: data.min,
        max: data.max,
        avg: data.count > 0 ? data.sum / data.count : 0
      };
    }
    return result;
  }, [state.history]);

  return {
    ...state,
    sensorMap,
    dataQuality,
    summary,
    reconnect
  };
};
