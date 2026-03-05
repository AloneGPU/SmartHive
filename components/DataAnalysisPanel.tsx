import React, { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, BarChart, Bar, Cell
} from 'recharts';
import { BeehiveData } from '../types';

interface Props {
  history: any[];
}

export const DataAnalysisPanel: React.FC<Props> = ({ history }) => {
  // 如果没有历史数据，显示空状态
  const hasData = history && history.length > 0;
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
  
  // 1. Correlation Data: Temperature vs Bees Out
  const correlationData = useMemo(() => {
    if (!hasData) return [];
    return history.map(h => ({
      temp: h.temp || h.temperature || 0,
      activity: h.beesOut || 0,
      timestamp: typeof h.timestamp === 'number' ? h.timestamp : Date.now(),
      time: h.time
    })).filter(d => d.temp > 0); // Filter invalid data
  }, [history, hasData]);

  // 2. Health Trend (Calculated)
  const healthTrendData = useMemo(() => {
    if (!hasData) return [];
    return history.map(h => {
      // Simple heuristic health score
      // Optimal temp ~35, deviation reduces score
      const temp = h.temp || h.temperature || 0;
      const weight = h.weight || 0;
      const tempScore = Math.max(0, 100 - Math.abs(temp - 35) * 5);
      // More weight usually means more honey (simplified)
      const weightScore = Math.min(100, (weight / 50) * 100);
      
      const score = (tempScore * 0.6 + weightScore * 0.4).toFixed(1);
      
      return {
        timestamp: typeof h.timestamp === 'number' ? h.timestamp : Date.now(),
        score: parseFloat(score),
        temp: temp
      };
    });
  }, [history, hasData]);

  // 3. Activity by Hour (Aggregation)
  const hourlyActivity = useMemo(() => {
    if (!hasData) {
      return Array(24).fill(0).map((_, hour) => ({
        hour: `${hour}:00`,
        avgActivity: 0
      }));
    }
    
    const hours = Array(24).fill(0);
    const counts = Array(24).fill(0);

    history.forEach(h => {
      try {
        const timePart = h.time ? (h.time.split(' ')[1] || h.time) : ''; // Handle "YYYY-MM-DD HH:mm:ss" or "HH:mm:ss"
        const hour = parseInt(timePart.split(':')[0], 10);
        if (!isNaN(hour) && hour >= 0 && hour < 24) {
          hours[hour] += (h.beesOut || 0);
          counts[hour] += 1;
        }
      } catch (e) {
        // ignore parse error
      }
    });

    return hours.map((total, hour) => ({
      hour: `${hour}:00`,
      avgActivity: counts[hour] > 0 ? Math.round(total / counts[hour]) : 0
    }));
  }, [history, hasData]);

  return (
    <div className="space-y-6">
      {!hasData && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-400">
          <p className="text-sm">暂无历史数据</p>
          <p className="text-xs mt-2">请等待传感器数据上传或运行测试数据脚本</p>
        </div>
      )}
      
      {hasData && (
        <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Correlation Analysis */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-purple-500 rounded-full"></span>
            温度与活跃度相关性 (散点图)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="temp" name="温度" unit="°C" domain={['auto', 'auto']} />
                <YAxis type="number" dataKey="activity" name="出巢数" unit="只" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  labelFormatter={formatFullTime}
                />
                <Scatter name="数据点" data={correlationData} fill="#8884d8" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            分析温度变化对蜜蜂出巢活跃度的影响。通常在 25-35°C 区间活跃度最高。
          </p>
        </div>

        {/* Health Trend */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-green-500 rounded-full"></span>
            蜂群健康指数趋势
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={healthTrendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  hide
                />
                <YAxis domain={[0, 100]} />
                <Tooltip labelFormatter={formatFullTime} />
                <Legend />
                <Line type="monotone" dataKey="score" name="健康分" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            基于温度稳定性和重量增长计算的综合健康评分 (0-100)。
          </p>
        </div>

      </div>

       {/* Hourly Activity */}
       <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-blue-500 rounded-full"></span>
            时段活跃度分布 (24h)
          </h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyActivity} barCategoryGap="15%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tick={{fontSize: 10}} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="avgActivity" name="平均出巢数" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12}>
                  {hourlyActivity.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.avgActivity > 100 ? '#ef4444' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        </>
      )}
    </div>
  );
};
