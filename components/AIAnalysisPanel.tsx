import React, { useState } from 'react';
import { Sparkles, RefreshCw, CheckCircle, Settings, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { AIAnalysisResult, CustomAIConfig } from '../types';

interface Props {
  analysis: AIAnalysisResult | null;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  config: CustomAIConfig;
  isAdmin: boolean;
}

export const AIAnalysisPanel: React.FC<Props> = ({
  analysis,
  onAnalyze,
  isAnalyzing,
  config,
  isAdmin
}) => {
  const [showConfigHint, setShowConfigHint] = useState(false);

  const handleStartAnalyze = () => {
    if (!config.apiKey) {
      setShowConfigHint(true);
      return;
    }
    onAnalyze();
  };

  if (showConfigHint) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-6">
        <div className="flex flex-col items-center text-center py-8">
          <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-4">
            <Settings className="w-8 h-8 text-orange-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">需要配置 AI 密钥</h3>
          <p className="text-gray-600 mb-6 max-w-sm">
            为了获取真实的 AI 深度分析报告，请先配置通义千问 API 密钥。系统已移除所有模拟数据，确保分析结果的准确性。
          </p>
          
          {isAdmin ? (
            <button
              onClick={() => {
                alert("请前往【管理后台 -> AI配置】中填入通义千问 API 密钥。");
                setShowConfigHint(false);
              }}
              className="flex items-center space-x-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium shadow-sm"
            >
              <span>去配置密钥</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="bg-gray-50 px-4 py-3 rounded-lg text-sm text-gray-500">
              请联系管理员配置 AI 服务密钥
            </div>
          )}
          
          <button 
            onClick={() => setShowConfigHint(false)}
            className="mt-4 text-sm text-gray-400 hover:text-gray-600 underline"
          >
            暂不分析，返回监控
          </button>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-full flex flex-col justify-center">
        <div className="text-center py-8">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-20"></div>
            <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-full mb-4 inline-flex">
              <Sparkles className="w-8 h-8 text-indigo-600" />
            </div>
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 mb-2">AI 智能蜂群分析</h3>
          <p className="text-gray-500 mb-8 max-w-sm mx-auto">
            基于当前传感器数据与历史趋势，生成蜂群健康状况、产蜜潜力及异常预警报告。
          </p>
          
          <button
            onClick={handleStartAnalyze}
            disabled={isAnalyzing}
            className={`w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 ${
              isAnalyzing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:shadow-indigo-200'
            }`}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>正在分析中...</span>
              </>
            ) : (
              <>
                <Zap className="w-5 h-5 fill-current" />
                <span>生成分析报告</span>
              </>
            )}
          </button>
          
          <p className="mt-4 text-xs text-gray-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            数据安全加密传输
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-100 p-2 rounded-lg">
               <Sparkles className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">AI 分析报告</h2>
              <p className="text-xs text-gray-500">生成于 {new Date().toLocaleTimeString()}</p>
            </div>
          </div>
          <button
            onClick={handleStartAnalyze}
            disabled={isAnalyzing}
            className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-indigo-600"
            title="重新分析"
          >
            <RefreshCw className={`w-5 h-5 ${isAnalyzing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">健康评分</div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-black text-indigo-600">{analysis.healthScore}</span>
              <span className="text-sm text-gray-400 mb-1">/100</span>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">活跃等级</div>
            <div className="text-xl font-bold text-gray-800">{analysis.healthScore >= 80 ? '高活跃' : analysis.healthScore >= 60 ? '中活跃' : '低活跃'}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">产蜜潜力</div>
            <div className="text-xl font-bold text-gray-800">{analysis.healthScore >= 85 ? '高潜力' : analysis.healthScore >= 65 ? '中潜力' : '待提升'}</div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
            核心发现
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 text-gray-700 leading-relaxed text-sm">
            {analysis.summary}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <div className="w-1 h-4 bg-green-500 rounded-full"></div>
            智能建议
          </h3>
          <ul className="space-y-3">
            {analysis.recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-3 bg-green-50/50 p-3 rounded-lg border border-green-100">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
