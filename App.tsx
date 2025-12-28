
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
import { Database, ShieldCheck, Zap, Globe, Cpu, Server } from 'lucide-react';

function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [hiveData, setHiveData] = useState<BeehiveData | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [location] = useState<LocationData>({ latitude: 30.5728, longitude: 104.0668, address: '数字化蜂场 - MySQL 集成节点' });
  
  const [aiConfig, setAiConfig] = useState<CustomAIConfig>(() => {
    const saved = localStorage.getItem('SMART_HIVE_AI_CONFIG');
    return saved ? JSON.parse(saved) : { apiKey: '', modelName: 'gemini-3-flash-preview', apiBaseUrl: 'http://localhost:3000', apiToken: '', isActive: false };
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
    for(let i = 0; i < steps.length; i++) {
      setConnectStep(i);
      await new Promise(r => setTimeout(r, 600));
    }

    const data = await fetchLiveHiveData(aiConfig.apiBaseUrl, aiConfig.apiToken);
    const history = await fetchHistoryData(aiConfig.apiBaseUrl, aiConfig.apiToken);
    
    setHiveData(data);
    setHistoryData(history);
    setConnectionStatus('connected');
  };

  const handleDisconnect = () => {
    setConnectionStatus('disconnected');
    setHiveData(null);
  };

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
      {connectionStatus === 'connected' && (
        <ConnectionHeader 
          status={connectionStatus}
          onSync={handleSync}
          onDisconnect={handleDisconnect}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">
        {connectionStatus === 'connected' && hiveData ? (
          <div className="animate-in fade-in slide-in-from-top-4 duration-700 space-y-8">
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
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[85vh]">
            <div className="bg-white p-10 md:p-14 rounded-[3rem] shadow-2xl border border-gray-100 max-w-2xl w-full text-center relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 to-indigo-400"></div>
              
              <div className="mb-8 flex justify-center">
                <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 shadow-inner group-hover:scale-110 transition-transform duration-500">
                  <Database size={40} />
                </div>
              </div>

              <h1 className="text-4xl font-black text-gray-900 mb-4 tracking-tighter">
                SmartHive <span className="text-indigo-600">SQL Bridge</span>
              </h1>
              <p className="text-gray-500 mb-10 font-medium px-4">
                已进入 MySQL 数据驱动模式。系统将通过您定义的网关地址进行鉴权并拉取传感器时序数据。
              </p>

              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col items-center">
                  <Server size={20} className="text-indigo-500 mb-2" />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">后端适配器</span>
                  <span className="text-xs font-bold text-gray-800">REST API / JSON</span>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col items-center">
                  <ShieldCheck size={20} className="text-purple-500 mb-2" />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">认证协议</span>
                  <span className="text-xs font-bold text-gray-800">Bearer Token</span>
                </div>
              </div>

              <button 
                onClick={handleSync}
                disabled={connectionStatus === 'connecting' || !aiConfig.isActive}
                className={`w-full py-5 text-xl font-bold rounded-2xl transition-all shadow-xl active:scale-95 ${
                  aiConfig.isActive 
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {!aiConfig.isActive ? '请先配置集成参数' : (connectionStatus === 'connecting' ? steps[connectStep] : '验证凭据并建立连接')}
              </button>
              
              {!aiConfig.isActive && (
                <p className="mt-4 text-xs text-orange-500 font-bold animate-pulse">
                  ⚠ 提示：请点击右上角设置图标填写您的 API 接口信息
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
