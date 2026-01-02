import React from 'react';
import { Thermometer, Droplets, Scale, MapPin, Activity, ArrowDown, ArrowUp, AlertCircle } from 'lucide-react';
import { BeehiveData, LocationData } from '../types';

interface Props {
  data: BeehiveData;
  location: LocationData;
}

export const SensorGrid: React.FC<Props> = ({ data, location }) => {
  const netBees = data.beesIn - data.beesOut;
  
  // Status Logic
  const tempStatus = data.temperature > 36 ? 'high' : data.temperature < 31 ? 'low' : 'optimal';
  const humStatus = data.humidity > 80 ? 'high' : data.humidity < 40 ? 'low' : 'optimal';
  const weightStatus = data.weight > 25 ? 'heavy' : 'normal'; // Simplified logic

  const getStatusLabel = (val: number, type: 'temp' | 'hum') => {
      if (type === 'temp') {
          if (val > 36) return { text: '需降温', color: 'text-red-500', bg: 'bg-red-50' };
          if (val < 31) return { text: '需保温', color: 'text-blue-500', bg: 'bg-blue-50' };
          return { text: '适宜繁育', color: 'text-emerald-500', bg: 'bg-emerald-50' };
      }
      if (type === 'hum') {
          if (val > 80) return { text: '过湿', color: 'text-amber-500', bg: 'bg-amber-50' };
          if (val < 40) return { text: '干燥', color: 'text-amber-500', bg: 'bg-amber-50' };
          return { text: '环境舒适', color: 'text-emerald-500', bg: 'bg-emerald-50' };
      }
      return { text: '正常', color: 'text-gray-500', bg: 'bg-gray-50' };
  };

  const tempLabel = getStatusLabel(data.temperature, 'temp');
  const humLabel = getStatusLabel(data.humidity, 'hum');
  
  // 优先使用数据中的GPS信息，否则使用传入的location对象
  const displayLatitude = data.latitude !== undefined ? data.latitude : location.latitude;
  const displayLongitude = data.longitude !== undefined ? data.longitude : location.longitude;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Temperature */}
      <div className={`p-5 rounded-2xl shadow-sm border transition-colors ${tempStatus !== 'optimal' ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
        <div className="flex items-center justify-between mb-3 text-gray-400">
          <Thermometer size={18} className={tempStatus !== 'optimal' ? 'text-red-500' : ''} />
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${tempLabel.bg} ${tempLabel.color}`}>
             {tempLabel.text}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-1">箱内温度</span>
          <div className="flex items-end gap-1">
            <span className={`text-2xl font-black ${tempStatus !== 'optimal' ? 'text-red-600' : 'text-gray-900'}`}>{data.temperature}</span>
            <span className="text-xs text-gray-400 mb-1 font-bold">°C</span>
          </div>
        </div>
      </div>

      {/* Humidity */}
      <div className="p-5 rounded-2xl shadow-sm border bg-white border-gray-100">
        <div className="flex items-center justify-between mb-3 text-blue-400">
          <Droplets size={18} />
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${humLabel.bg} ${humLabel.color}`}>
             {humLabel.text}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-1">相对湿度</span>
          <div className="flex items-end gap-1">
            <span className="text-2xl font-black text-gray-900">{data.humidity}</span>
            <span className="text-xs text-gray-400 mb-1 font-bold">%</span>
          </div>
        </div>
      </div>

      {/* Weight */}
      <div className="p-5 rounded-2xl shadow-sm border bg-white border-gray-100">
        <div className="flex items-center justify-between mb-3 text-emerald-500">
          <Scale size={18} />
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-600">
             储蜜增长
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-1">蜂箱总重</span>
          <div className="flex items-end gap-1">
            <span className="text-2xl font-black text-gray-900">{data.weight}</span>
            <span className="text-xs text-gray-400 mb-1 font-bold">kg</span>
          </div>
        </div>
      </div>

      {/* Activity */}
      <div className="p-5 rounded-2xl shadow-sm border bg-white border-gray-100">
        <div className="flex items-center mb-3 text-amber-500">
          <Activity size={18} />
        </div>
        <div className="flex justify-between items-end">
           <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-1">今日流向</span>
              <div className="flex items-center gap-2">
                 <span className="flex items-center text-[10px] font-bold text-emerald-600"><ArrowDown size={10}/>{data.beesIn}</span>
                 <span className="flex items-center text-[10px] font-bold text-amber-600"><ArrowUp size={10}/>{data.beesOut}</span>
              </div>
           </div>
           <div className="text-right">
              <span className={`text-xl font-black ${netBees >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {netBees > 0 ? '+' : ''}{netBees}
              </span>
           </div>
        </div>
      </div>

      {/* GPS Information */}
      <div className="p-5 rounded-2xl shadow-sm border bg-white border-gray-100">
        <div className="flex items-center mb-3 text-blue-500">
          <MapPin size={18} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-1">GPS 纬度</span>
          <div className="flex items-end gap-1">
            <span className="text-2xl font-black text-gray-900">{displayLatitude.toFixed(6)}</span>
            <span className="text-xs text-gray-400 mb-1 font-bold">°</span>
          </div>
        </div>
      </div>

      {/* GPS Information */}
      <div className="p-5 rounded-2xl shadow-sm border bg-white border-gray-100">
        <div className="flex items-center mb-3 text-blue-500">
          <MapPin size={18} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-1">GPS 经度</span>
          <div className="flex items-end gap-1">
            <span className="text-2xl font-black text-gray-900">{displayLongitude.toFixed(6)}</span>
            <span className="text-xs text-gray-400 mb-1 font-bold">°</span>
          </div>
        </div>
      </div>

       {/* Location Info */}
       <div className="col-span-2 md:col-span-4 p-4 rounded-2xl shadow-sm border bg-indigo-900 border-indigo-800 flex items-center justify-between text-white">
         <div className="flex items-center gap-4">
             <div className="p-3 bg-white/10 rounded-xl">
                 <MapPin size={24} className="text-indigo-300" />
             </div>
             <div>
                 <p className="text-[10px] text-indigo-300 font-black uppercase tracking-widest">设备地理坐标</p>
                 <p className="text-sm font-bold tracking-tight">{location.address || '正在通过运营商基站定位...'}</p>
                 <p className="text-[10px] opacity-60 font-mono mt-0.5">{displayLatitude.toFixed(6)}, {displayLongitude.toFixed(6)}</p>
             </div>
         </div>
         <div className="hidden sm:flex flex-col items-end">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full">
               <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
               <span className="text-[10px] font-bold">北斗高精度定位中</span>
            </div>
         </div>
       </div>

    </div>
  );
};