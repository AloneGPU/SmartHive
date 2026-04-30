import React, { useState } from 'react';
import { Calendar, Save, Sparkles, Check } from 'lucide-react';
import { HiveConfig, BeehiveData } from '../types';

interface HarvestPlannerProps {
  hiveConfig: HiveConfig;
  currentWeight: number | null;
  onUpdateConfig: (config: HiveConfig) => void;
  historyData: BeehiveData[];
}

export const HarvestPlanner: React.FC<HarvestPlannerProps> = ({ 
  hiveConfig, 
  currentWeight, 
  onUpdateConfig,
  historyData
}) => {
  const [plannedDate, setPlannedDate] = useState<string>(
    hiveConfig.plannedHarvestDate 
      ? new Date(hiveConfig.plannedHarvestDate).toISOString().split('T')[0] 
      : ''
  );
  const [targetWeight, setTargetWeight] = useState<number>(hiveConfig.targetWeight || 50);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // 计算平均日增重
  const calculateDailyGain = () => {
    if (historyData.length < 2) return 0;
    
    // 取最近7天的数据
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentData = historyData
      .filter((d) => d.timestamp >= sevenDaysAgo)
      .filter((d) => Number.isFinite(Number(d.weight)));
    
    if (recentData.length < 2) return 0;
    
    // 简单的线性回归或首尾差值
    const first = recentData[0];
    const last = recentData[recentData.length - 1];
    const days = (last.timestamp - first.timestamp) / (24 * 60 * 60 * 1000);
    
    if (days <= 0) return 0;
    
    const gain = (Number(last.weight) - Number(first.weight)) / days;
    return gain > 0 ? gain : 0; // 只考虑正增长
  };

  const handleAiAnalyze = () => {
    if (currentWeight === null || !Number.isFinite(currentWeight)) {
      setAiSuggestion('当前重量缺失，无法生成采蜜建议。请先检查称重采集是否正常。');
      return;
    }
    const dailyGain = calculateDailyGain();
    const remainingWeight = targetWeight - currentWeight;

    if (currentWeight >= targetWeight) {
      setAiSuggestion('当前重量已达到目标，建议尽快安排采蜜，并结合天气与蜂群状态人工确认。');
      return;
    }
    if (dailyGain > 0) {
      const daysNeeded = Math.ceil(remainingWeight / dailyGain);
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysNeeded);
      setAiSuggestion(`基于近7天增重趋势（约 ${dailyGain.toFixed(2)} kg/天），预计 ${daysNeeded} 天后达到目标重量，建议在 ${targetDate.toLocaleDateString()} 左右安排采蜜。`);
      return;
    }
    setAiSuggestion('历史数据不足或增重不明显，无法估算达到目标重量的时间。建议补充记录并结合人工巡检判断。');
  };

  const handleSave = () => {
    setSaveStatus('saving');
    const newConfig = {
      ...hiveConfig,
      targetWeight,
      plannedHarvestDate: plannedDate ? new Date(plannedDate).getTime() : null
    };
    
    onUpdateConfig(newConfig);
    
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 500);
  };

  // 计算倒计时
  const getDaysRemaining = () => {
    if (!plannedDate) return null;
    const target = new Date(plannedDate).getTime();
    const now = Date.now();
    const diff = target - now;
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    return days;
  };

  const daysRemaining = getDaysRemaining();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="bg-amber-100 p-2 rounded-lg">
          <Calendar className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">采蜜计划</h2>
          <p className="text-sm text-gray-500">规划与追踪下一次收获</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* 目标设定 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">目标重量 (kg)</label>
            <div className="relative">
              <input
                type="number"
                value={targetWeight}
                onChange={(e) => setTargetWeight(parseFloat(e.target.value))}
                className="w-full pl-4 pr-12 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              />
              <span className="absolute right-4 top-2 text-gray-400">kg</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">计划采蜜日期</label>
            <input
              type="date"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
        </div>

        {/* 进度概览 */}
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">完成进度</span>
            <span className="text-sm font-bold text-amber-600">
              {currentWeight === null ? '--' : `${Math.min(100, Math.max(0, (currentWeight / targetWeight) * 100)).toFixed(1)}%`}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
            <div 
              className="bg-amber-500 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${currentWeight === null ? 0 : Math.min(100, Math.max(0, (currentWeight / targetWeight) * 100))}%` }}
            ></div>
          </div>
          
          <div className="flex justify-between text-sm">
            <div className="text-gray-600">
              当前: <span className="font-semibold text-gray-900">{currentWeight === null ? '--' : `${currentWeight.toFixed(1)} kg`}</span>
            </div>
            {daysRemaining !== null && (
              <div className={`font-medium ${daysRemaining < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                {daysRemaining < 0 ? `已逾期 ${Math.abs(daysRemaining)} 天` : `剩余 ${daysRemaining} 天`}
              </div>
            )}
          </div>
        </div>

        {/* AI 建议区域 */}
        <div className="border border-indigo-100 bg-indigo-50/50 rounded-xl p-4">
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              AI 智能建议
            </h3>
            <button
              onClick={handleAiAnalyze}
              className="text-xs bg-white border border-indigo-200 text-indigo-600 px-3 py-1 rounded-md hover:bg-indigo-50 transition-colors"
            >
              生成建议
            </button>
          </div>
          
          {aiSuggestion ? (
            <div className="text-sm text-indigo-800 leading-relaxed animate-in fade-in">
              {aiSuggestion}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">
              点击上方按钮，基于历史增重趋势获取采蜜时间建议...
            </div>
          )}
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={`flex items-center space-x-2 px-6 py-2 rounded-lg font-medium text-white transition-all ${
              saveStatus === 'saved' 
                ? 'bg-green-500 hover:bg-green-600' 
                : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            {saveStatus === 'saved' ? (
              <>
                <Check className="w-4 h-4" />
                <span>已保存</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>保存计划</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
