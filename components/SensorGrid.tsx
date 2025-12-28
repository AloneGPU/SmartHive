import React from 'react';
import { Thermometer, Droplets, Scale, MapPin, Activity, ArrowDown, ArrowUp, AlertCircle } from 'lucide-react';
import { BeehiveData, LocationData } from '../types';

interface Props {
  data: BeehiveData;
  location: LocationData;
}

export const SensorGrid: React.FC<Props> = ({ data, location }) => {
  const netBees = data.beesIn - data.beesOut;
  const tempStatus = data.temperature > 36 || data.temperature < 31 ? 'warning' : 'optimal';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Temperature */}
      <div className={`p-5 rounded-2xl shadow-sm border transition-colors ${
        tempStatus === 'warning' ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'
      }`}>
        <div className="flex items-center justify-between mb-3 text-gray-400">
          <Thermometer size={18} />
          {tempStatus === 'warning' && <AlertCircle size={14} className="text-red-500 animate-pulse" />}
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-1">内部温度</span>
          <div className="flex items-end gap-1">
            <span className={`text-2xl font-black ${tempStatus === 'warning' ? 'text-red-600' : 'text-gray-900'}`}>{data.temperature}</span>
            <span className="text-xs text-gray-400 mb-1 font-bold">°C</span>
          </div>
        </div>
      </div>

      {/* Humidity */}
      <div className="p-5 rounded-2xl shadow-sm border bg-white border-gray-100">
        <div className="flex items-center mb-3 text-blue-400">
          <Droplets size={18} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-1">内部湿度</span>
          <div className="flex items-end gap-1">
            <span className="text-2xl font-black text-gray-900">{data.humidity}</span>
            <span className="text-xs text-gray-400 mb-1 font-bold">%</span>
          </div>
        </div>
      </div>

      {/* Weight */}
      <div className="p-5 rounded-2xl shadow-sm border bg-white border-gray-100">
        <div className="flex items-center mb-3 text-emerald-500">
          <Scale size={18} />
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

       {/* Location Info */}
       <div className="col-span-2 md:col-span-4 p-4 rounded-2xl shadow-sm border bg-indigo-900 border-indigo-800 flex items-center justify-between text-white">
         <div className="flex items-center gap-4">
             <div className="p-3 bg-white/10 rounded-xl">
                 <MapPin size={24} className="text-indigo-300" />
             </div>
             <div>
                 <p className="text-[10px] text-indigo-300 font-black uppercase tracking-widest">设备地理坐标</p>
                 <p className="text-sm font-bold tracking-tight">{location.address || '正在通过运营商基站定位...'}</p>
                 <p className="text-[10px] opacity-60 font-mono mt-0.5">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>
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