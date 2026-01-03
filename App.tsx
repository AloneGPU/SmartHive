
import React, { useState, useEffect } from 'react';
import { ConnectionHeader } from './components/ConnectionHeader';
import { SensorGrid } from './components/SensorGrid';
import { AIAnalysisPanel } from './components/AIAnalysisPanel';
import { DetailedAnalytics } from './components/DetailedAnalytics';
import { ProductivityPanel } from './components/ProductivityPanel';
import { BehaviorInsights } from './components/BehaviorInsights';
import { HistoryCharts } from './components/HistoryCharts';
import { DataAnalysisPanel } from './components/DataAnalysisPanel';
import { EventLog } from './components/EventLog';
import { WeatherWidget } from './components/WeatherWidget';
import { fetchLiveHiveData, fetchHistoryData } from './services/dataService';
import { analyzeHiveHealth } from './services/qwenService';
import { BeehiveData, ConnectionStatus, AIAnalysisResult, LocationData, CustomAIConfig, HiveConfig } from './types';
import { Database, ShieldCheck, Zap, Globe, Cpu, Server, RefreshCw, LayoutDashboard, BarChart2, CheckCircle, Smartphone } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'monitor' | 'analytics'>('monitor');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [hiveData, setHiveData] = useState<BeehiveData | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  // 基于 GPS 坐标更新位置信息
  const [location, setLocation] = useState<LocationData>({
    latitude: 30.5728, 
    longitude: 104.0668, 
    address: '数字化蜂场 - MySQL 集成节点'
  });

  // 蜂箱配置信息
  const [hiveConfig, setHiveConfig] = useState<HiveConfig>(() => {
    const saved = localStorage.getItem('SMART_HIVE_CONFIG');
    return saved ? JSON.parse(saved) : { 
      lastHarvestDate: Date.now() - 15 * 24 * 60 * 60 * 1000, // Default to 15 days ago
      startFarmingDate: Date.now() - 90 * 24 * 60 * 60 * 1000, // Default to 3 months ago
      targetWeight: 50 // Default target 50kg
    };
  });

  const handleUpdateHiveConfig = (newConfig: HiveConfig) => {
    setHiveConfig(newConfig);
    localStorage.setItem('SMART_HIVE_CONFIG', JSON.stringify(newConfig));
  };
  
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
    return saved ? JSON.parse(saved) : { apiKey: '', modelName: 'qwen-turbo', apiBaseUrl: 'http://localhost:3001', apiToken: '123456789', isActive: true };
  });

  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [connectStep, setConnectStep] = useState(0);
  const steps = ["解析后端 API 地址", "注入鉴权令牌 (Token)", "同步 MySQL 时序库", "挂载 Qwen 分析引擎"];

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
      const result = await analyzeHiveHealth(hiveData, aiConfig, hiveConfig);
      setAiAnalysis(result);
    } catch (error) {
      console.error("Analysis failed:", error);
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
                <div className="flex space-x-4 border-b border-gray-200 pb-2 mb-6">
                  <button
                    onClick={() => setActiveTab('monitor')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === 'monitor'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    实时监控
                  </button>
                  <button
                    onClick={() => setActiveTab('analytics')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === 'analytics'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <BarChart2 className="w-4 h-4" />
                    深度分析
                  </button>
                </div>

                {activeTab === 'monitor' ? (
                  <div className="space-y-6">
                    {/* Top Stats */}
                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                      <div className="xl:col-span-3">
                        <SensorGrid data={hiveData} location={location} />
                      </div>
                      <div className="xl:col-span-1">
                         {/* Replace SQL Status with Weather Widget */}
                         <WeatherWidget location={location} />
                      </div>
                    </div>

                    {/* Main Trend Chart */}
                    <HistoryCharts data={historyData} />

                    {/* AI & Event Log */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2">
                         <AIAnalysisPanel 
                            data={hiveData}
                            analysis={aiAnalysis} 
                            isAnalyzing={isAnalyzing}
                            onAnalyze={handleAnalyze} 
                            config={aiConfig}
                            onUpdateConfig={handleUpdateConfig}
                            hiveConfig={hiveConfig}
                         />
                      </div>
                      <div className="lg:col-span-1">
                         <EventLog />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                     <DataAnalysisPanel history={historyData} />
                     <DetailedAnalytics history={historyData} currentData={hiveData} />
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <BehaviorInsights data={hiveData} />
                        <ProductivityPanel 
                           data={hiveData} 
                           history={historyData} 
                           config={hiveConfig}
                           onUpdateConfig={handleUpdateHiveConfig}
                        />
                     </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[40vh] bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-2xl mx-auto mt-12">
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                   <Server size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">数据暂未就绪</h3>
                <p className="text-gray-500 text-center mb-8 max-w-md">
                   数据库中尚未检测到有效的蜂箱传感器数据。如果您是首次使用，请确保硬件设备已开启并连接网络。
                </p>
                <div className="w-full bg-gray-50 rounded-xl p-4 mb-6">
                    <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                        <CheckCircle size={16} className="text-green-500"/> 自检清单
                    </h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-center gap-2">
                           <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                           检查传感器网关电源指示灯是否常亮
                        </li>
                        <li className="flex items-center gap-2">
                           <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                           确认 4G/WiFi 信号强度是否正常
                        </li>
                    </ul>
                </div>
                <button 
                  onClick={handleSync}
                  className="bg-indigo-600 text-white hover:bg-indigo-700 px-8 py-3 rounded-xl shadow-lg active:scale-95 transition-all font-bold flex items-center gap-2"
                >
                  <RefreshCw size={18} />
                  刷新并尝试重连
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[85vh]">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-md w-full text-center relative overflow-hidden">
               {/* Decorative background */}
               <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
              
              <div className="mb-8 relative z-10">
                <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 ${
                  connectionStatus === 'connecting' ? 'bg-indigo-50 ring-4 ring-indigo-100' : 'bg-gray-50 ring-4 ring-gray-100'
                }`}>
                  {connectionStatus === 'connecting' ? (
                    <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin" />
                  ) : (
                    <Smartphone className="w-10 h-10 text-gray-400" />
                  )}
                </div>
                <h2 className="text-2xl font-black text-gray-900 mb-2">
                  {connectionStatus === 'connecting' ? '正在同步数据...' : '智慧蜂场管理终端'}
                </h2>
                <p className="text-gray-500 text-sm px-4">
                  {connectionStatus === 'connecting' 
                    ? '正在从云端拉取最新的传感器数据与 AI 分析报告，请稍候。' 
                    : '请连接设备以查看实时蜂箱状态、环境监控及智能分析报告。'}
                </p>
              </div>
              
              <div className="space-y-3 relative z-10">
                  <button 
                    onClick={handleSync}
                    disabled={connectionStatus === 'connecting'}
                    className={`w-full py-3.5 font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                      connectionStatus === 'connecting' 
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-indigo-200 active:scale-95'
                    }`}
                  >
                    {connectionStatus === 'connecting' ? (
                      '连接中...' 
                    ) : (
                      <>
                        <Zap size={18} className="fill-current" />
                        立即连接
                      </>
                    )}
                  </button>
                  
                  {!connectionStatus && (
                      <button className="w-full py-3.5 font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-colors">
                        查看演示模式
                      </button>
                  )}
              </div>
              
              <div className="mt-8 pt-6 border-t border-gray-50 flex justify-center gap-6">
                 <div className="flex flex-col items-center gap-1">
                    <ShieldCheck size={20} className="text-emerald-500" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase">安全加密</span>
                 </div>
                 <div className="flex flex-col items-center gap-1">
                    <Globe size={20} className="text-blue-500" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase">云端同步</span>
                 </div>
                 <div className="flex flex-col items-center gap-1">
                    <Cpu size={20} className="text-purple-500" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase">AI 驱动</span>
                 </div>
              </div>

            </div>
            <p className="mt-8 text-xs text-gray-400 font-medium">
               &copy; 2024 SmartHive Connect &bull; v1.0.2
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
