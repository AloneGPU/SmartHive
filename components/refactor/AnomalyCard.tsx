import { AlertTriangle, CheckCircle2, Bug, Thermometer, Droplets } from 'lucide-react';
import { BeehiveData } from '../../types';
import {
  resolveInsideHumidity,
  resolveInsideTemperature,
  resolveOutsideHumidity,
  resolveOutsideTemperature,
  resolvePrimaryHumidity,
  resolvePrimaryTemperature
} from '../../services/hiveDataAdapter';

type Row = { level: 'ok' | 'warn' | 'error'; title: string; detail: string; icon: React.ReactNode };

export const AnomalyCard = (props: { latest: BeehiveData | null; series: BeehiveData[]; isLoading: boolean }) => {
  const rangeEndPoint = props.series
    .filter((item) => Number.isFinite(Number(item?.timestamp)))
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
    .slice(-1)[0] ?? null;
  const d = rangeEndPoint ?? props.latest;
  const pointLabel = rangeEndPoint ? '区间末' : '最新';
  const n = (value: unknown) => {
    const x = Number(value);
    return Number.isFinite(x) ? x : null;
  };

  const rows: Row[] = [];
  if (!d) {
    rows.push({ level: 'warn', title: '暂无最新数据', detail: '请检查后端连接与 Token 配置。', icon: <AlertTriangle className="w-4 h-4" /> });
  } else {
    const hornets = n(d.hornetsDetected);
    const insideTemperature = resolveInsideTemperature(d);
    const outsideTemperature = resolveOutsideTemperature(d);
    const insideHumidity = resolveInsideHumidity(d);
    const outsideHumidity = resolveOutsideHumidity(d);
    const primaryTemperature = resolvePrimaryTemperature(d);
    const primaryHumidity = resolvePrimaryHumidity(d);
    const hasStructuredEnv =
      insideTemperature !== null || outsideTemperature !== null || insideHumidity !== null || outsideHumidity !== null;

    if (hornets !== null && hornets > 0) {
      rows.push({ level: 'error', title: '检测到马蜂', detail: `马蜂数量：${hornets.toFixed(0)}`, icon: <Bug className="w-4 h-4" /> });
    }

    if (insideTemperature !== null && (insideTemperature > 38 || insideTemperature < 10)) {
      rows.push({
        level: 'warn',
        title: '箱内温度异常',
        detail: `${pointLabel}箱内温度：${insideTemperature.toFixed(1)}°C`,
        icon: <Thermometer className="w-4 h-4" />
      });
    }
    if (outsideTemperature !== null && (outsideTemperature > 40 || outsideTemperature < 0)) {
      rows.push({
        level: 'warn',
        title: '箱外温度异常',
        detail: `${pointLabel}箱外温度：${outsideTemperature.toFixed(1)}°C`,
        icon: <Thermometer className="w-4 h-4" />
      });
    }
    if (insideHumidity !== null && (insideHumidity > 85 || insideHumidity < 30)) {
      rows.push({
        level: 'warn',
        title: '箱内湿度异常',
        detail: `${pointLabel}箱内湿度：${insideHumidity.toFixed(1)}%`,
        icon: <Droplets className="w-4 h-4" />
      });
    }
    if (outsideHumidity !== null && (outsideHumidity > 90 || outsideHumidity < 30)) {
      rows.push({
        level: 'warn',
        title: '箱外湿度异常',
        detail: `${pointLabel}箱外湿度：${outsideHumidity.toFixed(1)}%`,
        icon: <Droplets className="w-4 h-4" />
      });
    }

    if (!hasStructuredEnv) {
      if (primaryTemperature !== null && (primaryTemperature > 38 || primaryTemperature < 10)) {
        rows.push({
          level: 'warn',
          title: '温度异常',
          detail: `${pointLabel}温度：${primaryTemperature.toFixed(1)}°C`,
          icon: <Thermometer className="w-4 h-4" />
        });
      }
      if (primaryHumidity !== null && (primaryHumidity > 85 || primaryHumidity < 30)) {
        rows.push({
          level: 'warn',
          title: '湿度异常',
          detail: `${pointLabel}湿度：${primaryHumidity.toFixed(1)}%`,
          icon: <Droplets className="w-4 h-4" />
        });
      }
    }

    if (hornets === null && primaryTemperature === null && primaryHumidity === null) {
      rows.push({ level: 'warn', title: '当前点位缺少有效数值', detail: '后端返回了空值，请检查采集链路与传感器状态。', icon: <AlertTriangle className="w-4 h-4" /> });
    }
    if (rows.length === 0) {
      rows.push({ level: 'ok', title: '暂无异常', detail: '关键指标处于合理区间。', icon: <CheckCircle2 className="w-4 h-4" /> });
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">异常预警</div>
          <div className="mt-1 text-xs text-gray-500">一眼看风险点</div>
        </div>
        {!props.isLoading ? (
          <div className="text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
            {rows.some((r) => r.level === 'error') ? '高风险' : rows.some((r) => r.level === 'warn') ? '需关注' : '正常'}
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {props.isLoading ? (
          <div className="h-24 rounded-xl bg-gray-50 animate-pulse" />
        ) : (
          rows.map((r, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-3 flex items-start gap-3 ${
                r.level === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : r.level === 'warn'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <div className="mt-0.5">{r.icon}</div>
              <div>
                <div className="text-sm font-medium">{r.title}</div>
                <div className="text-xs mt-1 opacity-90">{r.detail}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

