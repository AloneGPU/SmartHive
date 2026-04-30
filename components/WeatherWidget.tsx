import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  CloudRain,
  Sun,
  Wind,
  Thermometer,
  Droplets,
  MapPin,
  Calendar,
  RefreshCw,
  CloudSnow,
  CloudFog,
  Sun as SunIcon
} from 'lucide-react';

export interface WeatherData {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    uv_index: number;
    precipitation: number;
    pressure_msl: number;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_probability_max: number[];
    sunrise: string[];
    sunset: string[];
  };
  timezone: string;
  latitude: number;
  longitude: number;
}

interface WeatherWidgetProps {
  latitude: number;
  longitude: number;
  locationName?: string;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  latitude,
  longitude,
  locationName
}) => {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // 默认中国城市坐标（如果用户没有提供坐标）
  const defaultCoords = {
    beijing: { lat: 39.9042, lng: 116.4074 },
    shanghai: { lat: 31.2304, lng: 121.4737 },
    guangzhou: { lat: 23.1291, lng: 113.2644 },
    shenzhen: { lat: 22.5431, lng: 114.0579 }
  };

  const fetchWeather = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      // 使用 Open-Meteo API 获取天气数据
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,uv_index,precipitation,pressure_msl&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setWeatherData(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('获取天气数据失败:', error);
      setError(error instanceof Error ? error.message : '获取天气数据失败');
    } finally {
      setLoading(false);
    }
  }, [latitude, longitude]);

  useEffect(() => {
    if (latitude && longitude) {
      fetchWeather();
    }
  }, [fetchWeather]);

  // 自动刷新（每30分钟）
  useEffect(() => {
    const interval = setInterval(() => {
      if (weatherData && !loading) {
        fetchWeather();
      }
    }, 30 * 60 * 1000); // 30分钟

    return () => clearInterval(interval);
  }, [fetchWeather, loading, weatherData]);

  const getWeatherIcon = (weatherCode: number, size: number = 32) => {
    const iconProps = { className: `w-${size/8} h-${size/8} text-current` };

    switch (weatherCode) {
      case 0: // Clear sky
        return <Sun className="w-8 h-8 text-yellow-500" />;
      case 1: // Mainly clear
        return <Sun className="w-8 h-8 text-yellow-400" />;
      case 2: // Partly cloudy
        return <Cloud className="w-8 h-8 text-gray-400" />;
      case 3: // Overcast
        return <Cloud className="w-8 h-8 text-gray-600" />;
      case 45: case 48: // Fog
        return <CloudFog className="w-8 h-8 text-gray-400" />;
      case 51: case 53: case 55: // Drizzle
        return <CloudRain className="w-8 h-8 text-blue-400" />;
      case 56: case 57: // Freezing drizzle
        return <CloudSnow className="w-8 h-8 text-blue-200" />;
      case 61: case 63: case 65: // Rain
        return <CloudRain className="w-8 h-8 text-blue-500" />;
      case 66: case 67: // Freezing rain
        return <CloudSnow className="w-8 h-8 text-blue-300" />;
      case 71: case 73: case 75: // Snow fall
        return <CloudSnow className="w-8 h-8 text-blue-100" />;
      case 77: // Snow grains
        return <CloudSnow className="w-8 h-8 text-gray-200" />;
      case 80: case 81: case 82: // Rain showers
        return <CloudRain className="w-8 h-8 text-blue-600" />;
      case 85: case 86: // Snow showers
        return <CloudSnow className="w-8 h-8 text-blue-200" />;
      case 95: case 96: case 99: // Thunderstorm
        return <Cloud className="w-8 h-8 text-purple-500" />;
      default:
        return <Cloud className="w-8 h-8 text-gray-400" />;
    }
  };

  const getWeatherDescription = (weatherCode: number) => {
    const descriptions: { [key: number]: string } = {
      0: '晴朗',
      1: '基本晴朗',
      2: '部分多云',
      3: '阴天',
      45: '有雾',
      48: '浓雾',
      51: '毛毛雨',
      53: '小雨',
      55: '中雨',
      56: '冻毛毛雨',
      57: '冻雨',
      61: '雨',
      63: '中雨',
      65: '大雨',
      66: '冻雨',
      67: '大雨',
      71: '雪',
      73: '中雪',
      75: '大雪',
      77: '冰粒',
      80: '阵雨',
      81: '中阵雨',
      82: '大阵雨',
      85: '阵雪',
      86: '大雪',
      95: '雷暴',
      96: '强雷暴',
      99: '强雷暴'
    };
    return descriptions[weatherCode] || '未知';
  };

  const getWindDirection = (degrees: number) => {
    const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  };

  const getUVLevel = (uvIndex: number) => {
    if (uvIndex <= 2) return { level: '低', color: 'text-green-600' };
    if (uvIndex <= 5) return { level: '中等', color: 'text-yellow-600' };
    if (uvIndex <= 7) return { level: '高', color: 'text-orange-600' };
    if (uvIndex <= 10) return { level: '很高', color: 'text-red-600' };
    return { level: '极高', color: 'text-purple-600' };
  };

  const formatTime = (timeStr: string) => {
    return timeStr.slice(11, 16); // 提取 HH:MM
  };

  const formatDateTime = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
              <div className="w-24 h-6 bg-gray-200 rounded"></div>
            </div>
            <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
          </div>
          <div className="space-y-3">
            <div className="w-32 h-8 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-12 bg-gray-200 rounded"></div>
              <div className="h-12 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center">
          <Cloud className="w-12 h-12 mx-auto mb-3 text-red-300" />
          <p className="text-red-600 mb-2">获取天气数据失败</p>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchWeather}
            className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!weatherData) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center text-gray-500">
          <Cloud className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>无法获取天气数据</p>
        </div>
      </div>
    );
  }

  const { current, daily, timezone } = weatherData;
  const uvInfo = getUVLevel(current.uv_index);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          {getWeatherIcon(current.weather_code)}
          <div>
            <h2 className="text-xl font-bold text-gray-900">天气信息</h2>
            <div className="flex items-center text-sm text-gray-500">
              <MapPin className="w-4 h-4 mr-1" />
              <span>{locationName || `纬度 ${latitude.toFixed(2)}, 经度 ${longitude.toFixed(2)}`}</span>
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-gray-400">
          {formatDateTime(lastUpdated)}
        </div>
      </div>

      {/* 当前天气 */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 温度信息 */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1">
                <Thermometer className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-700">当前温度</span>
              </div>
              <span className="text-3xl font-bold text-gray-900">
                {current.temperature_2m.toFixed(1)}°C
              </span>
            </div>
            <div className="text-sm text-gray-600">
              体感温度: {current.apparent_temperature.toFixed(1)}°C
            </div>
            <div className="text-xs text-gray-500 mt-1">
              最高: {daily.temperature_2m_max[0]?.toFixed(1)}°C
              最低: {daily.temperature_2m_min[0]?.toFixed(1)}°C
            </div>
          </div>

          {/* 天气状况 */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">天气状况</span>
              {getWeatherIcon(current.weather_code)}
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {getWeatherDescription(current.weather_code)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              风速: {current.wind_speed_10m.toFixed(1)} km/h {getWindDirection(current.wind_direction_10m)}
            </div>
          </div>
        </div>

        {/* 详细信息 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center space-x-2">
            <Droplets className="w-4 h-4 text-blue-500" />
            <div>
              <div className="text-sm font-medium text-gray-700">湿度</div>
              <div className="text-lg font-semibold text-gray-900">
                {current.relative_humidity_2m.toFixed(0)}%
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Wind className="w-4 h-4 text-gray-500" />
            <div>
              <div className="text-sm font-medium text-gray-700">气压</div>
              <div className="text-lg font-semibold text-gray-900">
                {current.pressure_msl.toFixed(0)} hPa
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <SunIcon className="w-4 h-4 text-yellow-500" />
            <div>
              <div className="text-sm font-medium text-gray-700">紫外线</div>
              <div className={`text-lg font-semibold ${uvInfo.color}`}>
                {uvInfo.level} ({current.uv_index.toFixed(1)})
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <CloudRain className="w-4 h-4 text-blue-400" />
            <div>
              <div className="text-sm font-medium text-gray-700">降水</div>
              <div className="text-lg font-semibold text-gray-900">
                {current.precipitation.toFixed(1)} mm
              </div>
            </div>
          </div>
        </div>

        {/* 数据来源和刷新按钮 */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="text-xs text-gray-500">
            数据来源: Open-Meteo API | 时区: {timezone}
          </div>
          <button
            onClick={fetchWeather}
            className="inline-flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            刷新
          </button>
        </div>
      </div>
    </div>
  );
};