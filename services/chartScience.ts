import { extent, mean, deviation, rollup } from 'd3-array';
import { BeehiveData } from '../types';
import {
  buildFlowSeries,
  resolveInsideHumidity,
  resolveInsideTemperature,
  resolveOutsideHumidity,
  resolveOutsideTemperature,
  resolvePrimaryHumidity,
  resolvePrimaryTemperature
} from './hiveDataAdapter';

export type MetricKey = 'temperature' | 'humidity' | 'insideTemperature' | 'insideHumidity' | 'outsideTemperature' | 'outsideHumidity' | 'weight' | 'activity' | 'hornetsDetected';

export type MetricMeta = {
  label: string;
  unit: string;
  color: string;
};

export const METRIC_META: Record<MetricKey, MetricMeta> = {
  temperature: { label: '温度', unit: '°C', color: '#f59e0b' },
  humidity: { label: '湿度', unit: '%', color: '#2563eb' },
  insideTemperature: { label: '蜂箱里温度', unit: '°C', color: '#f59e0b' },
  insideHumidity: { label: '蜂箱里湿度', unit: '%', color: '#2563eb' },
  outsideTemperature: { label: '蜂箱外温度', unit: '°C', color: '#f59e0b' },
  outsideHumidity: { label: '蜂箱外湿度', unit: '%', color: '#2563eb' },
  weight: { label: '重量', unit: 'kg', color: '#10b981' },
  activity: { label: '活动量', unit: '次', color: '#7c3aed' },
  hornetsDetected: { label: '胡蜂数量', unit: '只', color: '#dc2626' }
};

const metricValue = (item: BeehiveData, metric: MetricKey) => {
  const safe = (value: number | null) => (value === null ? NaN : value);
  if (metric === 'temperature') return safe(resolvePrimaryTemperature(item));
  if (metric === 'humidity') return safe(resolvePrimaryHumidity(item));
  if (metric === 'insideTemperature') return safe(resolveInsideTemperature(item));
  if (metric === 'insideHumidity') return safe(resolveInsideHumidity(item));
  if (metric === 'outsideTemperature') return safe(resolveOutsideTemperature(item));
  if (metric === 'outsideHumidity') return safe(resolveOutsideHumidity(item));
  if (metric === 'activity') {
    const inVal = Number(item.beesIn);
    const outVal = Number(item.beesOut);
    if (!Number.isFinite(inVal) || !Number.isFinite(outVal)) return NaN;
    return inVal + outVal;
  }
  if (metric === 'hornetsDetected') {
    const n = Number(item.hornetsDetected);
    return Number.isFinite(n) ? n : NaN;
  }
  const n = Number(item[metric]);
  return Number.isFinite(n) ? n : NaN;
};

export const sliceByHours = (list: BeehiveData[], hours: number) => {
  const cutoff = Date.now() - hours * 3600 * 1000;
  return list.filter((it) => Number(it.timestamp) >= cutoff);
};

export const buildTrendSeries = (list: BeehiveData[], metric: MetricKey) => {
  if (metric === 'activity') {
    const flow = buildFlowSeries(
      list.map((item) => ({
        timestamp: item.timestamp,
        beesIn: item.beesIn,
        beesOut: item.beesOut
      }))
    );
    return flow.points.map((point) => [point.timestamp, Number(point.totalActivity.toFixed(4))] as [number, number]);
  }
  return list
    .map((item) => {
      const value = metricValue(item, metric);
      const ts = Number(item.timestamp);
      if (!Number.isFinite(value) || !Number.isFinite(ts)) {
        return null;
      }
      return [ts, Number(value.toFixed(4))] as [number, number];
    })
    .filter((it): it is [number, number] => Boolean(it));
};

export const buildScatterSeries = (list: BeehiveData[]) => {
  return list
    .map((item) => {
      const x = resolvePrimaryTemperature(item);
      const y = resolvePrimaryHumidity(item);
      const z = Number(item.weight);
      const ts = Number(item.timestamp);
      if (x === null || y === null || !Number.isFinite(z) || !Number.isFinite(ts)) {
        return null;
      }
      return [x, y, z, ts] as [number, number, number, number];
    })
    .filter((it): it is [number, number, number, number] => Boolean(it));
};

export const buildHeatmapSeries = (list: BeehiveData[]) => {
  const grouped = rollup(
    list,
    (values: BeehiveData[]) => values.length,
    (item: BeehiveData) => new Date(item.timestamp).getDay(),
    (item: BeehiveData) => new Date(item.timestamp).getHours()
  );
  const points: Array<[number, number, number]> = [];
  grouped.forEach((hourMap: Map<number, number>, day: number) => {
    hourMap.forEach((count: number, hour: number) => {
      points.push([hour, day, count]);
    });
  });
  return points;
};

export const buildStats = (list: BeehiveData[], metric: MetricKey) => {
  const values = list.map((it) => metricValue(it, metric)).filter((v) => Number.isFinite(v));
  const avg = values.length > 0 ? (mean(values) ?? null) : null;
  const min = values.length > 0 ? Math.min(...values) : null;
  const max = values.length > 0 ? Math.max(...values) : null;
  const std = values.length > 1 ? (deviation(values) ?? 0) : null;
  const [domainMin, domainMax] = extent(values) as [number | undefined, number | undefined];
  const hasValid = values.length > 0 && Number.isFinite(domainMin) && Number.isFinite(domainMax);
  const padding = hasValid ? Math.max(((domainMax as number) - (domainMin as number)) * 0.1, 1) : 1;
  return {
    avg,
    min,
    max,
    std,
    hasValid,
    axisMin: Number((domainMin ?? 0) - padding),
    axisMax: Number((domainMax ?? 1) + padding)
  };
};

export const validateLegend = (metric: MetricKey) => `${METRIC_META[metric].label}（${METRIC_META[metric].unit}）`;
