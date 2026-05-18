import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { fetchIotMonitor, fetchIotRealtimeLatest, type IotMonitorSnapshot, type IotSensorPoint } from '../services/dataService';

type RealtimeState = {
  latest: IotSensorPoint[];
  history: IotSensorPoint[];
  monitor: IotMonitorSnapshot | null;
  activeDeviceId: string;
  streamConnected: boolean;
  lastUpdated: number | null;
  reconnectAttempts: number;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  isPaused: boolean;
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
  refreshInterval?: number;
};

const toMap = (rows: IotSensorPoint[]) => {
  const m = new Map<string, IotSensorPoint>();
  for (const row of Array.isArray(rows) ? rows : []) m.set(row.sensorType, row);
  return m;
};

const EMPTY_MONITOR: IotMonitorSnapshot = {
  mqtt: {
    connected: false,
    reconnects: 0,
    receivedMessages: 0,
    persistedPoints: 0,
    droppedMessages: 0,
    startedAt: 0
  },
  stream: {
    connectedClients: 0
  },
  devices: []
};

const toFiniteNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const mergeRealtimePoints = (
  prev: RealtimeState,
  points: IotSensorPoint[],
  rangeMs: number
): RealtimeState => {
  if (points.length === 0) return prev;
  const incomingDeviceId = points[0]?.deviceId || prev.activeDeviceId;
  const byType = new Map<string, IotSensorPoint>();
  for (const row of prev.latest) {
    const cur = byType.get(row.sensorType);
    if (!cur || row.timestamp >= cur.timestamp) byType.set(row.sensorType, row);
  }
  for (const point of points) {
    const cur = byType.get(point.sensorType);
    if (!cur || point.timestamp >= cur.timestamp) byType.set(point.sensorType, point);
  }
  const mergedLatest = Array.from(byType.values()).sort((a, b) => b.timestamp - a.timestamp);
  const mergedHistory = [...prev.history, ...points]
    .filter((p) => p.timestamp >= Date.now() - rangeMs)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(-5000);

  return {
    ...prev,
    activeDeviceId: incomingDeviceId,
    latest: mergedLatest,
    history: mergedHistory,
    lastUpdated: Date.now()
  };
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
    activeDeviceId: deviceId,
    streamConnected: false,
    lastUpdated: null,
    reconnectAttempts: 0,
    connectionStatus: 'disconnected',
    isPaused: false
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
  const lastSseDataAtRef = useRef(0);
  const activeDeviceIdRef = useRef(deviceId);

  useEffect(() => {
    activeDeviceIdRef.current = deviceId;
    setState((prev) => ({ ...prev, activeDeviceId: deviceId }));
  }, [deviceId]);

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

    const url = `${baseUrl}/iot/stream?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(deviceId)}`;
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
        
        if (!payload || !payload.deviceId || !Array.isArray(payload.sensors)) return;

        const incomingDeviceId = String(payload.deviceId);
        const activeDeviceId = activeDeviceIdRef.current || deviceId;
        const hasRecentSseData =
          lastSseDataAtRef.current > 0 && Date.now() - lastSseDataAtRef.current < 15_000;
        const shouldAdoptIncoming =
          !activeDeviceId ||
          !hasRecentSseData ||
          incomingDeviceId === deviceId;

        if (incomingDeviceId !== activeDeviceId) {
          if (!shouldAdoptIncoming) return;
          activeDeviceIdRef.current = incomingDeviceId;
          console.warn(
            `[IoT Stream] 配置设备 ${deviceId} 暂无实时数据，已自动切换到正在上报的设备 ${incomingDeviceId}`
          );
        }
        
        const points: IotSensorPoint[] = payload.sensors
          .map((s: any) => {
            const value = toFiniteNumber(s.value);
            if (value === null) return null;
            return {
              timestamp: Number(payload.timestamp || Date.now()),
              deviceId: incomingDeviceId,
              sensorType: String(s.type || ''),
              value,
              unit: s.unit ? String(s.unit) : undefined
            } as IotSensorPoint;
          })
          .filter((p: IotSensorPoint | null): p is IotSensorPoint => Boolean(p && p.sensorType));
        
        if (points.length === 0) return;

        if (closedRef.current) return;
        lastSseDataAtRef.current = Date.now();
        
        setState((prev) => {
          const updatedState = mergeRealtimePoints(prev, points, rangeMs);
          onDataUpdate?.(updatedState.latest);
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

  // 暂停实时更新
  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: true }));
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    console.log('[IoT Stream] 实时更新已暂停');
  }, []);

  // 恢复实时更新
  const resume = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: false }));
    if (!closedRef.current && token && deviceId) {
      connect();
    }
    console.log('[IoT Stream] 实时更新已恢复');
  }, [connect, deviceId, token]);

  // 手动刷新数据
  const refreshData = useCallback(async () => {
    if (!token) return;
    try {
      const [monitor, latestPoints] = await Promise.all([
        fetchIotMonitor(baseUrl, token),
        fetchIotRealtimeLatest(baseUrl, token, activeDeviceIdRef.current || deviceId)
      ]);
      if (latestPoints.length > 0) {
        const incomingDeviceId = latestPoints[0].deviceId;
        activeDeviceIdRef.current = incomingDeviceId;
        lastSseDataAtRef.current = Date.now();
      }
      setState((prev) => ({
        ...mergeRealtimePoints(prev, latestPoints, rangeMs),
        monitor,
        lastUpdated: Date.now()
      }));
      console.log('[IoT Stream] 监控状态已刷新');
    } catch (error) {
      console.error('[IoT Stream] 手动刷新失败:', error);
      setState((prev) => ({
        ...prev,
        monitor: prev.monitor || EMPTY_MONITOR,
        lastUpdated: Date.now()
      }));
      onError?.(error);
    }
  }, [baseUrl, deviceId, rangeMs, token, onError]);

  useEffect(() => {
    if (!enabled || !token || !deviceId) {
      setState({
        latest: [],
        history: [],
        monitor: null,
        activeDeviceId: deviceId,
        streamConnected: false,
        lastUpdated: null,
        reconnectAttempts: 0,
        connectionStatus: 'disconnected',
        isPaused: false
      });
      lastSseDataAtRef.current = 0;
      onStreamStatusChange?.(false);
      return;
    }

    closedRef.current = false;

    // 初始化只加载监控状态。实时窗体的传感器读数只来自 MQTT -> SSE，
    // 不从 MySQL 的 /iot/latest / /iot/history 读取，避免把小时级归档当实时数据。
    const bootstrap = async () => {
      try {
        const [monitor, latestPoints] = await Promise.all([
          fetchIotMonitor(baseUrl, token),
          fetchIotRealtimeLatest(baseUrl, token, deviceId)
        ]);
        if (closedRef.current) return;
        if (latestPoints.length > 0) {
          const incomingDeviceId = latestPoints[0].deviceId;
          activeDeviceIdRef.current = incomingDeviceId;
          lastSseDataAtRef.current = Date.now();
        }
        setState((prev) => ({
          ...mergeRealtimePoints(prev, latestPoints, rangeMs),
          activeDeviceId: activeDeviceIdRef.current || deviceId,
          monitor,
          lastUpdated: Date.now()
        }));
      } catch (error) {
        console.error('[useIotRealtime] 初始化失败:', error);
        setState((prev) => ({
          ...prev,
          monitor: prev.monitor || EMPTY_MONITOR,
          lastUpdated: Date.now()
        }));
        onError?.(error);
      }
    };
    bootstrap();

    // 定期更新监控状态；传感器读数只由 SSE 更新。
    const monitorTimer = setInterval(() => {
      fetchIotMonitor(baseUrl, token)
        .then((monitor) => {
          if (closedRef.current) return;
          const monitorDevices = Array.isArray(monitor?.devices) ? monitor.devices : [];
          const activeDevice = activeDeviceIdRef.current || deviceId;
          const latestDevice = monitorDevices
            .filter((d) => d.deviceId)
            .sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0))[0];
          const latestDeviceFresh =
            latestDevice && Number.isFinite(Number(latestDevice.lastSeenAt))
              ? Date.now() - Number(latestDevice.lastSeenAt) < 30_000
              : false;
          const hasRecentSseData =
            lastSseDataAtRef.current > 0 && Date.now() - lastSseDataAtRef.current < 15_000;
          if (latestDevice?.deviceId && latestDevice.deviceId !== activeDevice && latestDeviceFresh && !hasRecentSseData) {
            activeDeviceIdRef.current = latestDevice.deviceId;
            setState((prev) => ({
              ...prev,
              activeDeviceId: latestDevice.deviceId
            }));
            console.warn(`[useIotRealtime] 已切换到最近活跃设备 ${latestDevice.deviceId}，等待 SSE 实时数据`);
          }
          const shouldPullRealtimeFallback =
            !lastSseDataAtRef.current || Date.now() - lastSseDataAtRef.current > 6_000;
          if (shouldPullRealtimeFallback) {
            fetchIotRealtimeLatest(baseUrl, token, activeDeviceIdRef.current || deviceId)
              .then((latestPoints) => {
                if (closedRef.current || latestPoints.length === 0) return;
                const incomingDeviceId = latestPoints[0].deviceId;
                activeDeviceIdRef.current = incomingDeviceId;
                setState((prev) => ({
                  ...mergeRealtimePoints(prev, latestPoints, rangeMs),
                  monitor
                }));
                onDataUpdate?.(latestPoints);
              })
              .catch((error) => {
                console.error('[useIotRealtime] 实时缓存兜底拉取失败:', error);
                onError?.(error);
              });
            return;
          }
          setState((prev) => ({ ...prev, monitor }));
        })
        .catch((error) => {
          console.error('[useIotRealtime] 监控数据更新失败:', error);
          setState((prev) => ({
            ...prev,
            monitor: prev.monitor || EMPTY_MONITOR,
            lastUpdated: Date.now()
          }));
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
    reconnect,
    pause,
    resume,
    refreshData
  };
};
