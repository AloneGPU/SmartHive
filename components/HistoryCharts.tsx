import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: { time: string; temp: number; weight: number }[];
}

export const HistoryCharts: React.FC<Props> = ({ data }) => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <h3 className="font-semibold text-gray-800 mb-6">今日数据趋势</h3>
      
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="time" tick={{fontSize: 12, fill: '#9ca3af'}} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{fontSize: 12, fill: '#9ca3af'}} axisLine={false} tickLine={false} unit="°C" domain={['dataMin - 1', 'dataMax + 1']}/>
            <YAxis yAxisId="right" orientation="right" tick={{fontSize: 12, fill: '#9ca3af'}} axisLine={false} tickLine={false} unit="kg" domain={['dataMin - 0.5', 'dataMax + 0.5']}/>
            <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
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
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-6 mt-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span> 温度 (°C)
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span> 重量 (kg)
          </div>
      </div>
    </div>
  );
};