import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { BeehiveData } from '../types';
import { TrendingUp, TrendingDown, Minus, Calendar, Thermometer, Droplets, Weight, AlertTriangle } from 'lucide-react';

interface MobileOptimizedChartsProps {
  data: BeehiveData[];
  isTablet?: boolean;
}

interface MetricCard {
  id: string;
  name: string;
  icon: React.ReactNode;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  change: number;
  min: number;
  max: number;
}

interface TimeSeriesData {
  timestamp: number;
  temperature: number;
  humidity: number;
  weight: number;
  hornetsDetected: number;
}

export const MobileOptimizedCharts: React.FC<MobileOptimizedChartsProps> = ({
  data,
  isTablet = false
}) => {
  const [selectedMetric, setSelectedMetric] = useState<'temperature' | 'humidity' | 'weight' | 'activity'>('temperature');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '31d'>('24h');

  // 处理数据
  const processedData = useMemo(() => {
    const now = Date.now();
    const ranges = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '31d': 31 * 24 * 60 * 60 * 1000
    };

    const filtered = data
      .filter(d => Number(d.timestamp) >= now - ranges[timeRange])
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

    // 优化数据点数量
    const maxPoints = isTablet ? 100 : 60;
    const step = Math.ceil(filtered.length / maxPoints);

    return filtered
      .filter((_, index) => index % step === 0)
      .slice(-maxPoints)
      .map(d => ({
        timestamp: Number(d.timestamp),
        temperature: Number(d.temperature),
        humidity: Number(d.humidity),
        weight: Number(d.weight),
        hornetsDetected: Number(d.hornetsDetected || 0)
      })) as TimeSeriesData[];
  }, [data, timeRange, isTablet]);

  // 计算指标卡片数据
  const metricCards = useMemo<MetricCard[]>(() => {
    if (!processedData.length) return [];

    const latest = processedData[processedData.length - 1];
    const previous = processedData[Math.max(0, processedData.length - 10)];

    const calculateMetric = (
      values: number[],
      name: string,
      icon: React.ReactNode,
      unit: string
    ): MetricCard => {
      const current = values[values.length - 1];
      const previousValue = values[values.length - 10];
      const change = previousValue && previousValue !== 0
        ? ((current - previousValue) / previousValue) * 100
        : 0;

      const trend = change > 5 ? 'up' : change < -5 ? 'down' : 'stable';
      const min = Math.min(...values.filter(v => Number.isFinite(v)));
      const max = Math.max(...values.filter(v => Number.isFinite(v)));

      return {
        id: name.toLowerCase(),
        name,
        icon,
        value: current,
        unit,
        trend,
        change,
        min,
        max
      };
    };

    return [
      calculateMetric(
        processedData.map(d => d.temperature),
        '温度',
        <Thermometer className="w-5 h-5 text-orange-500" />,
        '°C'
      ),
      calculateMetric(
        processedData.map(d => d.humidity),
        '湿度',
        <Droplets className="w-5 h-5 text-blue-500" />,
        '%'
      ),
      calculateMetric(
        processedData.map(d => d.weight),
        '重量',
        <Weight className="w-5 h-5 text-green-500" />,
        'kg'
      ),
      calculateMetric(
        processedData.map(d => d.hornetsDetected),
        '活动量',
        <TrendingUp className="w-5 h-5 text-purple-500" />,
        '次'
      )
    ];
  }, [processedData]);

  // 图表格式化函数
  const formatXAxis = (tickItem: number) => {
    const date = new Date(tickItem);
    if (timeRange === '24h') {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  // 移动端自定义提示
  const MobileTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const date = new Date(label);
      const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="text-xs font-medium text-gray-900 mb-1">
            {timeRange === '24h' ? timeStr : `${dateStr} ${timeStr}`}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              <span className="font-medium">{entry.name}: </span>
              {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
              {entry.name === '温度' ? '°C' :
               entry.name === '湿度' ? '%' :
               entry.name === '重量' ? 'kg' : '次'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // 选择趋势颜色
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-blue-500" />;
      default:
        return <Minus className="w-4 h-4 text-green-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* 时间范围选择器 */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {(['24h', '7d', '31d'] as const).map(range => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              timeRange === range
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {range === '24h' ? '24小时' : range === '7d' ? '7天' : '31天'}
          </button>
        ))}
      </div>

      {/* 指标卡片 - 垂直滚动 */}
      <div className="space-y-3">
        {metricCards.map(card => (
          <div
            key={card.id}
            className="bg-white rounded-lg border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {card.icon}
                <h3 className="font-medium text-gray-900">{card.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                {getTrendIcon(card.trend)}
                <span className="text-sm font-medium text-gray-600">
                  {card.change > 0 ? '+' : ''}{card.change.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900">
                {card.value.toFixed(1)}
              </span>
              <span className="text-sm text-gray-500">{card.unit}</span>
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-400">
              <span>最低: {card.min.toFixed(1)}{card.unit}</span>
              <span>最高: {card.max.toFixed(1)}{card.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 指标选择器 */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {metricCards.map(card => (
          <button
            key={card.id}
            onClick={() => setSelectedMetric(card.id as any)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              selectedMetric === card.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {card.name}
          </button>
        ))}
      </div>

      {/* 主图表 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {selectedMetric === 'activity' ? (
              <BarChart data={processedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatXAxis}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip content={<MobileTooltip />} />
                <Bar
                  dataKey="hornetsDetected"
                  fill="#f59e0b"
                  name="活动量"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            ) : (
              <LineChart data={processedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatXAxis}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip content={<MobileTooltip />} />
                <Line
                  type="monotone"
                  dataKey={selectedMetric}
                  stroke={
                    selectedMetric === 'temperature' ? '#ef4444' :
                    selectedMetric === 'humidity' ? '#3b82f6' :
                    '#10b981'
                  }
                  strokeWidth={2}
                  dot={false}
                  name={
                    selectedMetric === 'temperature' ? '温度' :
                    selectedMetric === 'humidity' ? '湿度' : '重量'
                  }
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* 快速统计 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-900">异常检测</span>
          </div>
          <p className="text-xs text-blue-700">
            最近24小时检测到 {processedData.filter(d => d.hornetsDetected > 2).length} 次异常活动
          </p>
        </div>

        <div className="bg-green-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-green-900">数据更新</span>
          </div>
          <p className="text-xs text-green-700">
            最后更新: {new Date(processedData[processedData.length - 1]?.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  );
};