import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { FilterBar } from '../components/refactor/FilterBar';
import { fetchHiveRangeData, getFriendlyErrorMessage } from '../services/dataService';
import { DataAnalysisPanel } from '../components/DataAnalysisPanel';
import { DetailedAnalytics } from '../components/DetailedAnalytics';
import { BehaviorInsights } from '../components/BehaviorInsights';
import { ProductivityHarvestDashboard } from '../components/ProductivityHarvestDashboard';
import { MetricKey } from '../services/chartScience';
import { useLiveHiveQuery } from '../hooks/useHiveData';

const parsePreset = (v: string | null) => {
  if (v === '24h' || v === '31d') return v;
  return '7d' as const;
};

const parseDimension = (v: string | null): MetricKey => {
  if (
    v === 'temperature' ||
    v === 'humidity' ||
    v === 'insideTemperature' ||
    v === 'insideHumidity' ||
    v === 'outsideTemperature' ||
    v === 'outsideHumidity' ||
    v === 'weight' ||
    v === 'activity'
  ) {
    return v;
  }
  return 'weight';
};

export const BreakdownPage = () => {
  const { aiConfig, hiveConfig, handleUpdateHiveConfig } = useAppContext();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();

  const preset = parsePreset(sp.get('range'));
  const riskFilter = sp.get('risk') || 'all';
  const dimension = parseDimension(sp.get('dimension'));
  const now = Date.now();
  const rangeMs = preset === '31d' ? 31 * 864e5 : preset === '24h' ? 864e5 : 7 * 864e5;
  const startMs = Number(sp.get('start')) || now - rangeMs;
  const endMs = Number(sp.get('end')) || now;

  const baseUrl = aiConfig.apiBaseUrl || '/api';
  const token = aiConfig.apiToken;

  const rangeQuery = useQuery({
    queryKey: ['range', baseUrl, token, startMs, endMs, 'breakdown'],
    queryFn: () => fetchHiveRangeData(baseUrl, token, startMs, endMs, 5000, 0),
    enabled: Boolean(token),
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  });
  const liveQuery = useLiveHiveQuery();

  const onPresetChange = (next: '24h' | '7d' | '31d') => {
    const n = Date.now();
    const ms = next === '31d' ? 31 * 864e5 : next === '7d' ? 7 * 864e5 : 864e5;
    setSp({ range: next, start: String(n - ms), end: String(n), risk: riskFilter, dimension });
  };

  const onRefresh = () => {
    void liveQuery.refetch();
    void rangeQuery.refetch();
  };

  const latestInRange = useMemo(() => {
    const list = rangeQuery.data || [];
    return list.length ? list[list.length - 1] : null;
  }, [rangeQuery.data]);
  const currentLive = liveQuery.data || null;
  const currentData = currentLive || latestInRange;

  const onGoDetail = useMemo(() => {
    return (date: Date) => {
      const query = `date=${date.toISOString().slice(0, 10)}&range=${preset}&start=${startMs}&end=${endMs}&dimension=${dimension}&risk=${riskFilter}&from=${encodeURIComponent(`?range=${preset}&start=${startMs}&end=${endMs}&dimension=${dimension}&risk=${riskFilter}`)}`;
      navigate(`/detail/${dimension}?${query}`);
    };
  }, [dimension, endMs, navigate, preset, riskFilter, startMs]);

  const quickFilters = [
    { id: 'all', label: '全部' },
    { id: 'hornet', label: '马蜂异常' },
    { id: 'env', label: '环境异常' }
  ];
  const dimensionOptions: Array<{ id: MetricKey; label: string }> = [
    { id: 'temperature', label: '温度' },
    { id: 'humidity', label: '湿度' },
    { id: 'insideTemperature', label: '蜂箱里温度' },
    { id: 'insideHumidity', label: '蜂箱里湿度' },
    { id: 'outsideTemperature', label: '蜂箱外温度' },
    { id: 'outsideHumidity', label: '蜂箱外湿度' },
    { id: 'weight', label: '重量' },
    { id: 'activity', label: '活动量' }
  ];
  const activeRiskLabel = quickFilters.find((it) => it.id === riskFilter)?.label || '全部';
  const summaryItems = [`维度:${dimensionOptions.find((it) => it.id === dimension)?.label || '重量'}`, `范围:${preset}`, `筛选:${activeRiskLabel}`];
  const errorMessage = rangeQuery.isError ? getFriendlyErrorMessage(rangeQuery.error, '细分数据加载失败') : '';

  const onQuickFilterToggle = (id: string) => {
    setSp({ range: preset, start: String(startMs), end: String(endMs), risk: id, dimension });
  };

  const onClearFilters = () => {
    const n = Date.now();
    setSp({ range: '7d', start: String(n - 7 * 864e5), end: String(n), risk: 'all', dimension: 'weight' });
  };

  const onDimensionChange = (next: MetricKey) => {
    setSp({ range: preset, start: String(startMs), end: String(endMs), risk: riskFilter, dimension: next });
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ ts?: number }>).detail;
      if (!detail?.ts) return;
      onGoDetail(new Date(detail.ts));
    };
    window.addEventListener('smarthive:drilldown', handler as EventListener);
    return () => window.removeEventListener('smarthive:drilldown', handler as EventListener);
  }, [onGoDetail]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <h1 className="text-lg sm:text-xl font-bold text-gray-900">指标细分</h1>

      <FilterBar
        preset={preset}
        start={new Date(startMs)}
        end={new Date(endMs)}
        onPresetChange={onPresetChange}
        onRefresh={onRefresh}
        quickFilters={quickFilters}
        activeQuickFilterIds={[riskFilter]}
        onQuickFilterToggle={onQuickFilterToggle}
        summaryItems={summaryItems}
        onClearFilters={onClearFilters}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-indigo-50 border border-indigo-100 rounded-2xl p-4 sm:p-5">
          <div className="text-sm font-semibold text-indigo-900">快速上手</div>
          <div className="mt-2 text-sm text-indigo-800 space-y-1">
            <div>1. 先看“实时读数”和“当前值/均值/最小值/最大值/标准差”。</div>
            <div>2. 再看趋势图，点击任一点可直接下钻到详情。</div>
            <div>3. 最后查看“周内活跃分布”和“行为洞察”判断行为变化。</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">维度切换</div>
          <select
            value={dimension}
            onChange={(e) => onDimensionChange(e.target.value as MetricKey)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white"
            aria-label="维度切换"
          >
            {dimensionOptions.map((it) => (
              <option key={it.id} value={it.id}>
                {it.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{errorMessage}</span>
          <button type="button" onClick={onRefresh} className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700">
            重试
          </button>
        </div>
      ) : null}

      <div className="space-y-6">
        <DataAnalysisPanel
          historyData={rangeQuery.data || []}
          currentData={currentData}
          timeRange={preset}
          metric={dimension}
          onMetricChange={onDimensionChange}
          onRefresh={onRefresh}
        />
        <DetailedAnalytics historyData={rangeQuery.data || []} currentData={currentData} timeRange={preset} />
        <div className="grid grid-cols-1 gap-6">
          <BehaviorInsights historyData={rangeQuery.data || []} currentData={currentData} />
          <ProductivityHarvestDashboard 
            hiveConfig={hiveConfig} 
            currentWeight={Number.isFinite(Number(currentData?.weight)) ? Number(currentData?.weight) : null} 
            onUpdateConfig={handleUpdateHiveConfig} 
            historyData={rangeQuery.data || []} 
          />
        </div>
        <div className="text-xs text-gray-500">你可以在“数据详情”页按日历下钻查看每日趋势。</div>
        <button
          type="button"
          onClick={() => onGoDetail(new Date())}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium"
          aria-label="查看今日详情"
        >
          查看今日详情
        </button>
      </div>
    </motion.div>
  );
};

