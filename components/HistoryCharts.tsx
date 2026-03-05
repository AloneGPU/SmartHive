
import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Download, Calendar, BarChart3 } from 'lucide-react';

interface Props {
  data: { time: string; timeShort?: string; timestamp?: number; temp: number; weight: number; humidity?: number }[];
  totalCount: number;
}

export const HistoryCharts: React.FC<Props> = ({ data, totalCount }) => {
  const [visibleSeries, setVisibleSeries] = useState({
    temp: true,
    weight: true,
    humidity: true
  });
  const hasData = data && data.length > 0;
  const chartData = hasData ? data : [];
  const missingCount = Math.max(0, totalCount - chartData.length);
  const formatFullTime = (value: number | string) => new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const formatAxisTime = (value: number | string) => new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const toggleSeries = (key: keyof typeof visibleSeries) => {
    setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const exportToCSV = () => {
    if (!chartData || chartData.length === 0) return;
    
    const headers = ['时间', '时间戳', '温度(°C)', '重量(kg)', '湿度(%)'];
    const csvContent = [
      headers.join(','),
      ...chartData.map(row => [
        row.time,
        row.timestamp ?? '',
        row.temp, 
        row.weight, 
        row.humidity || ''
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `蜂箱数据_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!hasData) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[400px]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
             <BarChart3 className="text-indigo-500" size={18} />
             环境与状态趋势
          </h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
          <Calendar size={48} className="mb-4 opacity-20" />
          <p className="text-sm font-medium">暂无历史趋势数据</p>
          <p className="text-xs mt-1 opacity-70">请等待传感器上传更多数据点</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <BarChart3 className="text-indigo-500" size={18} />
            环境与状态趋势
        </h3>
        <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
              {chartData.length} 数据点
            </span>
            <button 
                onClick={exportToCSV}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors"
                title="导出CSV数据"
            >
                <Download size={14} />
                导出
            </button>
        </div>
      </div>
      
      <div className="h-[320px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 500}}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatAxisTime}
              minTickGap={40}
              dy={10}
            />
            
            {/* Left Axis: Temperature */}
            <YAxis 
                yAxisId="left" 
                tick={{fontSize: 10, fill: '#f59e0b', fontWeight: 600}} 
                axisLine={false} 
                tickLine={false} 
                unit="°C" 
                domain={['auto', 'auto']}
                width={35}
            />
            
            {/* Right Axis: Weight */}
            <YAxis 
                yAxisId="right" 
                orientation="right" 
                tick={{fontSize: 10, fill: '#3b82f6', fontWeight: 600}} 
                axisLine={false} 
                tickLine={false} 
                unit="kg" 
                domain={['auto', 'auto']}
                width={35}
            />
            
            {/* Right Axis 2: Humidity (hidden axis line, but visible data) */}
            <YAxis yAxisId="hum" orientation="right" tick={{fontSize: 10, fill: '#10b981'}} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} hide />

            <Tooltip 
                trigger="hover"
                cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }}
                contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    padding: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(4px)'
                }}
                isAnimationActive={false}
                labelFormatter={(label) => <span className="text-xs font-bold text-gray-500 mb-2 block">{formatFullTime(label)}</span>}
            />
            
            <Area 
                yAxisId="left"
                type="monotone" 
                dataKey="temp" 
                name="温度"
                stroke="#f59e0b" 
                fillOpacity={1} 
                fill="url(#colorTemp)" 
                strokeWidth={2}
                hide={!visibleSeries.temp}
                isAnimationActive={true}
                animationDuration={1000}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#f59e0b' }}
            />
            <Area 
                yAxisId="right"
                type="monotone" 
                dataKey="weight" 
                name="重量"
                stroke="#3b82f6" 
                fillOpacity={1} 
                fill="url(#colorWeight)" 
                strokeWidth={2}
                hide={!visibleSeries.weight}
                isAnimationActive={true}
                animationDuration={1000}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
            />
            <Area 
                yAxisId="hum"
                type="monotone" 
                dataKey="humidity" 
                name="湿度"
                stroke="#10b981" 
                fillOpacity={1} 
                fill="url(#colorHum)" 
                strokeWidth={2}
                hide={!visibleSeries.humidity}
                isAnimationActive={true}
                animationDuration={1000}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#10b981' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="flex justify-center gap-3 mt-4 flex-wrap">
          <button 
            onClick={() => toggleSeries('temp')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                visibleSeries.temp 
                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' 
                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
              <div className={`w-2 h-2 rounded-full ${visibleSeries.temp ? 'bg-amber-500' : 'bg-gray-400'}`}></div>
              温度 (°C)
          </button>
          <button 
            onClick={() => toggleSeries('weight')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                visibleSeries.weight 
                ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' 
                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
              <div className={`w-2 h-2 rounded-full ${visibleSeries.weight ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
              重量 (kg)
          </button>
          <button 
            onClick={() => toggleSeries('humidity')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                visibleSeries.humidity 
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' 
                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
              <div className={`w-2 h-2 rounded-full ${visibleSeries.humidity ? 'bg-emerald-500' : 'bg-gray-400'}`}></div>
              湿度 (%)
          </button>
      </div>
    </div>
  );
};
