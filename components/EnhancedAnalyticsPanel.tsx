import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from 'recharts';
import { BeehiveData, AIAnalysisResult } from '../types';
import { useAppContext } from '../context/AppContext';
import { analyzeHiveHealth } from '../services/qwenService';
import { TrendingUp, Brain, Download } from 'lucide-react';

interface EnhancedAnalyticsPanelProps {
  data: BeehiveData[];
  isLoading: boolean;
}

interface MetricSummary {
  name: string;
  value: number;
  unit: string;
  change: number;
  trend: 'up' | 'down' | 'stable';
  min: number;
  max: number;
  avg: number;
}

interface ChartConfig {
  key: string;
  name: string;
  color: string;
  type: 'line' | 'bar';
  unit?: string;
}

// 优化的图表配置
const CHART_CONFIGS: ChartConfig[] = [
  {
    key: 'temperature',
    name: '温度',
    color: '#ef4444',
    type: 'line',
    unit: '°C'
  },
  {
    key: 'humidity',
    name: '湿度',
    color: '#3b82f6',
    type: 'line',
    unit: '%'
  },
  {
    key: 'weight',
    name: '重量',
    color: '#10b981',
    type: 'line',
    unit: 'kg'
  },
  {
    key: 'hornetsDetected',
    name: '马蜂检测',
    color: '#f59e0b',
    type: 'bar',
    unit: '次'
  }
];

// 优化的提示组件
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const time = new Date(label).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
        <p className="text-sm font-medium text-gray-900 mb-2">{time}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            <span className="font-medium">{entry.name}: </span>
            {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
            {CHART_CONFIGS.find(c => c.key === entry.name)?.unit}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const EnhancedAnalyticsPanel: React.FC<EnhancedAnalyticsPanelProps> = ({
  data,
  isLoading
}) => {
  const { aiConfig } = useAppContext();
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string>('temperature');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '31d'>('24h');
  const [mobileView, setMobileView] = useState(false);

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setMobileView(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 计算指标摘要
  const metricSummaries = useMemo<MetricSummary[]>(() => {
    if (!data.length) return [];

    const now = Date.now();
    const ranges = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '31d': 31 * 24 * 60 * 60 * 1000
    };

    const filteredData = data.filter(d =>
      Number(d.timestamp) >= now - ranges[timeRange]
    );

    return CHART_CONFIGS.map(config => {
      const values = filteredData
        .map(d => Number(d[config.key as keyof BeehiveData]))
        .filter(v => Number.isFinite(v));

      if (values.length === 0) return null;

      const recent = values.slice(-10);
      const older = values.slice(-20, -10);

      const change = older.length && recent.length
        ? ((recent.reduce((a, b) => a + b, 0) / recent.length) -
           (older.reduce((a, b) => a + b, 0) / older.length)) /
          (older.reduce((a, b) => a + b, 0) / older.length) * 100
        : 0;

      const trend = change > 5 ? 'up' : change < -5 ? 'down' : 'stable';

      return {
        name: config.name,
        value: recent[recent.length - 1] || 0,
        unit: config.unit || '',
        change,
        trend,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      };
    }).filter(Boolean) as MetricSummary[];
  }, [data, timeRange]);

  // 图表数据处理
  const chartData = useMemo(() => {
    const now = Date.now();
    const ranges = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '31d': 31 * 24 * 60 * 60 * 1000
    };

    const filtered = data
      .filter(d => Number(d.timestamp) >= now - ranges[timeRange])
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
      .slice(0, mobileView ? 200 : 500);

    return filtered.map(d => ({
      timestamp: Number(d.timestamp),
      temperature: Number(d.temperature),
      humidity: Number(d.humidity),
      weight: Number(d.weight),
      hornetsDetected: Number(d.hornetsDetected || 0)
    }));
  }, [data, timeRange, mobileView]);

  // AI分析
  const runAIAnalysis = async () => {
    if (!data.length || isAnalyzing || !aiConfig.apiKey) return;

    setIsAnalyzing(true);
    try {
      const latest = data[data.length - 1];
      const history = data.slice(-200); // 最近200个数据点
      const result = await analyzeHiveHealth(latest, history, {
        apiKey: aiConfig.apiKey,
        modelName: aiConfig.modelName
      });
      setAiAnalysis(result);
    } catch (error) {
      console.error('AI分析失败:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 自动触发AI分析
  useEffect(() => {
    if (data.length > 50 && aiConfig.apiKey && !aiAnalysis) {
      const timeout = setTimeout(runAIAnalysis, 2000);
      return () => clearTimeout(timeout);
    }
  }, [data, aiConfig, aiAnalysis]);

  // 导出数据
  const exportData = () => {
    const csvContent = [
      ['时间', '温度', '湿度', '重量', '马蜂检测'].join(','),
      ...chartData.map(d => [
        new Date(d.timestamp).toLocaleString('zh-CN'),
        d.temperature,
        d.humidity,
        d.weight,
        d.hornetsDetected
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `蜂箱数据_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-32 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 控制面板 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTimeRange('24h')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                timeRange === '24h'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              24小时
            </button>
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                timeRange === '7d'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              7天
            </button>
            <button
              onClick={() => setTimeRange('31d')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                timeRange === '31d'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              31天
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={runAIAnalysis}
              disabled={isAnalyzing || !aiConfig.apiKey}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isAnalyzing || !aiConfig.apiKey
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
            >
              <Brain className="w-4 h-4" />
              {isAnalyzing ? '分析中...' : 'AI分析'}
            </button>

            <button
              onClick={exportData}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              导出
            </button>
          </div>
        </div>
      </div>

      {/* 指标摘要卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricSummaries.map(metric => (
          <div key={metric.name} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">{metric.name}</h3>
              {metric.trend === 'up' && <TrendingUp className="w-4 h-4 text-red-500" />}
              {metric.trend === 'down' && <TrendingUp className="w-4 h-4 text-blue-500 transform rotate-180" />}
              {metric.trend === 'stable' && <div className="w-4 h-4 h-4 bg-green-500 rounded-full"></div>}
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {metric.value.toFixed(1)}{metric.unit}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              变化: {metric.change > 0 ? '+' : ''}{metric.change.toFixed(1)}%
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>最低: {metric.min.toFixed(1)}{metric.unit}</span>
              <span>最高: {metric.max.toFixed(1)}{metric.unit}</span>
              <span>平均: {metric.avg.toFixed(1)}{metric.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 主图表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">数据趋势</h3>
          <p className="text-sm text-gray-500">实时监控蜂箱各项指标变化</p>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  if (timeRange === '24h') {
                    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                  } else if (timeRange === '7d') {
                    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit' });
                  }
                  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
                }}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                yAxisId="left"
              />
              <YAxis
                orientation="right"
                yAxisId="right"
                tick={{ fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Brush
                dataKey="timestamp"
                height={30}
                stroke="#8884d8"
              />

              {/* 温度线 */}
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="temperature"
                stroke="#ef4444"
                fill="#fee2e2"
                fillOpacity={0.3}
                name="温度"
                unit="°C"
              />

              {/* 湿度线 */}
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="humidity"
                stroke="#3b82f6"
                fill="#dbeafe"
                fillOpacity={0.3}
                name="湿度"
                unit="%"
              />

              {/* 重量线 */}
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="weight"
                stroke="#10b981"
                fill="#d1fae5"
                fillOpacity={0.3}
                name="重量"
                unit="kg"
              />

              {/* 马蜂检测柱状图 */}
              <Bar
                yAxisId="right"
                dataKey="hornetsDetected"
                fill="#f59e0b"
                name="马蜂检测"
                unit="次"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI分析结果 */}
      {aiAnalysis && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">AI智能分析</h3>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
              健康评分: {aiAnalysis.healthScore}/100
            </span>
          </div>

          <div className="space-y-4">
            {/* 摘要 */}
            <div>
              <h4 className="font-medium text-gray-700 mb-2">摘要</h4>
              <p className="text-gray-600 text-sm leading-relaxed">{aiAnalysis.summary}</p>
            </div>

            {/* 建议 */}
            <div>
              <h4 className="font-medium text-gray-700 mb-2">改进建议</h4>
              <ul className="space-y-1">
                {aiAnalysis.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-blue-500 mt-1">•</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>

            {/* 事件提醒 */}
            {aiAnalysis.events.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-700 mb-2">重要事件</h4>
                <div className="space-y-2">
                  {aiAnalysis.events.map((event, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded-lg text-sm ${
                        event.type === 'critical' ? 'bg-red-50 text-red-700' :
                        event.type === 'warning' ? 'bg-yellow-50 text-yellow-700' :
                        'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {event.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 详细分析 */}
            {aiAnalysis.detailedAnalysis && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-medium text-gray-700 mb-2">详细分析</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                  <div>
                    <span className="font-medium">环境分析:</span>
                    <p>{aiAnalysis.detailedAnalysis.environment}</p>
                  </div>
                  <div>
                    <span className="font-medium">行为分析:</span>
                    <p>{aiAnalysis.detailedAnalysis.behavior}</p>
                  </div>
                  <div>
                    <span className="font-medium">生产状态:</span>
                    <p>{aiAnalysis.detailedAnalysis.production}</p>
                  </div>
                  <div>
                    <span className="font-medium">风险评估:</span>
                    <p>{aiAnalysis.detailedAnalysis.risks}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};