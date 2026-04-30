import React from 'react';
import { Thermometer, Droplets, Weight, ArrowRightLeft, Bug } from 'lucide-react';
import { BeehiveData } from '../../types';
import {
  resolveInsideHumidity,
  resolveInsideTemperature,
  resolveOutsideHumidity,
  resolveOutsideTemperature
} from '../../services/hiveDataAdapter';

const Card = (props: { title: string; value: string; icon: React.ReactNode; tone: 'indigo' | 'amber' | 'blue' | 'emerald' | 'red' }) => {
  const toneMap: Record<string, { bg: string; fg: string; ring: string }> = {
    indigo: { bg: 'bg-indigo-50', fg: 'text-indigo-700', ring: 'ring-indigo-100' },
    amber: { bg: 'bg-amber-50', fg: 'text-amber-700', ring: 'ring-amber-100' },
    blue: { bg: 'bg-blue-50', fg: 'text-blue-700', ring: 'ring-blue-100' },
    emerald: { bg: 'bg-emerald-50', fg: 'text-emerald-700', ring: 'ring-emerald-100' },
    red: { bg: 'bg-red-50', fg: 'text-red-700', ring: 'ring-red-100' }
  };
  const t = toneMap[props.tone];
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-gray-500">{props.title}</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{props.value}</div>
        </div>
        <div className={`${t.bg} ${t.fg} ${t.ring} ring-8 w-10 h-10 rounded-xl flex items-center justify-center`}>{props.icon}</div>
      </div>
    </div>
  );
};

export const KpiGrid = (props: { latest: BeehiveData | null; isLoading: boolean }) => {
  const d = props.latest;
  const loadingValue = props.isLoading ? '加载中...' : '--';
  const n = (value: unknown) => {
    const x = Number(value);
    return Number.isFinite(x) ? x : null;
  };
  const insideTemperature = resolveInsideTemperature(d);
  const insideHumidity = resolveInsideHumidity(d);
  const outsideTemperature = resolveOutsideTemperature(d);
  const outsideHumidity = resolveOutsideHumidity(d);
  const weight = n(d?.weight);
  const beesIn = n(d?.beesIn);
  const beesOut = n(d?.beesOut);
  const hornets = n(d?.hornetsDetected);
  const activity = beesIn !== null && beesOut !== null ? beesIn + beesOut : null;
  const envPair = (temp: number | null, hum: number | null) => {
    if (temp === null && hum === null) return loadingValue;
    const tempText = temp === null ? '--' : `${temp.toFixed(1)}°C`;
    const humText = hum === null ? '--' : `${hum.toFixed(1)}%`;
    return `${tempText} / ${humText}`;
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4" data-tour="kpis">
      <Card title="箱内温湿度" value={envPair(insideTemperature, insideHumidity)} icon={<Thermometer className="w-5 h-5" />} tone="amber" />
      <Card title="箱外温湿度" value={envPair(outsideTemperature, outsideHumidity)} icon={<Droplets className="w-5 h-5" />} tone="blue" />
      <Card title="重量" value={weight === null ? loadingValue : `${weight.toFixed(2)}kg`} icon={<Weight className="w-5 h-5" />} tone="emerald" />
      <Card title="活动" value={activity === null ? loadingValue : `${activity.toFixed(0)}次`} icon={<ArrowRightLeft className="w-5 h-5" />} tone="indigo" />
      <Card title="马蜂" value={hornets === null ? loadingValue : `${hornets.toFixed(0)}`} icon={<Bug className="w-5 h-5" />} tone={hornets !== null && hornets > 0 ? 'red' : 'indigo'} />
    </div>
  );
};

