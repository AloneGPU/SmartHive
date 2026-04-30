import React from 'react';
import { Thermometer, Droplets, Weight, ArrowRight, ArrowLeft, Bug } from 'lucide-react';
import { BeehiveData } from '../types';
import {
  resolveInsideHumidity,
  resolveInsideTemperature,
  resolveOutsideHumidity,
  resolveOutsideTemperature,
  resolvePrimaryHumidity,
  resolvePrimaryTemperature,
  toFiniteNumber
} from '../services/hiveDataAdapter';

interface SensorGridProps {
  data: BeehiveData | null;
}

export const SensorGrid: React.FC<SensorGridProps> = ({ data }) => {
  if (!data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
            <div className="flex items-center justify-between mb-4">
              <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
              <div className="w-16 h-4 bg-gray-200 rounded"></div>
            </div>
            <div className="w-24 h-8 bg-gray-200 rounded mb-2"></div>
            <div className="w-32 h-4 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  const temperature = resolvePrimaryTemperature(data);
  const humidity = resolvePrimaryHumidity(data);
  const insideTemperature = resolveInsideTemperature(data);
  const insideHumidity = resolveInsideHumidity(data);
  const outsideTemperature = resolveOutsideTemperature(data);
  const outsideHumidity = resolveOutsideHumidity(data);
  const weight = toFiniteNumber(data.weight);
  const beesIn = toFiniteNumber(data.beesIn);
  const beesOut = toFiniteNumber(data.beesOut);
  const hornets = toFiniteNumber(data.hornetsDetected);

  const sensors = [
    {
      icon: <Thermometer className="w-6 h-6 text-orange-500" />,
      title: '温度',
      value: temperature === null ? '--' : `${temperature.toFixed(1)}°C`,
      status: temperature !== null && temperature > 35 ? 'high' : temperature !== null && temperature < 15 ? 'low' : 'normal',
      statusText: temperature !== null && temperature > 35 ? '过高' : temperature !== null && temperature < 15 ? '过低' : '适宜',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200'
    },
    {
      icon: <Droplets className="w-6 h-6 text-blue-500" />,
      title: '湿度',
      value: humidity === null ? '--' : `${humidity.toFixed(1)}%`,
      status: humidity !== null && humidity > 80 ? 'high' : humidity !== null && humidity < 40 ? 'low' : 'normal',
      statusText: humidity !== null && humidity > 80 ? '过高' : humidity !== null && humidity < 40 ? '过低' : '适宜',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    {
      icon: <Thermometer className="w-6 h-6 text-red-500" />,
      title: '内部温湿度',
      value: insideTemperature !== null && insideHumidity !== null ? `${insideTemperature.toFixed(1)}°C / ${insideHumidity.toFixed(1)}%` : 'N/A',
      status:
        (insideTemperature !== null && insideTemperature > 35) || (insideHumidity !== null && insideHumidity > 80)
          ? 'high'
          : (insideTemperature !== null && insideTemperature < 15) || (insideHumidity !== null && insideHumidity < 40)
            ? 'low'
            : 'normal',
      statusText:
        (insideTemperature !== null && insideTemperature > 35) || (insideHumidity !== null && insideHumidity > 80)
          ? '异常'
          : (insideTemperature !== null && insideTemperature < 15) || (insideHumidity !== null && insideHumidity < 40)
            ? '异常'
            : '适宜',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200'
    },
    {
      icon: <Thermometer className="w-6 h-6 text-green-500" />,
      title: '外部温湿度',
      value: outsideTemperature !== null && outsideHumidity !== null ? `${outsideTemperature.toFixed(1)}°C / ${outsideHumidity.toFixed(1)}%` : 'N/A',
      status:
        (outsideTemperature !== null && outsideTemperature > 40) || (outsideHumidity !== null && outsideHumidity > 90)
          ? 'high'
          : (outsideTemperature !== null && outsideTemperature < 0) || (outsideHumidity !== null && outsideHumidity < 30)
            ? 'low'
            : 'normal',
      statusText:
        (outsideTemperature !== null && outsideTemperature > 40) || (outsideHumidity !== null && outsideHumidity > 90)
          ? '异常'
          : (outsideTemperature !== null && outsideTemperature < 0) || (outsideHumidity !== null && outsideHumidity < 30)
            ? '异常'
            : '适宜',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    {
      icon: <Weight className="w-6 h-6 text-green-500" />,
      title: '重量',
      value: weight === null ? '--' : `${weight.toFixed(2)}kg`,
      status: 'normal',
      statusText: '监测中',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    {
      icon: <ArrowRight className="w-6 h-6 text-purple-500" />,
      title: '蜜蜂进入',
      value: beesIn === null ? '--' : beesIn.toFixed(0),
      status: 'normal',
      statusText: '正常',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200'
    },
    {
      icon: <ArrowLeft className="w-6 h-6 text-indigo-500" />,
      title: '蜜蜂离开',
      value: beesOut === null ? '--' : beesOut.toFixed(0),
      status: 'normal',
      statusText: '正常',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200'
    },
    {
      icon: <Bug className="w-6 h-6 text-red-500" />,
      title: '马蜂检测',
      value: hornets === null ? '--' : hornets.toFixed(0),
      status: hornets !== null && hornets > 0 ? 'warning' : 'normal',
      statusText: hornets !== null && hornets > 0 ? '警告' : '安全',
      bgColor: hornets !== null && hornets > 0 ? 'bg-red-50' : 'bg-gray-50',
      borderColor: hornets !== null && hornets > 0 ? 'border-red-200' : 'border-gray-200'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sensors.map((sensor, index) => (
        <div key={index} className={`${sensor.bgColor} ${sensor.borderColor} rounded-xl border p-6 hover:shadow-md transition-shadow`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {sensor.icon}
              <h3 className="text-sm font-medium text-gray-700">{sensor.title}</h3>
            </div>
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${
              sensor.status === 'high' ? 'bg-red-100 text-red-700' :
              sensor.status === 'low' ? 'bg-blue-100 text-blue-700' :
              sensor.status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
              'bg-green-100 text-green-700'
            }`}>
              {sensor.statusText}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-2xl font-bold text-gray-900">{sensor.value}</div>
            <div className="text-xs text-gray-500">实时数据</div>
          </div>
        </div>
      ))}
    </div>
  );
};
