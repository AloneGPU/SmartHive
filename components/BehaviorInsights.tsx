import React, { useMemo } from 'react';
import { Brain, TrendingUp, Users, Clock, Activity, AlertCircle } from 'lucide-react';
import {
  buildFlowSeries,
  resolveInsideHumidity,
  resolveInsideTemperature,
  resolveOutsideHumidity,
  resolveOutsideTemperature,
  toFiniteNumber
} from '../services/hiveDataAdapter';

interface BehaviorInsightsProps {
  historyData: any[];
  currentData: any;
}

type InsightAlert = { type: 'warning' | 'error' | 'info'; message: string };

type InsightResult = {
  hasValidData: boolean;
  activityPattern: string;
  peakHours: string;
  temperaturePreference: string;
  humidityPreference: string;
  activityLevel: 'high' | 'moderate' | 'low' | 'unknown';
  avgTemperature: number | null;
  avgHumidity: number | null;
  avgInsideTemperature: number | null;
  avgOutsideTemperature: number | null;
  avgInsideHumidity: number | null;
  avgOutsideHumidity: number | null;
  avgActivity: number | null;
  alerts: InsightAlert[];
};

const meanOf = (values: number[]) => {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
};

const formatPreference = (insideValues: number[], outsideValues: number[], unit: 'temperature' | 'humidity') => {
  const insideP25 = percentile(insideValues, 0.25);
  const insideP75 = percentile(insideValues, 0.75);
  const outsideP25 = percentile(outsideValues, 0.25);
  const outsideP75 = percentile(outsideValues, 0.75);

  const formatRange = (p25: number | null, p75: number | null, metric: 'temperature' | 'humidity') => {
    if (p25 === null || p75 === null) return '--';
    if (metric === 'temperature') return `${p25.toFixed(1)}-${p75.toFixed(1)}°C`;
    return `${p25.toFixed(0)}-${p75.toFixed(0)}%`;
  };

  const insideRange = formatRange(insideP25, insideP75, unit);
  const outsideRange = formatRange(outsideP25, outsideP75, unit);

  if (insideRange !== '--' && outsideRange !== '--') return `箱内 ${insideRange} / 箱外 ${outsideRange}`;
  if (insideRange !== '--') return `箱内 ${insideRange}`;
  if (outsideRange !== '--') return `箱外 ${outsideRange}`;
  return '--';
};

const hourRangeLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00-${String(hour).padStart(2, '0')}:59`;

export const BehaviorInsights: React.FC<BehaviorInsightsProps> = ({ historyData, currentData: _currentData }) => {
  const insights = useMemo<InsightResult>(() => {
    if (!Array.isArray(historyData) || historyData.length === 0) {
      return {
        hasValidData: false,
        activityPattern: 'unknown',
        peakHours: '--',
        temperaturePreference: '--',
        humidityPreference: '--',
        activityLevel: 'unknown',
        avgTemperature: null,
        avgHumidity: null,
        avgInsideTemperature: null,
        avgOutsideTemperature: null,
        avgInsideHumidity: null,
        avgOutsideHumidity: null,
        avgActivity: null,
        alerts: [{ type: 'info', message: '暂无可用历史数据，无法生成行为洞察。' }]
      };
    }

    const recentData = historyData.slice(-168); // 最多使用最近一周采样点
    const baseRows = recentData
      .map((item) => {
        const timestamp = toFiniteNumber(item?.timestamp);
        const beesIn = toFiniteNumber(item?.beesIn);
        const beesOut = toFiniteNumber(item?.beesOut);
        if (timestamp === null || beesIn === null || beesOut === null) {
          return null;
        }
        return {
          timestamp,
          beesIn,
          beesOut,
          insideTemperature: resolveInsideTemperature(item),
          outsideTemperature: resolveOutsideTemperature(item),
          insideHumidity: resolveInsideHumidity(item),
          outsideHumidity: resolveOutsideHumidity(item)
        };
      })
      .filter(
        (
          row
        ): row is {
          timestamp: number;
          beesIn: number;
          beesOut: number;
          insideTemperature: number | null;
          outsideTemperature: number | null;
          insideHumidity: number | null;
          outsideHumidity: number | null;
        } => Boolean(row)
      );

    const flow = buildFlowSeries(baseRows);
    const flowByTs = new Map<number, { activity: number }>();
    for (const point of flow.points) {
      flowByTs.set(point.timestamp, { activity: point.totalActivity });
    }
    const valid = baseRows
      .map((row) => {
        const flowHit = flowByTs.get(row.timestamp);
        if (!flowHit) return null;
        return {
          ...row,
          activity: flowHit.activity
        };
      })
      .filter(
        (
          row
        ): row is {
          timestamp: number;
          beesIn: number;
          beesOut: number;
          insideTemperature: number | null;
          outsideTemperature: number | null;
          insideHumidity: number | null;
          outsideHumidity: number | null;
          activity: number;
        } => Boolean(row)
      );

    if (valid.length === 0) {
      return {
        hasValidData: false,
        activityPattern: 'unknown',
        peakHours: '--',
        temperaturePreference: '--',
        humidityPreference: '--',
        activityLevel: 'unknown',
        avgTemperature: null,
        avgHumidity: null,
        avgInsideTemperature: null,
        avgOutsideTemperature: null,
        avgInsideHumidity: null,
        avgOutsideHumidity: null,
        avgActivity: null,
        alerts: [{ type: 'warning', message: '历史记录存在缺值，当前无完整有效样本。' }]
      };
    }

    const activities = valid.map((v) => v.activity);
    const insideTemperatures = valid.map((v) => v.insideTemperature).filter((v): v is number => v !== null);
    const outsideTemperatures = valid.map((v) => v.outsideTemperature).filter((v): v is number => v !== null);
    const insideHumidities = valid.map((v) => v.insideHumidity).filter((v): v is number => v !== null);
    const outsideHumidities = valid.map((v) => v.outsideHumidity).filter((v): v is number => v !== null);
    const primaryTemperatures = valid
      .map((v) => v.insideTemperature ?? v.outsideTemperature)
      .filter((v): v is number => v !== null);
    const primaryHumidities = valid
      .map((v) => v.insideHumidity ?? v.outsideHumidity)
      .filter((v): v is number => v !== null);

    const avgActivity = meanOf(activities);
    const avgInsideTemperature = meanOf(insideTemperatures);
    const avgOutsideTemperature = meanOf(outsideTemperatures);
    const avgInsideHumidity = meanOf(insideHumidities);
    const avgOutsideHumidity = meanOf(outsideHumidities);
    const avgTemperature = meanOf(primaryTemperatures);
    const avgHumidity = meanOf(primaryHumidities);

    const byHour = new Map<number, { total: number; count: number }>();
    for (const row of valid) {
      const hour = new Date(row.timestamp).getHours();
      const prev = byHour.get(hour) || { total: 0, count: 0 };
      prev.total += row.activity;
      prev.count += 1;
      byHour.set(hour, prev);
    }
    const peakHour = Array.from(byHour.entries()).reduce<{ hour: number; avg: number } | null>((best, [hour, bucket]) => {
      const avg = bucket.count > 0 ? bucket.total / bucket.count : -1;
      if (!best || avg > best.avg) return { hour, avg };
      return best;
    }, null);

    const dayActivity = valid.filter((v) => {
      const h = new Date(v.timestamp).getHours();
      return h >= 8 && h < 18;
    }).map((v) => v.activity);
    const nightActivity = valid.filter((v) => {
      const h = new Date(v.timestamp).getHours();
      return h < 8 || h >= 18;
    }).map((v) => v.activity);
    const dayAvg = meanOf(dayActivity);
    const nightAvg = meanOf(nightActivity);

    let activityPattern = '波动平稳';
    if (dayAvg !== null && nightAvg !== null) {
      if (dayAvg > nightAvg * 1.35) activityPattern = '昼间活跃';
      else if (nightAvg > dayAvg * 1.1) activityPattern = '夜间偏活跃';
    }

    let activityLevel: InsightResult['activityLevel'] = 'unknown';
    if (avgActivity !== null) {
      if (avgActivity >= 80) activityLevel = 'high';
      else if (avgActivity >= 25) activityLevel = 'moderate';
      else activityLevel = 'low';
    }

    const alerts: InsightAlert[] = [];
    if (avgInsideTemperature !== null && avgInsideTemperature < 20) {
      alerts.push({ type: 'warning', message: '最近箱内平均温度偏低，可能抑制出勤活动。' });
    }
    if (avgInsideTemperature !== null && avgInsideTemperature > 36) {
      alerts.push({ type: 'warning', message: '最近箱内平均温度偏高，建议加强遮阴与通风。' });
    }
    if (avgInsideHumidity !== null && avgInsideHumidity > 80) {
      alerts.push({ type: 'warning', message: '最近箱内平均湿度偏高，建议检查蜂箱通风与潮气。' });
    }
    if (avgOutsideTemperature !== null && avgOutsideTemperature > 40) {
      alerts.push({ type: 'info', message: '箱外环境温度偏高，建议在高温时段减少开盖操作。' });
    }
    if (avgOutsideHumidity !== null && avgOutsideHumidity > 90) {
      alerts.push({ type: 'info', message: '箱外环境湿度偏高，建议重点检查防潮与排水。' });
    }
    if (
      avgInsideTemperature !== null &&
      avgOutsideTemperature !== null &&
      Math.abs(avgInsideTemperature - avgOutsideTemperature) >= 8
    ) {
      alerts.push({ type: 'info', message: '箱内外温差较大，请关注保温与通风平衡。' });
    }
    if (avgActivity !== null && avgActivity < 15) alerts.push({ type: 'info', message: '活动量偏低，请结合花期和天气判断是否季节性影响。' });

    return {
      hasValidData: true,
      activityPattern,
      peakHours: peakHour ? hourRangeLabel(peakHour.hour) : '--',
      temperaturePreference: formatPreference(insideTemperatures, outsideTemperatures, 'temperature'),
      humidityPreference: formatPreference(insideHumidities, outsideHumidities, 'humidity'),
      activityLevel,
      avgTemperature,
      avgHumidity,
      avgInsideTemperature,
      avgOutsideTemperature,
      avgInsideHumidity,
      avgOutsideHumidity,
      avgActivity,
      alerts
    };
  }, [historyData]);

  const recommendations = useMemo(() => {
    const rows: Array<{ type: 'success' | 'warning' | 'info'; title: string; description: string }> = [];

    if (!insights.hasValidData) {
      rows.push({
        type: 'warning',
        title: '补齐采集数据',
        description: '当前缺少有效样本，建议优先检查蜂箱采集链路与字段完整性。'
      });
      return rows;
    }

    if (insights.avgInsideTemperature !== null && insights.avgInsideTemperature < 20) {
      rows.push({
        type: 'warning',
        title: '提升保温',
        description: '箱内温度偏低，夜间需加强保温，减少活动抑制。'
      });
    } else if (insights.avgInsideTemperature !== null && insights.avgInsideTemperature > 36) {
      rows.push({
        type: 'warning',
        title: '加强散热',
        description: '箱内温度偏高，建议优化遮阳并增加通风口换气。'
      });
    } else {
      rows.push({
        type: 'success',
        title: '温度区间可接受',
        description: '近期箱内温度波动可控，可维持当前管理策略。'
      });
    }

    if (insights.avgInsideHumidity !== null && insights.avgInsideHumidity > 80) {
      rows.push({
        type: 'warning',
        title: '降低湿度',
        description: '箱内湿度偏高，建议排查积水与通风，防止环境过潮。'
      });
    } else if (insights.avgInsideHumidity !== null && insights.avgInsideHumidity < 45) {
      rows.push({
        type: 'info',
        title: '适度保湿',
        description: '箱内湿度偏低，可考虑缩小通风开口并关注蜂群饮水。'
      });
    } else {
      rows.push({
        type: 'success',
        title: '湿度区间可接受',
        description: '近期箱内湿度处于较稳定范围。'
      });
    }

    rows.push({
      type: insights.activityLevel === 'low' ? 'info' : 'success',
      title: insights.activityLevel === 'low' ? '活动偏低' : '活动稳定',
      description: insights.activityLevel === 'low'
        ? '请结合天气、花期和群势，确认是否需补饲或调整巡检频率。'
        : '活动趋势整体稳定，可按当前节奏进行巡检。'
    });

    return rows.slice(0, 3);
  }, [insights.activityLevel, insights.avgInsideHumidity, insights.avgInsideTemperature, insights.hasValidData]);

  const behaviorCards = [
    {
      title: '活动模式',
      value: insights.hasValidData ? insights.activityPattern : '--',
      icon: <Activity className="w-6 h-6 text-blue-500" />,
      description: insights.activityLevel === 'high' ? '活动水平: 高' : insights.activityLevel === 'low' ? '活动水平: 低' : insights.activityLevel === 'moderate' ? '活动水平: 中' : '活动水平: --',
      color: 'bg-blue-50 border-blue-200'
    },
    {
      title: '高峰时段',
      value: insights.peakHours,
      icon: <Clock className="w-6 h-6 text-green-500" />,
      description: '按真实采样统计得到',
      color: 'bg-green-50 border-green-200'
    },
    {
      title: '温度偏好区间（内/外）',
      value: insights.temperaturePreference,
      icon: <TrendingUp className="w-6 h-6 text-orange-500" />,
      description: '按近时段箱内/箱外温度分位区间估算',
      color: 'bg-orange-50 border-orange-200'
    },
    {
      title: '湿度偏好区间（内/外）',
      value: insights.humidityPreference,
      icon: <Users className="w-6 h-6 text-purple-500" />,
      description: '按近时段箱内/箱外湿度分位区间估算',
      color: 'bg-purple-50 border-purple-200'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {behaviorCards.map((card, index) => (
          <div key={index} className={`${card.color} rounded-xl border p-6 hover:shadow-md transition-shadow`}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium text-gray-700">{card.title}</div>
              {card.icon}
            </div>
            <div className="space-y-2">
              <div className="text-xl font-bold text-gray-900">{card.value}</div>
              <div className="text-xs text-gray-600">{card.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">智能洞察</h2>
          <Brain className="w-6 h-6 text-indigo-500" />
        </div>

        <div className="space-y-4">
          {insights.alerts.length > 0 ? (
            insights.alerts.map((alert, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-l-4 ${
                  alert.type === 'warning' ? 'bg-yellow-50 border-l-yellow-500' : alert.type === 'error' ? 'bg-red-50 border-l-red-500' : 'bg-blue-50 border-l-blue-500'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <AlertCircle
                    className={`w-5 h-5 mt-0.5 ${
                      alert.type === 'warning' ? 'text-yellow-500' : alert.type === 'error' ? 'text-red-500' : 'text-blue-500'
                    }`}
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 mb-1">{alert.message}</div>
                    <div className="text-xs text-gray-600">{alert.type === 'warning' ? '请关注' : alert.type === 'error' ? '建议立即处理' : '信息提示'}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 bg-green-50 border-l-4 border-l-green-500 rounded-lg">
              <div className="flex items-start space-x-3">
                <TrendingUp className="w-5 h-5 mt-0.5 text-green-500" />
                <div>
                  <div className="text-sm font-medium text-gray-900">未发现明显异常</div>
                  <div className="text-xs text-gray-600">最近样本显示温湿度与活动趋势相对稳定。</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">建议清单</h3>
        <div className="space-y-3">
          {recommendations.map((rec, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${
                rec.type === 'success' ? 'bg-green-50 border-green-200' : rec.type === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="text-sm font-medium text-gray-900 mb-1">{rec.title}</div>
              <div className="text-sm text-gray-600">{rec.description}</div>
              <div className="mt-2 text-xs text-gray-500">优先级：{rec.type === 'warning' ? '高' : rec.type === 'info' ? '中' : '低'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
