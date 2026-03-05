
import React from 'react';
import { Thermometer, Droplets, Scale, MapPin, Activity, ArrowDown, ArrowUp, AlertCircle, Clock, Wifi, CheckCircle2 } from 'lucide-react';
import { BeehiveData, LocationData } from '../types';

interface Props {
  data: BeehiveData;
  location: LocationData;
  lastUpdatedAt?: number | null;
}

export const SensorGrid: React.FC<Props> = ({ data, location, lastUpdatedAt }) => {
  const netBees = data.beesIn - data.beesOut;
  
  // Status Logic
  const tempStatus = data.temperature > 36 ? 'high' : data.temperature < 10 ? 'low' : 'optimal';
  const humStatus = data.humidity > 80 ? 'high' : data.humidity < 40 ? 'low' : 'optimal';
  
  const getStatusLabel = (val: number, type: 'temp' | 'hum') => {
      if (type === 'temp') {
          if (val > 36) return { text: '需降温', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' };
          if (val < 10) return { text: '需保温', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' };
          return { text: '适宜繁育', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' };
      }
      if (type === 'hum') {
          if (val > 80) return { text: '过湿', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' };
          if (val < 40) return { text: '干燥', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' };
          return { text: '环境舒适', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' };
      }
      return { text: '正常', color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-100' };
  };

  const tempLabel = getStatusLabel(data.temperature, 'temp');
  const humLabel = getStatusLabel(data.humidity, 'hum');
  
  const displayLatitude = data.latitude !== undefined ? data.latitude : location.latitude;
  const displayLongitude = data.longitude !== undefined ? data.longitude : location.longitude;
  const locationRegion = [location.province, location.city, location.district].filter(Boolean).join(' ');
  const locationStatusLabel = location.status === 'resolving' ? '解析中...' : location.status === 'error' ? '解析失败' : '已定位';
  const locationStatusColor = location.status === 'error' ? 'text-rose-400' : 'text-emerald-400';

  const dataTimestamp = typeof data.timestamp === 'number' ? data.timestamp : (lastUpdatedAt ?? Date.now());
  const dataAgeMs = Math.max(0, Date.now() - dataTimestamp);
  
  // Simplified Freshness Logic
  const isFresh = dataAgeMs <= 5 * 60 * 1000;
  
  return (
    <div className="space-y-4">
      {/* 1. Status Bar Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
           <div className={`p-2 rounded-xl ${isFresh ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
              {isFresh ? <Wifi size={18} /> : <AlertCircle size={18} />}
           </div>
           <div>
              <div className="flex items-center gap-2">
                 <p className="text-xs font-bold text-gray-700">数据状态</p>
                 <span className={`w-2 h-2 rounded-full ${isFresh ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              </div>
              <p className="text-[10px] text-gray-400 font-mono">
                 {new Date(dataTimestamp).toLocaleString('zh-CN', { hour12: false })}
                 <span className="ml-1 opacity-75">({isFresh ? '实时' : '滞后'})</span>
              </p>
           </div>
        </div>
        
        {/* Alerts Pills */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 sm:pb-0 no-scrollbar">
           {data.hornetsDetected > 0 && (
             <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 whitespace-nowrap">
               <AlertCircle size={12} />
               <span className="text-[10px] font-bold">胡蜂威胁 {data.hornetsDetected}</span>
             </div>
           )}
           {tempStatus !== 'optimal' && (
             <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border whitespace-nowrap ${tempLabel.bg} ${tempLabel.border} ${tempLabel.color}`}>
               <Thermometer size={12} />
               <span className="text-[10px] font-bold">{tempLabel.text}</span>
             </div>
           )}
           {humStatus !== 'optimal' && (
             <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border whitespace-nowrap ${humLabel.bg} ${humLabel.border} ${humLabel.color}`}>
               <Droplets size={12} />
               <span className="text-[10px] font-bold">{humLabel.text}</span>
             </div>
           )}
           {data.hornetsDetected === 0 && tempStatus === 'optimal' && humStatus === 'optimal' && (
             <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 whitespace-nowrap">
               <CheckCircle2 size={12} />
               <span className="text-[10px] font-bold">各项指标正常</span>
             </div>
           )}
        </div>
      </div>

      {/* 2. Sensor Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Temperature */}
        <div className={`relative overflow-hidden p-5 rounded-2xl shadow-sm border transition-all hover:shadow-md ${tempStatus !== 'optimal' ? 'bg-white border-rose-200' : 'bg-white border-gray-100'}`}>
          <div className={`absolute top-0 right-0 p-3 opacity-10 ${tempStatus !== 'optimal' ? 'text-rose-500' : 'text-gray-400'}`}>
             <Thermometer size={48} />
          </div>
          <div className="relative z-10">
             <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${tempStatus !== 'optimal' ? 'bg-rose-100 text-rose-600' : 'bg-orange-100 text-orange-600'}`}>
                   <Thermometer size={16} />
                </div>
                <span className="text-xs font-bold text-gray-400 uppercase">温度</span>
             </div>
             <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-black ${tempStatus !== 'optimal' ? 'text-rose-600' : 'text-gray-800'}`}>
                  {data.temperature.toFixed(1)}
                </span>
                <span className="text-xs text-gray-400 font-bold">°C</span>
             </div>
             <div className={`mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${tempLabel.bg} ${tempLabel.color}`}>
                {tempLabel.text}
             </div>
          </div>
        </div>

        {/* Humidity */}
        <div className="relative overflow-hidden p-5 rounded-2xl shadow-sm border bg-white border-gray-100 hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 p-3 opacity-10 text-blue-500">
             <Droplets size={48} />
          </div>
          <div className="relative z-10">
             <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                   <Droplets size={16} />
                </div>
                <span className="text-xs font-bold text-gray-400 uppercase">湿度</span>
             </div>
             <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-gray-800">
                  {data.humidity.toFixed(1)}
                </span>
                <span className="text-xs text-gray-400 font-bold">%</span>
             </div>
             <div className={`mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${humLabel.bg} ${humLabel.color}`}>
                {humLabel.text}
             </div>
          </div>
        </div>

        {/* Weight */}
        <div className="relative overflow-hidden p-5 rounded-2xl shadow-sm border bg-white border-gray-100 hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 p-3 opacity-10 text-emerald-500">
             <Scale size={48} />
          </div>
          <div className="relative z-10">
             <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600">
                   <Scale size={16} />
                </div>
                <span className="text-xs font-bold text-gray-400 uppercase">重量</span>
             </div>
             <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-gray-800">
                  {data.weight.toFixed(2)}
                </span>
                <span className="text-xs text-gray-400 font-bold">kg</span>
             </div>
             <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600">
                储蜜监测中
             </div>
          </div>
        </div>

        {/* Activity */}
        <div className="relative overflow-hidden p-5 rounded-2xl shadow-sm border bg-white border-gray-100 hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 p-3 opacity-10 text-amber-500">
             <Activity size={48} />
          </div>
          <div className="relative z-10">
             <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-amber-100 text-amber-600">
                   <Activity size={16} />
                </div>
                <span className="text-xs font-bold text-gray-400 uppercase">净流量</span>
             </div>
             <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-black ${netBees >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                   {netBees > 0 ? '+' : ''}{netBees}
                </span>
                <span className="text-xs text-gray-400 font-bold">只</span>
             </div>
             <div className="mt-2 flex items-center gap-2 text-[10px] font-bold">
                <span className="flex items-center gap-0.5 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                   <ArrowDown size={10} /> {data.beesIn}
                </span>
                <span className="flex items-center gap-0.5 text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                   <ArrowUp size={10} /> {data.beesOut}
                </span>
             </div>
          </div>
        </div>

      </div>

      {/* 3. Location Bar */}
      <div className="bg-slate-900 rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-white relative overflow-hidden">
         <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20 -mr-16 -mt-16"></div>
         
         <div className="flex items-center gap-4 relative z-10 w-full">
            <div className="p-3 bg-white/10 backdrop-blur-sm rounded-xl shrink-0">
               <MapPin size={20} className="text-indigo-200" />
            </div>
            <div className="min-w-0 flex-1">
               <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">设备位置</p>
                  <span className={`text-[10px] font-bold ${locationStatusColor} bg-white/5 px-1.5 rounded`}>
                     {locationStatusLabel}
                  </span>
               </div>
               <p className="text-sm font-bold truncate">{location.address || '正在获取详细地址...'}</p>
               <p className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                  <span>{displayLatitude.toFixed(6)}, {displayLongitude.toFixed(6)}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                  <span>{locationRegion || '未知区域'}</span>
               </p>
            </div>
         </div>
      </div>
    </div>
  );
};
