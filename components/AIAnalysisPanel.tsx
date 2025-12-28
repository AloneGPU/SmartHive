
import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, CheckCircle, Settings2, Key, Info, ExternalLink, X, ShieldCheck } from 'lucide-react';
import { AIAnalysisResult, CustomAIConfig } from '../types';
import { validateConfig } from '../services/geminiService';

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
  const [tempKey, setTempKey] = useState(config.apiKey);
  const [tempModel, setTempModel] = useState(config.modelName || 'gemini-3-flash-preview');
  const [isValidating, setIsValidating] = useState(false);
  const [valResult, setValResult] = useState<'none' | 'success' | 'fail'>('none');

  const handleSaveConfig = async () => {
    if (!tempKey || !tempModel) return;
    
    setIsValidating(true);
    setValResult('none');
    
    const isOk = await validateConfig(tempKey, tempModel);
    
    if (isOk) {
      setValResult('success');
      onUpdateConfig({
        apiKey: tempKey,
        modelName: tempModel,
        isActive: true
      });
      setTimeout(() => setIsConfiguring(false), 1500);
    } else {
      setValResult('fail');
    }
    setIsValidating(false);
  };

  return (
    <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl shadow-sm border border-yellow-200 p-6 relative overflow-hidden h-full flex flex-col">
      {/* 装饰背景 */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-200 rounded-full filter blur-3xl opacity-30 -mr-10 -mt-10"></div>

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Sparkles className="text-yellow-600" size={20} />
              AI 智能健康分析
            </h2>
          </div>
          <button 
            onClick={() => setIsConfiguring(!isConfiguring)}
            className={`p-2 rounded-xl transition-all ${isConfiguring ? 'bg-yellow-200 text-yellow-800' : 'bg-white/80 text-gray-500 shadow-sm'}`}
          >
            <Settings2 size={18} />
          </button>
        </div>

        {isConfiguring ? (
          <div className="flex-1 bg-white/80 backdrop-blur-md rounded-xl p-4 border border-yellow-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1">
                <Key size={14} className="text-indigo-500" /> 自定义模型配置
              </h3>
              <button onClick={() => setIsConfiguring(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">API Key (密钥)</label>
                <input 
                  type="password"
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder="输入您的 Gemini API Key"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Model Name (模型名称)</label>
                <input 
                  type="text"
                  value={tempModel}
                  onChange={(e) => setTempModel(e.target.value)}
                  placeholder="例如: gemini-3-flash-preview"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                />
              </div>

              <div className="pt-2">
                <button 
                  onClick={handleSaveConfig}
                  disabled={isValidating || !tempKey}
                  className={`w-full py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95 ${
                    valResult === 'success' ? 'bg-green-500 text-white' : 
                    valResult === 'fail' ? 'bg-red-500 text-white' : 
                    'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {isValidating ? <RefreshCw className="animate-spin" size={16} /> : 
                   valResult === 'success' ? <CheckCircle size={16} /> : 
                   valResult === 'fail' ? <X size={16} /> : <ShieldCheck size={16} />}
                  {isValidating ? '正在验证连接...' : 
                   valResult === 'success' ? '配置通过' : 
                   valResult === 'fail' ? '验证失败，请检查' : '测试并保存配置'}
                </button>
                <p className="mt-2 text-[9px] text-gray-400 text-center flex items-center justify-center gap-1 leading-tight">
                  <Info size={10} /> 方便中国用户自行配置 API 环境，推荐使用 Flash 系列。
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-4 px-1">
                <div className={`w-2 h-2 rounded-full ${config.isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  当前引擎: {config.isActive ? config.modelName : '未配置(演示模式)'}
                </span>
              </div>

              <button
                onClick={onAnalyze}
                disabled={loading}
                className="w-full mb-6 flex items-center justify-center gap-2 px-4 py-4 bg-gray-900 text-white rounded-xl text-sm font-bold shadow-lg shadow-gray-200 hover:bg-black transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {loading ? (
                  <RefreshCw className="animate-spin" size={18} />
                ) : (
                  <Sparkles size={18} className="group-hover:rotate-12 transition-transform text-yellow-400" />
                )}
                {loading ? '分析中...' : '开始 AI 诊断报告'}
              </button>

              {analysis ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                  <div className="flex items-center gap-4 bg-white/70 p-4 rounded-xl backdrop-blur-sm border border-yellow-100">
                    <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                       <svg className="w-full h-full transform -rotate-90">
                          <circle cx="28" cy="28" r="24" stroke="#e5e7eb" strokeWidth="5" fill="transparent" />
                          <circle 
                              cx="28" cy="28" r="24" 
                              stroke={analysis.healthScore > 80 ? '#22c55e' : analysis.healthScore > 60 ? '#f59e0b' : '#ef4444'} 
                              strokeWidth="5" 
                              fill="transparent" 
                              strokeDasharray={150.8} 
                              strokeDashoffset={150.8 - (150.8 * analysis.healthScore) / 100}
                              className="transition-all duration-1000 ease-out"
                          />
                       </svg>
                       <span className="absolute text-sm font-black text-gray-800">{analysis.healthScore}</span>
                    </div>
                    <div className="flex-1">
                       <h4 className="text-xs font-bold text-gray-800">蜂群健康指数</h4>
                       <p className="text-[11px] text-gray-600 leading-tight mt-1">{analysis.summary}</p>
                    </div>
                  </div>

                  <div className="bg-white/70 p-4 rounded-xl backdrop-blur-sm border border-yellow-100">
                     <h4 className="text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">养殖策略建议</h4>
                     <ul className="space-y-2.5">
                       {analysis.recommendations.map((rec, idx) => (
                         <li key={idx} className="flex items-start gap-2.5 text-xs text-gray-700 font-medium leading-relaxed">
                           <CheckCircle size={14} className="text-green-500 mt-0.5 shrink-0" />
                           {rec}
                         </li>
                       ))}
                     </ul>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-8 text-gray-400 bg-white/30 rounded-xl border border-dashed border-yellow-200">
                  <Sparkles className="opacity-30 mb-2" size={24} />
                  <p className="text-xs font-medium text-center px-4">运行诊断以获取 AI 的专家级蜂场建议</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
