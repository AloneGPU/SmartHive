
import React, { useState, useEffect } from 'react';
import { ConnectionHeader } from './components/ConnectionHeader';
import { SensorGrid } from './components/SensorGrid';
import { AIAnalysisPanel } from './components/AIAnalysisPanel';
import { DetailedAnalytics } from './components/DetailedAnalytics';
import { ProductivityPanel } from './components/ProductivityPanel';
import { BehaviorInsights } from './components/BehaviorInsights';
import { EventLog } from './components/EventLog';
import { getSimulatedData, getHistoryData } from './services/mockDataService';
import { analyzeHiveHealth } from './services/geminiService';
import { BeehiveData, ConnectionMode, ConnectionStatus, AIAnalysisResult, LocationData, CustomAIConfig } from './types';
import { Bluetooth, Signal, ShieldCheck, Zap, Globe, Cpu } from 'lucide-react';

function App() {
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('MQTT');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [hiveData, setHiveData] = useState<BeehiveData | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [location, setLocation] = useState<LocationData>({ latitude: 30.5728, longitude: 104.0668, address: '四川省成都市龙泉驿区智慧农业园' });
  
  // AI Configuration State
  const [aiConfig, setAiConfig] = useState<CustomAIConfig>(() => {
    const saved = localStorage.getItem('SMART_HIVE_AI_CONFIG');
    return saved ? JSON.parse(saved) : { apiKey: '', modelName: 'gemini-3-flash-preview', isActive: false };
  });
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Connection Steps for visual feedback
  const [connectStep, setConnectStep] = useState(0);
  const steps = ["正在执行安全握手", "同步多维传感器数据", "加载 AI 预测模型", "建立数据流双向通道"];

  useEffect(() => {
    setHistoryData(getHistoryData(40));
  }, []);

  const handleUpdateConfig = (newConfig: CustomAIConfig) => {
    setAiConfig(newConfig);
    localStorage.setItem('SMART_HIVE_AI_CONFIG', JSON.stringify(newConfig));
  };

  const handleConnect = () => {
    setConnectionStatus('connecting');
    setConnectStep(0);
    
    const timer = setInterval(() => {
      setConnectStep(prev => {
        if (prev >= steps.length - 1) {
          clearInterval(timer);
          setConnectionStatus('connected');
          setHiveData(getSimulatedData());
          return prev;
        }
        return prev + 1;
      });
    }, 600);
  };

  const handleDisconnect = () => {
    setConnectionStatus('disconnected');
    setHiveData(null);
    setConnectStep(0);
  };

  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    const intervalId = setInterval(() => {
      setHiveData(prevData => {
        const newData = getSimulatedData();
        setHistoryData(prevHistory => {
            const newPoint = {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                temp: newData.temperature,
                weight: newData.weight,
                beesIn: newData.beesIn,
                beesOut: newData.beesOut
            };
            return [...prevHistory.slice(1), newPoint];
        });
        return newData;
      });
    }, 5000);
    return () => clearInterval(intervalId);
  }, [connectionStatus]);

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
    <div className="min-h-screen bg-gray-50 pb-16">
      {connectionStatus === 'connected' && (
        <ConnectionHeader 
          mode={connectionMode} 
          status={connectionStatus}
          onToggleMode={setConnectionMode}
          onConnect={handleConnect}
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
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-full group hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">电量状态</p>
                            <p className="text-3xl font-black text-gray-900">{Math.round(hiveData.batteryLevel)}%</p>
                        </div>
                        <div className={`p-3 rounded-2xl ${hiveData.batteryLevel > 20 ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'}`}>
                           <Cpu size={24} />
                        </div>
                    </div>
                    <div className="mt-6">
                        <div className="flex justify-between items-center mb-2">
                           <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">信号强度 ({connectionMode})</p>
                           <span className="text-[10px] font-bold text-indigo-600">-54 dBm</span>
                        </div>
                        <div className="flex gap-1.5 mt-1">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className={`h-2.5 flex-1 rounded-full ${i <= 4 ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]' : 'bg-gray-100'}`}></div>
                            ))}
                        </div>
                    </div>
                 </div>
               </div>
            </div>

            <div className="space-y-4">
               <div className="flex items-center gap-2 px-2">
                  <h2 className="text-lg font-bold text-gray-900">数字化洞察</h2>
                  <div className="h-px flex-1 bg-gray-200"></div>
               </div>
               <DetailedAnalytics history={historyData} currentData={hiveData} />
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

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <EventLog />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[90vh] relative">
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03]">
              <div className="grid grid-cols-8 gap-4 transform rotate-12 scale-150">
                {Array.from({length: 64}).map((_, i) => (
                  <div key={i} className="aspect-square bg-gray-900 clip-hexagon"></div>
                ))}
              </div>
            </div>

            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-gray-100 max-w-2xl w-full relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-400 via-indigo-500 to-emerald-500"></div>
              
              <div className="flex flex-col md:flex-row gap-10 items-center">
                <div className="flex-1 text-center md:text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">
                    <ShieldCheck size={12} /> SmartHive v3.0 Pro
                  </div>
                  <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-4 tracking-tighter leading-tight">
                    智联蜂场<br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-orange-600">云控制台</span>
                  </h1>
                  <p className="text-gray-500 mb-8 leading-relaxed font-medium">
                    通过多维传感技术与 AI 边缘计算，赋予传统养蜂业“数字化灵魂”。
                  </p>

                  <div className="grid grid-cols-3 gap-3 mb-10">
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col items-center">
                      <Bluetooth size={16} className="text-blue-500 mb-1" />
                      <span className="text-[10px] font-bold text-gray-400 uppercase">BLE</span>
                      <span className="text-[10px] font-bold text-green-500">就绪</span>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col items-center">
                      <Signal size={16} className="text-emerald-500 mb-1" />
                      <span className="text-[10px] font-bold text-gray-400 uppercase">4G/LTE</span>
                      <span className="text-[10px] font-bold text-green-500">强信号</span>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col items-center">
                      <Globe size={16} className="text-indigo-500 mb-1" />
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Cloud</span>
                      <span className="text-[10px] font-bold text-green-500">在线</span>
                    </div>
                  </div>

                  <button 
                    onClick={handleConnect}
                    disabled={connectionStatus === 'connecting'}
                    className="w-full relative py-5 bg-gray-900 hover:bg-black text-white text-xl font-bold rounded-2xl transition-all transform hover:-translate-y-1 active:scale-95 shadow-xl shadow-gray-200 overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <span className="relative flex items-center justify-center gap-3">
                      {connectionStatus === 'connecting' ? (
                        <>
                          <Zap className="animate-pulse text-yellow-400" size={20} />
                          {steps[connectStep]}
                        </>
                      ) : (
                        <>
                          <Zap size={20} />
                          立即建立同步
                        </>
                      )}
                    </span>
                  </button>
                </div>

                <div className="hidden md:flex w-48 h-48 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-[2.5rem] shadow-inner items-center justify-center rotate-3 relative shrink-0">
                  <div className="absolute inset-4 border-2 border-white/30 rounded-[1.5rem] border-dashed animate-spin-slow"></div>
                  <Cpu size={64} className="text-white drop-shadow-lg" />
                  
                  <div className="absolute -top-4 -right-4 w-12 h-12 bg-white rounded-2xl shadow-lg flex items-center justify-center animate-bounce">
                    <Signal size={20} className="text-indigo-600" />
                  </div>
                  <div className="absolute -bottom-2 -left-4 w-10 h-10 bg-indigo-900 rounded-xl shadow-lg flex items-center justify-center">
                    <Bluetooth size={16} className="text-white" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-8 items-center text-gray-400">
               <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-gray-800">1.2ms</span>
                  <span className="text-[10px] uppercase font-black tracking-widest">延时</span>
               </div>
               <div className="w-px h-8 bg-gray-200"></div>
               <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-gray-800">256-bit</span>
                  <span className="text-[10px] uppercase font-black tracking-widest">加密</span>
               </div>
               <div className="w-px h-8 bg-gray-200"></div>
               <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-gray-800">Gemini 3</span>
                  <span className="text-[10px] uppercase font-black tracking-widest">内核</span>
               </div>
            </div>
          </div>
        )}
      </main>
      
      <style>{`
        .clip-hexagon {
          clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
        }
        .animate-spin-slow {
          animation: spin 8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
