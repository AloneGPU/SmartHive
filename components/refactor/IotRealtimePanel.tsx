import { useMemo, useEffect, useState } from 'react';
import { Activity, Download, Radio, Thermometer, Droplets, Wifi, Bug, Clock, Pause, Play, RotateCcw } from 'lucide-react';
import { exportIotHistoryCsv, type IotMonitorSnapshot, type IotSensorPoint } from '../../services/dataService';

const valueOfAny = (rows: IotSensorPoint[], sensorTypes: string[]): number | null => {
  for (const sensorType of sensorTypes) {
    const hit = rows.find((r) => r.sensorType === sensorType);
    if (hit) {
      const v = Number(hit.value);
      if (Number.isFinite(v)) return v;
    }
  }
  return null;
};

const formatStreamAge = (ts: number) => {
  const d = Date.now() - ts;
  if (!Number.isFinite(d) || d < 0) return '--';
  if (d < 2000) return '刚刚';
  if (d < 60_000) return `${Math.floor(d / 1000)} 秒前`;
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const IotRealtimePanel = (props: {
  latest: IotSensorPoint[];
  history: IotSensorPoint[];
  monitor: IotMonitorSnapshot | null;
  streamConnected: boolean;
  baseUrl: string;
  token: string;
  deviceId: string;
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onRefresh?: () => void;
  /** SSE/MQTT 最近一次收到数据或心跳的时间戳（ms） */
  streamLastAt?: number | null;
}) => {
  const latestRows = Array.isArray(props.latest) ? props.latest : [];
  const historyRows = Array.isArray(props.history) ? props.history : [];
  const streamLive = props.streamConnected && !props.isPaused;
  const [, setAgeTick] = useState(0);
  useEffect(() => {
    if (!streamLive) return;
    const id = window.setInterval(() => setAgeTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [streamLive]);

  // 读数仅来自 IoT 通道（bootstrap 拉取的 latest + SSE 推送）；断流/暂停也不使用库表 mainData
  const tempIn = valueOfAny(latestRows, ['inside_temperature', 'temperature']);
  const humIn = valueOfAny(latestRows, ['inside_humidity', 'humidity']);
  const tempOut = valueOfAny(latestRows, ['outside_temperature']);
  const humOut = valueOfAny(latestRows, ['outside_humidity']);
  const weight = valueOfAny(latestRows, ['weight']);
  const currentIn = valueOfAny(latestRows, ['bees_in', 'bee_in', 'in_count']) ?? 0;
  const currentOut = valueOfAny(latestRows, ['bees_out', 'bee_out', 'out_count']) ?? 0;
  const hornetCount = valueOfAny(latestRows, ['hornet_count', 'hornets_detected']);

  const thresholdIn = 100;
  const thresholdOut = 100;
  const isInThresholdReached = currentIn >= thresholdIn;
  const isOutThresholdReached = currentOut >= thresholdOut;

  const onExport = async () => {
    const start = Date.now() - 7 * 864e5;
    const end = Date.now();
    const blob = await exportIotHistoryCsv(props.baseUrl, props.token, { deviceId: props.deviceId, start, end });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iot_${props.deviceId}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const trend = useMemo(() => {
    const byHour = new Map<number, { tIn: number[]; hIn: number[]; tOut: number[]; hOut: number[]; hornets: number[] }>();
    for (const p of historyRows) {
      if (!Number.isFinite(Number(p.value))) continue;
      const hour = Math.floor(p.timestamp / 3600000) * 3600000;
      const prev = byHour.get(hour) || { tIn: [], hIn: [], tOut: [], hOut: [], hornets: [] };
      if (p.sensorType === 'temperature' || p.sensorType === 'inside_temperature') prev.tIn.push(p.value);
      if (p.sensorType === 'humidity' || p.sensorType === 'inside_humidity') prev.hIn.push(p.value);
      if (p.sensorType === 'outside_temperature') prev.tOut.push(p.value);
      if (p.sensorType === 'outside_humidity') prev.hOut.push(p.value);
      if (p.sensorType === 'hornet_count' || p.sensorType === 'hornets_detected') {
        prev.hornets.push(p.value);
      }
      byHour.set(hour, prev);
    }
    return Array.from(byHour.entries())
      .map(([ts, v]) => ({
        ts,
        tempIn: v.tIn.length > 0 ? v.tIn.reduce((sum, val) => sum + val, 0) / v.tIn.length : null,
        humIn: v.hIn.length > 0 ? v.hIn.reduce((sum, val) => sum + val, 0) / v.hIn.length : null,
        tempOut: v.tOut.length > 0 ? v.tOut.reduce((sum, val) => sum + val, 0) / v.tOut.length : null,
        humOut: v.hOut.length > 0 ? v.hOut.reduce((sum, val) => sum + val, 0) / v.hOut.length : null,
        hornets: v.hornets.length > 0 ? v.hornets.reduce((sum, val) => sum + val, 0) : null
      }))
      .sort((a, b) => a.ts - b.ts)
      .slice(-24);
  }, [historyRows]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-gray-800 font-bold text-sm sm:text-base">
          <Radio className={`w-4 h-4 sm:w-5 sm:h-5 ${props.streamConnected && !props.isPaused ? 'text-emerald-500 animate-pulse' : 'text-red-500'}`} />
          物联网实时监控
          {props.isPaused && (
            <span className="ml-2 px-2 py-0.5 text-[10px] bg-yellow-100 text-yellow-700 rounded-full font-normal">
              已暂停
            </span>
          )}
          {streamLive && (
            <span className="ml-2 px-2 py-0.5 text-[10px] bg-emerald-50 text-emerald-700 rounded-full font-normal border border-emerald-100">
              MQTT 实时
            </span>
          )}
          {props.streamLastAt != null && streamLive ? (
            <span className="text-[10px] text-gray-400 font-normal ml-1">更新 {formatStreamAge(props.streamLastAt)}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.isPaused ? props.onResume : props.onPause}
            disabled={!props.onPause || !props.onResume}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
              props.isPaused
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-yellow-500 hover:bg-yellow-600 text-white'
            } ${(!props.onPause || !props.onResume) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {props.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {props.isPaused ? '恢复' : '暂停'}
          </button>
          <button
            type="button"
            onClick={props.onRefresh}
            disabled={!props.onRefresh}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 text-gray-600 hover:bg-gray-100 text-xs sm:text-sm font-semibold transition-colors ${
              !props.onRefresh ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            刷新
          </button>
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 text-gray-600 hover:bg-gray-100 text-xs sm:text-sm font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            导出历史明细
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {/* 温度卡片 */}
        <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3 sm:p-4 col-span-2 sm:col-span-1 lg:col-span-1 xl:col-span-2">
          <div className="text-[10px] sm:text-xs font-bold text-amber-700 flex items-center gap-1 mb-2 uppercase tracking-wider">
            <Thermometer className="w-3.5 h-3.5" />
            温度环境
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-gray-400 font-medium">箱内</div>
              <div className="text-lg sm:text-xl font-black text-amber-900 mt-0.5">{tempIn === null ? '--' : `${tempIn.toFixed(1)}°`}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 font-medium">箱外</div>
              <div className="text-lg sm:text-xl font-black text-amber-800/70 mt-0.5">{tempOut === null ? '--' : `${tempOut.toFixed(1)}°`}</div>
            </div>
          </div>
        </div>

        {/* 湿度卡片 */}
        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3 sm:p-4 col-span-2 sm:col-span-1 lg:col-span-1 xl:col-span-2">
          <div className="text-[10px] sm:text-xs font-bold text-blue-700 flex items-center gap-1 mb-2 uppercase tracking-wider">
            <Droplets className="w-3.5 h-3.5" />
            湿度环境
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-gray-400 font-medium">箱内</div>
              <div className="text-lg sm:text-xl font-black text-blue-900 mt-0.5">{humIn === null ? '--' : `${humIn.toFixed(0)}%`}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 font-medium">箱外</div>
              <div className="text-lg sm:text-xl font-black text-blue-800/70 mt-0.5">{humOut === null ? '--' : `${humOut.toFixed(0)}%`}</div>
            </div>
          </div>
        </div>

        {/* 重量卡片：对应 OLED 的 W */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 sm:p-4 col-span-1 sm:col-span-1 lg:col-span-1 xl:col-span-1">
          <div className="text-[10px] sm:text-xs font-bold text-emerald-700 flex items-center gap-1 uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5" />
            蜂箱重量
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-900 mt-1">
            {weight === null ? '--' : weight.toFixed(1)}
          </div>
          <div className="text-[9px] mt-1 font-bold text-emerald-500">kg</div>
        </div>

        {/* 胡蜂卡片 */}
        <div
          className={`rounded-2xl border transition-all duration-300 ${hornetCount !== null && hornetCount > 0 ? 'border-red-200 bg-red-50 shadow-sm shadow-red-100' : 'border-gray-100 bg-gray-50/50'} p-3 sm:p-4 col-span-1 sm:col-span-1 lg:col-span-1 xl:col-span-1`}
        >
          <div className={`text-[10px] sm:text-xs font-bold ${hornetCount !== null && hornetCount > 0 ? 'text-red-700' : 'text-gray-500'} flex items-center gap-1 uppercase tracking-wider`}>
            <Bug className={`w-3.5 h-3.5 ${hornetCount !== null && hornetCount > 0 ? 'animate-bounce' : ''}`} />
            胡蜂监测
          </div>
          <div className={`text-2xl sm:text-3xl font-black ${hornetCount !== null && hornetCount > 0 ? 'text-red-600' : 'text-gray-900'} mt-1`}>
            {hornetCount === null ? '--' : hornetCount}
          </div>
          <div className={`text-[9px] mt-1 font-bold ${hornetCount !== null && hornetCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {hornetCount !== null && hornetCount > 0 ? '发现威胁' : '暂无异常'}
          </div>
        </div>

        {/* 进出卡片：直接显示 OLED 的 Bee IN/OUT 当前累计值 */}
        <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-3 sm:p-4 col-span-2 sm:col-span-1 lg:col-span-1 xl:col-span-2">
          <div className="text-[10px] sm:text-xs font-bold text-purple-700 flex items-center gap-1 mb-2 uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5" />
            蜜蜂流量
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-gray-400 font-medium">进入</div>
              <div className={`text-lg sm:text-xl font-black ${isInThresholdReached ? 'text-red-600 animate-pulse' : 'text-purple-900'} mt-0.5`}>
                {currentIn.toFixed(0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 font-medium">出去</div>
              <div className={`text-lg sm:text-xl font-black ${isOutThresholdReached ? 'text-red-600 animate-pulse' : 'text-purple-900'} mt-0.5`}>
                {currentOut.toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      </div>



      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] sm:text-xs">
        <div className="rounded-xl border border-gray-50 p-3 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-500 font-medium">
            <Wifi className="w-3.5 h-3.5" />
            MQTT状态
          </div>
          <div className={`font-bold ${props.monitor?.mqtt?.connected ? 'text-emerald-600' : 'text-red-500'}`}>
            {props.monitor?.mqtt?.connected ? '已连接' : '已断开'}
          </div>
        </div>
        <div className="rounded-xl border border-gray-50 p-3 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-500 font-medium">
            <Clock className="w-3.5 h-3.5" />
            实时终端
          </div>
          <div className="font-bold text-indigo-600">{props.monitor?.stream?.connectedClients ?? '0'} 个</div>
        </div>
        <div className="rounded-xl border border-gray-50 p-3 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-500 font-medium">
            <Activity className="w-3.5 h-3.5" />
            累计消息
          </div>
          <div className="font-bold text-gray-900">{props.monitor?.mqtt?.receivedMessages ?? '0'}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-gray-50/30 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-white/50">
          <div className="text-xs font-bold text-gray-500 flex items-center gap-1.5 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" />
            SSE 实时趋势
          </div>
          <div className="text-[10px] text-gray-400 italic">仅显示本次页面收到的 MQTT/SSE 数据</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] sm:text-xs min-w-[480px]">
            <thead className="text-gray-400 bg-gray-50/50">
              <tr>
                <th className="px-4 py-2.5 font-bold">时间</th>
                <th className="px-2 py-2.5 font-bold">内温</th>
                <th className="px-2 py-2.5 font-bold">外温</th>
                <th className="px-2 py-2.5 font-bold">内湿</th>
                <th className="px-2 py-2.5 font-bold">外湿</th>
                <th className="px-4 py-2.5 text-right font-bold">胡蜂</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white/30">
              {trend.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400 italic">
                    等待 MQTT 实时数据
                  </td>
                </tr>
              ) : (
                trend.map((row) => (
                  <tr key={row.ts} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-4 py-2.5 text-gray-500 font-mono">
                      {new Date(row.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-2 py-2.5 font-bold text-amber-700">
                      {row.tempIn === null ? '--' : `${row.tempIn.toFixed(1)}°`}
                    </td>
                    <td className="px-2 py-2.5 text-amber-600/60">
                      {row.tempOut === null ? '--' : `${row.tempOut.toFixed(1)}°`}
                    </td>
                    <td className="px-2 py-2.5 font-bold text-blue-700">
                      {row.humIn === null ? '--' : `${row.humIn.toFixed(0)}%`}
                    </td>
                    <td className="px-2 py-2.5 text-blue-600/60">
                      {row.humOut === null ? '--' : `${row.humOut.toFixed(0)}%`}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {row.hornets !== null && row.hornets > 0 ? (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 font-black text-[10px] animate-pulse">
                          {row.hornets}
                        </span>
                      ) : (
                        <span className="text-gray-300 font-mono">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
