import React from 'react';
import { TrendingUp, Calendar, Zap, Droplets } from 'lucide-react';
import { BeehiveData } from '../types';

interface Props {
  data: BeehiveData;
  history: any[];
}

export const ProductivityPanel: React.FC<Props> = ({ data, history }) => {
  // 简易逻辑：计算近几次重量变化的趋势
  const weightGain = history.length > 1 ? data.weight - history[0].weight : 0;
  const daysToHarvest = weightGain > 0 ? Math.max(1, Math.round((45 - data.weight) / (weightGain / history.length * 24))) : '--';
  const flowStatus = weightGain > 0.1 ? '大流蜜' : weightGain > 0 ? '平稳增长' : '消耗期';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp size={18} className="text-emerald-500" />
          生产效益分析
        </h3>
        <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
          {flowStatus}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 p-3 rounded-xl">
          <p className="text-[10px] text-gray-500 font-medium mb-1">预计蜂蜜净产</p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-emerald-600">{(data.weight * 0.65).toFixed(1)}</span>
            <span className="text-xs text-gray-400">kg</span>
          </div>
        </div>
        <div className="bg-gray-50 p-3 rounded-xl">
          <p className="text-[10px] text-gray-500 font-medium mb-1">建议采收时间</p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-gray-800">{daysToHarvest}</span>
            <span className="text-xs text-gray-400">天后</span>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 flex items-center gap-1.5"><Zap size={14} className="text-amber-500"/> 采蜜强度</span>
          <div className="w-24 bg-gray-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-amber-400 h-full" style={{ width: `${Math.min(100, (data.beesOut / 2000) * 100)}%` }}></div>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 flex items-center gap-1.5"><Droplets size={14} className="text-blue-500"/> 水分干预</span>
          <span className="text-gray-800 font-medium">{data.humidity > 70 ? '需要通风' : '无需干预'}</span>
        </div>
      </div>
    </div>
  );
};