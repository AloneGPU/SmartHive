import { BeehiveData } from '../types';

export type FlowRowInput = {
  timestamp: unknown;
  beesIn: unknown;
  beesOut: unknown;
};

export type FlowMode = 'raw' | 'counter-delta';

export type FlowPoint = {
  timestamp: number;
  beesIn: number;
  beesOut: number;
  totalActivity: number;
  netActivity: number;
};

export const toFiniteNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const resolveInsideTemperature = (row: Partial<BeehiveData> | null | undefined): number | null => {
  const inside = toFiniteNumber(row?.insideTemperature);
  if (inside !== null) return inside;
  return toFiniteNumber(row?.temperature);
};

export const resolveInsideHumidity = (row: Partial<BeehiveData> | null | undefined): number | null => {
  const inside = toFiniteNumber(row?.insideHumidity);
  if (inside !== null) return inside;
  return toFiniteNumber(row?.humidity);
};

export const resolveOutsideTemperature = (row: Partial<BeehiveData> | null | undefined): number | null =>
  toFiniteNumber(row?.outsideTemperature);

export const resolveOutsideHumidity = (row: Partial<BeehiveData> | null | undefined): number | null =>
  toFiniteNumber(row?.outsideHumidity);

export const resolvePrimaryTemperature = (row: Partial<BeehiveData> | null | undefined): number | null => {
  return resolveInsideTemperature(row) ?? resolveOutsideTemperature(row);
};

export const resolvePrimaryHumidity = (row: Partial<BeehiveData> | null | undefined): number | null => {
  return resolveInsideHumidity(row) ?? resolveOutsideHumidity(row);
};

const isCounterLike = (values: number[]) => {
  if (values.length < 4) return false;
  let nonDecreasingCount = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] >= values[i - 1]) nonDecreasingCount += 1;
  }
  const trendRatio = nonDecreasingCount / Math.max(1, values.length - 1);
  const maxValue = Math.max(...values);
  const span = Math.max(...values) - Math.min(...values);
  return trendRatio >= 0.85 && maxValue >= 30 && span >= 8;
};

const normalizeCounterSeries = (values: number[], counterLike: boolean) => {
  if (!counterLike) return values.map((v) => Math.max(0, v));
  return values.map((v, i) => {
    if (i === 0) return 0;
    const prev = values[i - 1];
    if (!Number.isFinite(prev)) return 0;
    const diff = v - prev;
    return diff > 0 ? diff : 0;
  });
};

export const buildFlowSeries = (rows: FlowRowInput[]): { mode: FlowMode; points: FlowPoint[] } => {
  const ordered = rows
    .map((row) => {
      const timestamp = toFiniteNumber(row.timestamp);
      const beesIn = toFiniteNumber(row.beesIn);
      const beesOut = toFiniteNumber(row.beesOut);
      if (timestamp === null || beesIn === null || beesOut === null) return null;
      return { timestamp, beesIn, beesOut };
    })
    .filter((row): row is { timestamp: number; beesIn: number; beesOut: number } => Boolean(row))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (ordered.length === 0) {
    return { mode: 'raw', points: [] };
  }

  const inValues = ordered.map((row) => row.beesIn);
  const outValues = ordered.map((row) => row.beesOut);
  const inCounter = isCounterLike(inValues);
  const outCounter = isCounterLike(outValues);
  const normalizedIn = normalizeCounterSeries(inValues, inCounter);
  const normalizedOut = normalizeCounterSeries(outValues, outCounter);

  const points = ordered.map((row, index) => {
    const beesIn = normalizedIn[index];
    const beesOut = normalizedOut[index];
    return {
      timestamp: row.timestamp,
      beesIn,
      beesOut,
      totalActivity: beesIn + beesOut,
      netActivity: beesIn - beesOut
    };
  });

  return { mode: inCounter || outCounter ? 'counter-delta' : 'raw', points };
};

