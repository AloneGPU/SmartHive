import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { LayoutGrid, Calendar as CalendarIcon, Layers, Info, Activity, MapPin, ShieldAlert, Weight } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { CalendarSelector } from '../components/CalendarSelector';
import { TrendCard } from '../components/refactor/TrendCard';
import { fetchCalendarSummary, fetchHiveRangeData, getFriendlyErrorMessage } from '../services/dataService';
import { useLiveHiveQuery } from '../hooks/useHiveData';
import {
  resolveInsideHumidity,
  resolveInsideTemperature,
  resolveOutsideHumidity,
  resolveOutsideTemperature,
  resolvePrimaryHumidity,
  resolvePrimaryTemperature
} from '../services/hiveDataAdapter';

const formatYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatYM = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const parseDateYMD = (s: string | null) => {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(mon) || !Number.isFinite(day)) return null;
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  return new Date(year, mon - 1, day);
};

export const DetailPage = () => {
  const { aiConfig, location } = useAppContext();
  const navigate = useNavigate();
  const { entityId: entityIdFromPath } = useParams();
  const [sp, setSp] = useSearchParams();
  const entityId = entityIdFromPath || sp.get('entityId') || 'default';
  
  const initialStart = parseDateYMD(sp.get('start')) || parseDateYMD(sp.get('date')) || new Date();
  const initialEnd = parseDateYMD(sp.get('end')) || initialStart;
  
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initialStart.getFullYear(), initialStart.getMonth(), 1));
  
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareStartDate, setCompareStartDate] = useState<Date | null>(null);
  const [compareEndDate, setCompareEndDate] = useState<Date | null>(null);
  const [selectingCompare, setSelectingCompare] = useState(false);

  const applyPreset = (daysOffset: number) => {
    const s = new Date(startDate.getTime() - daysOffset * 864e5);
    const e = new Date(endDate.getTime() - daysOffset * 864e5);
    setCompareStartDate(s);
    setCompareEndDate(e);
    setIsCompareMode(true);
    setSelectingCompare(false);
  };

  const baseUrl = aiConfig.apiBaseUrl || '/api';
  const token = aiConfig.apiToken;
  const tz = 'Asia/Shanghai';
  const liveQuery = useLiveHiveQuery();

  const monthYm = formatYM(visibleMonth);

  const startMs = startDate.getTime();
  const endMs = endDate.getTime() + 864e5 - 1; // 包含结束当天的全部时间

  const rangeQuery = useQuery({
    queryKey: ['range-detail', baseUrl, token, startMs, endMs],
    queryFn: () => fetchHiveRangeData(baseUrl, token, startMs, endMs, 5000, 0),
    enabled: Boolean(token),
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  });

  const compareQuery = useQuery({
    queryKey: ['range-compare', baseUrl, token, compareStartDate?.getTime(), compareEndDate?.getTime()],
    queryFn: () => {
      if (!compareStartDate || !compareEndDate) return [];
      const s = compareStartDate.getTime();
      const e = compareEndDate.getTime() + 864e5 - 1;
      return fetchHiveRangeData(baseUrl, token, s, e, 5000, 0);
    },
    enabled: Boolean(token && isCompareMode && compareStartDate && compareEndDate),
  });

  const monthQuery = useQuery({
    queryKey: ['calendar-summary', baseUrl, token, monthYm, tz],
    queryFn: () => fetchCalendarSummary(baseUrl, token, monthYm, tz),
    enabled: Boolean(token),
    refetchInterval: 30000,
    refetchIntervalInBackground: true
  });

  const hasDataOnDate = useMemo(() => {
    const index = new Set<string>((monthQuery.data?.days || []).map((d) => d.date));
    return (date: Date) => {
      const key = formatYMD(date);
      return index.has(key);
    };
  }, [monthQuery.data?.days]);

  const onRangeSelect = (start: Date, end: Date) => {
    if (selectingCompare) {
      setCompareStartDate(start);
      setCompareEndDate(end);
      return;
    }
    setStartDate(start);
    setEndDate(end);
    setVisibleMonth(new Date(start.getFullYear(), start.getMonth(), 1));
    setSp({ ...Object.fromEntries(sp), start: formatYMD(start), end: formatYMD(end) });
  };

  const points = rangeQuery.data || [];
  const latest = points.length > 0 ? points[points.length - 1] : null;
  const liveData = liveQuery.data || null;
  const liveInsideTemperature = resolveInsideTemperature(liveData);
  const liveOutsideTemperature = resolveOutsideTemperature(liveData);
  const liveInsideHumidity = resolveInsideHumidity(liveData);
  const liveOutsideHumidity = resolveOutsideHumidity(liveData);
  const liveWeight = liveData && Number.isFinite(Number(liveData.weight)) ? Number(liveData.weight) : null;
  const liveHornets = liveData && Number.isFinite(Number(liveData.hornetsDetected)) ? Number(liveData.hornetsDetected) : null;
  const liveLocationText = Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    ? ((location.address || '').trim() || `蜂箱位置 - ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`)
    : '暂无定位';
  const formatLiveUpdatedAt = (timestamp?: number | null) => {
    if (!timestamp || !Number.isFinite(timestamp)) return '暂无';
    const diff = Date.now() - timestamp;
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const notes = useMemo(() => {
    if (!latest) return [];
    const list: Array<{ level: 'warn' | 'error'; message: string }> = [];
    const hornets = Number(latest.hornetsDetected);
    const insideTemperature = resolveInsideTemperature(latest);
    const outsideTemperature = resolveOutsideTemperature(latest);
    const insideHumidity = resolveInsideHumidity(latest);
    const outsideHumidity = resolveOutsideHumidity(latest);
    const temperature = resolvePrimaryTemperature(latest);
    const humidity = resolvePrimaryHumidity(latest);
    const hasSplitEnv =
      insideTemperature !== null || outsideTemperature !== null || insideHumidity !== null || outsideHumidity !== null;
    if (Number.isFinite(hornets) && hornets > 0) {
      list.push({ level: 'error', message: `检测到马蜂 ${hornets.toFixed(0)} 只，建议检查蜂箱入口与防护。` });
    }
    if (insideTemperature !== null && (insideTemperature > 38 || insideTemperature < 10)) {
      list.push({ level: 'warn', message: `区间末箱内温度 ${insideTemperature.toFixed(1)}°C 偏离建议区间。` });
    }
    if (outsideTemperature !== null && (outsideTemperature > 40 || outsideTemperature < 0)) {
      list.push({ level: 'warn', message: `区间末箱外温度 ${outsideTemperature.toFixed(1)}°C 偏离建议区间。` });
    }
    if (insideHumidity !== null && (insideHumidity > 85 || insideHumidity < 30)) {
      list.push({ level: 'warn', message: `区间末箱内湿度 ${insideHumidity.toFixed(1)}% 偏离建议区间。` });
    }
    if (outsideHumidity !== null && (outsideHumidity > 90 || outsideHumidity < 30)) {
      list.push({ level: 'warn', message: `区间末箱外湿度 ${outsideHumidity.toFixed(1)}% 偏离建议区间。` });
    }
    if (!hasSplitEnv && temperature !== null && (temperature > 38 || temperature < 10)) {
      list.push({ level: 'warn', message: `区间末温度 ${temperature.toFixed(1)}°C 偏离建议区间。` });
    }
    if (!hasSplitEnv && humidity !== null && (humidity > 85 || humidity < 30)) {
      list.push({ level: 'warn', message: `区间末湿度 ${humidity.toFixed(1)}% 偏离建议区间。` });
    }
    if (list.length === 0 && !Number.isFinite(hornets) && temperature === null && humidity === null) {
      list.push({ level: 'warn', message: '区间末采样点关键指标缺失，无法生成风险提示。' });
    }
    return list;
  }, [latest]);

  const rangeError = rangeQuery.isError ? getFriendlyErrorMessage(rangeQuery.error, '范围数据加载失败') : '';
  const from = sp.get('from') || '';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div className="text-xs text-gray-500 flex items-center justify-between">
        <div>
          <button type="button" onClick={() => navigate('/overview')} className="hover:text-gray-700">
            总览
          </button>
          <span className="mx-1">/</span>
          <button type="button" onClick={() => navigate(`/breakdown${from}`)} className="hover:text-gray-700">
            细分
          </button>
          <span className="mx-1">/</span>
          <span className="text-gray-700">详情</span>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-indigo-600" />
          数据分析详情
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsCompareMode(!isCompareMode);
              if (!isCompareMode) {
                setSelectingCompare(true);
              } else {
                setSelectingCompare(false);
                setCompareStartDate(null);
                setCompareEndDate(null);
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
              isCompareMode ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Layers className="w-4 h-4" />
            {isCompareMode ? '退出对比' : '开启对比'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Info className="w-4 h-4 text-gray-400" />
            数据摘要
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
            <div className="text-xs text-gray-500">对象 ID</div>
            <div className="mt-1 font-semibold text-gray-900">{entityId}</div>
          </div>
          <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
            <div className="text-xs text-gray-500">当前区间</div>
            <div className="mt-1 font-semibold text-gray-900 flex items-center gap-1">
              {formatYMD(startDate)}
              {startDate.getTime() !== endDate.getTime() && ` ~ ${formatYMD(endDate)}`}
            </div>
          </div>
          <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
            <div className="text-xs text-gray-500">数据量</div>
            <div className="mt-1 font-semibold text-gray-900">
              {rangeQuery.data?.length ?? 0} 个采样点
            </div>
          </div>
        </div>
      </div>

      {rangeError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{rangeError}</span>
          <button type="button" onClick={() => void rangeQuery.refetch()} className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700">
            重试
          </button>
        </div>
      ) : null}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-900">实时当前值</div>
          <div className="text-xs text-gray-500">最后更新：{formatLiveUpdatedAt(liveData?.timestamp)}</div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 text-sm">
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
            <div className="text-xs text-amber-700 flex items-center gap-1"><Activity className="w-3.5 h-3.5" />箱内温湿度</div>
            <div className="mt-1 font-semibold text-gray-900">
              {liveInsideTemperature === null ? '--' : `${liveInsideTemperature.toFixed(1)}°C`} / {liveInsideHumidity === null ? '--' : `${liveInsideHumidity.toFixed(0)}%`}
            </div>
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
            <div className="text-xs text-blue-700 flex items-center gap-1"><Activity className="w-3.5 h-3.5" />箱外温湿度</div>
            <div className="mt-1 font-semibold text-gray-900">
              {liveOutsideTemperature === null ? '--' : `${liveOutsideTemperature.toFixed(1)}°C`} / {liveOutsideHumidity === null ? '--' : `${liveOutsideHumidity.toFixed(0)}%`}
            </div>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
            <div className="text-xs text-emerald-700 flex items-center gap-1"><Weight className="w-3.5 h-3.5" />当前重量</div>
            <div className="mt-1 font-semibold text-gray-900">{liveWeight === null ? '--' : `${liveWeight.toFixed(2)} kg`}</div>
          </div>
          <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
            <div className="text-xs text-rose-700 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" />胡蜂预警</div>
            <div className="mt-1 font-semibold text-gray-900">{liveHornets === null ? '--' : `${liveHornets.toFixed(0)} 只`}</div>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
            <div className="text-xs text-slate-600 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />当前定位</div>
            <div className="mt-1 font-semibold text-gray-900 break-words">{liveLocationText}</div>
          </div>
        </div>
        {liveQuery.isError ? (
          <div className="mt-3 text-xs text-red-600">实时数据获取失败：{getFriendlyErrorMessage(liveQuery.error, '实时数据获取失败')}</div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className={`p-4 rounded-2xl border transition-all ${selectingCompare ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-100' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <CalendarIcon className={`w-4 h-4 ${selectingCompare ? 'text-indigo-600' : 'text-gray-400'}`} />
                {selectingCompare ? '正在选择对照区间' : '选择主分析区间'}
              </h3>
              {isCompareMode && (
                <button
                  onClick={() => setSelectingCompare(!selectingCompare)}
                  className="text-xs text-indigo-600 hover:underline font-medium"
                >
                  {selectingCompare ? '完成选择' : '重新选择'}
                </button>
              )}
            </div>
            <CalendarSelector
              startDate={selectingCompare ? (compareStartDate || startDate) : startDate}
              endDate={selectingCompare ? (compareEndDate || endDate) : endDate}
              onRangeSelect={onRangeSelect}
              hasData={hasDataOnDate}
              visibleMonth={visibleMonth}
              onVisibleMonthChange={setVisibleMonth}
            />

            {/* 对比预设 */}
            {!selectingCompare && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">快速对比预设</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => applyPreset(1)}
                    className="px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all text-left"
                  >
                    同比昨日
                  </button>
                  <button
                    onClick={() => applyPreset(7)}
                    className="px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all text-left"
                  >
                    上周同期
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {isCompareMode && compareStartDate && (
            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
              <div className="text-xs text-indigo-600 font-medium">对照组区间</div>
              <div className="mt-1 text-sm font-bold text-indigo-900">
                {formatYMD(compareStartDate)} {compareEndDate && ` ~ ${formatYMD(compareEndDate)}`}
              </div>
            </div>
          )}
        </div>
        <div className="lg:col-span-3">
          <TrendCard 
            title={isCompareMode ? "趋势叠加对比" : "历史趋势分析"} 
            data={points} 
            comparisonData={isCompareMode && compareQuery.data ? [compareQuery.data] : undefined}
            mainRangeStart={startDate.getTime()}
            compareRangeStart={compareStartDate?.getTime()}
            isLoading={rangeQuery.isFetching || compareQuery.isFetching} 
            onRefresh={() => {
              void liveQuery.refetch();
              void rangeQuery.refetch();
              if (isCompareMode) void compareQuery.refetch();
            }}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
        <div className="text-sm font-semibold text-gray-900">关联提示</div>
        <div className="mt-3 space-y-2">
          {notes.length === 0 ? (
            <div className="text-sm text-gray-500">暂无提示</div>
          ) : (
            notes.map((note, idx) => (
              <div
                key={`${note.level}-${idx}`}
                className={`rounded-lg border p-3 text-sm ${
                  note.level === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {note.message}
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
};

