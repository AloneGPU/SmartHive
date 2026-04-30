import { useMemo, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Navigation } from 'lucide-react';
import { FilterBar } from '../components/refactor/FilterBar';
import { TrendCard } from '../components/refactor/TrendCard';
import { AnomalyCard } from '../components/refactor/AnomalyCard';
import { WeatherWidget } from '../components/WeatherWidget';
import { HiveWeatherAlert } from '../components/HiveWeatherAlert';
import { EnhancedAnalyticsPanel } from '../components/EnhancedAnalyticsPanel';
import { useLiveHiveQuery, useHiveRangeQuery, useQueryError } from '../hooks/useHiveData';
import { useIotRealtime } from '../hooks/useIotRealtime';
import { IotRealtimePanel } from '../components/refactor/IotRealtimePanel';
import { useAppContext } from '../context/AppContext';
import { useWeather } from '../hooks/useWeather';
import { useIsMobile } from '../hooks/useIsMobile';

const parsePreset = (v: string | null) => {
  if (v === '7d' || v === '31d') return v;
  return '24h' as const;
};

export const OverviewPage = () => {
  const { aiConfig, auth, location } = useAppContext();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // 天气数据
  const hasCoordinates = Number.isFinite(location.latitude) && Number.isFinite(location.longitude);
  const weather = useWeather({
    latitude: location.latitude,
    longitude: location.longitude,
    enabled: hasCoordinates && auth.isAuthenticated
  });

  const preset = parsePreset(sp.get('range'));
  const riskFilter = sp.get('risk') || 'all';
  const now = Date.now();
  const rangeMs = preset === '31d' ? 31 * 864e5 : preset === '7d' ? 7 * 864e5 : 864e5;
  const startMs = Number(sp.get('start')) || now - rangeMs;
  const endMs = Number(sp.get('end')) || now;

  const latestQuery = useLiveHiveQuery();
  const rangeQuery = useHiveRangeQuery(startMs, endMs, { id: 'overview' });
  const iotDeviceId = 'pi5-vision-client'; // 固定设备ID
  const iotRealtime = useIotRealtime(iotDeviceId, rangeMs, {
    baseUrl: aiConfig.apiBaseUrl || '/api',
    token: aiConfig.apiToken,
    enabled: auth.isAuthenticated
  });

  const onPresetChange = (next: '24h' | '7d' | '31d') => {
    const n = Date.now();
    const ms = next === '31d' ? 31 * 864e5 : next === '7d' ? 7 * 864e5 : 864e5;
    setSp({ range: next, start: String(n - ms), end: String(n), risk: riskFilter });
  };

  const onRefresh = () => {
    void latestQuery.refetch();
    void rangeQuery.refetch();
  };

  const onDrilldown = useMemo(() => {
    return () => navigate(`/breakdown?range=${preset}&start=${startMs}&end=${endMs}&risk=${riskFilter}`);
  }, [endMs, navigate, preset, riskFilter, startMs]);

  const start = new Date(startMs);
  const end = new Date(endMs);
  const quickFilters = [
    { id: 'all', label: '全部' },
    { id: 'hornet', label: '马蜂异常' },
    { id: 'env', label: '环境异常' }
  ];
  const resolvedAddress = (location.address || '').trim();
  const locationStatus = hasCoordinates ? (location.status || 'resolving') : 'error';
  const statusClassName =
    locationStatus === 'resolved'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : locationStatus === 'resolving'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-700 border-red-200';
  const statusText =
    locationStatus === 'resolved' ? '位置已解析' : locationStatus === 'resolving' ? '位置解析中' : '位置未解析';
  const divisionText = [location.province, location.city, location.district, location.road].filter(Boolean).join(' / ');
  const shouldShowGaodeHint = hasCoordinates && locationStatus === 'error';
  const locationErrorText = (location.errorMessage || '').trim();
  const locationHintText = (() => {
    if (!locationErrorText) {
      return '经纬度已收到，但地址解析失败。请在“管理后台 - 服务配置”填写高德 API Key，或检查后端 `GAODE_API_KEY`。';
    }
    if (/GAODE_API_KEY is not configured/i.test(locationErrorText)) {
      return '高德 API Key 未配置。请在“管理后台 - 服务配置”填写，或在后端环境变量中设置 `GAODE_API_KEY` 后重启服务。';
    }
    if (/INVALID_USER_KEY|USERKEY_PLAT_NOMATCH|INVALID_USER_SCODE/i.test(locationErrorText)) {
      return `高德 API Key 无效或应用类型不匹配：${locationErrorText}`;
    }
    if (/DAILY_QUERY_OVER_LIMIT|ACCESS_TOO_FREQUENT/i.test(locationErrorText)) {
      return `高德接口额度或频率受限：${locationErrorText}`;
    }
    return `地址解析失败：${locationErrorText}`;
  })();
  const summaryItems = [`范围:${preset}`];
  const onQuickFilterToggle = (id: string) => {
    setSp({ range: preset, start: String(startMs), end: String(endMs), risk: id });
  };
  const onClearFilters = () => {
    const n = Date.now();
    setSp({ range: '24h', start: String(n - 864e5), end: String(n), risk: 'all' });
  };
  const errorMessage = useQueryError(
    latestQuery.isError ? latestQuery : rangeQuery, 
    '总览数据加载失败'
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <h1 className="text-lg sm:text-xl font-bold text-gray-900">指标总览</h1>





      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{errorMessage}</span>
          <button type="button" onClick={onRefresh} className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700">
            重试
          </button>
        </div>
      ) : null}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-gray-800 font-semibold">
            <MapPin className="w-4 h-4 text-indigo-500" />
            蜂箱定位
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${statusClassName}`}>{statusText}</span>
        </div>

        {hasCoordinates ? (
          <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
            <div className="text-xs text-gray-500 mb-1">详细位置</div>
            <div className="text-gray-800 font-medium break-words">
              {resolvedAddress || `蜂箱位置 - ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}
            </div>
            {divisionText ? <div className="text-xs text-gray-500 mt-2">行政区：{divisionText}</div> : null}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            还没有收到定位经纬度，请检查设备上报字段 `latitude` / `longitude`。
          </div>
        )}

        {shouldShowGaodeHint ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {locationHintText}
          </div>
        ) : null}

        {auth.role === 'admin' ? (
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <Navigation className="w-3.5 h-3.5" />
            去管理后台检查高德配置
          </button>
        ) : null}
      </div>

      <IotRealtimePanel
        latest={iotRealtime.latest}
        history={iotRealtime.history}
        mainData={latestQuery.data || null}
        monitor={iotRealtime.monitor}
        streamConnected={iotRealtime.streamConnected}
        baseUrl={aiConfig.apiBaseUrl || '/api'}
        token={aiConfig.apiToken}
        deviceId={iotDeviceId}
      />

      {/* 天气组件 - 所有设备通用 */}
      {hasCoordinates && auth.isAuthenticated ? (
        <WeatherWidget
          latitude={location.latitude}
          longitude={location.longitude}
          locationName={resolvedAddress || undefined}
        />
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center space-x-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            <span className="text-blue-800 font-medium">启用天气功能</span>
          </div>
          <p className="text-sm text-blue-700 mt-1">
            {auth.isAuthenticated
              ? '需要获取蜂箱定位才能显示天气信息'
              : '请先登录以获取天气信息'
            }
          </p>
        </div>
      )}


    </motion.div>
  );
};
