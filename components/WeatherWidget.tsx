
import React, { useState, useEffect } from 'react';
import { CloudRain, Sun, Cloud, Wind, CloudLightning, CloudSnow, RefreshCw } from 'lucide-react';
import { fetchWeatherData } from '../services/dataService';

interface WeatherProps {
  location: { latitude: number; longitude: number };
}

interface WeatherState {
  temp: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
  forecast: string;
  loading: boolean;
}

export const WeatherWidget: React.FC<WeatherProps> = ({ location }) => {
  const [weather, setWeather] = useState<WeatherState>({
    temp: 0,
    condition: 'Sunny',
    humidity: 0,
    windSpeed: 0,
    feelsLike: 0,
    forecast: '正在更新...',
    loading: true
  });

  // WMO Weather interpretation codes (http://www.wmo.int/pages/prog/www/IMOP/publications/CIMO-Guide/Prof_Guide/CIMO_Guide-2008_Part-I_Chapter-13.pdf)
  // 0: Clear sky
  // 1, 2, 3: Mainly clear, partly cloudy, and overcast
  // 45, 48: Fog and depositing rime fog
  // 51, 53, 55: Drizzle: Light, moderate, and dense intensity
  // 56, 57: Freezing Drizzle: Light and dense intensity
  // 61, 63, 65: Rain: Slight, moderate and heavy intensity
  // 66, 67: Freezing Rain: Light and heavy intensity
  // 71, 73, 75: Snow fall: Slight, moderate, and heavy intensity
  // 77: Snow grains
  // 80, 81, 82: Rain showers: Slight, moderate, and violent
  // 85, 86: Snow showers slight and heavy
  // 95: Thunderstorm: Slight or moderate
  // 96, 99: Thunderstorm with slight and heavy hail

  const mapWmoCodeToCondition = (code: number): string => {
    if (code === 0) return 'Sunny';
    if (code >= 1 && code <= 3) return 'Cloudy';
    if (code >= 45 && code <= 48) return 'Cloudy'; // Fog as cloudy
    if (code >= 51 && code <= 67) return 'Rain';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code >= 80 && code <= 82) return 'Rain';
    if (code >= 85 && code <= 86) return 'Snow';
    if (code >= 95 && code <= 99) return 'Thunder';
    return 'Sunny';
  };

  const getConditionLabel = (condition: string): string => {
      switch(condition) {
          case 'Sunny': return '晴朗';
          case 'Cloudy': return '多云';
          case 'Rain': return '有雨';
          case 'Snow': return '有雪';
          case 'Thunder': return '雷雨';
          default: return '未知';
      }
  };

  const getAdvice = (temp: number, wind: number, condition: string): string => {
      if (condition === 'Rain' || condition === 'Thunder') return '不宜开箱';
      if (wind > 8) return '风大不宜开箱';
      if (temp < 12) return '气温低不宜开箱';
      if (temp > 35) return '高温注意防暑';
      return '适宜开箱检查';
  };

  useEffect(() => {
    const updateWeather = async () => {
        if (!location.latitude || !location.longitude) return;
        
        try {
            const data = await fetchWeatherData(location.latitude, location.longitude);
            if (data && data.current) {
                const current = data.current;
                const condition = mapWmoCodeToCondition(current.weather_code);
                
                setWeather({
                    temp: Math.round(current.temperature_2m),
                    condition: condition,
                    humidity: current.relative_humidity_2m,
                    windSpeed: current.wind_speed_10m,
                    feelsLike: Math.round(current.apparent_temperature),
                    forecast: getAdvice(current.temperature_2m, current.wind_speed_10m, condition),
                    loading: false
                });
            }
        } catch (error) {
            console.error('Failed to update weather widget', error);
            // Fallback to mock/default or keep loading state? 
            // Let's keep loading false but maybe show stale data
            setWeather(prev => ({ ...prev, loading: false }));
        }
    };

    updateWeather();
    // Refresh every 30 mins
    const interval = setInterval(updateWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [location.latitude, location.longitude]);

  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case 'Rain': return <CloudRain className="w-8 h-8 text-blue-300" />;
      case 'Cloudy': return <Cloud className="w-8 h-8 text-gray-200" />;
      case 'Sunny': return <Sun className="w-8 h-8 text-amber-300 animate-spin-slow" />;
      case 'Snow': return <CloudSnow className="w-8 h-8 text-white" />;
      case 'Thunder': return <CloudLightning className="w-8 h-8 text-purple-300" />;
      default: return <Sun className="w-8 h-8 text-amber-300" />;
    }
  };

  if (weather.loading) {
      return (
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg h-full flex items-center justify-center">
            <RefreshCw className="animate-spin opacity-50" />
        </div>
      );
  }

  return (
    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg overflow-hidden relative h-full flex flex-col justify-between">
      {/* Decorative background circles */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
      
      <div className="relative z-10 flex justify-between items-start">
        <div>
          <h3 className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">当前天气</h3>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-black">{weather.temp}°</span>
            <div className="flex flex-col">
               <span className="text-sm font-medium">{getConditionLabel(weather.condition)}</span>
               <span className="text-xs text-blue-100 opacity-80">体感 {weather.feelsLike}°</span>
            </div>
          </div>
        </div>
        <div>
          {getWeatherIcon(weather.condition)}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 relative z-10">
        <div className="bg-white/10 rounded-lg p-2 flex items-center gap-2">
           <Wind size={14} className="text-blue-200" />
           <span className="text-xs font-medium">{weather.windSpeed} m/s</span>
        </div>
        <div className="bg-white/10 rounded-lg p-2 flex items-center gap-2">
           <CloudRain size={14} className="text-blue-200" />
           <span className="text-xs font-medium">{weather.humidity}%</span>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-white/10 relative z-10">
         <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${weather.forecast.includes('不宜') ? 'bg-red-400' : 'bg-green-400'}`}></div>
            <span className="text-xs font-bold text-white/90">{weather.forecast}</span>
         </div>
      </div>
    </div>
  );
};
