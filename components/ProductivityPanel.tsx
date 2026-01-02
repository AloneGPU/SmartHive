import React, { useState, useMemo } from 'react';
import { TrendingUp, Calendar, Zap, Droplets, Settings, X, Save, Clock, Scale } from 'lucide-react';
import { BeehiveData, HiveConfig } from '../types';

interface Props {
  data: BeehiveData;
  history: any[];
  config: HiveConfig;
  onUpdateConfig: (config: HiveConfig) => void;
}

export const ProductivityPanel: React.FC<Props> = ({ data, history, config, onUpdateConfig }) => {
  const [showSettings, setShowSettings] = useState(false);
  const [tempConfig, setTempConfig] = useState<HiveConfig>(config);

  // Analysis Logic
  const analysis = useMemo(() => {
    // 1. Calculate Time Since Last Harvest
    const lastHarvest = config.lastHarvestDate || Date.now();
    const daysSinceHarvest = Math.floor((Date.now() - lastHarvest) / (1000 * 60 * 60 * 24));
    
    // 2. Calculate Weight Trend (Daily Gain)
    // We look at the history to find the rate of change
    let dailyGain = 0;
    if (history.length > 10) {
        // Use last ~hour of data to extrapolate daily rate? 
        // Better: Use start and end of history buffer if it spans enough time
        const newest = history[0];
        const oldest = history[history.length - 1];
        const timeDiffHours = (new Date(newest.timestamp).getTime() - new Date(oldest.timestamp).getTime()) / 3600000;
        
        if (timeDiffHours > 0.5) {
             const weightDiff = newest.weight - oldest.weight;
             dailyGain = (weightDiff / timeDiffHours) * 24;
        }
    }
    
    // 3. Predict Days Remaining
    const weightRemaining = Math.max(0, config.targetWeight - data.weight);
    let daysToHarvest: string | number = '--';
    let harvestDate: Date | null = null;

    if (weightRemaining === 0) {
        daysToHarvest = 0; // Ready!
        harvestDate = new Date();
    } else if (dailyGain > 0.1) {
        const days = weightRemaining / dailyGain;
        daysToHarvest = Math.ceil(days);
        harvestDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    // 4. Flow Status
    let flowStatus = '消耗期';
    if (dailyGain > 0.5) flowStatus = '大流蜜期';
    else if (dailyGain > 0.1) flowStatus = '平稳增长';
    else if (dailyGain > -0.1) flowStatus = '维持期';

    return {
        daysSinceHarvest,
        dailyGain,
        weightRemaining,
        daysToHarvest,
        harvestDate,
        flowStatus,
        progress: Math.min(100, Math.max(0, (data.weight / config.targetWeight) * 100))
    };
  }, [data, history, config]);

  const handleSaveConfig = () => {
    onUpdateConfig(tempConfig);
    setShowSettings(false);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = new Date(e.target.value).getTime();
    setTempConfig(prev => ({ ...prev, lastHarvestDate: date }));
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 relative overflow-hidden">
      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="absolute inset-0 bg-white/95 z-20 flex flex-col p-5 animate-in fade-in duration-200">
           <div className="flex justify-between items-center mb-6">
               <h4 className="font-bold text-gray-800 flex items-center gap-2">
                   <Settings size={18} className="text-gray-600"/> 采蜜配置
               </h4>
               <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded-full">
                   <X size={20} className="text-gray-500"/>
               </button>
           </div>
           
           <div className="space-y-4 flex-1">
               <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">上次采蜜日期</label>
                   <input 
                      type="date" 
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={tempConfig.lastHarvestDate ? new Date(tempConfig.lastHarvestDate).toISOString().split('T')[0] : ''}
                      onChange={handleDateChange}
                   />
               </div>
               
               <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">目标采收重量 (kg)</label>
                   <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-emerald-500">
                      <Scale size={16} className="text-gray-400"/>
                      <input 
                          type="number" 
                          className="w-full outline-none text-sm"
                          value={tempConfig.targetWeight}
                          onChange={(e) => setTempConfig(prev => ({...prev, targetWeight: Number(e.target.value)}))}
                      />
                      <span className="text-xs text-gray-400 font-medium">KG</span>
                   </div>
               </div>
           </div>

           <button 
              onClick={handleSaveConfig}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors mt-4"
           >
               <Save size={18} /> 保存配置
           </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp size={18} className="text-emerald-500" />
          智能采蜜预测
        </h3>
        <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                analysis.flowStatus === '大流蜜期' ? 'bg-amber-100 text-amber-700' : 
                analysis.flowStatus === '消耗期' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
            {analysis.flowStatus}
            </span>
            <button 
                onClick={() => {
                    setTempConfig(config);
                    setShowSettings(true);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="设置"
            >
                <Settings size={16} />
            </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50">
          <p className="text-[10px] text-emerald-600 font-bold mb-1 flex items-center gap-1">
             <Calendar size={10}/> 距离上次
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-gray-800">{analysis.daysSinceHarvest}</span>
            <span className="text-xs text-gray-500 font-medium">天</span>
          </div>
        </div>
        
        <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100/50">
          <p className="text-[10px] text-amber-600 font-bold mb-1 flex items-center gap-1">
             <Clock size={10}/> 预计采收
          </p>
          <div className="flex items-baseline gap-1">
             {typeof analysis.daysToHarvest === 'number' ? (
                 <>
                    <span className="text-2xl font-bold text-gray-800">{analysis.daysToHarvest}</span>
                    <span className="text-xs text-gray-500 font-medium">天后</span>
                 </>
             ) : (
                 <span className="text-lg font-bold text-gray-400">需更多数据</span>
             )}
          </div>
          {analysis.harvestDate && (
              <p className="text-[10px] text-gray-400 mt-1">
                  约 {analysis.harvestDate.getMonth() + 1}月{analysis.harvestDate.getDate()}日
              </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
         {/* Progress Bar */}
         <div>
            <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-500">成熟度进度</span>
                <span className="font-bold text-gray-800">{analysis.progress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div 
                    className={`h-full transition-all duration-1000 ${analysis.progress >= 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} 
                    style={{ width: `${analysis.progress}%` }}
                ></div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>当前: {data.weight}kg</span>
                <span>目标: {config.targetWeight}kg</span>
            </div>
         </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50">
            <div className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded-lg">
                <span className="text-gray-500 text-xs flex items-center gap-1.5">
                    <Zap size={12} className="text-amber-500"/> 
                    日增重
                </span>
                <span className={`font-bold text-xs ${analysis.dailyGain > 0 ? 'text-emerald-600' : 'text-gray-600'}`}>
                    {analysis.dailyGain > 0 ? '+' : ''}{analysis.dailyGain.toFixed(2)} kg
                </span>
            </div>
            <div className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded-lg">
                <span className="text-gray-500 text-xs flex items-center gap-1.5">
                    <Droplets size={12} className="text-blue-500"/> 
                    湿度
                </span>
                <span className="font-bold text-xs text-gray-700">{data.humidity}%</span>
            </div>
        </div>
      </div>
    </div>
  );
};
