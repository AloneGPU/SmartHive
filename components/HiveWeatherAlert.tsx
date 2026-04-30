import React from 'react';
import { WeatherData } from './WeatherWidget';

interface HiveWeatherAlertProps {
  weatherData: WeatherData | null;
}

type HiveAlertType = 'danger' | 'warning' | 'info';
type HiveAlert = {
  type: HiveAlertType;
  title: string;
  description: string;
  icon: string;
};

export const HiveWeatherAlert: React.FC<HiveWeatherAlertProps> = ({ weatherData }) => {
  if (!weatherData) {
    return null;
  }

  const { current } = weatherData;

  // 生成蜂箱管理建议
  const generateAlerts = () => {
    const alerts: HiveAlert[] = [];

    // 温度相关警告
    if (current.temperature_2m > 35) {
      alerts.push({
        type: 'danger',
        title: '高温警告',
        description: '温度过高，建议加强蜂箱通风，防止蜜蜂热应激',
        icon: '🔥'
      });
    } else if (current.temperature_2m < 10) {
      alerts.push({
        type: 'warning',
        title: '低温警告',
        description: '温度较低，注意保温，检查蜂群状态',
        icon: '❄️'
      });
    }

    // 湿度相关警告
    if (current.relative_humidity_2m > 80) {
      alerts.push({
        type: 'warning',
        title: '高湿度提醒',
        description: '湿度较高，注意防潮，防止蜂巢发霉',
        icon: '💧'
      });
    } else if (current.relative_humidity_2m < 30) {
      alerts.push({
        type: 'info',
        title: '干燥提醒',
        description: '空气干燥，注意补充水源',
        icon: '☀️'
      });
    }

    // 风力相关警告
    if (current.wind_speed_10m > 20) {
      alerts.push({
        type: 'warning',
        title: '大风预警',
        description: '风力较大，注意固定蜂箱，防止被吹倒',
        icon: '🌪️'
      });
    }

    // 降水相关警告
    if (current.precipitation > 10) {
      alerts.push({
        type: 'info',
        title: '降雨提醒',
        description: '有较强降水，蜜蜂可能减少外出活动',
        icon: '🌧️'
      });
    }

    // 紫外线警告
    if (current.uv_index > 7) {
      alerts.push({
        type: 'warning',
        title: '强紫外线',
        description: '紫外线强烈，外出检查时注意防护',
        icon: '☀️'
      });
    }

    return alerts;
  };

  const alerts = generateAlerts();

  if (alerts.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-green-600">✅</span>
          </div>
          <div>
            <h3 className="font-semibold text-green-800">天气状况良好</h3>
            <p className="text-sm text-green-700">当前天气条件适合蜂箱管理</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => {
        const alertColors = {
          danger: 'bg-red-50 border-red-200 text-red-800',
          warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
          info: 'bg-blue-50 border-blue-200 text-blue-800'
        } satisfies Record<HiveAlertType, string>;

        return (
          <div
            key={index}
            className={`${alertColors[alert.type]} border rounded-xl p-4`}
          >
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 text-xl">{alert.icon}</div>
              <div className="flex-1">
                <h4 className="font-semibold mb-1">{alert.title}</h4>
                <p className="text-sm">{alert.description}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};