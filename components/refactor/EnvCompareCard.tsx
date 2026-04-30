import { useMemo } from 'react';
import { Thermometer, Droplets } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { IotSensorPoint } from '../../services/dataService';
import { computePaddedDomain, downsampleSequence, formatTimeTick } from '../../services/chartViewport';

type Point = {
  ts: number;
  insideTemp?: number;
  outsideTemp?: number;
  insideHum?: number;
  outsideHum?: number;
};

const hourBucket = (ms: number) => Math.floor(ms / 3600000) * 3600000;

export const EnvCompareCard = (props: { history: IotSensorPoint[]; hours?: number }) => {
  const hours = props.hours ?? 48;

  const data = useMemo(() => {
    const cutoff = Date.now() - hours * 3600000;
    const m = new Map<number, Point>();

    for (const p of props.history) {
      if (p.timestamp < cutoff) continue;
      const b = hourBucket(p.timestamp);
      const prev = m.get(b) || { ts: b };
      if (p.sensorType === 'inside_temperature' || p.sensorType === 'temperature') prev.insideTemp = p.value;
      if (p.sensorType === 'outside_temperature') prev.outsideTemp = p.value;
      if (p.sensorType === 'inside_humidity' || p.sensorType === 'humidity') prev.insideHum = p.value;
      if (p.sensorType === 'outside_humidity') prev.outsideHum = p.value;
      m.set(b, prev);
    }

    return Array.from(m.values())
      .sort((a, b) => a.ts - b.ts)
      .filter((p) => p.insideTemp !== undefined || p.outsideTemp !== undefined || p.insideHum !== undefined || p.outsideHum !== undefined);
  }, [hours, props.history]);

  const displayData = useMemo(() => downsampleSequence(data, hours <= 72 ? 260 : 220), [data, hours]);
  const tempDomain = useMemo(() => {
    const values: Array<number | undefined> = [];
    for (const row of displayData) values.push(row.insideTemp, row.outsideTemp);
    return computePaddedDomain(values, { ratio: 0.08, minPadding: 1 }) ?? [0, 40];
  }, [displayData]);
  const humidityDomain = useMemo(() => {
    const values: Array<number | undefined> = [];
    for (const row of displayData) values.push(row.insideHum, row.outsideHum);
    return computePaddedDomain(values, { ratio: 0.08, minPadding: 2 }) ?? [0, 100];
  }, [displayData]);

  const hasInside = data.some((p) => p.insideTemp !== undefined || p.insideHum !== undefined);
  const hasOutside = data.some((p) => p.outsideTemp !== undefined || p.outsideHum !== undefined);
  if (data.length < 2 || (!hasInside && !hasOutside)) return null;

  const spanMs = Math.max(0, hours * 3600000);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">蜂箱内外温湿度对比</div>
          <div className="mt-1 text-xs text-gray-500">
            最近{hours}小时（按小时聚合展示）
            {!hasOutside ? '，当前仅检测到箱内传感器数据' : ''}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-100 bg-gray-50/30 p-3">
          <div className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <Thermometer className="w-4 h-4 text-amber-700" />
            温度对比（°C）
          </div>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fontSize: 10 }}
                  stroke="#9ca3af"
                  minTickGap={24}
                  tickFormatter={(v) => formatTimeTick(Number(v), spanMs, { withMinute: false })}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="#9ca3af"
                  width={32}
                  domain={tempDomain as [number, number]}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 8px 18px rgba(0,0,0,0.10)', fontSize: '12px' }}
                  labelFormatter={(label) => new Date(Number(label)).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit' })}
                  formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}°C`, name]}
                />
                <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                {hasInside ? <Line type="monotone" dataKey="insideTemp" name="箱内" stroke="#b45309" strokeWidth={2} dot={false} /> : null}
                {hasOutside ? <Line type="monotone" dataKey="outsideTemp" name="箱外" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 3" /> : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50/30 p-3">
          <div className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <Droplets className="w-4 h-4 text-blue-700" />
            湿度对比（%）
          </div>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fontSize: 10 }}
                  stroke="#9ca3af"
                  minTickGap={24}
                  tickFormatter={(v) => formatTimeTick(Number(v), spanMs, { withMinute: false })}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="#9ca3af"
                  width={32}
                  domain={humidityDomain as [number, number]}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 8px 18px rgba(0,0,0,0.10)', fontSize: '12px' }}
                  labelFormatter={(label) => new Date(Number(label)).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit' })}
                  formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}%`, name]}
                />
                <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                {hasInside ? <Line type="monotone" dataKey="insideHum" name="箱内" stroke="#1d4ed8" strokeWidth={2} dot={false} /> : null}
                {hasOutside ? <Line type="monotone" dataKey="outsideHum" name="箱外" stroke="#60a5fa" strokeWidth={2} dot={false} strokeDasharray="4 3" /> : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
