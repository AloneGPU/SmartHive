import { useEffect, useMemo, useState } from 'react';

type Step = { id: string; title: string; body: string; selector: string };

const storageKey = 'SMART_HIVE_TOUR_DONE';

export const OnboardingTour = () => {
  const steps = useMemo<Step[]>(
    () => [
      { id: 'filter', title: '第一步：选择范围', body: '用这里快速切换近24小时/7天/31天，并一键刷新数据。', selector: '[data-tour="filter"]' },
      { id: 'kpis', title: '第二步：看核心指标', body: '这些卡片展示关键指标，帮助你快速判断当前状态。', selector: '[data-tour="kpis"]' },
      { id: 'trend', title: '第三步：hover + 下钻', body: '图表默认支持 tooltip。点击“下钻”进入更详细分析。', selector: '[data-tour="trend"]' }
    ],
    []
  );
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(storageKey);
    if (done === 'true') return;
    const t = setTimeout(() => setOpen(true), 500);
    return () => clearTimeout(t);
  }, []);

  const step = steps[idx];
  const rect = useMemo(() => {
    if (!open) return null;
    const el = document.querySelector(step.selector);
    if (!el) return null;
    const r = (el as HTMLElement).getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, [open, step.selector, idx]);

  const close = () => {
    localStorage.setItem(storageKey, 'true');
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-label="新手引导" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      {rect ? (
        <div
          className="absolute rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
          style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12 }}
        />
      ) : null}
      <div className="absolute left-1/2 top-10 w-[92vw] max-w-lg -translate-x-1/2 rounded-2xl bg-white shadow-xl border border-gray-100 p-5">
        <div className="text-sm font-semibold text-gray-900">{step.title}</div>
        <div className="mt-2 text-sm text-gray-600 leading-relaxed">{step.body}</div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-gray-500">{idx + 1} / {steps.length}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={close}
              className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              aria-label="跳过引导"
            >
              跳过
            </button>
            <button
              type="button"
              onClick={() => {
                if (idx >= steps.length - 1) {
                  close();
                } else {
                  setIdx((v) => v + 1);
                }
              }}
              className="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700"
              aria-label={idx >= steps.length - 1 ? '完成引导' : '下一步'}
            >
              {idx >= steps.length - 1 ? '完成' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

