import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: { time: string; temp: number; weight: number; humidity?: number }[];
}

export const HistoryCharts: React.FC<Props> = ({ data }) => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-gray-800">环境与状态趋势</h3>
      </div>
      
      <div className="h-72 w-full">
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
              <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="time" tick={{fontSize: 12, fill: '#9ca3af'}} axisLine={false} tickLine={false} />
            
            {/* Left Axis: Temperature */}
            <YAxis yAxisId="left" tick={{fontSize: 12, fill: '#f59e0b'}} axisLine={false} tickLine={false} unit="°C" domain={['auto', 'auto']}/>
            
            {/* Right Axis: Weight */}
            <YAxis yAxisId="right" orientation="right" tick={{fontSize: 12, fill: '#3b82f6'}} axisLine={false} tickLine={false} unit="kg" domain={['auto', 'auto']}/>
            
             {/* Right Axis 2: Humidity (hidden axis line, but visible data) - sharing right side or offset? 
                 Recharts doesn't handle 3 axes perfectly without offset. 
                 Let's just put humidity on a separate scale but overlay it.
             */}
            <YAxis yAxisId="hum" orientation="right" tick={{fontSize: 12, fill: '#10b981'}} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} hide />

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
            <Area 
                yAxisId="hum"
                type="monotone" 
                dataKey="humidity" 
                name="湿度"
                stroke="#10b981" 
                fillOpacity={1} 
                fill="url(#colorHum)" 
                strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-6 mt-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span> 温度 (°C)
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span> 重量 (kg)
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span> 湿度 (%)
          </div>
      </div>
    </div>
  );
};