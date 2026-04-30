import React from 'react';
import { TrendingUp, TrendingDown, Minus, Calendar, Target, Clock } from 'lucide-react';
import { HiveConfig } from '../types';

interface ProductivityPanelProps {
  hiveConfig: HiveConfig;
  currentWeight: number | null;
}

export const ProductivityPanel: React.FC<ProductivityPanelProps> = ({ hiveConfig, currentWeight }) => {
  const calculateDaysSinceHarvest = () => {
    if (!hiveConfig.lastHarvestDate) return null;
    const now = Date.now();
    const days = Math.floor((now - hiveConfig.lastHarvestDate) / (1000 * 60 * 60 * 24));
    return days;
  };

  const calculateDaysSinceStart = () => {
    if (!hiveConfig.startFarmingDate) return null;
    const now = Date.now();
    const days = Math.floor((now - hiveConfig.startFarmingDate) / (1000 * 60 * 60 * 24));
    return days;
  };

  const calculateProductivity = () => {
    if (currentWeight === null || !Number.isFinite(currentWeight)) {
      return { weightDiff: null as number | null, percentage: null as number | null };
    }
    const weightDiff = currentWeight - (hiveConfig.targetWeight || 50);
    const percentage = (currentWeight / (hiveConfig.targetWeight || 50)) * 100;
    return { weightDiff, percentage };
  };

  const daysSinceHarvest = calculateDaysSinceHarvest();
  const daysSinceStart = calculateDaysSinceStart();
  const { weightDiff, percentage } = calculateProductivity();

  const getProductivityStatus = () => {
    if (percentage === null) return { status: 'unknown', text: '缺少数据', color: 'text-gray-600', bgColor: 'bg-gray-100' };
    if (percentage >= 100) return { status: 'excellent', text: '优秀', color: 'text-green-600', bgColor: 'bg-green-50' };
    if (percentage >= 80) return { status: 'good', text: '良好', color: 'text-blue-600', bgColor: 'bg-blue-50' };
    if (percentage >= 60) return { status: 'normal', text: '正常', color: 'text-yellow-600', bgColor: 'bg-yellow-50' };
    return { status: 'low', text: '偏低', color: 'text-red-600', bgColor: 'bg-red-50' };
  };

  const productivityStatus = getProductivityStatus();

  const productivityMetrics = [
    {
      title: '距离上次收蜜',
      value: daysSinceHarvest === null ? '--' : `${daysSinceHarvest} 天`,
      icon: <Calendar className="w-5 h-5 text-purple-500" />,
      trend: daysSinceHarvest === null ? 'stable' : daysSinceHarvest > 30 ? 'up' : 'down',
      description: daysSinceHarvest === null ? '未设置' : daysSinceHarvest > 30 ? '可以收蜜' : '时间较短'
    },
    {
      title: '养殖天数',
      value: daysSinceStart === null ? '--' : `${daysSinceStart} 天`,
      icon: <Clock className="w-5 h-5 text-indigo-500" />,
      trend: 'stable',
      description: daysSinceStart === null ? '未设置' : '持续养殖中'
    },
    {
      title: '目标完成度',
      value: percentage === null ? '--' : `${percentage.toFixed(1)}%`,
      icon: <Target className="w-5 h-5 text-green-500" />,
      trend: percentage === null ? 'stable' : percentage >= 100 ? 'up' : percentage >= 80 ? 'stable' : 'down',
      description: productivityStatus.text
    }
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">生产力分析</h2>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${productivityStatus.bgColor} ${productivityStatus.color}`}>
          {productivityStatus.text}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {productivityMetrics.map((metric, index) => (
          <div key={index} className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                {metric.icon}
                <span className="text-sm font-medium text-gray-700">{metric.title}</span>
              </div>
              <div className="flex items-center">
                {metric.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-500" />}
                {metric.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
                {metric.trend === 'stable' && <Minus className="w-4 h-4 text-gray-500" />}
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">{metric.value}</div>
            <div className="text-xs text-gray-500">{metric.description}</div>
          </div>
        ))}
      </div>

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
            <span className={`text-lg font-semibold ${
              weightDiff !== null && weightDiff >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {weightDiff === null ? '--' : `${weightDiff >= 0 ? '+' : ''}${weightDiff.toFixed(2)} kg`}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
            <div 
              className={`h-2 rounded-full ${
                percentage === null ? 'bg-gray-400' : percentage >= 100 ? 'bg-green-500' : percentage >= 80 ? 'bg-blue-500' : percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${percentage === null ? 0 : Math.min(percentage, 100)}%` }}
            ></div>
          </div>
          <div className="text-center text-sm text-gray-500 mt-2">
            进度: {percentage === null ? '--' : `${percentage.toFixed(1)}%`}
          </div>
        </div>
      </div>
    </div>
  );
};
