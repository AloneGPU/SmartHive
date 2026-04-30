import React, { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Alert, Card, Empty, Segmented, Select, Skeleton, Statistic, Tag } from 'antd';
import { motion } from 'framer-motion';
import { Download, RefreshCw } from 'lucide-react';
import { BeehiveData } from '../types';
import {
  buildHeatmapSeries,
  buildScatterSeries,
  buildStats,
  buildTrendSeries,
  METRIC_META,
  MetricKey,
  sliceByHours,
  validateLegend
} from '../services/chartScience';
import {
  buildFlowSeries,
  resolveInsideHumidity,
  resolveInsideTemperature,
  resolveOutsideHumidity,
  resolveOutsideTemperature,
  toFiniteNumber
} from '../services/hiveDataAdapter';
import { computePaddedDomain, downsampleSequence, formatTimeTick } from '../services/chartViewport';

interface DataAnalysisPanelProps {
  historyData: BeehiveData[];
  currentData: BeehiveData | null;
  timeRange?: '24h' | '7d' | '31d';
  metric?: MetricKey;
  onMetricChange?: (next: MetricKey) => void;
  onRefresh?: () => Promise<unknown> | void;
}

const formatDisplay = (value: number | null, unit: string, precision = 1) => {
  if (value === null) return '--';
  return `${value.toFixed(precision)}${unit}`;
};

const formatMaxThreeDecimals = (value: number | null | undefined) => {
  if (value === null || typeof value === 'undefined' || !Number.isFinite(value)) return '--';
  return Number(value.toFixed(3)).toString();
};

const getMetricValue = (data: BeehiveData | null, metric: MetricKey): number | null => {
  if (!data) return null;
  if (metric === 'activity') {
    const inVal = toFiniteNumber(data.beesIn);
    const outVal = toFiniteNumber(data.beesOut);
    if (inVal === null || outVal === null) return null;
    return inVal + outVal;
  }
  return toFiniteNumber(data[metric]);
};

export const DataAnalysisPanel: React.FC<DataAnalysisPanelProps> = ({
  historyData,
  currentData,
  timeRange: controlledTimeRange,
  metric: controlledMetric,
  onMetricChange,
  onRefresh
}) => {
  const [localTimeRange, setLocalTimeRange] = useState<'24h' | '7d' | '31d'>('24h');
  const [localMetric, setLocalMetric] = useState<MetricKey>('temperature');
  const [chartView, setChartView] = useState<'trend' | 'scatter' | 'heatmap'>('trend');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const timeRange = controlledTimeRange || localTimeRange;
  const dataType = controlledMetric || localMetric;
  const isTimeRangeControlled = typeof controlledTimeRange !== 'undefined';
  const isMetricControlled = typeof controlledMetric !== 'undefined';

  const hourWindow = timeRange === '24h' ? 24 : timeRange === '7d' ? 24 * 7 : 24 * 31;
  const filtered = useMemo(() => sliceByHours(historyData || [], hourWindow), [historyData, hourWindow]);
  const trendMaxPoints = isMobile ? 300 : 900;
  const trendSeries = useMemo(() => buildTrendSeries(filtered, dataType), [filtered, dataType]);
  const scatterSeries = useMemo(() => buildScatterSeries(filtered), [filtered]);
  const heatmapSeries = useMemo(() => buildHeatmapSeries(filtered), [filtered]);
  const trendSeriesDisplay = useMemo(() => downsampleSequence(trendSeries, trendMaxPoints), [trendMaxPoints, trendSeries]);
  const trendInsideTemperatureDisplay = useMemo(
    () => downsampleSequence(buildTrendSeries(filtered, 'insideTemperature'), trendMaxPoints),
    [filtered, trendMaxPoints]
  );
  const trendOutsideTemperatureDisplay = useMemo(
    () => downsampleSequence(buildTrendSeries(filtered, 'outsideTemperature'), trendMaxPoints),
    [filtered, trendMaxPoints]
  );
  const trendInsideHumidityDisplay = useMemo(
    () => downsampleSequence(buildTrendSeries(filtered, 'insideHumidity'), trendMaxPoints),
    [filtered, trendMaxPoints]
  );
  const trendOutsideHumidityDisplay = useMemo(
    () => downsampleSequence(buildTrendSeries(filtered, 'outsideHumidity'), trendMaxPoints),
    [filtered, trendMaxPoints]
  );
  const scatterSeriesDisplay = useMemo(() => downsampleSequence(scatterSeries, isMobile ? 220 : 700), [isMobile, scatterSeries]);
  const stats = useMemo(() => buildStats(filtered, dataType), [filtered, dataType]);
  const currentMetricValue = useMemo(() => getMetricValue(currentData, dataType), [currentData, dataType]);
  const flowSeries = useMemo(
    () =>
      buildFlowSeries(
        filtered.map((item) => ({
          timestamp: item.timestamp,
          beesIn: item.beesIn,
          beesOut: item.beesOut
        }))
      ),
    [filtered]
  );

  const currentInsideTemperature = resolveInsideTemperature(currentData);
  const currentInsideHumidity = resolveInsideHumidity(currentData);
  const currentOutsideTemperature = resolveOutsideTemperature(currentData);
  const currentOutsideHumidity = resolveOutsideHumidity(currentData);
  const currentWeight = toFiniteNumber(currentData?.weight);
  const currentHornetsDetected = toFiniteNumber(currentData?.hornetsDetected) ?? 0;
  const currentActivity = useMemo(() => {
    const latest = flowSeries.points[flowSeries.points.length - 1];
    if (latest) return latest.totalActivity;
    const inVal = toFiniteNumber(currentData?.beesIn);
    const outVal = toFiniteNumber(currentData?.beesOut);
    if (inVal === null || outVal === null) return null;
    return inVal + outVal;
  }, [currentData?.beesIn, currentData?.beesOut, flowSeries.points]);

  const trendSeriesConfig = useMemo(() => {
    if (dataType === 'temperature') {
      return [
        { id: 'insideTemperature', name: '蜂箱里温度（°C）', unit: '°C', color: '#f59e0b', lineType: 'solid' as const, area: true, data: trendInsideTemperatureDisplay },
        { id: 'outsideTemperature', name: '蜂箱外温度（°C）', unit: '°C', color: '#fb923c', lineType: 'dashed' as const, area: false, data: trendOutsideTemperatureDisplay }
      ];
    }
    if (dataType === 'humidity') {
      return [
        { id: 'insideHumidity', name: '蜂箱里湿度（%）', unit: '%', color: '#2563eb', lineType: 'solid' as const, area: true, data: trendInsideHumidityDisplay },
        { id: 'outsideHumidity', name: '蜂箱外湿度（%）', unit: '%', color: '#60a5fa', lineType: 'dashed' as const, area: false, data: trendOutsideHumidityDisplay }
      ];
    }
    return [
      {
        id: dataType,
        name: validateLegend(dataType),
        unit: METRIC_META[dataType].unit,
        color: METRIC_META[dataType].color,
        lineType: 'solid' as const,
        area: true,
        data: trendSeriesDisplay
      }
    ];
  }, [
    dataType,
    trendInsideHumidityDisplay,
    trendInsideTemperatureDisplay,
    trendOutsideHumidityDisplay,
    trendOutsideTemperatureDisplay,
    trendSeriesDisplay
  ]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const trendHasEnough = trendSeriesConfig.some((item) => item.data.length >= 2);
    if (!trendHasEnough) {
      errors.push('趋势图有效数据点少于2，建议切换更长时间范围。');
    }
    if (stats.hasValid && (!Number.isFinite(stats.axisMin) || !Number.isFinite(stats.axisMax) || stats.axisMin >= stats.axisMax)) {
      errors.push('坐标轴刻度校验失败，请检查后端返回数据范围。');
    }
    if (!stats.hasValid) {
      errors.push('当前时段缺少有效数值，统计卡片将显示为 --。');
    }
    return errors;
  }, [stats.axisMax, stats.axisMin, stats.hasValid, trendSeriesConfig]);

  const trendSpanMs = useMemo(() => {
    let minTs = Number.POSITIVE_INFINITY;
    let maxTs = Number.NEGATIVE_INFINITY;
    for (const series of trendSeriesConfig) {
      for (const point of series.data) {
        const ts = Number(point[0]);
        if (!Number.isFinite(ts)) continue;
        if (ts < minTs) minTs = ts;
        if (ts > maxTs) maxTs = ts;
      }
    }
    if (!Number.isFinite(minTs) || !Number.isFinite(maxTs) || maxTs <= minTs) return 0;
    return maxTs - minTs;
  }, [trendSeriesConfig]);

  const trendAxisDomain = useMemo(() => {
    const domain = computePaddedDomain(
      trendSeriesConfig.flatMap((series) => series.data.map((point) => point[1])),
      { ratio: 0.08, minPadding: dataType === 'weight' ? 0.1 : 1 }
    );
    if (domain) return domain;
    return [stats.axisMin, stats.axisMax] as [number, number];
  }, [dataType, stats.axisMax, stats.axisMin, trendSeriesConfig]);

  const scatterWeightRange = useMemo(() => {
    if (scatterSeriesDisplay.length === 0) return { min: 0, max: 1 };
    const values = scatterSeriesDisplay.map((it) => it[2]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 1 };
  }, [scatterSeriesDisplay]);

  const heatmapMax = useMemo(() => {
    if (heatmapSeries.length === 0) return 1;
    return Math.max(...heatmapSeries.map((it) => Number(it[2]) || 0), 1);
  }, [heatmapSeries]);

  const handleMetricChange = (next: MetricKey) => {
    if (!isMetricControlled) {
      setLocalMetric(next);
    }
    onMetricChange?.(next);
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setIsMobile(false);
      return;
    }
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  const exportData = () => {
    const payload = JSON.stringify(
      {
        meta: { timeRange, dataType, legend: validateLegend(dataType), generatedAt: Date.now() },
        stats,
        trendSeries: trendSeriesConfig,
        scatterSeries,
        heatmapSeries
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scientific-chart-${timeRange}-${dataType}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportCsv = async () => {
    if (!historyData || historyData.length === 0) return;
    const startMs = historyData[0].timestamp;
    const endMs = historyData[historyData.length - 1].timestamp;
    const header = 'timestamp,temperature,humidity,insideTemperature,insideHumidity,outsideTemperature,outsideHumidity,weight,beesIn,beesOut,hornetsDetected\n';
    const body = historyData.map((r) => 
      `${r.timestamp},${r.temperature},${r.humidity},${r.insideTemperature ?? ''},${r.insideHumidity ?? ''},${r.outsideTemperature ?? ''},${r.outsideHumidity ?? ''},${r.weight},${r.beesIn ?? 0},${r.beesOut ?? 0},${r.hornetsDetected ?? 0}`
    ).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beehive_data_${timeRange}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const trendOption = useMemo(
    () => {
      const units = Array.from(new Set(trendSeriesConfig.map((item) => item.unit)));
      const yAxisName = units.length === 1 ? units[0] : '数值';
      const showAvgLine = trendSeriesConfig.length === 1 && stats.avg !== null;
      const mobileGrid = isMobile ? { left: 50, right: 16, top: 48, bottom: 68 } : { left: 42, right: 24, top: 52, bottom: 62 };
      return {
        animationDuration: 450,
        color: trendSeriesConfig.map((item) => item.color),
        grid: mobileGrid,
        tooltip: {
          trigger: 'axis',
          confine: true,
          formatter: (params: any) => {
            const rows = Array.isArray(params) ? params : [params];
            const first = rows[0];
            if (!first) return '';
            const ts = Number(Array.isArray(first.value) ? first.value[0] : first.axisValue);
            const body = rows
              .map((row: any) => {
                const seriesName = String(row.seriesName || '');
                const seriesMeta = trendSeriesConfig.find((item) => item.name === seriesName);
                const unit = seriesMeta?.unit || '';
                const value = Number(Array.isArray(row.value) ? row.value[1] : Number.NaN);
                const display = Number.isFinite(value) ? `${formatMaxThreeDecimals(value)} ${unit}` : '--';
                return `${row.marker || ''}${seriesName}: ${display}`;
              })
              .join('<br/>');
            return `${new Date(ts).toLocaleString('zh-CN')}<br/>${body}`;
          }
        },
        legend: { 
          data: trendSeriesConfig.map((item) => item.name), 
          top: 8,
          textStyle: { fontSize: isMobile ? 11 : 12 },
          itemWidth: isMobile ? 14 : 16,
          itemHeight: isMobile ? 10 : 12,
          itemGap: isMobile ? 8 : 12
        },
        xAxis: {
          type: 'time',
          axisLine: { lineStyle: { color: '#d1d5db' } },
          axisTick: { lineStyle: { color: '#d1d5db' } },
          axisLabel: {
            color: '#4b5563',
            fontSize: isMobile ? 10 : 11,
            formatter: (value: number) => formatTimeTick(Number(value), trendSpanMs),
            rotate: isMobile && (trendSpanMs > 7 * 864e5) ? 30 : 0
          }
        },
        yAxis: {
          type: 'value',
          min: trendAxisDomain[0],
          max: trendAxisDomain[1],
          name: yAxisName,
          nameTextStyle: { fontSize: isMobile ? 10 : 11 },
          axisLabel: {
            color: '#4b5563',
            fontSize: isMobile ? 10 : 11,
            formatter: (value: number) => formatMaxThreeDecimals(Number(value))
          },
          splitLine: { lineStyle: { color: '#f1f5f9' } }
        },
        dataZoom: [
          { type: 'inside' },
          { type: 'slider', height: isMobile ? 20 : 22, bottom: isMobile ? 14 : 12, brushSelect: false, showDataShadow: false }
        ],
        toolbox: !isMobile ? { feature: { saveAsImage: {}, dataZoom: {}, restore: {} } } : undefined,
        series: trendSeriesConfig.map((item, index) => ({
          name: item.name,
          type: 'line',
          showSymbol: false,
          smooth: true,
          sampling: 'lttb',
          lineStyle: { width: isMobile ? 2 : 2.5, type: item.lineType, color: item.color },
          itemStyle: { color: item.color },
          areaStyle: item.area
            ? {
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: `${item.color}55` },
                    { offset: 1, color: `${item.color}08` }
                  ]
                }
              }
            : undefined,
          markLine:
            showAvgLine && index === 0
              ? {
                  symbol: 'none',
                  lineStyle: { type: 'dashed', color: '#94a3b8' },
                  data: [{ yAxis: Number((stats.avg as number).toFixed(3)), name: '均值' }]
                }
              : undefined,
          data: item.data
        }))
      };
    },
    [isMobile, stats.avg, trendAxisDomain, trendSeriesConfig, trendSpanMs]
  );

  const scatterOption = useMemo(
    () => ({
      animationDuration: 450,
      grid: isMobile ? { left: 48, right: 14, top: 26, bottom: 68 } : { left: 42, right: 20, top: 30, bottom: 66 },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (p: { value: [number, number, number, number] }) =>
          `温度: ${formatMaxThreeDecimals(p.value[0])} °C<br/>湿度: ${formatMaxThreeDecimals(p.value[1])} %<br/>重量: ${formatMaxThreeDecimals(p.value[2])} kg<br/>时间: ${new Date(p.value[3]).toLocaleString('zh-CN')}`
      },
      xAxis: { 
        type: 'value', 
        name: '温度(°C)', 
        nameTextStyle: { fontSize: isMobile ? 10 : 11 },
        axisLabel: {
          color: '#4b5563',
          fontSize: isMobile ? 10 : 11,
          formatter: (value: number) => formatMaxThreeDecimals(Number(value))
        }, 
        splitLine: { lineStyle: { color: '#f1f5f9' } } 
      },
      yAxis: { 
        type: 'value', 
        name: '湿度(%)', 
        nameTextStyle: { fontSize: isMobile ? 10 : 11 },
        axisLabel: {
          color: '#4b5563',
          fontSize: isMobile ? 10 : 11,
          formatter: (value: number) => formatMaxThreeDecimals(Number(value))
        }, 
        splitLine: { lineStyle: { color: '#f1f5f9' } } 
      },
      visualMap: {
        show: !isMobile,
        dimension: 2,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        min: Math.min(scatterWeightRange.min, 0),
        max: Math.max(scatterWeightRange.max, 1),
        inRange: { color: ['#93c5fd', '#1d4ed8'] }
      },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: isMobile ? 20 : 22, bottom: isMobile ? 14 : 12 }],
      series: [
        {
          type: 'scatter',
          large: scatterSeriesDisplay.length > 250,
          progressive: 500,
          symbolSize: (val: number[]) => {
            const weight = Number(val[2]);
            if (!Number.isFinite(weight)) return isMobile ? 6 : 7;
            const span = Math.max(1e-6, scatterWeightRange.max - scatterWeightRange.min);
            const ratio = (weight - scatterWeightRange.min) / span;
            return Math.max(isMobile ? 5 : 6, Math.min(isMobile ? 14 : 18, (isMobile ? 5 : 6) + ratio * (isMobile ? 9 : 12)));
          },
          data: scatterSeriesDisplay
        }
      ]
    }),
    [isMobile, scatterSeriesDisplay, scatterWeightRange.max, scatterWeightRange.min]
  );

  const heatmapOption = useMemo(
    () => ({
      animationDuration: 450,
      tooltip: {
        position: 'top',
        confine: true,
        formatter: (p: { value: [number, number, number] }) => {
          const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
          const hour = p.value[0];
          const day = dayLabels[p.value[1]] || `周${p.value[1]}`;
          return `${day} ${hour}:00-${hour + 1}:00<br/>样本数：${p.value[2]}`;
        }
      },
      grid: { height: isMobile ? '60%' : '66%', top: isMobile ? '10%' : '8%' },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
        splitArea: { show: true },
        axisLabel: { color: '#4b5563', fontSize: isMobile ? 9 : 11 }
      },
      yAxis: {
        type: 'category',
        data: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
        splitArea: { show: true },
        axisLabel: { color: '#4b5563', fontSize: isMobile ? 9 : 11 }
      },
      visualMap: {
        min: 0,
        max: heatmapMax,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        textStyle: { fontSize: isMobile ? 10 : 11 },
        text: ['高频', '低频']
      },
      series: [{ type: 'heatmap', data: heatmapSeries, emphasis: { itemStyle: { borderColor: '#111827', borderWidth: 1 } } }]
    }),
    [isMobile, heatmapMax, heatmapSeries]
  );

  const chartHint =
    chartView === 'trend'
      ? dataType === 'temperature' || dataType === 'humidity'
        ? '提示：当前趋势图已同时展示蜂箱内与蜂箱外数据，点击任意数据点可下钻详情。'
        : '提示：点击趋势图任意数据点，可直接下钻到详情页对应时间。'
      : chartView === 'scatter'
      ? '提示：散点图用于观察温湿度与重量的相关关系。'
      : '提示：热力图用于发现一周内高频采样时段。';

  const trendRenderCount = useMemo(
    () => trendSeriesConfig.reduce((max, item) => Math.max(max, item.data.length), 0),
    [trendSeriesConfig]
  );

  const chartHeight = isMobile ? (chartView === 'heatmap' ? 340 : 320) : chartView === 'heatmap' ? 440 : 420;

  if (!historyData || historyData.length === 0) {
    return <Empty description="暂无可分析数据，等待后端返回记录" className="bg-white rounded-xl border border-gray-200 p-8" />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      {validationErrors.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title="数据校验提醒"
          description={validationErrors.join('；')}
          className="rounded-xl"
        />
      ) : null}

      <Card className="rounded-2xl" styles={{ body: { padding: 16 } }}>
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {!isTimeRangeControlled ? (
              <Segmented
                value={timeRange}
                onChange={(v) => setLocalTimeRange(v as '24h' | '7d' | '31d')}
                options={[
                  { label: '24小时', value: '24h' },
                  { label: '7天', value: '7d' },
                  { label: '31天', value: '31d' }
                ]}
              />
            ) : (
              <Tag color="default">范围：{timeRange === '24h' ? '24小时' : timeRange === '7d' ? '7天' : '31天'}</Tag>
            )}

            {!isMetricControlled ? (
              <Select
                value={dataType}
                style={{ width: 140 }}
                onChange={(v) => handleMetricChange(v as MetricKey)}
                options={[
                  { label: '蜂箱里温度', value: 'insideTemperature' },
                  { label: '蜂箱里湿度', value: 'insideHumidity' },
                  { label: '蜂箱外温度', value: 'outsideTemperature' },
                  { label: '蜂箱外湿度', value: 'outsideHumidity' },
                  { label: '重量', value: 'weight' },
                  { label: '活动量', value: 'activity' },
                  { label: '胡蜂数量', value: 'hornetsDetected' }
                ]}
              />
            ) : (
              <Tag color="processing">维度：{METRIC_META[dataType].label}</Tag>
            )}

            <Segmented
              value={chartView}
              onChange={(v) => setChartView(v as 'trend' | 'scatter' | 'heatmap')}
              options={[
                { label: '趋势', value: 'trend' },
                { label: '相关', value: 'scatter' },
                { label: '密度', value: 'heatmap' }
              ]}
            />
            <Tag color="processing">图例：{validateLegend(dataType)}</Tag>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshData()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100"
            >
              <Download className="w-4 h-4" />
              导出数据(CSV)
            </button>
            <button
              type="button"
              onClick={exportData}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            >
              <Download className="w-4 h-4" />
              导出图表配置
            </button>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-500">建议路径：先看实时读数，再看趋势图，最后点击数据点下钻详情。</div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <Card className="rounded-xl border-amber-50 shadow-sm" styles={{ body: { padding: '12px 8px' } }}>
          <div className="text-[10px] sm:text-xs text-gray-400 mb-1 flex items-center gap-1 font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
            箱内温度
          </div>
          <div className="text-base sm:text-lg font-black text-amber-600">{formatDisplay(currentInsideTemperature, '°C', 1)}</div>
        </Card>
        <Card className="rounded-xl border-blue-50 shadow-sm" styles={{ body: { padding: '12px 8px' } }}>
          <div className="text-[10px] sm:text-xs text-gray-400 mb-1 flex items-center gap-1 font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
            箱内湿度
          </div>
          <div className="text-base sm:text-lg font-black text-blue-600">{formatDisplay(currentInsideHumidity, '%', 0)}</div>
        </Card>
        <Card className="rounded-xl border-amber-50 shadow-sm" styles={{ body: { padding: '12px 8px' } }}>
          <div className="text-[10px] sm:text-xs text-gray-400 mb-1 flex items-center gap-1 font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-300"></div>
            箱外温度
          </div>
          <div className="text-base sm:text-lg font-black text-amber-500/80">{formatDisplay(currentOutsideTemperature, '°C', 1)}</div>
        </Card>
        <Card className="rounded-xl border-blue-50 shadow-sm" styles={{ body: { padding: '12px 8px' } }}>
          <div className="text-[10px] sm:text-xs text-gray-400 mb-1 flex items-center gap-1 font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-300"></div>
            箱外湿度
          </div>
          <div className="text-base sm:text-lg font-black text-blue-500/80">{formatDisplay(currentOutsideHumidity, '%', 0)}</div>
        </Card>
        <Card className="rounded-xl border-emerald-50 shadow-sm" styles={{ body: { padding: '12px 8px' } }}>
          <div className="text-[10px] sm:text-xs text-gray-400 mb-1 flex items-center gap-1 font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
            当前重量
          </div>
          <div className="text-base sm:text-lg font-black text-emerald-600">{formatDisplay(currentWeight, 'kg', 2)}</div>
        </Card>
        <Card className="rounded-xl border-violet-50 shadow-sm" styles={{ body: { padding: '12px 8px' } }}>
          <div className="text-[10px] sm:text-xs text-gray-400 mb-1 flex items-center gap-1 font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400"></div>
            进出流量
          </div>
          <div className="text-base sm:text-lg font-black text-violet-600">{formatDisplay(currentActivity, '次', 0)}</div>
        </Card>
        <Card className={`rounded-xl shadow-sm ${currentHornetsDetected > 0 ? 'border-red-100 bg-red-50/30' : 'border-gray-100'}`} styles={{ body: { padding: '12px 8px' } }}>
          <div className="text-[10px] sm:text-xs text-gray-400 mb-1 flex items-center gap-1 font-medium">
            <div className={`w-1.5 h-1.5 rounded-full ${currentHornetsDetected > 0 ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`}></div>
            胡蜂预警
          </div>
          <div className={`text-base sm:text-lg font-black ${currentHornetsDetected > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatDisplay(currentHornetsDetected, '只', 0)}</div>
        </Card>
      </div>

      <Card className="rounded-2xl" styles={{ body: { padding: 12 } }}>
        {isRefreshing ? (
          <Skeleton active paragraph={{ rows: 7 }} />
        ) : (
          <>
            <ReactECharts
              style={{ height: chartHeight, width: '100%' }}
              option={chartView === 'trend' ? trendOption : chartView === 'scatter' ? scatterOption : heatmapOption}
              notMerge
              lazyUpdate
              opts={{ renderer: 'canvas' }}
              onEvents={{
                click: (event: { value?: unknown }) => {
                  if (chartView === 'trend' && Array.isArray(event.value)) {
                    window.dispatchEvent(new CustomEvent('smarthive:drilldown', { detail: { ts: event.value[0] } }));
                  }
                }
              }}
            />
            <div className="mt-2 text-xs text-gray-500">
              {chartHint} 当前图层渲染点：{chartView === 'trend' ? trendRenderCount : chartView === 'scatter' ? scatterSeriesDisplay.length : heatmapSeries.length}
            </div>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className="rounded-xl">
          <Statistic
            title={timeRange === '24h' ? '24小时内值' : timeRange === '7d' ? '7天内值' : '31天内值'}
            value={currentMetricValue ?? '--'}
            precision={currentMetricValue === null ? undefined : 2}
            suffix={currentMetricValue === null ? '' : METRIC_META[dataType].unit}
          />
        </Card>
        <Card className="rounded-xl">
          <Statistic title="均值" value={stats.avg ?? '--'} precision={stats.avg === null ? undefined : 2} suffix={stats.avg === null ? '' : METRIC_META[dataType].unit} />
        </Card>
        <Card className="rounded-xl">
          <Statistic title="最小值" value={stats.min ?? '--'} precision={stats.min === null ? undefined : 2} suffix={stats.min === null ? '' : METRIC_META[dataType].unit} />
        </Card>
        <Card className="rounded-xl">
          <Statistic title="最大值" value={stats.max ?? '--'} precision={stats.max === null ? undefined : 2} suffix={stats.max === null ? '' : METRIC_META[dataType].unit} />
        </Card>
        <Card className="rounded-xl">
          <Statistic title="标准差" value={stats.std ?? '--'} precision={stats.std === null ? undefined : 2} suffix={stats.std === null ? '' : METRIC_META[dataType].unit} />
        </Card>
      </div>
    </motion.div>
  );
};
