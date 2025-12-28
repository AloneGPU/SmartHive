import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart, Line, Area, Legend
} from 'recharts';
import { BeehiveData } from '../types';

interface Props {
  history: any[];
  currentData: BeehiveData;
}

export const DetailedAnalytics: React.FC<Props> = ({ history, currentData }) => {
  // 构造雷达图数据
  const radarData = [
    { subject: '蜂力强度', A: Math.min(100, (currentData.beesIn + currentData.beesOut) / 50), fullMark: 100 },
    { subject: '生产效率', A: currentData.weight > 20 ? 85 : 40, fullMark: 100 },
    { subject: '控温能力', A: currentData.temperature > 33 && currentData.temperature < 36 ? 95 : 60, fullMark: 100 },
    { subject: '归巢防御', A: (currentData.beesIn / (currentData.beesOut || 1)) * 100, fullMark: 100 },
  ];

  // 构造出勤分布图数据 (模拟数据处理)
  const activityDistribution = history.map(h => ({
    time: h.time,
    in: Math.floor(Math.random() * 200 + 100),
    out: Math.floor(Math.random() * 200 + 100)
  })).slice(-12);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1. 蜂群体质雷达图 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span>
            蜂群多维体质评估
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="当前状态"
                  dataKey="A"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.6}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. 环境与采集相关性分析 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-orange-400 rounded-full"></span>
            温控与采集活跃度关联
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={history.slice(-15)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{fontSize: 10, fill: '#9ca3af'}} axisLine={false} />
                <YAxis yAxisId="left" orientation="left" tick={{fontSize: 10, fill: '#9ca3af'}} axisLine={false} unit="°C"/>
                <YAxis yAxisId="right" orientation="right" tick={{fontSize: 10, fill: '#9ca3af'}} axisLine={false} unit="次"/>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                <Area yAxisId="left" type="monotone" dataKey="temp" name="箱内温度" fill="#ffedd5" stroke="#f97316" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="weight" name="采集活跃(模拟)" stroke="#6366f1" strokeWidth={3} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* 3. 24小时出勤规律图 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span className="w-1.5 h-4 bg-emerald-500 rounded-full"></span>
          近期出勤流量分布 (进/出比)
        </h3>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activityDistribution}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="time" tick={{fontSize: 10, fill: '#9ca3af'}} axisLine={false} />
              <YAxis tick={{fontSize: 10, fill: '#9ca3af'}} axisLine={false} />
              <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{ borderRadius: '8px', border: 'none' }} />
              <Bar dataKey="in" name="入巢次数" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
              <Bar dataKey="out" name="出巢次数" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};