import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, Line, Legend, ReferenceLine } from 'recharts';
import { BeehiveData } from '../types';
import { CalendarX, ArrowRight, Activity } from 'lucide-react';
import {
  buildFlowSeries,
  resolveInsideHumidity,
  resolveInsideTemperature,
  resolveOutsideHumidity,
  resolveOutsideTemperature,
  resolvePrimaryHumidity,
  resolvePrimaryTemperature,
  toFiniteNumber
} from '../services/hiveDataAdapter';
import { computePaddedDomain, downsampleSequence, formatTimeTick } from '../services/chartViewport';

interface HistoryChartsProps {
  data: BeehiveData[];
  isMobile?: boolean;
}

type ChartMetric = 'temperature' | 'humidity' | 'insideTemperature' | 'insideHumidity' | 'outsideTemperature' | 'outsideHumidity' | 'weight' | 'bees' | 'hornetsDetected';

export const HistoryCharts: React.FC<HistoryChartsProps> = ({ data, isMobile = false }) => {
  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>('temperature');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '31d'>('24h');

  // 过滤数据根据时间范围
  const filterDataByTimeRange = (rows: BeehiveData[], range: '24h' | '7d' | '31d') => {
    if (!rows || rows.length === 0) return [];

    const now = Date.now();
    const rangesMs: Record<'24h' | '7d' | '31d', number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '31d': 31 * 24 * 60 * 60 * 1000
    };

    const cutoff = now - rangesMs[range];
    return rows.filter((item) => Number(item.timestamp) >= cutoff);
  };

  const filteredData = useMemo(
    () => [...filterDataByTimeRange(data, timeRange)].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)),
    [data, timeRange]
  );
  const flowSeries = useMemo(
    () =>
      buildFlowSeries(
        filteredData.map((item) => ({
          timestamp: item.timestamp,
          beesIn: item.beesIn,
          beesOut: item.beesOut
        }))
      ),
    [filteredData]
  );
  const flowByTs = useMemo(() => {
    const m = new Map<number, { beesIn: number; beesOut: number }>();
    for (const point of flowSeries.points) {
      m.set(point.timestamp, { beesIn: point.beesIn, beesOut: point.beesOut });
    }
    return m;
  }, [flowSeries.points]);

  // 为图表准备数据
  const chartData = useMemo(
    () =>
      filteredData.map((item) => {
        const flow = flowByTs.get(Number(item.timestamp));
        return {
          timestamp: item.timestamp,
          temperature: resolvePrimaryTemperature(item),
          humidity: resolvePrimaryHumidity(item),
          insideTemperature: resolveInsideTemperature(item),
          insideHumidity: resolveInsideHumidity(item),
          outsideTemperature: resolveOutsideTemperature(item),
          outsideHumidity: resolveOutsideHumidity(item),
          weight: toFiniteNumber(item.weight),
          beesIn: flow?.beesIn ?? null,
          beesOut: flow?.beesOut ?? null,
          totalActivity: flow ? flow.beesIn + flow.beesOut : null,
          netActivity: flow ? flow.beesIn - flow.beesOut : null,
          hornetsDetected: toFiniteNumber(item.hornetsDetected)
        };
      }),
    [filteredData, flowByTs]
  );

  const maxRenderPoints = isMobile ? 220 : 520;
  const displayData = useMemo(() => downsampleSequence(chartData, maxRenderPoints), [chartData, maxRenderPoints]);

  const timeSpanMs = useMemo(() => {
    if (displayData.length < 2) return 0;
    const first = Number(displayData[0].timestamp);
    const last = Number(displayData[displayData.length - 1].timestamp);
    return Math.max(0, last - first);
  }, [displayData]);
  const hasInsideTemperatureSeries = useMemo(
    () => displayData.some((point) => point.insideTemperature !== null),
    [displayData]
  );
  const hasOutsideTemperatureSeries = useMemo(
    () => displayData.some((point) => point.outsideTemperature !== null),
    [displayData]
  );
  const hasInsideHumiditySeries = useMemo(
    () => displayData.some((point) => point.insideHumidity !== null),
    [displayData]
  );
  const hasOutsideHumiditySeries = useMemo(
    () => displayData.some((point) => point.outsideHumidity !== null),
    [displayData]
  );

  const yAxisDomain = useMemo(() => {
    if (selectedMetric === 'bees') {
      const values: Array<number | null> = [];
      for (const point of displayData) {
        values.push(point.beesIn, point.beesOut, point.totalActivity, point.netActivity);
      }
      return computePaddedDomain(values, { ratio: 0.12, minPadding: 1 }) ?? [0, 10];
    }

    if (selectedMetric === 'temperature') {
      const values: Array<number | null> = [];
      for (const point of displayData) {
        values.push(point.insideTemperature, point.outsideTemperature, point.temperature);
      }
      return computePaddedDomain(values, { ratio: 0.1, minPadding: 1 }) ?? [0, 1];
    }

    if (selectedMetric === 'humidity') {
      const values: Array<number | null> = [];
      for (const point of displayData) {
        values.push(point.insideHumidity, point.outsideHumidity, point.humidity);
      }
      return computePaddedDomain(values, { ratio: 0.1, minPadding: 2 }) ?? [0, 1];
    }

    const values = displayData.map((point) => point[selectedMetric] as number | null | undefined);
    return computePaddedDomain(values, { ratio: 0.1, minPadding: selectedMetric === 'weight' ? 0.1 : 1 }) ?? [0, 1];
  }, [displayData, selectedMetric]);

  const metricConfig: Record<ChartMetric, { label: string; color: string; unit: string; gradientId: string }> = {
    temperature: {
      label: '温度（内外）',
      color: '#f59e0b',
      unit: '°C',
      gradientId: 'tempGradient'
    },
    humidity: {
      label: '湿度（内外）',
      color: '#3b82f6',
      unit: '%',
      gradientId: 'humidityGradient'
    },
    insideTemperature: {
      label: '内部温度',
      color: '#ef4444',
      unit: '°C',
      gradientId: 'insideTempGradient'
    },
    insideHumidity: {
      label: '内部湿度',
      color: '#06b6d4',
      unit: '%',
      gradientId: 'insideHumidityGradient'
    },
    outsideTemperature: {
      label: '外部温度',
      color: '#22c55e',
      unit: '°C',
      gradientId: 'outsideTempGradient'
    },
    outsideHumidity: {
      label: '外部湿度',
      color: '#6366f1',
      unit: '%',
      gradientId: 'outsideHumidityGradient'
    },
    weight: {
      label: '重量',
      color: '#10b981',
      unit: 'kg',
      gradientId: 'weightGradient'
    },
    bees: {
      label: '蜜蜂活动',
      color: '#8b5cf6',
      unit: '次',
      gradientId: 'beesGradient'
    },
    hornetsDetected: {
      label: '胡蜂数量',
      color: '#dc2626',
      unit: '只',
      gradientId: 'hornetsGradient'
    }
  };

  const currentConfig = metricConfig[selectedMetric];
  const averageValue = (key: keyof (typeof chartData)[number]) => {
    const values = chartData
      .map((item) => item[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length === 0) return '--';
    return (values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(1);
  };

  // 空状态组件
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center h-80 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200 backdrop-blur-sm">
      <div className="bg-white p-4 rounded-full shadow-sm mb-4">
        <CalendarX className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">暂无历史数据</h3>
      <p className="text-gray-500 text-sm mb-6 text-center max-w-xs">
        在所选的“{timeRange === '24h' ? '24小时' : timeRange === '7d' ? '7天' : '31天'}”范围内没有找到数据记录。
      </p>
      {timeRange === '24h' && (
        <button
          onClick={() => setTimeRange('7d')}
          className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors shadow-sm"
        >
          <span>查看最近7天</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 transition-all hover:shadow-md">
      {/* 控制面板 */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Activity className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">历史数据趋势</h2>
            {filteredData.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                原始 {filteredData.length} 点，当前渲染 {displayData.length} 点
              </p>
            )}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          {/* 时间范围选择 */}
          <div className="flex bg-gray-100/80 p-1 rounded-xl">
            {(['24h', '7d', '31d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  timeRange === range
                    ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                }`}
              >
                {range === '24h' ? '24小时' : range === '7d' ? '7天' : '31天'}
              </button>
            ))}
          </div>

          {/* 指标选择 */}
          <div className="flex bg-gray-100/80 p-1 rounded-xl overflow-x-auto hide-scrollbar">
            {Object.entries(metricConfig).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setSelectedMetric(key as ChartMetric)}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 flex items-center gap-2 ${
                  selectedMetric === key
                    ? 'bg-white shadow-sm ring-1 ring-black/5'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                }`}
                style={{
                  color: selectedMetric === key ? config.color : undefined
                }}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="space-y-8">
        {filteredData.length > 0 ? (
          <div className="h-[320px] sm:h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={displayData} margin={{ top: 20, right: 12, left: -14, bottom: !isMobile && displayData.length > 80 ? 28 : 0 }}>
                <defs>
                  <linearGradient id={currentConfig.gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={currentConfig.color} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={currentConfig.color} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis 
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  stroke="#9ca3af" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
                  dy={10}
                  tickFormatter={(value) => formatTimeTick(Number(value), timeSpanMs)}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  dx={-10}
                  domain={yAxisDomain as [number, number]}
                  tickFormatter={(value) => {
                    const num = Number(value);
                    if (!Number.isFinite(num)) return '--';
                    if (selectedMetric === 'weight') return `${num.toFixed(1)}kg`;
                    if (selectedMetric === 'hornetsDetected') return `${num.toFixed(0)}`;
                    return `${num.toFixed(0)}`;
                  }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    border: 'none', 
                    borderRadius: '12px',
                    boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.1)',
                    fontSize: '13px',
                    padding: '12px 16px'
                  }}
                  itemStyle={{ color: '#374151', fontWeight: 600 }}
                  labelFormatter={(label) =>
                    new Date(Number(label)).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  }
                  formatter={(value: any, name: any) => {
                    if (!Number.isFinite(Number(value))) return ['--', name];
                    const numeric = Number(value);
                    const seriesName = String(name);
                    if (seriesName.includes('重量')) return [`${numeric.toFixed(2)} kg`, seriesName];
                    if (seriesName.includes('湿度')) return [`${numeric.toFixed(1)} %`, seriesName];
                    if (seriesName.includes('温度')) return [`${numeric.toFixed(1)} °C`, seriesName];
                    if (seriesName.includes('胡蜂')) return [`${numeric.toFixed(0)} 只`, seriesName];
                    return [`${numeric.toFixed(1)} 次`, seriesName];
                  }}
                  cursor={{ stroke: currentConfig.color, strokeWidth: 1, strokeDasharray: '5 5' }}
                />
                {selectedMetric === 'bees' ? (
                  <>
                    <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                    <Area
                      type="monotone"
                      dataKey="beesIn"
                      name="蜂群进入"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fillOpacity={0.16}
                      fill="#8b5cf6"
                      connectNulls={false}
                      isAnimationActive={displayData.length < 360}
                    />
                    <Area
                      type="monotone"
                      dataKey="beesOut"
                      name="蜂群离开"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fillOpacity={0.08}
                      fill="#ef4444"
                      connectNulls={false}
                      isAnimationActive={displayData.length < 360}
                    />
                    <Line
                      type="monotone"
                      dataKey="totalActivity"
                      name="总活动量"
                      stroke="#1d4ed8"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={displayData.length < 360}
                    />
                    <Line
                      type="monotone"
                      dataKey="netActivity"
                      name="净流量"
                      stroke="#0f766e"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={displayData.length < 360}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                  </>
                ) : selectedMetric === 'temperature' ? (
                  <>
                    <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                    {hasInsideTemperatureSeries ? (
                      <Line
                        type="monotone"
                        dataKey="insideTemperature"
                        name="箱内温度"
                        stroke="#ef4444"
                        strokeWidth={2.5}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={displayData.length < 360}
                      />
                    ) : null}
                    {hasOutsideTemperatureSeries ? (
                      <Line
                        type="monotone"
                        dataKey="outsideTemperature"
                        name="箱外温度"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        strokeDasharray="4 3"
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={displayData.length < 360}
                      />
                    ) : null}
                    {!hasInsideTemperatureSeries && !hasOutsideTemperatureSeries ? (
                      <Area
                        type="monotone"
                        dataKey="temperature"
                        name="主温度"
                        stroke={currentConfig.color}
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill={`url(#${currentConfig.gradientId})`}
                        connectNulls={false}
                        activeDot={{ r: 6, strokeWidth: 0, fill: currentConfig.color }}
                        animationDuration={800}
                        isAnimationActive={displayData.length < 360}
                      />
                    ) : null}
                  </>
                ) : selectedMetric === 'humidity' ? (
                  <>
                    <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                    {hasInsideHumiditySeries ? (
                      <Line
                        type="monotone"
                        dataKey="insideHumidity"
                        name="箱内湿度"
                        stroke="#1d4ed8"
                        strokeWidth={2.5}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={displayData.length < 360}
                      />
                    ) : null}
                    {hasOutsideHumiditySeries ? (
                      <Line
                        type="monotone"
                        dataKey="outsideHumidity"
                        name="箱外湿度"
                        stroke="#60a5fa"
                        strokeWidth={2.5}
                        strokeDasharray="4 3"
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={displayData.length < 360}
                      />
                    ) : null}
                    {!hasInsideHumiditySeries && !hasOutsideHumiditySeries ? (
                      <Area
                        type="monotone"
                        dataKey="humidity"
                        name="主湿度"
                        stroke={currentConfig.color}
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill={`url(#${currentConfig.gradientId})`}
                        connectNulls={false}
                        activeDot={{ r: 6, strokeWidth: 0, fill: currentConfig.color }}
                        animationDuration={800}
                        isAnimationActive={displayData.length < 360}
                      />
                    ) : null}
                  </>
                ) : (
                  <Area
                    type="monotone"
                    dataKey={selectedMetric}
                    name={currentConfig.label}
                    stroke={currentConfig.color}
                    strokeWidth={3}
                    fillOpacity={1}
                    fill={`url(#${currentConfig.gradientId})`}
                    connectNulls={false}
                    activeDot={{ r: 6, strokeWidth: 0, fill: currentConfig.color }}
                    animationDuration={800}
                    isAnimationActive={displayData.length < 360}
                  />
                )}
                {!isMobile && displayData.length > 80 ? (
                  <Brush
                    dataKey="timestamp"
                    height={20}
                    stroke="#cbd5e1"
                    fill="#f8fafc"
                    travellerWidth={10}
                    tickFormatter={(value) => formatTimeTick(Number(value), timeSpanMs, { withMinute: false })}
                  />
                ) : null}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* 数据概览卡片 */}
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        {
          [
            {
              title: '主温度均值',
              value: averageValue('temperature') === '--' ? '--' : `${averageValue('temperature')}°C`,
              color: 'text-amber-600',
              bgColor: 'bg-amber-50',
              borderColor: 'border-amber-100'
            },
            {
              title: '主湿度均值',
              value: averageValue('humidity') === '--' ? '--' : `${averageValue('humidity')}%`,
              color: 'text-blue-600',
              bgColor: 'bg-blue-50',
              borderColor: 'border-blue-100'
            },
            {
              title: '箱内温度均值',
              value: averageValue('insideTemperature') === '--' ? '--' : `${averageValue('insideTemperature')}°C`,
              color: 'text-red-600',
              bgColor: 'bg-red-50',
              borderColor: 'border-red-100'
            },
            {
              title: '箱内湿度均值',
              value: averageValue('insideHumidity') === '--' ? '--' : `${averageValue('insideHumidity')}%`,
              color: 'text-cyan-600',
              bgColor: 'bg-cyan-50',
              borderColor: 'border-cyan-100'
            },
            {
              title: '箱外温度均值',
              value: averageValue('outsideTemperature') === '--' ? '--' : `${averageValue('outsideTemperature')}°C`,
              color: 'text-green-600',
              bgColor: 'bg-green-50',
              borderColor: 'border-green-100'
            },
            {
              title: '箱外湿度均值',
              value: averageValue('outsideHumidity') === '--' ? '--' : `${averageValue('outsideHumidity')}%`,
              color: 'text-indigo-600',
              bgColor: 'bg-indigo-50',
              borderColor: 'border-indigo-100'
            }
          ].map((stat, index) => (
            <div key={index} className={`${stat.bgColor} ${stat.borderColor} border rounded-xl p-4 transition-transform hover:-translate-y-1 duration-300`}>
              <div className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">{stat.title}</div>
              <div className={`text-xl sm:text-2xl font-bold ${stat.color} tracking-tight`}>{stat.value}</div>
            </div>
          ))
        }
      </div>

      {/* 数据表格 */}
      {isMobile && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">最近数据</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">箱内温度</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">箱外温度</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">箱内湿度</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">箱外湿度</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">重量</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {chartData.slice(-10).reverse().map((item, index) => (
                  <tr key={index}>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                      {new Date(Number(item.timestamp)).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                      {item.insideTemperature === null ? '--' : `${item.insideTemperature.toFixed(1)}°C`}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                      {item.outsideTemperature === null ? '--' : `${item.outsideTemperature.toFixed(1)}°C`}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                      {item.insideHumidity === null ? '--' : `${item.insideHumidity.toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                      {item.outsideHumidity === null ? '--' : `${item.outsideHumidity.toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                      {item.weight === null ? '--' : `${item.weight.toFixed(2)}kg`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
