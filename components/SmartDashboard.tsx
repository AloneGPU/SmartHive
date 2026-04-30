import React, { useMemo, useState } from 'react';
import { BeehiveData } from '../types';
import { useAppContext } from '../context/AppContext';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Cloud,
  Droplets,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Weight,
  Zap
} from 'lucide-react';

interface SmartDashboardProps {
  data: BeehiveData[];
  className?: string;
}

interface HealthMetric {
  id: string;
  name: string;
  icon: React.ReactNode;
  value: number;
  unit: string;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
  description: string;
}

interface AlertItem {
  id: string;
  type: 'info' | 'warning' | 'error';
  icon: React.ReactNode;
  title: string;
  message: string;
  timestamp?: Date;
}

export const SmartDashboard: React.FC<SmartDashboardProps> = ({
  data,
  className = ''
}) => {
  const { location } = useAppContext();
  const [selectedTimeRange, setSelectedTimeRange] = useState<'24h' | '7d' | '31d'>('24h');

  // 计算健康指标
  const healthMetrics = useMemo<HealthMetric[]>(() => {
    if (!data.length) return [];

    const now = Date.now();
    const rangeMs = selectedTimeRange === '24h' ? 24 * 60 * 60 * 1000 :
                    selectedTimeRange === '7d' ? 7 * 24 * 60 * 60 * 1000 :
                    30 * 24 * 60 * 60 * 1000;

    const recentData = data.filter(d => Number(d.timestamp) >= now - rangeMs);

    // 计算温度指标
    const temperatures = recentData.map(d => d.temperature).filter(v => Number.isFinite(v));
    const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
    const tempStatus = avgTemp > 30 ? 'critical' : avgTemp > 25 ? 'warning' : avgTemp > 15 ? 'good' : 'critical';
    const tempTrend = temperatures.length > 10 ?
      (temperatures[temperatures.length - 1] - temperatures[temperatures.length - 10] > 1 ? 'up' :
       temperatures[temperatures.length - 1] - temperatures[temperatures.length - 10] < -1 ? 'down' : 'stable') : 'stable';

    // 计算湿度指标
    const humidities = recentData.map(d => d.humidity).filter(v => Number.isFinite(v));
    const avgHumidity = humidities.reduce((a, b) => a + b, 0) / humidities.length;
    const humidityStatus = avgHumidity > 80 ? 'warning' : avgHumidity < 30 ? 'warning' : 'good';
    const humidityTrend = humidities.length > 10 ?
      (humidities[humidities.length - 1] - humidities[humidities.length - 10] > 5 ? 'up' :
       humidities[humidities.length - 1] - humidities[humidities.length - 10] < -5 ? 'down' : 'stable') : 'stable';

    // 计算重量指标
    const weights = recentData.map(d => d.weight).filter(v => Number.isFinite(v));
    const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
    const weightTrend = weights.length > 10 ?
      (weights[weights.length - 1] - weights[weights.length - 10] > 0.5 ? 'up' :
       weights[weights.length - 1] - weights[weights.length - 10] < -0.5 ? 'down' : 'stable') : 'stable';

    // 计算活动指标
    const hornetsDetected = recentData.reduce((sum, d) => sum + (d.hornetsDetected || 0), 0);
    const activityStatus = hornetsDetected > 10 ? 'warning' : hornetsDetected > 5 ? 'good' : 'excellent';

    return [
      {
        id: 'temperature',
        name: '温度',
        icon: <Thermometer className="w-5 h-5" />,
        value: avgTemp,
        unit: '°C',
        status: tempStatus,
        trend: tempTrend,
        description: '蜂箱内部温度'
      },
      {
        id: 'humidity',
        name: '湿度',
        icon: <Droplets className="w-5 h-5" />,
        value: avgHumidity,
        unit: '%',
        status: humidityStatus,
        trend: humidityTrend,
        description: '蜂箱内部湿度'
      },
      {
        id: 'weight',
        name: '重量',
        icon: <Weight className="w-5 h-5" />,
        value: avgWeight,
        unit: 'kg',
        status: 'good',
        trend: weightTrend,
        description: '蜂箱总重量'
      },
      {
        id: 'activity',
        name: '活动量',
        icon: <Activity className="w-5 h-5" />,
        value: hornetsDetected,
        unit: '次',
        status: activityStatus,
        trend: 'stable',
        description: '马蜂检测次数'
      }
    ];
  }, [data, selectedTimeRange]);

  // 生成警告列表
  const alerts = useMemo<AlertItem[]>(() => {
    const alerts: AlertItem[] = [];

    // 检查温度
    const temp = healthMetrics.find(m => m.id === 'temperature');
    if (temp?.status === 'critical') {
      alerts.push({
        id: 'temp-critical',
        type: 'error',
        icon: <Thermometer className="w-4 h-4 text-red-500" />,
        title: '温度异常',
        message: '蜂箱温度过高或过低，可能影响蜜蜂生存'
      });
    }

    // 检查湿度
    const humidity = healthMetrics.find(m => m.id === 'humidity');
    if (humidity?.status === 'warning') {
      alerts.push({
        id: 'humidity-warning',
        type: 'warning',
        icon: <Droplets className="w-4 h-4 text-yellow-500" />,
        title: '湿度异常',
        message: '湿度过高可能引发疾病'
      });
    }

    // 检查活动量
    const activity = healthMetrics.find(m => m.id === 'activity');
    if ((activity?.value ?? 0) > 10) {
      alerts.push({
        id: 'activity-high',
        type: 'warning',
        icon: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
        title: '活动量偏高',
        message: '检测到较多马蜂活动，建议加强防护'
      });
    }

    return alerts;
  }, [healthMetrics]);

  // 计算整体健康评分
  const overallHealthScore = useMemo(() => {
    if (healthMetrics.length === 0) return 0;

    const scores = healthMetrics.map(metric => {
      switch (metric.status) {
        case 'excellent': return 100;
        case 'good': return 80;
        case 'warning': return 60;
        case 'critical': return 30;
        default: return 0;
      }
    });

    return Math.round(scores.reduce<number>((a, b) => a + b, 0) / scores.length);
  }, [healthMetrics]);

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent':
      case 'good':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  // 获取趋势颜色
  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up':
        return 'text-red-500';
      case 'down':
        return 'text-blue-500';
      default:
        return 'text-green-500';
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}>
      {/* 标题和健康评分 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">智能监控面板</h2>
          <p className="text-sm text-gray-500 mt-1">
            位置: {location.province || '未知'} - {location.city || '未知'}
          </p>
        </div>
        <div className="text-center">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${
            overallHealthScore >= 80 ? 'bg-green-100' :
            overallHealthScore >= 60 ? 'bg-yellow-100' : 'bg-red-100'
          }`}>
            {overallHealthScore >= 80 ? (
              <CheckCircle className="w-8 h-8 text-green-600" />
            ) : overallHealthScore >= 60 ? (
              <AlertTriangle className="w-8 h-8 text-yellow-600" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-red-600" />
            )}
          </div>
          <p className="text-sm font-medium mt-2">
            健康评分: <span className="text-lg font-bold">{overallHealthScore}</span>/100
          </p>
        </div>
      </div>

      {/* 时间范围选择 */}
      <div className="flex gap-2 mb-6">
        {(['24h', '7d', '31d'] as const).map(range => (
          <button
            key={range}
            onClick={() => setSelectedTimeRange(range)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedTimeRange === range
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {range === '24h' ? '24小时' : range === '7d' ? '7天' : '31天'}
          </button>
        ))}
      </div>

      {/* 健康指标网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {healthMetrics.map(metric => (
          <div
            key={metric.id}
            className={`rounded-lg border p-4 ${getStatusColor(metric.status)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {metric.icon}
                <h3 className="font-medium">{metric.name}</h3>
              </div>
              <div className="flex items-center gap-1">
                {metric.trend === 'up' && <TrendingUp className="w-4 h-4" />}
                {metric.trend === 'down' && <TrendingDown className="w-4 h-4" />}
                {metric.trend === 'stable' && <div className="w-4 h-4 bg-gray-400 rounded-full"></div>}
              </div>
            </div>
            <div className="text-2xl font-bold mb-1">
              {metric.value.toFixed(1)}{metric.unit}
            </div>
            <p className="text-xs opacity-80">{metric.description}</p>
          </div>
        ))}
      </div>

      {/* 警告和提醒 */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            需要注意
          </h3>
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border-l-4 ${
                alert.type === 'error' ? 'bg-red-50 border-red-400' :
                alert.type === 'warning' ? 'bg-yellow-50 border-yellow-400' :
                'bg-blue-50 border-blue-400'
              }`}
            >
              <div className="flex items-start gap-3">
                {alert.icon}
                <div>
                  <h4 className="font-medium text-sm">{alert.title}</h4>
                  <p className="text-xs text-gray-600 mt-1">{alert.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 快速操作 */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            <BarChart3 className="w-4 h-4" />
            查看详情
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            <Cloud className="w-4 h-4" />
            天气信息
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            <Zap className="w-4 h-4" />
            AI分析
          </button>
        </div>
      </div>
    </div>
  );
};