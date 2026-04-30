export const downsampleSequence = <T>(list: T[], maxPoints: number): T[] => {
  if (!Array.isArray(list)) return [];
  const safeMax = Number.isFinite(maxPoints) ? Math.max(3, Math.floor(maxPoints)) : 300;
  if (list.length <= safeMax) return list;

  const lastIndex = list.length - 1;
  const indices = new Set<number>();
  indices.add(0);
  indices.add(lastIndex);

  for (let i = 1; i < safeMax - 1; i += 1) {
    const idx = Math.round((i * lastIndex) / (safeMax - 1));
    if (idx > 0 && idx < lastIndex) {
      indices.add(idx);
    }
  }

  return Array.from(indices)
    .sort((a, b) => a - b)
    .map((idx) => list[idx]);
};

export const computePaddedDomain = (
  values: Array<number | null | undefined>,
  options: { ratio?: number; minPadding?: number } = {}
): [number, number] | null => {
  const finite = values
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;

  let min = finite[0];
  let max = finite[0];
  for (const value of finite) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const ratio = Number.isFinite(options.ratio) ? Math.max(0, Number(options.ratio)) : 0.12;
  const minPadding = Number.isFinite(options.minPadding) ? Math.max(0, Number(options.minPadding)) : 1;
  const span = max - min;
  const padding = span > 0 ? Math.max(span * ratio, minPadding) : Math.max(Math.abs(max) * 0.08, minPadding);
  return [min - padding, max + padding];
};

export const formatTimeTick = (ts: number, spanMs: number, options: { withMinute?: boolean } = {}) => {
  const date = new Date(ts);
  const withMinute = options.withMinute ?? true;
  if (spanMs <= 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: withMinute ? '2-digit' : undefined });
  }
  if (spanMs <= 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit' });
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

