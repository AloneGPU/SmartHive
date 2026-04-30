import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';

export default function TrendCardMobileECharts(props: {
  option: any;
  a11yLabel: string;
  minTs: number;
  maxTs: number;
}) {
  const echartsRef = useRef<ReactECharts>(null);
  type LegendItem = { name: string; color: string };
  const legendItems = useMemo(() => {
    const names = new Set<string>();
    return Array.isArray(props.option?.series)
      ? props.option.series
          .map((series: any) => ({
            name: String(series?.name || '').trim(),
            color: String(series?.lineStyle?.color || series?.itemStyle?.color || '#4F46E5')
          }))
          .filter((item: LegendItem) => {
            if (!item.name || names.has(item.name)) return false;
            names.add(item.name);
            return true;
          })
      : [];
  }, [props.option?.series]);
  const [hiddenLegends, setHiddenLegends] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHiddenLegends({});
  }, [props.option]);

  const zoomBy = (ratio: number) => {
    const inst = echartsRef.current?.getEchartsInstance?.();
    if (!inst) return;
    const opt = inst.getOption() as any;
    const dz = Array.isArray(opt?.dataZoom) ? opt.dataZoom[0] : null;
    const startValue = Number(dz?.startValue ?? props.minTs);
    const endValue = Number(dz?.endValue ?? props.maxTs);
    const center = (startValue + endValue) / 2;
    const nextHalf = Math.max(30 * 60 * 1000, (endValue - startValue) * ratio / 2);
    const nextStart = Math.max(props.minTs, Math.round(center - nextHalf));
    const nextEnd = Math.min(props.maxTs, Math.round(center + nextHalf));
    inst.dispatchAction({ type: 'dataZoom', startValue: nextStart, endValue: nextEnd });
  };

  const resetZoom = () => {
    const inst = echartsRef.current?.getEchartsInstance?.();
    if (!inst) return;
    inst.dispatchAction({ type: 'dataZoom', startValue: props.minTs, endValue: props.maxTs });
  };

  const toggleLegend = (name: string) => {
    const inst = echartsRef.current?.getEchartsInstance?.();
    if (!inst) return;
    inst.dispatchAction({ type: 'legendToggleSelect', name });
    setHiddenLegends((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const compactLegendLabel = (name: string) => {
    return name
      .replace('箱内温度', '箱内温')
      .replace('箱外温度', '箱外温')
      .replace('箱内湿度', '箱内湿')
      .replace('箱外湿度', '箱外湿')
      .replace('对照箱内温度', '对照内温')
      .replace('对照箱内湿度', '对照内湿')
      .replace('对照箱外温度', '对照外温')
      .replace('对照箱外湿度', '对照外湿');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => zoomBy(0.8)}
          className="h-10 px-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold text-sm active:scale-95"
          aria-label="放大趋势图"
        >
          放大
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1.25)}
          className="h-10 px-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold text-sm active:scale-95"
          aria-label="缩小趋势图"
        >
          缩小
        </button>
        <button
          type="button"
          onClick={resetZoom}
          className="h-10 px-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold text-sm active:scale-95"
          aria-label="重置趋势图缩放"
        >
          重置
        </button>
        <div className="ml-auto text-[11px] text-gray-400">双指缩放，点线看读数</div>
      </div>
      {legendItems.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {legendItems.map((item: LegendItem) => {
            const isHidden = Boolean(hiddenLegends[item.name]);
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => toggleLegend(item.name)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  isHidden ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-gray-200 bg-white text-gray-700'
                }`}
                aria-pressed={!isHidden}
                aria-label={`切换${item.name}显示`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: isHidden ? '#D1D5DB' : item.color }}
                />
                <span>{compactLegendLabel(item.name)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="rounded-2xl border border-gray-100 bg-white p-2">
        <div className="h-[360px]" role="img" aria-label={props.a11yLabel}>
          <ReactECharts
            ref={echartsRef}
            option={props.option}
            style={{ width: '100%', height: '100%' }}
            notMerge
            lazyUpdate
            opts={{ renderer: 'canvas' }}
          />
        </div>
      </div>
    </div>
  );
}

