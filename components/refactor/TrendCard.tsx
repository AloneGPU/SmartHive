import { Area, AreaChart, Brush, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { ChevronRight, RefreshCw, Info } from 'lucide-react';
import { BeehiveData } from '../../types';
import { useEffect, useMemo, useState, Fragment, Suspense, lazy } from 'react';
import {
  resolveInsideHumidity,
  resolveInsideTemperature,
  resolveOutsideHumidity,
  resolveOutsideTemperature
} from '../../services/hiveDataAdapter';
import { computePaddedDomain, downsampleSequence, formatTimeTick } from '../../services/chartViewport';

type TrendPoint = {
  ts: number;
  insideTemperature: number | null;
  outsideTemperature: number | null;
  insideHumidity: number | null;
  outsideHumidity: number | null;
  weight: number | null;
  hornetsDetected: number | null;
};

const toFiniteNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toPoint = (d: BeehiveData): TrendPoint | null => {
  const ts = Number(d.timestamp);
  if (!Number.isFinite(ts)) return null;
  return {
    ts,
    insideTemperature: resolveInsideTemperature(d),
    outsideTemperature: resolveOutsideTemperature(d),
    insideHumidity: resolveInsideHumidity(d),
    outsideHumidity: resolveOutsideHumidity(d),
    weight: toFiniteNumber(d.weight),
    hornetsDetected: toFiniteNumber((d as any).hornetsDetected)
  };
};

const hasAnyMainMetric = (p: TrendPoint) =>
  p.insideTemperature !== null ||
  p.outsideTemperature !== null ||
  p.insideHumidity !== null ||
  p.outsideHumidity !== null ||
  p.weight !== null;

const TrendCardMobileECharts = lazy(() => import('./TrendCardMobileECharts'));

const formatDelta = (v: number, digits: number) => {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}`;
};

const badgeTone = (level: 'ok' | 'warn' | 'error') => {
  if (level === 'error') return 'bg-red-50 text-red-700 border-red-200';
  if (level === 'warn') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-emerald-50 text-emerald-800 border-emerald-200';
};

const formatFullLabel = (ts: number) => {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);
  return isMobile;
};

export const TrendCard = (props: {
  title: string;
  data: BeehiveData[];
  comparisonData?: BeehiveData[][];
  mainRangeStart?: number;
  compareRangeStart?: number;
  isLoading: boolean;
  onDrilldown?: () => void;
  onRefresh?: () => void;
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isMobile = useIsMobile();
  
  // 主数据处理
  const data = useMemo(
    () =>
      props.data
        .map(toPoint)
        .filter((p): p is TrendPoint => Boolean(p && hasAnyMainMetric(p)))
        .sort((a, b) => a.ts - b.ts),
    [props.data]
  );
  const dataSpan = useMemo(() => {
    if (data.length === 0) return { minTs: 0, maxTs: 0, spanMs: 0 };
    let minTs = data[0].ts;
    let maxTs = data[0].ts;
    for (const p of data) {
      if (p.ts < minTs) minTs = p.ts;
      if (p.ts > maxTs) maxTs = p.ts;
    }
    return { minTs, maxTs, spanMs: Math.max(0, maxTs - minTs) };
  }, [data]);

  // 比较数据处理：将其平移到主数据的时间线上，以便重叠
  const processedComparisonData = useMemo(() => {
    if (!props.comparisonData || !props.mainRangeStart || !props.compareRangeStart) return [];
    
    const offset = props.mainRangeStart - props.compareRangeStart;
    return props.comparisonData
      .map((group) =>
        group
          .map((d) => {
            const p = toPoint(d);
            if (!p) return null;
            return {
              ...p,
              ts: p.ts + offset, // 平移时间戳
              originalTs: p.ts // 保留原始时间戳用于 Tooltip
            };
          })
          .filter((p): p is TrendPoint & { originalTs: number } => Boolean(p && hasAnyMainMetric(p)))
      )
      .filter((group) => group.length > 0);
  }, [props.comparisonData, props.mainRangeStart, props.compareRangeStart]);

  const maxRenderPoints = isMobile ? 360 : 560;
  const displayData = useMemo(() => downsampleSequence(data, maxRenderPoints), [data, maxRenderPoints]);
  const displayComparisonData = useMemo(
    () => processedComparisonData.map((group) => downsampleSequence(group, maxRenderPoints)),
    [maxRenderPoints, processedComparisonData]
  );

  const leftAxisDomain = useMemo(() => {
    const values: Array<number | null> = [];
    for (const p of displayData) {
      values.push(p.insideTemperature, p.outsideTemperature, p.insideHumidity, p.outsideHumidity);
    }
    for (const group of displayComparisonData) {
      for (const p of group) {
        values.push(p.insideTemperature, p.outsideTemperature, p.insideHumidity, p.outsideHumidity);
      }
    }
    const domain = computePaddedDomain(values, { ratio: 0.1, minPadding: 1 }) ?? [0, 100];
    return [Math.max(0, domain[0]), Math.max(5, domain[1])] as [number, number];
  }, [displayComparisonData, displayData]);

  const rightAxisDomain = useMemo(() => {
    const values: Array<number | null> = [];
    for (const p of displayData) values.push(p.weight);
    const domain = computePaddedDomain(values, { ratio: 0.08, minPadding: 0.1 }) ?? [0, 1];
    return [Math.max(0, domain[0]), Math.max(1, domain[1])] as [number, number];
  }, [displayData]);

  const a11ySummary = useMemo(() => {
    if (data.length === 0) return '';
    const insideTemps = data.map((p) => p.insideTemperature).filter((v): v is number => v !== null);
    const outsideTemps = data.map((p) => p.outsideTemperature).filter((v): v is number => v !== null);
    const insideHums = data.map((p) => p.insideHumidity).filter((v): v is number => v !== null);
    const outsideHums = data.map((p) => p.outsideHumidity).filter((v): v is number => v !== null);
    const weights = data.map((p) => p.weight).filter((v): v is number => v !== null);
    const start = formatFullLabel(dataSpan.minTs);
    const end = formatFullLabel(dataSpan.maxTs);
    const latestInsideTemp = [...data].reverse().find((p) => p.insideTemperature !== null)?.insideTemperature ?? null;
    const latestOutsideTemp = [...data].reverse().find((p) => p.outsideTemperature !== null)?.outsideTemperature ?? null;
    const latestInsideHum = [...data].reverse().find((p) => p.insideHumidity !== null)?.insideHumidity ?? null;
    const latestOutsideHum = [...data].reverse().find((p) => p.outsideHumidity !== null)?.outsideHumidity ?? null;
    const latestWeight = [...data].reverse().find((p) => p.weight !== null)?.weight ?? null;
    return [
      `${props.title}。时间范围：${start} 到 ${end}。`,
      insideTemps.length > 0 && latestInsideTemp !== null
        ? `箱内温度：最小 ${Math.min(...insideTemps).toFixed(1)}℃，最大 ${Math.max(...insideTemps).toFixed(1)}℃，区间末 ${latestInsideTemp.toFixed(1)}℃。`
        : '箱内温度：暂无有效数据。',
      outsideTemps.length > 0 && latestOutsideTemp !== null
        ? `箱外温度：最小 ${Math.min(...outsideTemps).toFixed(1)}℃，最大 ${Math.max(...outsideTemps).toFixed(1)}℃，区间末 ${latestOutsideTemp.toFixed(1)}℃。`
        : '箱外温度：暂无有效数据。',
      insideHums.length > 0 && latestInsideHum !== null
        ? `箱内湿度：最小 ${Math.min(...insideHums).toFixed(1)}%，最大 ${Math.max(...insideHums).toFixed(1)}%，区间末 ${latestInsideHum.toFixed(1)}%。`
        : '箱内湿度：暂无有效数据。',
      outsideHums.length > 0 && latestOutsideHum !== null
        ? `箱外湿度：最小 ${Math.min(...outsideHums).toFixed(1)}%，最大 ${Math.max(...outsideHums).toFixed(1)}%，区间末 ${latestOutsideHum.toFixed(1)}%。`
        : '箱外湿度：暂无有效数据。',
      weights.length > 0 && latestWeight !== null
        ? `重量：最小 ${Math.min(...weights).toFixed(2)}kg，最大 ${Math.max(...weights).toFixed(2)}kg，区间末 ${latestWeight.toFixed(2)}kg。`
        : '重量：暂无有效数据。',
      processedComparisonData.length > 0 ? `当前为对比模式，对照组数量：${processedComparisonData.length}。` : ''
    ]
      .filter(Boolean)
      .join(' ');
  }, [data, dataSpan.maxTs, dataSpan.minTs, processedComparisonData.length, props.title]);

  const headline = useMemo(() => {
    if (data.length === 0) return null;
    const firstInsideTemp = data.find((p) => p.insideTemperature !== null)?.insideTemperature ?? null;
    const lastInsideTemp = [...data].reverse().find((p) => p.insideTemperature !== null)?.insideTemperature ?? null;
    const firstOutsideTemp = data.find((p) => p.outsideTemperature !== null)?.outsideTemperature ?? null;
    const lastOutsideTemp = [...data].reverse().find((p) => p.outsideTemperature !== null)?.outsideTemperature ?? null;
    const firstInsideHum = data.find((p) => p.insideHumidity !== null)?.insideHumidity ?? null;
    const lastInsideHum = [...data].reverse().find((p) => p.insideHumidity !== null)?.insideHumidity ?? null;
    const firstOutsideHum = data.find((p) => p.outsideHumidity !== null)?.outsideHumidity ?? null;
    const lastOutsideHum = [...data].reverse().find((p) => p.outsideHumidity !== null)?.outsideHumidity ?? null;
    const firstWgt = data.find((p) => p.weight !== null)?.weight ?? null;
    const lastWgt = [...data].reverse().find((p) => p.weight !== null)?.weight ?? null;
    if (
      firstInsideTemp === null ||
      lastInsideTemp === null ||
      firstInsideHum === null ||
      lastInsideHum === null ||
      firstWgt === null ||
      lastWgt === null
    ) {
      return null;
    }

    const dInsideTemp = lastInsideTemp - firstInsideTemp;
    const dOutsideTemp = firstOutsideTemp !== null && lastOutsideTemp !== null ? lastOutsideTemp - firstOutsideTemp : null;
    const dInsideHum = lastInsideHum - firstInsideHum;
    const dOutsideHum = firstOutsideHum !== null && lastOutsideHum !== null ? lastOutsideHum - firstOutsideHum : null;
    const dWgt = lastWgt - firstWgt;
    const latest = data[data.length - 1];

    const alerts: Array<{ level: 'ok' | 'warn' | 'error'; label: string }> = [];
    if (latest.insideTemperature !== null && (latest.insideTemperature > 38 || latest.insideTemperature < 10)) {
      alerts.push({ level: 'warn', label: '箱内温度异常' });
    }
    if (latest.insideHumidity !== null && (latest.insideHumidity > 85 || latest.insideHumidity < 30)) {
      alerts.push({ level: 'warn', label: '箱内湿度异常' });
    }
    if (latest.hornetsDetected !== null && latest.hornetsDetected > 0) alerts.push({ level: 'error', label: `马蜂 ${latest.hornetsDetected.toFixed(0)}` });
    if (alerts.length === 0) alerts.push({ level: 'ok', label: '状态正常' });

    return {
      last: {
        insideTemperature: lastInsideTemp,
        outsideTemperature: lastOutsideTemp,
        insideHumidity: lastInsideHum,
        outsideHumidity: lastOutsideHum,
        weight: lastWgt
      },
      delta: {
        insideTemp: dInsideTemp,
        outsideTemp: dOutsideTemp,
        insideHum: dInsideHum,
        outsideHum: dOutsideHum,
        wgt: dWgt
      },
      alerts
    };
  }, [data]);
  
  const handleRefresh = async () => {
    if (props.onRefresh) {
      setIsRefreshing(true);
      await props.onRefresh();
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  const isFutureDate = () => {
    if (data.length === 0) return false;
    const lastTs = Math.max(...data.map(d => d.ts));
    return lastTs > Date.now() + 864e5; // 超过一天以后算未来
  };
  const showDesktopBrush = !isMobile && displayData.length > 90;

  const buildEChartsOption = useMemo(() => {
    if (!isMobile || displayData.length === 0) return null;
    const maxTs = dataSpan.maxTs;
    const minTs = dataSpan.minTs;
    const endValue = maxTs;
    const initialWindowMs = dataSpan.spanMs > 10 * 864e5 ? 7 * 864e5 : dataSpan.spanMs;
    const startValue = Math.max(minTs, maxTs - initialWindowMs);

    const series = [
      {
        name: '箱内温度',
        type: 'line',
        yAxisIndex: 0,
        showSymbol: false,
        sampling: 'lttb',
        lineStyle: { width: 2, color: '#B45309' },
        itemStyle: { color: '#B45309' },
        data: displayData.map((p) => [p.ts, p.insideTemperature]),
      },
      {
        name: '箱外温度',
        type: 'line',
        yAxisIndex: 0,
        showSymbol: false,
        sampling: 'lttb',
        lineStyle: { width: 1.5, type: 'dashed', color: '#F59E0B' },
        itemStyle: { color: '#F59E0B' },
        data: displayData.map((p) => [p.ts, p.outsideTemperature]),
      },
      {
        name: '箱内湿度',
        type: 'line',
        yAxisIndex: 0,
        showSymbol: false,
        sampling: 'lttb',
        lineStyle: { width: 2, color: '#1D4ED8' },
        itemStyle: { color: '#1D4ED8' },
        data: displayData.map((p) => [p.ts, p.insideHumidity]),
      },
      {
        name: '箱外湿度',
        type: 'line',
        yAxisIndex: 0,
        showSymbol: false,
        sampling: 'lttb',
        lineStyle: { width: 1.5, type: 'dashed', color: '#60A5FA' },
        itemStyle: { color: '#60A5FA' },
        data: displayData.map((p) => [p.ts, p.outsideHumidity]),
      },
      {
        name: '重量',
        type: 'line',
        yAxisIndex: 1,
        showSymbol: false,
        sampling: 'lttb',
        lineStyle: { width: 2, color: '#047857' },
        itemStyle: { color: '#047857' },
        data: displayData.map((p) => [p.ts, p.weight]),
      }
    ];

    displayComparisonData.forEach((group, idx) => {
      const label = group.length > 0 ? new Date(group[0].originalTs).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : `对照组${idx + 1}`;
      series.push(
        {
          name: `对照箱内温度 (${label})`,
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          sampling: 'lttb',
          lineStyle: { width: 1, type: 'dashed', color: '#4338CA' },
          itemStyle: { color: '#4338CA' },
          data: group.map((p) => [p.ts, p.insideTemperature]),
        } as any,
        {
          name: `对照箱内湿度 (${label})`,
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          sampling: 'lttb',
          lineStyle: { width: 1, type: 'dotted', color: '#6366F1' },
          itemStyle: { color: '#6366F1' },
          data: group.map((p) => [p.ts, p.insideHumidity]),
        } as any
      );
    });

    return {
      animation: false,
      aria: { enabled: true, description: a11ySummary || '' },
      grid: { left: 14, right: 14, top: 18, bottom: 40, containLabel: true },
      legend: {
        show: false
      },
      tooltip: {
        trigger: 'axis',
        triggerOn: 'click',
        confine: true,
        backgroundColor: '#FFFFFF',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        textStyle: { color: '#111827', fontSize: 14 },
        extraCssText: 'box-shadow: 0 8px 18px rgba(0,0,0,0.12); border-radius: 12px;',
        formatter: (params: Array<{ value: [number, number]; seriesName: string }>) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const ts = Number(params[0]?.value?.[0]);
          const rows = params
            .map((it) => {
              const value = Number(it.value?.[1]);
              const suffix = it.seriesName.includes('重量')
                ? 'kg'
                : it.seriesName.includes('湿度')
                  ? '%'
                  : '°C';
              const display = Number.isFinite(value) ? `${value.toFixed(suffix === 'kg' ? 2 : 1)}${suffix}` : '--';
              return `${it.seriesName}: ${display}`;
            })
            .join('<br/>');
          return `${formatFullLabel(ts)}<br/>${rows}`;
        }
      },
      xAxis: {
        type: 'time',
        boundaryGap: false,
        axisLabel: {
          fontSize: 11,
          color: '#374151',
          hideOverlap: true,
          margin: 10,
          formatter: (value: number) =>
            dataSpan.spanMs <= 24 * 60 * 60 * 1000
              ? new Date(Number(value)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
              : formatTimeTick(Number(value), dataSpan.spanMs, { withMinute: false })
        },
        axisLine: { lineStyle: { color: '#E5E7EB' } },
        axisTick: { lineStyle: { color: '#E5E7EB' } },
        splitLine: { show: false }
      },
      yAxis: [
        {
          type: 'value',
          min: leftAxisDomain[0],
          max: leftAxisDomain[1],
          splitNumber: 4,
          axisLabel: { fontSize: 11, color: '#374151', formatter: (v: number) => `${Math.round(Number(v))}` },
          splitLine: { lineStyle: { color: '#F3F4F6' } }
        },
        {
          type: 'value',
          min: rightAxisDomain[0],
          max: rightAxisDomain[1],
          splitNumber: 4,
          axisLabel: {
            fontSize: 11,
            color: '#374151',
            formatter: (v: number) => {
              const n = Number(v);
              if (!Number.isFinite(n)) return '--';
              return n >= 100 ? `${n.toFixed(0)}kg` : `${n.toFixed(1)}kg`;
            }
          },
          splitLine: { show: false }
        }
      ],
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 18,
          bottom: 6,
          startValue,
          endValue,
          showDetail: false,
          handleSize: 18,
          handleStyle: { color: '#4F46E5', borderColor: '#4F46E5' },
          moveHandleSize: 0,
          textStyle: { fontSize: 0, color: 'transparent' },
          fillerColor: 'rgba(79, 70, 229, 0.12)',
          borderColor: '#E5E7EB',
          backgroundColor: '#F8FAFC'
        },
        {
          type: 'inside',
          xAxisIndex: 0,
          startValue,
          endValue
        }
      ],
      // 手机上用手势更友好：支持拖动查看 tooltip
      axisPointer: { type: 'line', snap: true },
      series
    };
  }, [a11ySummary, dataSpan.maxTs, dataSpan.minTs, dataSpan.spanMs, displayComparisonData, displayData, isMobile, leftAxisDomain, rightAxisDomain]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5" data-tour="trend">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            {props.title}
            {props.comparisonData && props.comparisonData.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100">
                对比模式
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {props.comparisonData ? '多时段数据叠加对比' : '箱内/箱外温湿度 + 重量复合趋势（按时间轴对齐）'}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">
            区间：{dataSpan.minTs ? formatFullLabel(dataSpan.minTs) : '--'} ~ {dataSpan.maxTs ? formatFullLabel(dataSpan.maxTs) : '--'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {props.onRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              className={`p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all ${
                isRefreshing ? 'text-indigo-600 bg-indigo-50' : ''
              }`}
              title="刷新数据"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing || props.isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {props.onDrilldown && (
            <button
              type="button"
              onClick={props.onDrilldown}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1 ml-2"
              aria-label="下钻"
            >
              下钻
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {headline ? (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-[11px] text-gray-500">区间末箱内温度</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-xl font-black text-amber-800">{headline.last.insideTemperature.toFixed(1)}°C</div>
              <div className={`text-xs font-bold ${headline.delta.insideTemp >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatDelta(headline.delta.insideTemp, 1)}°C
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-[11px] text-gray-500">区间末箱外温度</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-xl font-black text-orange-700">
                {headline.last.outsideTemperature === null ? '--' : `${headline.last.outsideTemperature.toFixed(1)}°C`}
              </div>
              <div className={`text-xs font-bold ${headline.delta.outsideTemp === null ? 'text-gray-400' : headline.delta.outsideTemp >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {headline.delta.outsideTemp === null ? '--' : `${formatDelta(headline.delta.outsideTemp, 1)}°C`}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-[11px] text-gray-500">区间末箱内湿度</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-xl font-black text-blue-800">{headline.last.insideHumidity.toFixed(1)}%</div>
              <div className={`text-xs font-bold ${headline.delta.insideHum >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatDelta(headline.delta.insideHum, 1)}%
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-[11px] text-gray-500">区间末箱外湿度</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-xl font-black text-sky-700">
                {headline.last.outsideHumidity === null ? '--' : `${headline.last.outsideHumidity.toFixed(1)}%`}
              </div>
              <div className={`text-xs font-bold ${headline.delta.outsideHum === null ? 'text-gray-400' : headline.delta.outsideHum >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {headline.delta.outsideHum === null ? '--' : `${formatDelta(headline.delta.outsideHum, 1)}%`}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-[11px] text-gray-500">区间末重量</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-xl font-black text-emerald-800">{headline.last.weight.toFixed(2)}kg</div>
              <div className={`text-xs font-bold ${headline.delta.wgt >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatDelta(headline.delta.wgt, 2)}kg
              </div>
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-5 flex flex-wrap gap-2">
            {headline.alerts.map((a, idx) => (
              <span key={`${a.label}-${idx}`} className={`px-2.5 py-1 rounded-full text-xs border ${badgeTone(a.level)}`}>
                {a.label}
              </span>
            ))}
            <span className="px-2.5 py-1 rounded-full text-xs border border-gray-200 bg-white text-gray-600">
              点图表可查看某一时刻读数
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-4 h-[420px] sm:h-72">
        {props.isLoading ? (
          <div className="h-full rounded-xl bg-gray-50 animate-pulse flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-indigo-200 animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-full rounded-xl bg-gray-50 flex flex-col items-center justify-center text-sm text-gray-500 gap-2">
            {isFutureDate() ? (
              <>
                <Info className="w-8 h-8 text-amber-300" />
                <span className="font-medium text-gray-600">无法查看未来日期</span>
                <span className="text-xs">请选择今天或之前的日期查看历史数据</span>
              </>
            ) : (
              <>
                <Info className="w-8 h-8 text-gray-300" />
                <span>当前范围暂无数据</span>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="sr-only" aria-live="polite">
              {a11ySummary}
            </div>
            {isMobile && buildEChartsOption ? (
              <Suspense fallback={<div className="h-full rounded-xl bg-gray-50 animate-pulse" />}>
                <TrendCardMobileECharts option={buildEChartsOption} a11yLabel={a11ySummary} minTs={dataSpan.minTs} maxTs={dataSpan.maxTs} />
              </Suspense>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: showDesktopBrush ? 26 : 0 }}>
                  <defs>
                    <linearGradient id="inTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="outTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fb923c" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#fb923c" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="inHum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="outHum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="wgt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="compare" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fontSize: 10 }}
                    stroke="#9ca3af"
                    minTickGap={30}
                    tickFormatter={(v) => formatTimeTick(Number(v), dataSpan.spanMs)}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10 }}
                    stroke="#9ca3af"
                    width={30}
                    domain={leftAxisDomain as [number, number]}
                    tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10 }}
                    stroke="#9ca3af"
                    width={40}
                    domain={rightAxisDomain as [number, number]}
                    tickFormatter={(v) => `${Number(v).toFixed(1)}kg`}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                    labelFormatter={(label) => `基准时间：${formatFullLabel(Number(label))}`}
                    formatter={(value: any, name: any, entry: any) => {
                      if (value === null || value === undefined || !Number.isFinite(Number(value))) {
                        return ['--', name];
                      }
                      const originalTs = entry?.payload?.originalTs;
                      const datePrefix = originalTs
                        ? `[${new Date(originalTs).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}] `
                        : '';

                      if (String(name).includes('温度')) return [`${Number(value).toFixed(1)}°C`, `${datePrefix}${name}`];
                      if (String(name).includes('湿度')) return [`${Number(value).toFixed(1)}%`, `${datePrefix}${name}`];
                      if (String(name).includes('重量')) return [`${Number(value).toFixed(2)}kg`, `${datePrefix}${name}`];
                      return [value, name];
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '0px' }} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="insideTemperature"
                    name="箱内温度"
                    stroke="#f59e0b"
                    fill="url(#inTemp)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={displayData.length < 420}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="outsideTemperature"
                    name="箱外温度"
                    stroke="#fb923c"
                    fill="url(#outTemp)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={displayData.length < 420}
                    activeDot={{ r: 3 }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="insideHumidity"
                    name="箱内湿度"
                    stroke="#3b82f6"
                    fill="url(#inHum)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={displayData.length < 420}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="outsideHumidity"
                    name="箱外湿度"
                    stroke="#60a5fa"
                    fill="url(#outHum)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={displayData.length < 420}
                    activeDot={{ r: 3 }}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="weight"
                    name="重量"
                    stroke="#10b981"
                    fill="url(#wgt)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={displayData.length < 420}
                    activeDot={{ r: 4 }}
                  />
                  {displayComparisonData?.map((compData, idx) => {
                    const dateLabel = compData.length > 0
                      ? new Date(compData[0].originalTs).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
                      : `对照组 ${idx + 1}`;

                    return (
                      <Fragment key={`comp-${idx}`}>
                        <Area
                          yAxisId="left"
                          type="monotone"
                          data={compData}
                          dataKey="insideTemperature"
                          name={`对照箱内温度 (${dateLabel})`}
                          stroke="#6366f1"
                          fill="none"
                          strokeWidth={1.5}
                          strokeDasharray="5 5"
                          dot={false}
                          connectNulls={false}
                          isAnimationActive={displayData.length < 420}
                          activeDot={{ r: 3 }}
                        />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          data={compData}
                          dataKey="insideHumidity"
                          name={`对照箱内湿度 (${dateLabel})`}
                          stroke="#818cf8"
                          fill="none"
                          strokeWidth={1}
                          strokeDasharray="3 3"
                          dot={false}
                          connectNulls={false}
                          isAnimationActive={displayData.length < 420}
                          activeDot={{ r: 2 }}
                        />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          data={compData}
                          dataKey="outsideTemperature"
                          name={`对照箱外温度 (${dateLabel})`}
                          stroke="#a78bfa"
                          fill="none"
                          strokeWidth={1}
                          strokeDasharray="6 4"
                          dot={false}
                          connectNulls={false}
                          isAnimationActive={displayData.length < 420}
                          activeDot={{ r: 2 }}
                        />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          data={compData}
                          dataKey="outsideHumidity"
                          name={`对照箱外湿度 (${dateLabel})`}
                          stroke="#c4b5fd"
                          fill="none"
                          strokeWidth={1}
                          strokeDasharray="2 3"
                          dot={false}
                          connectNulls={false}
                          isAnimationActive={displayData.length < 420}
                          activeDot={{ r: 2 }}
                        />
                      </Fragment>
                    );
                  })}
                  {showDesktopBrush ? (
                    <Brush
                      dataKey="ts"
                      height={20}
                      stroke="#cbd5e1"
                      fill="#f8fafc"
                      travellerWidth={10}
                      tickFormatter={(value) => formatTimeTick(Number(value), dataSpan.spanMs, { withMinute: false })}
                    />
                  ) : null}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </>
        )}
      </div>
    </div>
  );
};

