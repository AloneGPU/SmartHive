import React from 'react';
import { Activity, UserCheck, LogOut, LogIn } from 'lucide-react';
import { BeehiveData } from '../types';

interface Props {
  data: BeehiveData;
}

export const BehaviorInsights: React.FC<Props> = ({ data }) => {
  const returnRate = data.beesOut > 0 ? (data.beesIn / data.beesOut * 100).toFixed(1) : '100';
  const score = parseFloat(returnRate);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
        <Activity size={18} className="text-indigo-500" />
        蜂群行为深度洞察
      </h3>

      <div className="space-y-6">
        {/* Return Rate Meter */}
        <div>
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs text-gray-500 font-medium">归巢完整率</span>
            <span className={`text-lg font-bold ${score < 90 ? 'text-red-500' : 'text-indigo-600'}`}>{returnRate}%</span>
          </div>
          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
             <div 
               className={`h-full transition-all duration-1000 ${score < 90 ? 'bg-red-500' : 'bg-indigo-500'}`}
               style={{ width: `${Math.min(100, score)}%` }}
             ></div>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            {score < 90 ? '警告：归巢率低，可能存在农药中毒或迷失。' : '状态：采集蜂回巢正常，蜂力强健。'}
          </p>
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 p-2 rounded-lg border border-gray-50">
             <div className="p-2 bg-blue-50 text-blue-500 rounded-md">
                <LogIn size={14}/>
             </div>
             <div>
                <p className="text-[10px] text-gray-400 font-medium uppercase">入巢峰值</p>
                <p className="text-sm font-bold text-gray-800">{Math.round(data.beesIn * 1.2)}/min</p>
             </div>
          </div>
          <div className="flex items-center gap-3 p-2 rounded-lg border border-gray-50">
             <div className="p-2 bg-amber-50 text-amber-500 rounded-md">
                <LogOut size={14}/>
             </div>
             <div>
                <p className="text-[10px] text-gray-400 font-medium uppercase">出巢频率</p>
                <p className="text-sm font-bold text-gray-800">{Math.round(data.beesOut / 60)}/sec</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};