
import React, { useState } from 'react';
import { Sparkles, RefreshCw, CheckCircle, Settings2, Key, Info, X, ShieldCheck, Database, Server, Terminal } from 'lucide-react';
import { AIAnalysisResult, CustomAIConfig } from '../types';
import { validateConfig } from '../services/qwenService';
import { testGatewayConnection } from '../services/dataService';

interface Props {
  analysis: AIAnalysisResult | null;
  onAnalyze: () => void;
  loading: boolean;
  config: CustomAIConfig;
  onUpdateConfig: (config: CustomAIConfig) => void;
}

export const AIAnalysisPanel: React.FC<Props> = ({ 
  analysis, 
  onAnalyze, 
  loading, 
  config,
  onUpdateConfig
}) => {
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [tempConfig, setTempConfig] = useState<Partial<CustomAIConfig>>({
    apiKey: config.apiKey,
    modelName: config.modelName,
    apiBaseUrl: config.apiBaseUrl,
    apiToken: config.apiToken
  });
  
  const [isValidating, setIsValidating] = useState(false);
  const [status, setStatus] = useState<{ db: boolean | null, ai: boolean | null }>({ db: null, ai: null });

  const handleSaveConfig = async () => {
    setIsValidating(true);
    
    // 1. 测试数据库网关
    const dbOk = await testGatewayConnection(tempConfig.apiBaseUrl || '', tempConfig.apiToken || '');
    // 2. 测试 AI 密钥
    const aiOk = await validateConfig(tempConfig.apiKey || process.env.QWEN_API_KEY || process.env.API_KEY || '', tempConfig.modelName || 'qwen-turbo');
    
    setStatus({ db: dbOk, ai: aiOk });

    if (dbOk && aiOk) {
      onUpdateConfig({
        apiKey: tempConfig.apiKey || '',
        modelName: tempConfig.modelName || 'qwen-turbo',//默认模型
        apiBaseUrl: tempConfig.apiBaseUrl || 'http://localhost:3001',
        apiToken: tempConfig.apiToken || '',
        isActive: true
      });
      setTimeout(() => setIsConfiguring(false), 2000);
    }
    setIsValidating(false);
  };

  return (
    <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl shadow-sm border border-yellow-200 p-6 relative overflow-hidden h-full flex flex-col">
      <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-200 rounded-full filter blur-3xl opacity-30 -mr-10 -mt-10"></div>

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Sparkles className="text-yellow-600" size={20} />
            系统深度设置
          </h2>
          <button 
            onClick={() => setIsConfiguring(!isConfiguring)}
            className={`p-2 rounded-xl transition-all ${isConfiguring ? 'bg-yellow-200 text-yellow-800 shadow-inner' : 'bg-white/80 text-gray-500 shadow-sm'}`}
          >
            <Settings2 size={18} />
          </button>
        </div>

        {isConfiguring ? (
          <div className="flex-1 bg-white/90 backdrop-blur-md rounded-xl p-4 border border-yellow-100 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">集成参数配置</h3>
              <button onClick={() => setIsConfiguring(false)} className="text-gray-300 hover:text-gray-500"><X size={16}/></button>
            </div>

            <div className="space-y-5">
              {/* 数据库部分 */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-indigo-600 mb-1">
                  <Database size={14} />
                  <span className="text-xs font-bold">1. 数据库网关 (MySQL Bridge)</span>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-500 mb-1">后端 API 地址</label>
                  <input 
                    type="text"
                    value={tempConfig.apiBaseUrl}
                    onChange={e => setTempConfig({...tempConfig, apiBaseUrl: e.target.value})}
                    placeholder="http://your-server.com:3000"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-500 mb-1">访问令牌 (API Token)</label>
                  <input 
                    type="password"
                    value={tempConfig.apiToken}//默认值为空
                    onChange={e => setTempConfig({...tempConfig, apiToken: e.target.value})}
                    placeholder="接口鉴权密钥"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs"
                  />
                </div>
                <div className="bg-indigo-50 p-2 rounded-lg text-[9px] text-indigo-700 flex gap-2">
                  <Terminal size={12} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">接口要求：</p>
                    <p>GET /api/beehive/latest (获取最新记录)</p>
                    <p>GET /api/beehive/history (获取趋势数据)</p>
                  </div>
                </div>
              </section>

              {/* AI 部分 */}
              <section className="space-y-3 border-t border-gray-50 pt-4">
                <div className="flex items-center gap-2 text-yellow-600 mb-1">
                  <Sparkles size={14} />
                  <span className="text-xs font-bold">2. 通义千问 (Qwen) AI 决策引擎</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                   <div>
                      <label className="block text-[9px] font-bold text-gray-500 mb-1">API Key</label>
                      <input 
                        type="password"
                        value={tempConfig.apiKey}
                        onChange={e => setTempConfig({...tempConfig, apiKey: e.target.value})}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono"
                      />
                   </div>
                   <div>
                      <label className="block text-[9px] font-bold text-gray-500 mb-1">模型名</label>
                      <select 
                        value={tempConfig.modelName}
                        onChange={e => setTempConfig({...tempConfig, modelName: e.target.value})}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs"
                      >
                        <option value="qwen-turbo">qwen-turbo (快速)</option>
                        <option value="qwen-plus">qwen-plus (增强)</option>
                        <option value="qwen-max">qwen-max (最强)</option>
                        <option value="qwen-max-longcontext">qwen-max-longcontext (长文本)</option>
                      </select>
                   </div>
                </div>
              </section>

              {/* 验证与保存 */}
              <div className="pt-2">
                <button 
                  onClick={handleSaveConfig}
                  disabled={isValidating}
                  className="w-full py-3 bg-gray-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-black transition-all active:scale-95"
                >
                  {isValidating ? <RefreshCw className="animate-spin" size={14} /> : <ShieldCheck size={14} />}
                  验证连接并同步
                </button>
                
                {(status.db !== null || status.ai !== null) && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className={`p-2 rounded-lg text-[9px] font-bold flex items-center gap-1.5 ${status.db ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                      {status.db ? <CheckCircle size={10}/> : <X size={10}/>} 网关连通性
                    </div>
                    <div className={`p-2 rounded-lg text-[9px] font-bold flex items-center gap-1.5 ${status.ai ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                      {status.ai ? <CheckCircle size={10}/> : <X size={10}/>} AI 服务状态
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4 px-1">
              <div className={`w-2 h-2 rounded-full ${config.isActive ? 'bg-indigo-500 animate-pulse' : 'bg-gray-300'}`}></div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                {config.isActive ? `已连接: ${new URL(config.apiBaseUrl).hostname}` : '等待配置数据库集成'}
              </span>
            </div>

            <button
              onClick={onAnalyze}
              disabled={loading || !config.isActive}
              className="w-full mb-6 flex items-center justify-center gap-2 px-4 py-4 bg-gray-900 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-black transition-all active:scale-95 disabled:opacity-30"
            >
              {loading ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} className="text-yellow-400" />}
              {loading ? 'AI 正在分析 MySQL 序列...' : '生成智能生产报告'}
            </button>

            {analysis ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 overflow-y-auto flex-1 pr-1 custom-scrollbar">
                <div className="bg-white/80 p-4 rounded-xl border border-yellow-100 flex items-center gap-4 shadow-sm">
                   <div className="w-12 h-12 rounded-full border-4 border-yellow-400 flex items-center justify-center font-black text-gray-800">
                     {analysis.healthScore}
                   </div>
                   <div className="flex-1">
                     <p className="text-[10px] font-bold text-yellow-600 uppercase">健康评价</p>
                     <p className="text-xs text-gray-700 leading-tight font-medium">{analysis.summary}</p>
                   </div>
                </div>
                <div className="bg-white/80 p-4 rounded-xl border border-yellow-100 flex-1">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">执行方案</p>
                  <ul className="space-y-2">
                    {analysis.recommendations.map((r, i) => (
                      <li key={i} className="flex gap-2 text-xs text-gray-600 font-medium leading-relaxed">
                        <CheckCircle size={12} className="text-green-500 shrink-0 mt-0.5" /> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-8 text-gray-400 bg-white/30 rounded-xl border border-dashed border-yellow-200">
                <Server className="opacity-30 mb-2" size={32} />
                <p className="text-[11px] font-medium text-center px-6">点击齿轮按钮配置您的后端地址和令牌</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
