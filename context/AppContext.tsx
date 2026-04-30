import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { BeehiveData, ConnectionStatus, AIAnalysisResult, LocationData, CustomAIConfig, HiveConfig } from '../types';
import { fetchLiveHiveData, fetchHistoryData, reverseGeocode, getFriendlyErrorMessage } from '../services/dataService';
import { analyzeHiveHealth } from '../services/qwenService';

interface AppContextType {
  // Auth State
  auth: { isAuthenticated: boolean; role: 'user' | 'admin'; adminSessionToken?: string };
  setAuth: React.Dispatch<React.SetStateAction<{ isAuthenticated: boolean; role: 'user' | 'admin'; adminSessionToken?: string }>>;
  currentView: 'dashboard' | 'admin';
  setCurrentView: React.Dispatch<React.SetStateAction<'dashboard' | 'admin'>>;
  
  // UI State
  activeTab: 'monitor' | 'analytics' | 'chat' | 'vision';
  setActiveTab: React.Dispatch<React.SetStateAction<'monitor' | 'analytics' | 'chat' | 'vision'>>;
  
  // Connection State
  connectionStatus: ConnectionStatus;
  setConnectionStatus: React.Dispatch<React.SetStateAction<ConnectionStatus>>;
  
  // Data State
  hiveData: BeehiveData | null;
  setHiveData: React.Dispatch<React.SetStateAction<BeehiveData | null>>;
  historyData: any[];
  setHistoryData: React.Dispatch<React.SetStateAction<any[]>>;
  lastUpdatedAt: number | null;
  setLastUpdatedAt: React.Dispatch<React.SetStateAction<number | null>>;
  
  // Configuration State
  refreshIntervalMs: number;
  setRefreshIntervalMs: React.Dispatch<React.SetStateAction<number>>;
  location: LocationData;
  setLocation: React.Dispatch<React.SetStateAction<LocationData>>;
  hiveConfig: HiveConfig;
  setHiveConfig: React.Dispatch<React.SetStateAction<HiveConfig>>;
  aiConfig: CustomAIConfig;
  setAiConfig: React.Dispatch<React.SetStateAction<CustomAIConfig>>;
  
  // AI Analysis State
  aiAnalysis: AIAnalysisResult | null;
  setAiAnalysis: React.Dispatch<React.SetStateAction<AIAnalysisResult | null>>;
  isAnalyzing: boolean;
  setIsAnalyzing: React.Dispatch<React.SetStateAction<boolean>>;
  errorMessage: string | null;
  clearErrorMessage: () => void;
  
  // Actions
  /** 管理员登录时 apiToken 由后端 /api/auth/login 下发；普通用户可传入已校验的令牌 */
  handleLogin: (role: 'user' | 'admin', apiToken?: string, adminSessionToken?: string) => void;
  handleLogout: () => void;
  handleSync: () => Promise<void>;
  handleDisconnect: () => void;
  handleAnalyze: () => Promise<void>;
  handleUpdateConfig: (newConfig: CustomAIConfig) => void;
  handleRefreshIntervalChange: (value: number) => void;
  handleUpdateHiveConfig: (newConfig: HiveConfig) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  // Auth State
  const [auth, setAuth] = useState<{ isAuthenticated: boolean; role: 'user' | 'admin'; adminSessionToken?: string }>({
    isAuthenticated: false,
    role: 'user',
    adminSessionToken: undefined
  });
  const [currentView, setCurrentView] = useState<'dashboard' | 'admin'>('dashboard');

  // UI State
  const [activeTab, setActiveTab] = useState<'monitor' | 'analytics' | 'chat' | 'vision'>('monitor');
  
  // Connection State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  
  // Data State
  const [hiveData, setHiveData] = useState<BeehiveData | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  
  // Configuration State
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(() => {
    const saved = localStorage.getItem('SMART_HIVE_REFRESH_INTERVAL');
    const parsed = saved ? Number(saved) : 15000;
    return Number.isFinite(parsed) ? parsed : 15000;
  });
  
  // Location State
  const [location, setLocation] = useState<LocationData>({
    latitude: Number.NaN,
    longitude: Number.NaN,
    address: '暂无定位数据',
    status: 'error',
    source: 'unknown',
    errorMessage: ''
  });

  // Hive Config State
  const [hiveConfig, setHiveConfig] = useState<HiveConfig>(() => {
    const saved = localStorage.getItem('SMART_HIVE_CONFIG');
    return saved ? JSON.parse(saved) : { 
      lastHarvestDate: null,
      startFarmingDate: null,
      targetWeight: 50 // Default target 50kg
    };
  });

  // AI Config State
  const [aiConfig, setAiConfig] = useState<CustomAIConfig>(() => {
    const saved = localStorage.getItem('SMART_HIVE_AI_CONFIG');
    // 强制重置 apiBaseUrl 为相对路径 '/api'，解决生产环境连接 localhost 的问题
    // 只有当 saved 存在且我们想保留其他配置时才解析，但 apiBaseUrl 必须强制覆盖
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          apiBaseUrl: '/api', // 强制修正
          apiToken: typeof parsed.apiToken === 'string' ? parsed.apiToken : '',
          videoStreamUrl: parsed.videoStreamUrl || '/api/vision/stream.mjpg',
          videoStreamMode: parsed.videoStreamMode === 'video' ? 'video' : 'mjpeg',
          visionDeviceId: parsed.visionDeviceId || 'pi5-vision-client'
        };
      } catch (e) {
        // 解析失败，回退到默认
      }
    }
    return { 
      apiKey: '', 
      modelName: 'qwen-flash', 
      apiBaseUrl: '/api', 
      apiToken: '', 
      gaodeApiKey: '',
      videoStreamUrl: '/api/vision/stream.mjpg',
      videoStreamMode: 'mjpeg',
      visionDeviceId: 'pi5-vision-client',
      isActive: true 
    };
  });

  // AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check Auth on Mount
  useEffect(() => {
    const savedAuth = localStorage.getItem('SMART_HIVE_AUTH');
    if (savedAuth) {
      try {
        const parsed = JSON.parse(savedAuth);
        setAuth({
          isAuthenticated: Boolean(parsed?.isAuthenticated),
          role: parsed?.role === 'admin' ? 'admin' : 'user',
          adminSessionToken: typeof parsed?.adminSessionToken === 'string' ? parsed.adminSessionToken : undefined
        });
      } catch (e) {
        localStorage.removeItem('SMART_HIVE_AUTH');
      }
    }
  }, []);

  const handleLogin = (role: 'user' | 'admin', apiTokenFromLogin?: string, adminSessionTokenFromLogin?: string) => {
    const newAuth = {
      isAuthenticated: true,
      role,
      adminSessionToken: role === 'admin' ? (adminSessionTokenFromLogin || '').trim() || undefined : undefined
    };
    setAuth(newAuth);
    setErrorMessage(null);
    localStorage.setItem('SMART_HIVE_AUTH', JSON.stringify(newAuth));

    const fromLogin = (apiTokenFromLogin ?? '').trim();
    const mergedToken = fromLogin || (aiConfig.apiToken || '').trim();

    const updatedConfig = {
      ...aiConfig,
      apiBaseUrl: aiConfig.apiBaseUrl || '/api',
      apiToken: mergedToken
    };
    setAiConfig(updatedConfig);
    localStorage.setItem('SMART_HIVE_AI_CONFIG', JSON.stringify(updatedConfig));
    
    if (role === 'admin') {
      setCurrentView('admin'); // Admin lands on admin dashboard
    } else {
      setCurrentView('dashboard');
    }

    // 立即触发数据同步
    setTimeout(() => {
      handleSync();
    }, 100);
  };

  const handleLogout = () => {
    setAuth({ isAuthenticated: false, role: 'user', adminSessionToken: undefined });
    setErrorMessage(null);
    localStorage.removeItem('SMART_HIVE_AUTH');
    setCurrentView('dashboard');
    handleDisconnect(); // Disconnect on logout
  };

  const resolveLocation = async (latitude: number, longitude: number) => {
    setLocation(prev => ({
      ...prev,
      latitude,
      longitude,
      status: 'resolving',
      source: 'backend',
      errorMessage: ''
    }));
    const data = await reverseGeocode(aiConfig.apiBaseUrl, aiConfig.apiToken, latitude, longitude);
    if (!data || data.errorMessage) {
      setLocation(prev => ({
        ...prev,
        latitude,
        longitude,
        address: `蜂箱位置 - ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        status: 'error',
        source: 'backend',
        errorMessage: data?.errorMessage || '地址解析失败'
      }));
      return;
    }
    setLocation({
      latitude,
      longitude,
      address: data.address || `蜂箱位置 - ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      province: data.province,
      city: data.city,
      district: data.district,
      road: data.road,
      source: data.source || 'backend',
      status: 'resolved',
      errorMessage: ''
    });
  };

  useEffect(() => {
    if (auth.isAuthenticated && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
        resolveLocation(location.latitude, location.longitude);
    }
  }, [aiConfig.apiBaseUrl, aiConfig.apiToken, auth.isAuthenticated]);

  useEffect(() => {
    if (hiveData?.latitude !== undefined && hiveData?.longitude !== undefined) {
      resolveLocation(hiveData.latitude, hiveData.longitude);
    }
  }, [hiveData?.latitude, hiveData?.longitude, aiConfig.apiBaseUrl, aiConfig.apiToken]);

  const handleUpdateConfig = async (newConfig: CustomAIConfig) => {
    // 确保包含所有必需字段
    const completeConfig: CustomAIConfig = {
      ...newConfig,
      apiKey: newConfig.apiKey || '',
      modelName: newConfig.modelName || 'qwen-flash',
      apiBaseUrl: newConfig.apiBaseUrl || '/api',
      apiToken: newConfig.apiToken || '',
      gaodeApiKey: (newConfig.gaodeApiKey || '').trim(),
      videoStreamUrl: newConfig.videoStreamUrl || '/api/vision/stream.mjpg',
      videoStreamMode: newConfig.videoStreamMode === 'video' ? 'video' : 'mjpeg',
      videoStreamSource: newConfig.videoStreamSource || 'direct',
      visionDeviceId: (newConfig.visionDeviceId || 'pi5-vision-client').trim() || 'pi5-vision-client',
      isActive: newConfig.isActive !== false
    };

    setAiConfig(completeConfig);
    localStorage.setItem('SMART_HIVE_AI_CONFIG', JSON.stringify(completeConfig));
  };
  
  const handleRefreshIntervalChange = (value: number) => {
    setRefreshIntervalMs(value);
    localStorage.setItem('SMART_HIVE_REFRESH_INTERVAL', String(value));
  };
  
  const handleUpdateHiveConfig = (newConfig: HiveConfig) => {
    setHiveConfig(newConfig);
    localStorage.setItem('SMART_HIVE_CONFIG', JSON.stringify(newConfig));
  };

  const normalizeTimestamp = (value?: number | null) => {
    if (typeof value !== 'number') {
      return Date.now();
    }
    return value < 1_000_000_000_000 ? value * 1000 : value;
  };
  
  const normalizeHiveData = (data: BeehiveData | null) => {
    if (!data) return null;
    return {
      ...data,
      timestamp: normalizeTimestamp(data.timestamp)
    };
  };

  const handleSync = async () => {
    setConnectionStatus('connecting');
    setErrorMessage(null);
    
    try {
      // 1. 同步全局配置 (仅在首次连接或管理员更新后需要，但这里简单起见每次连接都同步)
      // 获取最新配置并更新 context。
      // 位置解析已经统一改为后端代理，高德 Key 不再依赖浏览器本地缓存。
      // AI 问答走后端 /api/ai/chat；浏览器侧健康分析仍会读取 qwenApiKey。
      if (auth.isAuthenticated) {
        try {
            const configRes = await fetch(`${aiConfig.apiBaseUrl}/config`, {
                headers: {
                  'Authorization': `Bearer ${aiConfig.apiToken}`,
                  ...(auth.role === 'admin' && auth.adminSessionToken
                    ? { 'X-Admin-Session': auth.adminSessionToken }
                    : {})
                }
            });
            if (configRes.ok) {
                const remoteConfig = await configRes.json();
                const remoteToken = typeof remoteConfig.apiToken === 'string' ? remoteConfig.apiToken.trim() : '';
                const remoteGaodeApiKey = typeof remoteConfig.gaodeApiKey === 'string' ? remoteConfig.gaodeApiKey.trim() : '';
                const remoteQwenApiKey = typeof remoteConfig.qwenApiKey === 'string' ? remoteConfig.qwenApiKey : '';
                const remoteVideoStreamUrl = typeof remoteConfig.videoStreamUrl === 'string'
                  ? remoteConfig.videoStreamUrl
                  : '/api/vision/stream.mjpg';
                const remoteVideoStreamMode = remoteConfig.videoStreamMode === 'video' ? 'video' : 'mjpeg';
                const remoteVideoStreamSource = remoteConfig.videoStreamSource === 'proxy' ? 'proxy' : 'direct';
                const remoteVisionDeviceId = String(remoteConfig.visionDeviceId || 'pi5-vision-client').trim() || 'pi5-vision-client';
                
                // 以服务端配置为准，避免浏览器残留旧配置在不同用户之间产生漂移。
                setAiConfig(prev => {
                    // 保护当前会话中的有效 token，避免被数据库中的旧 token 覆盖后触发连续 401。
                    const nextApiToken = (prev.apiToken || '').trim() || remoteToken;
                    if (
                      (prev.gaodeApiKey || '') === remoteGaodeApiKey &&
                      prev.apiKey === remoteQwenApiKey &&
                      prev.apiToken === nextApiToken &&
                      (prev.videoStreamUrl || '/api/vision/stream.mjpg') === remoteVideoStreamUrl &&
                      (prev.videoStreamMode || 'mjpeg') === remoteVideoStreamMode &&
                      (prev.videoStreamSource || 'direct') === remoteVideoStreamSource &&
                      (prev.visionDeviceId || 'pi5-vision-client') === remoteVisionDeviceId
                    ) {
                        return prev;
                    }
                    return {
                        ...prev,
                        gaodeApiKey: remoteGaodeApiKey,
                        apiKey: remoteQwenApiKey,
                        apiToken: nextApiToken,
                        videoStreamUrl: remoteVideoStreamUrl,
                        videoStreamMode: remoteVideoStreamMode,
                        videoStreamSource: remoteVideoStreamSource,
                        visionDeviceId: remoteVisionDeviceId
                    };
                });
            }
        } catch (e) {
            console.warn('Failed to sync system config:', e);
        }
      }

      const data = await fetchLiveHiveData(aiConfig.apiBaseUrl, aiConfig.apiToken);
      const history = await fetchHistoryData(aiConfig.apiBaseUrl, aiConfig.apiToken);

      setHiveData(normalizeHiveData(data) ?? (history.length ? history[history.length - 1] : null));
      setHistoryData(history);
      setLastUpdatedAt(Date.now());
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Connection failed:', error);
      setConnectionStatus('disconnected');
      setErrorMessage(getFriendlyErrorMessage(error, '数据同步失败'));
    }
  };

  const handleDisconnect = () => {
    setConnectionStatus('disconnected');
    setHiveData(null);
    setLastUpdatedAt(null);
  };

  const clearErrorMessage = () => {
    setErrorMessage(null);
  };

  // Auto-connect when config is active
  useEffect(() => {
    // 只有当用户已认证且连接断开时才尝试自动连接
    // 增加 !errorMessage 判断，避免错误状态下无限重试
    if (auth.isAuthenticated && aiConfig.isActive && connectionStatus === 'disconnected' && !errorMessage) {
      // 增加延时以确保组件挂载完成
      const timer = setTimeout(() => {
        handleSync();
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiConfig.isActive, auth.isAuthenticated, connectionStatus]);

  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    if (refreshIntervalMs <= 0) return;
    const intervalId = setInterval(async () => {
      try {
        // 同时刷新最新数据和历史数据
        const data = await fetchLiveHiveData(aiConfig.apiBaseUrl, aiConfig.apiToken);
        const history = await fetchHistoryData(aiConfig.apiBaseUrl, aiConfig.apiToken);
        setHiveData(normalizeHiveData(data) ?? (history.length ? history[history.length - 1] : null));
        setHistoryData(history);
        setLastUpdatedAt(Date.now());
      } catch (error) {
        console.error('Auto-refresh failed:', error);
        setErrorMessage(getFriendlyErrorMessage(error, '自动刷新失败'));
      }
    }, refreshIntervalMs); 
    
    return () => clearInterval(intervalId);
  }, [connectionStatus, aiConfig.apiBaseUrl, aiConfig.apiToken, refreshIntervalMs]);

  const handleAnalyze = async () => {
    if (!hiveData) return;
    setIsAnalyzing(true);
    
    try {
      const result = await analyzeHiveHealth(hiveData, historyData, {
        apiKey: aiConfig.apiKey,
        modelName: aiConfig.modelName
      });
      setAiAnalysis(result);
    } catch (error) {
      console.error("Analysis failed:", error);
      setErrorMessage(getFriendlyErrorMessage(error, 'AI分析失败（已禁用模拟结果）'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const value: AppContextType = {
    // State
    auth,
    setAuth,
    currentView,
    setCurrentView,
    activeTab,
    setActiveTab,
    connectionStatus,
    setConnectionStatus,
    hiveData,
    setHiveData,
    historyData,
    setHistoryData,
    lastUpdatedAt,
    setLastUpdatedAt,
    refreshIntervalMs,
    setRefreshIntervalMs,
    location,
    setLocation,
    hiveConfig,
    setHiveConfig,
    aiConfig,
    setAiConfig,
    aiAnalysis,
    setAiAnalysis,
    isAnalyzing,
    setIsAnalyzing,
    errorMessage,
    clearErrorMessage,
    
    // Actions
    handleLogin,
    handleLogout,
    handleSync,
    handleDisconnect,
    handleAnalyze,
    handleUpdateConfig,
    handleRefreshIntervalChange,
    handleUpdateHiveConfig
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
