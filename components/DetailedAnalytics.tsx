import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend,
  ComposedChart, Line, Area
} from 'recharts';
import { BeehiveData, CustomAIConfig, PhysicalAssessmentResult } from '../types';
import { analyzePhysicalAssessment } from '../services/qwenService';

interface Props {
  history: any[];
  currentData: BeehiveData;
  aiConfig?: CustomAIConfig;
}

export const DetailedAnalytics: React.FC<Props> = ({ history, currentData, aiConfig }) => {
  const [assessment, setAssessment] = useState<PhysicalAssessmentResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 使用AI分析生成体质评估数据
  useEffect(() => {
    const loadAssessment = async () => {
      if (!currentData || !aiConfig?.isActive) {
        // 如果没有AI配置，使用简单计算
        setAssessment({
          生产效率: Math.min(100, Math.max(0, (currentData.weight / 50) * 100)),
          控温能力: currentData.temperature >= 33 && currentData.temperature <= 36 ? 95 : Math.max(0, 100 - Math.abs(currentData.temperature - 34.5) * 10),
          归巢防御: currentData.beesOut > 0 ? Math.min(100, (currentData.beesIn / currentData.beesOut) * 100) : 100,
          lastUpdated: Date.now()
        });
        return;
      }

      setIsAnalyzing(true);
      try {
        const historyData = history.map(h => ({
          temperature: h.temp || h.temperature,
          humidity: h.humidity,
          weight: h.weight,
          beesIn: h.beesIn,
          beesOut: h.beesOut,
          hornetsDetected: h.hornetsDetected || 0,
          timestamp: h.timestamp || Date.now()
        })) as BeehiveData[];

        const result = await analyzePhysicalAssessment(currentData, historyData, aiConfig);
        setAssessment(result);
      } catch (error) {
        console.error('Failed to analyze physical assessment:', error);
        // 使用后备计算
        setAssessment({
          生产效率: Math.min(100, Math.max(0, (currentData.weight / 50) * 100)),
          控温能力: currentData.temperature >= 33 && currentData.temperature <= 36 ? 95 : Math.max(0, 100 - Math.abs(currentData.temperature - 34.5) * 10),
          归巢防御: currentData.beesOut > 0 ? Math.min(100, (currentData.beesIn / currentData.beesOut) * 100) : 100,
          lastUpdated: Date.now()
        });
      } finally {
        setIsAnalyzing(false);
      }
    };

    loadAssessment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentData?.timestamp, history.length, aiConfig?.isActive, aiConfig?.apiKey]);

  // 构造环形饼图数据（移除蜂力强度，只保留三个维度）
  // 将分数转换为百分比，使饼图更直观
  const pieData = assessment ? [
    { 
      name: '生产效率', 
      value: assessment.生产效率, 
      color: '#10b981',
      fullValue: 100
    },
    { 
      name: '控温能力', 
      value: assessment.控温能力, 
      color: '#3b82f6',
      fullValue: 100
    },
    { 
      name: '归巢防御', 
      value: assessment.归巢防御, 
      color: '#f59e0b',
      fullValue: 100
    },
  ] : [
    { name: '生产效率', value: 50, color: '#10b981', fullValue: 100 },
    { name: '控温能力', value: 50, color: '#3b82f6', fullValue: 100 },
    { name: '归巢防御', value: 50, color: '#f59e0b', fullValue: 100 },
  ];

  // 构造出勤分布图数据（使用实际数据）
  const activityDistribution = history && history.length > 0 
    ? history.slice(-12).map(h => ({
      time: h.time || '',
      in: h.beesIn || 0,
      out: h.beesOut || 0
    }))
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1. 蜂群体质评估环形饼图（AI综合分析） */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span>
              蜂群多维体质评估
            </h3>
            {isAnalyzing && (
              <span className="text-xs text-gray-500 animate-pulse">AI分析中...</span>
            )}
            {assessment && !isAnalyzing && (
              <span className="text-xs text-green-600">✓ AI综合分析</span>
            )}
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={6}
                  dataKey="value"
                  label={false}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number, name: string) => [`${value.toFixed(1)}分`, name]}
                  contentStyle={{ borderRadius: '8px', border: 'none', fontSize: '12px' }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={56}
                  formatter={(value) => value}
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', paddingTop: '20px', paddingBottom: '10px', lineHeight: '1.5' }}
                  layout="horizontal"
                  align="center"
                  margin={{ top: 20, bottom: 20 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {assessment && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div className="text-center p-2 bg-green-50 rounded-lg">
                <div className="font-bold text-green-700">{assessment.生产效率.toFixed(0)}</div>
                <div className="text-gray-500">生产效率</div>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded-lg">
                <div className="font-bold text-blue-700">{assessment.控温能力.toFixed(0)}</div>
                <div className="text-gray-500">控温能力</div>
              </div>
              <div className="text-center p-2 bg-amber-50 rounded-lg">
                <div className="font-bold text-amber-700">{assessment.归巢防御.toFixed(0)}</div>
                <div className="text-gray-500">归巢防御</div>
              </div>
            </div>
          )}
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