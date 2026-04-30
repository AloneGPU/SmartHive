import React, { useState, useMemo, useCallback } from 'react';
import { Calendar, Save, Sparkles, Check, Download, Target, Clock, AlertCircle } from 'lucide-react';
import { HiveConfig, BeehiveData } from '../types';
import ReactECharts from 'echarts-for-react';

interface ProductivityHarvestDashboardProps {
  hiveConfig: HiveConfig;
  currentWeight: number | null;
  onUpdateConfig: (config: HiveConfig) => void;
  historyData: BeehiveData[];
}

export const ProductivityHarvestDashboard: React.FC<ProductivityHarvestDashboardProps> = ({
  hiveConfig,
  currentWeight,
  onUpdateConfig,
  historyData
}) => {
  // 状态管理
  const [lastHarvestDate, setLastHarvestDate] = useState<string>(
    hiveConfig.lastHarvestDate
      ? new Date(hiveConfig.lastHarvestDate).toISOString().split('T')[0]
      : ''
  );
  const [lastHarvestTime, setLastHarvestTime] = useState<string>(
    hiveConfig.lastHarvestDate
      ? new Date(hiveConfig.lastHarvestDate).toTimeString().split(' ')[0].substring(0, 5)
      : '12:00'
  );
  const [targetWeight, setTargetWeight] = useState<number>(hiveConfig.targetWeight || 50);
  const [plannedDate, setPlannedDate] = useState<string>(
    hiveConfig.plannedHarvestDate
      ? new Date(hiveConfig.plannedHarvestDate).toISOString().split('T')[0]
      : ''
  );
  const [plannedTime, setPlannedTime] = useState<string>('12:00');
  const [notificationDays, setNotificationDays] = useState<number>(3);
  const [aiAnalysis, setAiAnalysis] = useState<{
    suggestedDate: string;
    suggestedTime: string;
    confidence: number;
    factors: Array<{ name: string; weight: number; impact: string }>;
    explanation: string;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [activeTab, setActiveTab] = useState<'analysis' | 'planning' | 'forecast'>('analysis');

  // 计算距离上次收蜜的天数
  const calculateDaysSinceHarvest = useCallback(() => {
    if (!hiveConfig.lastHarvestDate) return null;
    const now = Date.now();
    const days = Math.floor((now - hiveConfig.lastHarvestDate) / (1000 * 60 * 60 * 24));
    return days;
  }, [hiveConfig.lastHarvestDate]);

  // 计算养殖天数
  const calculateDaysSinceStart = useCallback(() => {
    if (!hiveConfig.startFarmingDate) return null;
    const now = Date.now();
    const days = Math.floor((now - hiveConfig.startFarmingDate) / (1000 * 60 * 60 * 24));
    return days;
  }, [hiveConfig.startFarmingDate]);

  // 计算生产力指标
  const calculateProductivity = useCallback(() => {
    if (currentWeight === null || !Number.isFinite(currentWeight)) {
      return { weightDiff: null as number | null, percentage: null as number | null };
    }
    const weightDiff = currentWeight - (hiveConfig.targetWeight || 50);
    const percentage = (currentWeight / (hiveConfig.targetWeight || 50)) * 100;
    return { weightDiff, percentage };
  }, [currentWeight, hiveConfig.targetWeight]);

  // 计算平均日增重
  const calculateDailyGain = useCallback(() => {
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
  }, [historyData]);

  // 计算剩余天数
  const getDaysRemaining = useCallback(() => {
    if (!plannedDate) return null;
    const target = new Date(`${plannedDate}T${plannedTime}`).getTime();
    const now = Date.now();
    const diff = target - now;
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    return days;
  }, [plannedDate, plannedTime]);

  // 生成历史重量趋势数据
  const weightTrendData = useMemo(() => {
    return historyData
      .filter((d) => Number.isFinite(Number(d.weight)))
      .map((d) => ({
        timestamp: d.timestamp,
        weight: Number(d.weight)
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [historyData]);

  // 生成AI分析
  const handleAiAnalyze = useCallback(() => {
    if (currentWeight === null || !Number.isFinite(currentWeight)) {
      setAiAnalysis(null);
      return;
    }

    const dailyGain = calculateDailyGain();
    const remainingWeight = targetWeight - currentWeight;

    if (currentWeight >= targetWeight) {
      const suggestedDate = new Date().toISOString().split('T')[0];
      const suggestedTime = '10:00';
      const confidence = 0.95;
      const factors = [
        { name: '当前重量', weight: 0.8, impact: '已达到目标重量' },
        { name: '增重趋势', weight: 0.1, impact: '稳定增长' },
        { name: '时间因素', weight: 0.1, impact: '距离上次采蜜已足够时间' }
      ];
      const explanation = '当前重量已达到目标，建议尽快安排采蜜，并结合天气与蜂群状态人工确认。';

      setAiAnalysis({ suggestedDate, suggestedTime, confidence, factors, explanation });
      return;
    }

    if (dailyGain > 0) {
      const daysNeeded = Math.ceil(remainingWeight / dailyGain);
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysNeeded);
      const suggestedDate = targetDate.toISOString().split('T')[0];
      const suggestedTime = '10:00';
      const confidence = Math.min(0.9, 0.5 + (dailyGain / 2));
      const factors = [
        { name: '增重趋势', weight: 0.6, impact: `平均日增重 ${dailyGain.toFixed(2)} kg` },
        { name: '当前重量', weight: 0.3, impact: `距离目标还有 ${remainingWeight.toFixed(2)} kg` },
        { name: '时间因素', weight: 0.1, impact: `预计需要 ${daysNeeded} 天` }
      ];
      const explanation = `基于近7天增重趋势（约 ${dailyGain.toFixed(2)} kg/天），预计 ${daysNeeded} 天后达到目标重量，建议在 ${targetDate.toLocaleDateString()} 左右安排采蜜。`;

      setAiAnalysis({ suggestedDate, suggestedTime, confidence, factors, explanation });
      return;
    }

    // 历史数据不足的情况
    const suggestedDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const suggestedTime = '10:00';
    const confidence = 0.4;
    const factors = [
      { name: '数据不足', weight: 0.7, impact: '历史数据不足或增重不明显' },
      { name: '当前重量', weight: 0.2, impact: `距离目标还有 ${remainingWeight.toFixed(2)} kg` },
      { name: '时间因素', weight: 0.1, impact: '基于默认周期建议' }
    ];
    const explanation = '历史数据不足或增重不明显，无法准确估算达到目标重量的时间。建议补充记录并结合人工巡检判断。';

    setAiAnalysis({ suggestedDate, suggestedTime, confidence, factors, explanation });
  }, [currentWeight, targetWeight, calculateDailyGain]);

  // 保存计划
  const handleSave = useCallback(() => {
    setSaveStatus('saving');
    const newConfig = {
      ...hiveConfig,
      targetWeight,
      lastHarvestDate: lastHarvestDate ? new Date(`${lastHarvestDate}T${lastHarvestTime}`).getTime() : null,
      plannedHarvestDate: plannedDate ? new Date(`${plannedDate}T${plannedTime}`).getTime() : null,
      notificationDays
    };
    
    onUpdateConfig(newConfig);
    
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 500);
  }, [hiveConfig, targetWeight, lastHarvestDate, lastHarvestTime, plannedDate, plannedTime, notificationDays, onUpdateConfig]);

  // 导出分析报告
  const handleExportReport = useCallback(() => {
    const reportData = {
      generatedAt: new Date().toISOString(),
      hiveConfig,
      currentWeight,
      aiAnalysis,
      weightTrendData
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `productivity_harvest_report_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [hiveConfig, currentWeight, aiAnalysis, weightTrendData]);

  // 计算派生值
  const daysSinceHarvest = calculateDaysSinceHarvest();
  const daysSinceStart = calculateDaysSinceStart();
  const { weightDiff, percentage } = calculateProductivity();
  const daysRemaining = getDaysRemaining();

  // 生产力状态
  const productivityStatus = useMemo(() => {
    if (percentage === null) return { status: 'unknown', text: '缺少数据', color: 'text-gray-600', bgColor: 'bg-gray-100' };
    if (percentage >= 100) return { status: 'excellent', text: '优秀', color: 'text-green-600', bgColor: 'bg-green-50' };
    if (percentage >= 80) return { status: 'good', text: '良好', color: 'text-blue-600', bgColor: 'bg-blue-50' };
    if (percentage >= 60) return { status: 'normal', text: '正常', color: 'text-yellow-600', bgColor: 'bg-yellow-50' };
    return { status: 'low', text: '偏低', color: 'text-red-600', bgColor: 'bg-red-50' };
  }, [percentage]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      {/* 标题与状态 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">生产力与采蜜计划</h2>
          <p className="text-sm text-gray-500">智能分析与计划管理</p>
        </div>
        <div className={`px-4 py-2 rounded-full text-sm font-medium ${productivityStatus.bgColor} ${productivityStatus.color}`}>
          {productivityStatus.text}
        </div>
      </div>

      {/* 标签页导航 */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex -mb-px space-x-8 min-w-max pr-2">
          <button
            onClick={() => setActiveTab('analysis')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'analysis' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            生产力分析
          </button>
          <button
            onClick={() => setActiveTab('planning')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'planning' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            采蜜计划
          </button>
          <button
            onClick={() => setActiveTab('forecast')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'forecast' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            AI预测
          </button>
        </nav>
      </div>

      {/* 内容区域 */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {/* 生产力指标 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-purple-500" />
                  <span className="text-sm font-medium text-gray-700">距离上次收蜜</span>
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">{daysSinceHarvest === null ? '--' : `${daysSinceHarvest} 天`}</div>
              <div className="text-xs text-gray-500">{daysSinceHarvest === null ? '未设置' : daysSinceHarvest > 30 ? '可以收蜜' : '时间较短'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-indigo-500" />
                  <span className="text-sm font-medium text-gray-700">养殖天数</span>
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">{daysSinceStart === null ? '--' : `${daysSinceStart} 天`}</div>
              <div className="text-xs text-gray-500">{daysSinceStart === null ? '未设置' : '持续养殖中'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Target className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-medium text-gray-700">目标完成度</span>
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">{percentage === null ? '--' : `${percentage.toFixed(1)}%`}</div>
              <div className="text-xs text-gray-500">{productivityStatus.text}</div>
            </div>
          </div>

          {/* 重量目标追踪 */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">重量目标追踪</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">当前重量</span>
                <span className="text-lg font-semibold text-blue-600">{currentWeight === null ? '--' : `${currentWeight.toFixed(2)} kg`}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">目标重量</span>
                <span className="text-lg font-semibold text-purple-600">{hiveConfig.targetWeight} kg</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">重量差异</span>
                <span className={`text-lg font-semibold ${weightDiff !== null && weightDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {weightDiff === null ? '--' : `${weightDiff >= 0 ? '+' : ''}${weightDiff.toFixed(2)} kg`}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
                <div
                  className={`h-2 rounded-full ${percentage === null ? 'bg-gray-400' : percentage >= 100 ? 'bg-green-500' : percentage >= 80 ? 'bg-blue-500' : percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${percentage === null ? 0 : Math.min(percentage, 100)}%` }}
                ></div>
              </div>
              <div className="text-center text-sm text-gray-500 mt-2">
                进度: {percentage === null ? '--' : `${percentage.toFixed(1)}%`}
              </div>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'planning' && (
        <div className="space-y-6">
          {/* 数据输入区 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">距离上次收蜜时间</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={lastHarvestDate}
                  onChange={(e) => setLastHarvestDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <input
                  type="time"
                  value={lastHarvestTime}
                  onChange={(e) => setLastHarvestTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">目标重量 (kg)</label>
              <div className="relative">
                <input
                  type="number"
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(parseFloat(e.target.value))}
                  step="0.01"
                  min="0"
                  className="w-full pl-4 pr-12 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <span className="absolute right-4 top-2 text-gray-400">kg</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">计划采蜜日期</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <input
                  type="time"
                  value={plannedTime}
                  onChange={(e) => setPlannedTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">提前通知时间</label>
              <div className="relative">
                <input
                  type="number"
                  value={notificationDays}
                  onChange={(e) => setNotificationDays(parseInt(e.target.value))}
                  min="1"
                  max="30"
                  className="w-full pl-4 pr-12 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <span className="absolute right-4 top-2 text-gray-400">天</span>
              </div>
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
            
            <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-2">
              <div className="text-gray-600">
                当前: <span className="font-semibold text-gray-900">{currentWeight === null ? '--' : `${currentWeight.toFixed(1)} kg`}</span>
              </div>
              <div className="text-gray-600">
                目标: <span className="font-semibold text-gray-900">{targetWeight.toFixed(2)} kg</span>
              </div>
              {daysRemaining !== null && (
                <div className={`font-medium ${daysRemaining < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                  {daysRemaining < 0 ? `已逾期 ${Math.abs(daysRemaining)} 天` : `剩余 ${daysRemaining} 天`}
                </div>
              )}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              onClick={handleExportReport}
              className="flex items-center space-x-2 px-6 py-2 rounded-lg font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>导出报告</span>
            </button>
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
      )}

      {activeTab === 'forecast' && (
        <div className="space-y-6">
          {/* AI智能分析区 */}
          <div className="border border-indigo-100 bg-indigo-50/50 rounded-xl p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                AI 智能分析
              </h3>
              <button
                onClick={handleAiAnalyze}
                className="text-sm bg-white border border-indigo-200 text-indigo-600 px-4 py-2 rounded-md hover:bg-indigo-50 transition-colors"
              >
                生成分析
              </button>
            </div>
            
            {aiAnalysis ? (
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">建议采蜜时间</h4>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-indigo-500" />
                      <span className="text-lg font-bold text-indigo-700">{aiAnalysis.suggestedDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-indigo-500" />
                      <span className="text-lg font-bold text-indigo-700">{aiAnalysis.suggestedTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-indigo-500" />
                      <span className="text-sm font-medium text-indigo-700">
                        置信度: {Math.round(aiAnalysis.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">分析依据</h4>
                  <div className="space-y-2">
                    {aiAnalysis.factors.map((factor, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                          <span className="text-sm text-gray-700">{factor.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-gray-600">{factor.impact}</span>
                          <span className="text-xs font-medium text-indigo-600">
                            权重: {Math.round(factor.weight * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">分析说明</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {aiAnalysis.explanation}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg p-8 text-center">
                <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-sm text-gray-500">
                  点击上方按钮，基于历史数据和当前状态生成智能采蜜建议...
                </p>
              </div>
            )}
          </div>

          {/* 预测可视化 */}
          {aiAnalysis && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">预测趋势</h3>
              <div className="h-56 sm:h-64">
                <ReactECharts
                  style={{ height: '100%', width: '100%' }}
                  option={{
                    animationDuration: 500,
                    tooltip: {
                      trigger: 'axis',
                      formatter: (params: Array<{ value: [number, number] }>) => {
                        const row = params[0];
                        if (!row) return '';
                        return `${new Date(row.value[0]).toLocaleString('zh-CN')}<br/>重量: ${row.value[1].toFixed(2)} kg`;
                      }
                    },
                    xAxis: {
                      type: 'time',
                      axisLabel: {
                        formatter: (value: number) => {
                          const d = new Date(value);
                          return `${d.getMonth() + 1}/${d.getDate()}`;
                        }
                      }
                    },
                    yAxis: {
                      type: 'value',
                      name: '重量 (kg)'
                    },
                    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 20 }],
                    series: [
                      {
                        name: '历史重量',
                        type: 'line',
                        showSymbol: false,
                        smooth: true,
                        data: weightTrendData.map((item) => [item.timestamp, item.weight]),
                        lineStyle: {
                          color: '#3b82f6'
                        },
                        areaStyle: {
                          color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [{
                              offset: 0, color: 'rgba(59, 130, 246, 0.3)'
                            }, {
                              offset: 1, color: 'rgba(59, 130, 246, 0.05)'
                            }]
                          }
                        }
                      },
                      {
                        name: '预测重量',
                        type: 'line',
                        showSymbol: false,
                        smooth: true,
                        data: [
                          [Date.now(), currentWeight || 0],
                          [new Date(aiAnalysis.suggestedDate).getTime(), targetWeight]
                        ],
                        lineStyle: {
                          color: '#10b981',
                          type: 'dashed'
                        }
                      },
                      {
                        name: '目标重量',
                        type: 'line',
                        showSymbol: false,
                        data: [
                          [Date.now() - 7 * 24 * 60 * 60 * 1000, targetWeight],
                          [new Date(aiAnalysis.suggestedDate).getTime() + 7 * 24 * 60 * 60 * 1000, targetWeight]
                        ],
                        lineStyle: {
                          color: '#f59e0b',
                          type: 'dotted'
                        }
                      }
                    ]
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
