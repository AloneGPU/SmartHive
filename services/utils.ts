import { BeehiveData } from '../types';

export const lttbSampleIndexes = (x: number[], y: number[], threshold: number) => {
  const n = x.length;
  if (threshold >= n || threshold === 0) return Array.from({ length: n }, (_, i) => i);
  if (threshold === 2) return [0, n - 1];

  const sampled: number[] = [];
  const every = (n - 2) / (threshold - 2);
  let a = 0;
  sampled.push(a);

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * every) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * every) + 1, n);

    const avgRangeStart = Math.floor((i + 2) * every) + 1;
    const avgRangeEnd = Math.min(Math.floor((i + 3) * every) + 1, n);

    let avgX = 0;
    let avgY = 0;
    const avgRangeLength = Math.max(1, avgRangeEnd - avgRangeStart);
    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      avgX += x[j];
      avgY += y[j];
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    let maxArea = -1;
    let nextA = rangeStart;
    const ax = x[a];
    const ay = y[a];
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((ax - avgX) * (y[j] - ay) - (ax - x[j]) * (avgY - ay)) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        nextA = j;
      }
    }

    sampled.push(nextA);
    a = nextA;
  }

  sampled.push(n - 1);
  return sampled;
};

export const downsampleBeehiveData = (points: BeehiveData[], threshold: number) => {
  if (points.length <= threshold) {
    return { points, sample: { mode: 'none' as const, rawCount: points.length, returnedCount: points.length } };
  }
  const xs = points.map((p) => Number(p.timestamp));
  const temps = points.map((p) => Number(p.temperature ?? 0));
  const hums = points.map((p) => Number(p.humidity ?? 0));
  const weights = points.map((p) => Number(p.weight ?? 0));

  const meanStd = (arr: number[]) => {
    const n = arr.length;
    const m = arr.reduce((s, v) => s + v, 0) / Math.max(1, n);
    const v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, n);
    const std = Math.sqrt(v) || 1;
    return { m, std };
  };
  const t = meanStd(temps);
  const h = meanStd(hums);
  const w = meanStd(weights);
  const composite = points.map((p) => {
    const tv = (Number(p.temperature ?? 0) - t.m) / t.std;
    const hv = (Number(p.humidity ?? 0) - h.m) / h.std;
    const wv = (Number(p.weight ?? 0) - w.m) / w.std;
    return tv + hv + wv;
  });

  const idx = lttbSampleIndexes(xs, composite, threshold);
  const sampled = idx.map((i) => points[i]);
  return {
    points: sampled,
    sample: { mode: 'lttb' as const, rawCount: points.length, returnedCount: sampled.length }
  };
};

export const parseTzOffsetMinutes = (tzRaw: unknown) => {
  const tz = typeof tzRaw === 'string' ? tzRaw.trim() : '';
  if (!tz) return 480;
  if (tz === 'Asia/Shanghai') return 480;
  const m = tz.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const hh = Number(m[2]);
    const mm = Number(m[3]);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      return sign * (hh * 60 + mm);
    }
  }
  return 480;
};

export const parseMonthParam = (month: unknown) => {
  if (typeof month !== 'string') return null;
  const m = month.trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(mon) || mon < 1 || mon > 12) return null;
  return { year, mon, text: `${m[1]}-${m[2]}` };
};

export const parseDateParam = (date: unknown) => {
  if (typeof date !== 'string') return null;
  const m = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(mon) || !Number.isFinite(day)) return null;
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  return { year, mon, day, text: `${m[1]}-${m[2]}-${m[3]}` };
};

export const toUtcRangeForLocalMonth = (year: number, mon: number, tzOffsetMinutes: number) => {
  const offsetMs = tzOffsetMinutes * 60 * 1000;
  const startLocalUtcMs = Date.UTC(year, mon - 1, 1, 0, 0, 0, 0);
  const nextLocalUtcMs = Date.UTC(year, mon, 1, 0, 0, 0, 0);
  return {
    startMs: startLocalUtcMs - offsetMs,
    endMs: nextLocalUtcMs - offsetMs
  };
};

export const toUtcRangeForLocalDay = (year: number, mon: number, day: number, tzOffsetMinutes: number) => {
  const offsetMs = tzOffsetMinutes * 60 * 1000;
  const startLocalUtcMs = Date.UTC(year, mon - 1, day, 0, 0, 0, 0);
  return {
    startMs: startLocalUtcMs - offsetMs,
    endMs: startLocalUtcMs - offsetMs + 86400000
  };
};

export const hexToAscii = (hex: string) => {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  let result = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isNaN(code)) {
      result += String.fromCharCode(code);
    }
  }
  return result;
};

export const parseNmeaCoord = (raw: string, hemi: string, isLat: boolean) => {
  if (!raw || !hemi) return null;
  const degLength = isLat ? 2 : 3;
  const degrees = parseInt(raw.slice(0, degLength), 10);
  const minutes = parseFloat(raw.slice(degLength));
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null;
  let value = degrees + minutes / 60;
  if (hemi === 'S' || hemi === 'W') value = -value;
  return value;
};

export const extractNmeaSentences = (text: string) => {
  const results: string[] = [];
  const parts = text.split('$').slice(1);
  for (const part of parts) {
    const line = part.split(/\r?\n/)[0];
    if (line) results.push(`$${line}`);
  }
  return results;
};

export const parseNmeaFromText = (text: string) => {
  const sentences = extractNmeaSentences(text);
  const findSentence = (type: 'RMC' | 'GGA' | 'GLL') => {
    return sentences.find(s => s.length > 6 && s.slice(3, 6) === type);
  };
  const tryParse = (type: 'RMC' | 'GGA' | 'GLL') => {
    const line = findSentence(type);
    if (!line) return null;
    const fields = line.split(',');
    if (type === 'RMC') {
      if (fields[2] !== 'A') return null;
      const lat = parseNmeaCoord(fields[3], fields[4], true);
      const lon = parseNmeaCoord(fields[5], fields[6], false);
      if (lat === null || lon === null) return null;
      return { lat, lon };
    }
    if (type === 'GGA') {
      const fix = parseInt(fields[6], 10);
      if (!Number.isFinite(fix) || fix <= 0) return null;
      const lat = parseNmeaCoord(fields[2], fields[3], true);
      const lon = parseNmeaCoord(fields[4], fields[5], false);
      if (lat === null || lon === null) return null;
      return { lat, lon };
    }
    if (type === 'GLL') {
      if (fields[6] !== 'A') return null;
      const lat = parseNmeaCoord(fields[1], fields[2], true);
      const lon = parseNmeaCoord(fields[3], fields[4], false);
      if (lat === null || lon === null) return null;
      return { lat, lon };
    }
    return null;
  };
  return tryParse('RMC') || tryParse('GGA') || tryParse('GLL');
};
