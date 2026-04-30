import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { BeehiveData } from '../types';
import {
  buildFlowSeries,
} from '../services/hiveDataAdapter';

interface DetailedAnalyticsProps {
  historyData: BeehiveData[];
  currentData: BeehiveData | null;
  timeRange?: '24h' | '7d' | '31d';
}

export const DetailedAnalytics: React.FC<DetailedAnalyticsProps> = ({ historyData, currentData, timeRange = '24h' }) => {
  const analytics = useMemo(() => {
    if (!historyData || historyData.length === 0) {
      return {
        activityTrend: [] as Array<{
          timestamp: number;
          beesIn: number;
          beesOut: number;
          netActivity: number;
          totalActivity: number;
        }>,
        weeklyActivity: [] as Array<{ day: string; avgActivity: number; avgNet: number; hasData: boolean }>,
        summary: {
          totalIn24h: null as number | null,
          totalOut24h: null as number | null,
          net24h: null as number | null,
          peakHour: '--',
          sampleCount: 0
        }
      };
    }

    const ordered = [...historyData].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    const flow = buildFlowSeries(
      ordered.map((item) => ({
        timestamp: item.timestamp,
        beesIn: item.beesIn,
        beesOut: item.beesOut
      }))
    );
    const activityPointLimit = timeRange === '24h' ? 96 : timeRange === '7d' ? 360 : 720;
    const activityTrend = flow.points.slice(-activityPointLimit);
    const now = Date.now();
    const recent24 = flow.points
      .filter((item) => item.timestamp >= now - 24 * 60 * 60 * 1000)
      .map((item) => ({
        timestamp: item.timestamp,
        beesIn: item.beesIn,
        beesOut: item.beesOut,
        total: item.totalActivity
      }));

    const totalIn24h = recent24.length > 0 ? recent24.reduce((sum, item) => sum + item.beesIn, 0) : null;
    const totalOut24h = recent24.length > 0 ? recent24.reduce((sum, item) => sum + item.beesOut, 0) : null;
    const net24h = totalIn24h !== null && totalOut24h !== null ? totalIn24h - totalOut24h : null;
    const peakPoint = recent24.reduce(
      (max, item) => (item.total > max.total ? item : max),
      { timestamp: 0, beesIn: 0, beesOut: 0, total: -1 }
    );
    const peakHour =
      peakPoint.timestamp > 0
        ? new Date(peakPoint.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '--';

    const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayBuckets = new Map<number, { totalActivity: number; totalNet: number; samples: number }>();
    for (const item of flow.points) {
      const day = new Date(item.timestamp).getDay();
      const beesIn = item.beesIn;
      const beesOut = item.beesOut;
      const prev = dayBuckets.get(day) || { totalActivity: 0, totalNet: 0, samples: 0 };
      prev.totalActivity += beesIn + beesOut;
      prev.totalNet += beesIn - beesOut;
      prev.samples += 1;
      dayBuckets.set(day, prev);
    }

    const weeklyActivity = dayLabels.map((label, dayIndex) => {
      const bucket = dayBuckets.get(dayIndex);
      if (!bucket || bucket.samples === 0) {
        return { day: label, avgActivity: 0, avgNet: 0, hasData: false };
      }
      return {
        day: label,
        avgActivity: Number((bucket.totalActivity / bucket.samples).toFixed(1)),
        avgNet: Number((bucket.totalNet / bucket.samples).toFixed(1)),
        hasData: true
      };
    });

    return {
      activityTrend,
      weeklyActivity,
      summary: {
        totalIn24h,
        totalOut24h,
        net24h,
        peakHour,
        sampleCount: ordered.length
      }
    };
  }, [historyData, timeRange]);

  if (!historyData || historyData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-2">暂无详细分析数据</h3>
      </div>
    );
  }

  const summaryCards: { title: string; value: string; icon: React.ReactNode }[] = [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">周内活跃分布</h3>
        <p className="text-xs text-gray-500 mb-4">按星期聚合展示日均活跃度与日均净流量。</p>
        <div className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.weeklyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" stroke="#666" fontSize={12} />
              <YAxis stroke="#666" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value: any, name: any) => {
                  if (!Number.isFinite(Number(value))) return ['--', name];
                  return [`${Number(value).toFixed(1)} 次`, name];
                }}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
              <Bar dataKey="avgActivity" fill="#3b82f6" name="日均活跃度" radius={[3, 3, 0, 0]}>
                {analytics.weeklyActivity.map((entry, index) => (
                  <Cell key={`act-${entry.day}-${index}`} fill={entry.hasData ? '#3b82f6' : '#cbd5e1'} />
                ))}
              </Bar>
              <Bar dataKey="avgNet" fill="#22c55e" name="日均净流量" radius={[3, 3, 0, 0]}>
                {analytics.weeklyActivity.map((entry, index) => (
                  <Cell
                    key={`net-${entry.day}-${index}`}
                    fill={entry.hasData ? (entry.avgNet >= 0 ? '#22c55e' : '#ef4444') : '#e5e7eb'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
