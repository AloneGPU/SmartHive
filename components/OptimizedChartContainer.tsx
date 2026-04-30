import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BeehiveData } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Brush
} from 'recharts';

interface OptimizedChartContainerProps {
  data: BeehiveData[];
  metric: 'temperature' | 'humidity' | 'weight' | 'activity';
  title?: string;
  height?: number;
  className?: string;
}

interface DataPoint {
  timestamp: number;
  value: number;
  status?: 'normal' | 'warning' | 'critical';
}

// 性能优化：数据采样
const downsampleData = (
  data: BeehiveData[],
  maxPoints: number,
  metric: OptimizedChartContainerProps['metric']
): DataPoint[] => {
  if (data.length <= maxPoints) {
    return data.map(d => ({
      timestamp: Number(d.timestamp),
      value: Number(d[metric as keyof BeehiveData]) || 0,
      status: getStatus(metric, Number(d[metric as keyof BeehiveData]))
    }));
  }

  // 简单的线性采样
  const step = Math.floor(data.length / maxPoints);
  const sampled: DataPoint[] = [];

  for (let i = 0; i < data.length; i += step) {
    if (sampled.length >= maxPoints) break;
    const item = data[i];
    const value = Number(item[metric as keyof BeehiveData]) || 0;
    sampled.push({
      timestamp: Number(item.timestamp),
      value,
      status: getStatus(metric, value)
    });
  }

  return sampled;
};

// 根据指标获取状态
const getStatus = (
  metric: OptimizedChartContainerProps['metric'],
  value: number
): 'normal' | 'warning' | 'critical' => {
  if (metric === 'temperature') {
    if (value > 35 || value < 10) return 'critical';
    if (value > 30 || value < 15) return 'warning';
    return 'normal';
  } else if (metric === 'humidity') {
    if (value > 85 || value < 20) return 'critical';
    if (value > 80 || value < 30) return 'warning';
    return 'normal';
  } else if (metric === 'weight') {
    if (value < 20) return 'warning';
    return 'normal';
  }
  return 'normal';
};

// 生成图表配置
const getChartConfig = (metric: string) => {
  switch (metric) {
    case 'temperature':
      return {
        color: '#ef4444',
        bgColor: '#fee2e2',
        name: '温度',
        unit: '°C',
        thresholds: { warning: [15, 30], critical: [10, 35] }
      };
    case 'humidity':
      return {
        color: '#3b82f6',
        bgColor: '#dbeafe',
        name: '湿度',
        unit: '%',
        thresholds: { warning: [30, 80], critical: [20, 85] }
      };
    case 'weight':
      return {
        color: '#10b981',
        bgColor: '#d1fae5',
        name: '重量',
        unit: 'kg',
        thresholds: { warning: [20], critical: [15] }
      };
    case 'activity':
      return {
        color: '#f59e0b',
        bgColor: '#fef3c7',
        name: '活动量',
        unit: '次',
        thresholds: { warning: [5], critical: [10] }
      };
    default:
      return {
        color: '#6b7280',
        bgColor: '#f3f4f6',
        name: '指标',
        unit: '',
        thresholds: { warning: [], critical: [] }
      };
  }
};

export const OptimizedChartContainer: React.FC<OptimizedChartContainerProps> = ({
  data,
  metric,
  title,
  height = 300,
  className = ''
}) => {
  const { isMobile, isTablet } = useIsMobile();
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算最大数据点数
  const maxPoints = useMemo(() => {
    if (isMobile) return 50;
    if (isTablet) return 100;
    return 200;
  }, [isMobile, isTablet]);

  // 性能优化：使用 useMemo 缓存处理后的数据
  const chartData = useMemo(() => {
    if (!data.length) return [];

    // 延迟计算以避免阻塞UI
    setTimeout(() => setIsLoading(false), 100);

    return downsampleData(data, maxPoints, metric);
  }, [data, maxPoints, metric]);

  // 性能优化：防抖调整大小
  const handleResize = useCallback(() => {
    // 图表会自动响应容器大小变化
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [handleResize]);

  const config = getChartConfig(metric);

  // 自定义提示
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const date = new Date(label);
      const timeStr = date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="text-sm font-medium text-gray-900 mb-2">{timeStr}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              <span className="font-medium">{config.name}: </span>
              {entry.value.toFixed(1)}{config.unit}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // 加载状态
  if (isLoading) {
    return (
      <div ref={containerRef} className={`bg-gray-100 rounded-lg ${className}`} style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`} style={{ height }}>
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      )}

      <ResponsiveContainer width="100%" height={height - 60}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => {
              const date = new Date(value);
              return isMobile
                ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
            }}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            domain={['dataMin - 5', 'dataMax + 5']}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* 状态背景色 */}
          {chartData.map((point, index) => (
            <ReferenceLine
              key={index}
              y={point.value}
              stroke={point.status === 'critical' ? '#ef4444' : point.status === 'warning' ? '#f59e0b' : 'none'}
              strokeDasharray={point.status !== 'normal' ? '4 4' : 'none'}
              strokeWidth={point.status !== 'normal' ? 1 : 0}
            />
          ))}

          {/* 主数据线 */}
          <Area
            type="monotone"
            dataKey="value"
            stroke={config.color}
            fill={config.bgColor}
            fillOpacity={0.3}
            strokeWidth={2}
            dot={false}
            name={config.name}
          />

          {/* 阈值线 */}
          {config.thresholds.warning.length > 0 && (
            <>
              {config.thresholds.warning.map((threshold, index) => (
                <ReferenceLine
                  key={`warning-${index}`}
                  y={threshold}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{ value: '警告', position: 'insideTopRight', fill: '#f59e0b', fontSize: 10 }}
                />
              ))}
            </>
          )}

          {config.thresholds.critical.length > 0 && (
            <>
              {config.thresholds.critical.map((threshold, index) => (
                <ReferenceLine
                  key={`critical-${index}`}
                  y={threshold}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{ value: '危险', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }}
                />
              ))}
            </>
          )}

          {/* 数据过滤器（仅桌面端） */}
          {!isMobile && (
            <Brush
              dataKey="timestamp"
              height={30}
              stroke={config.color}
              startIndex={Math.max(0, chartData.length - 50)}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};