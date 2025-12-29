
import React, { useState, useEffect } from 'react';
import { ConnectionHeader } from './components/ConnectionHeader';
import { SensorGrid } from './components/SensorGrid';
import { AIAnalysisPanel } from './components/AIAnalysisPanel';
import { DetailedAnalytics } from './components/DetailedAnalytics';
import { ProductivityPanel } from './components/ProductivityPanel';
import { BehaviorInsights } from './components/BehaviorInsights';
import { EventLog } from './components/EventLog';
import { fetchLiveHiveData, fetchHistoryData } from './services/dataService';
import { analyzeHiveHealth } from './services/geminiService';
import { BeehiveData, ConnectionStatus, AIAnalysisResult, LocationData, CustomAIConfig } from './types';
import { Database, ShieldCheck, Zap, Globe, Cpu, Server, RefreshCw } from 'lucide-react';

function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [hiveData, setHiveData] = useState<BeehiveData | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  // 基于 GPS 坐标更新位置信息
  const [location, setLocation] = useState<LocationData>({
    latitude: 30.5728, 
    longitude: 104.0668, 
    address: '数字化蜂场 - MySQL 集成节点'
  });
  
  // 当获取到新的 GPS 数据时，更新位置信息
  useEffect(() => {
    if (hiveData?.latitude !== undefined && hiveData?.longitude !== undefined) {
      // 这里可以添加地理编码 API 调用，将 GPS 坐标转换为实际地址
      // 由于没有地理编码服务，我们使用坐标来生成一个动态地址
      const newAddress = `蜂箱位置 - ${hiveData.latitude.toFixed(4)}, ${hiveData.longitude.toFixed(4)}`;
      setLocation(prev => ({
        latitude: hiveData.latitude,
        longitude: hiveData.longitude,
        address: newAddress
      }));
    }
  }, [hiveData?.latitude, hiveData?.longitude]);
  
  const [aiConfig, setAiConfig] = useState<CustomAIConfig>(() => {
    const saved = localStorage.getItem('SMART_HIVE_AI_CONFIG');
    return saved ? JSON.parse(saved) : { apiKey: '', modelName: 'Qwen-3', apiBaseUrl: 'http://localhost:3001', apiToken: '123456789', isActive: true };
  });

  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [connectStep, setConnectStep] = useState(0);
  const steps = ["解析后端 API 地址", "注入鉴权令牌 (Token)", "同步 MySQL 时序库", "挂载 Gemini 分析引擎"];

  const handleUpdateConfig = (newConfig: CustomAIConfig) => {
    setAiConfig(newConfig);
    localStorage.setItem('SMART_HIVE_AI_CONFIG', JSON.stringify(newConfig));
  };

  const handleSync = async () => {
    setConnectionStatus('connecting');
    
    try {
      // Skip the animation steps for faster connection
      const data = await fetchLiveHiveData(aiConfig.apiBaseUrl, aiConfig.apiToken);
      const history = await fetchHistoryData(aiConfig.apiBaseUrl, aiConfig.apiToken);
      
      setHiveData(data);
      setHistoryData(history);
      // 无论是否有数据，只要连接成功就保持连接状态
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Connection failed:', error);
      setConnectionStatus('disconnected');
    }
  };

  const handleDisconnect = () => {
    setConnectionStatus('disconnected');
    setHiveData(null);
  };

  // Auto-connect when config is active
  useEffect(() => {
    if (aiConfig.isActive && connectionStatus === 'disconnected') {
      handleSync();
    }
  }, [aiConfig.isActive]);

  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    const intervalId = setInterval(async () => {
      const data = await fetchLiveHiveData(aiConfig.apiBaseUrl, aiConfig.apiToken);
      setHiveData(data);
    }, 15000); 
    return () => clearInterval(intervalId);
  }, [connectionStatus, aiConfig.apiBaseUrl, aiConfig.apiToken]);

  const handleAnalyze = async () => {
    if (!hiveData) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeHiveHealth(hiveData, aiConfig);
      setAiAnalysis(result);
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16 font-sans">
      {/* Always show connection header for easy access to settings */}
      <ConnectionHeader 
        status={connectionStatus}
        onSync={handleSync}
        onDisconnect={handleDisconnect}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">
        {connectionStatus === 'connected' ? (
          <div className="animate-in fade-in slide-in-from-top-4 duration-700 space-y-8">
            {hiveData ? (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                   <div className="xl:col-span-3">
                     <SensorGrid data={hiveData} location={location} />
                   </div>
                   <div className="xl:col-span-1">
                     <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full flex flex-col justify-between group hover:shadow-md transition-shadow">
                        <div>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">SQL 同步状态</p>
                            <p className="text-3xl font-black text-indigo-600">实时就绪</p>
                            <p className="text-[10px] text-green-500 font-bold mt-1">Latency: 24ms</p>
                        </div>
                        <div className="mt-6 pt-6 border-t border-gray-50">
                            <div className="flex justify-between items-center mb-2">
                               <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">数据吞吐量</p>
                            </div>
                            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 w-[45%] shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
                            </div>
                        </div>
                     </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                   <AIAnalysisPanel 
                      analysis={aiAnalysis} 
                      onAnalyze={handleAnalyze} 
                      loading={isAnalyzing}
                      config={aiConfig}
                      onUpdateConfig={handleUpdateConfig}
                   />
                   <BehaviorInsights data={hiveData} />
                   <ProductivityPanel data={hiveData} history={historyData} />
                </div>

                <div className="space-y-4">
                   <DetailedAnalytics history={historyData} currentData={hiveData} />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[40vh] bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <p className="text-gray-500 text-lg mb-4">暂无数据</p>
                <p className="text-sm text-gray-400 mb-6">数据库中没有找到蜂箱数据</p>
                <button 
                  onClick={handleSync}
                  className="bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-2 rounded-xl shadow-md active:scale-95 transition-all"
                >
                  刷新数据
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 max-w-md w-full text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">连接状态</h2>
              <div className="mb-6">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
                  connectionStatus === 'connecting' ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  {connectionStatus === 'connecting' ? (
                    <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                  ) : (
                    <Database className="w-8 h-8 text-gray-500" />
                  )}
                </div>
                <p className="text-gray-600 mb-2">
                  {connectionStatus === 'connecting' ? '正在连接到后端...' : '未连接到后端'}
                </p>
                <p className="text-sm text-gray-500">
                  {connectionStatus === 'connecting' ? '请稍候...' : '系统将自动尝试连接'}
                </p>
              </div>
              
              <button 
                onClick={handleSync}
                disabled={connectionStatus === 'connecting'}
                className={`w-full py-3 font-bold rounded-xl transition-all ${
                  connectionStatus === 'connecting' 
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md active:scale-95'
                }`}
              >
                {connectionStatus === 'connecting' ? '连接中...' : '手动连接'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
