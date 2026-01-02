import React from 'react';
import { CloudRain, Sun, Cloud, Wind, CloudLightning, CloudSnow } from 'lucide-react';

interface WeatherProps {
  location: { latitude: number; longitude: number };
}

export const WeatherWidget: React.FC<WeatherProps> = ({ location }) => {
  // Mock weather data since we don't have a real weather API key
  // Ideally this would fetch from OpenWeatherMap or similar based on location
  const weather = {
    temp: 24,
    condition: 'Sunny',
    humidity: 45,
    windSpeed: 3.2,
    forecast: '适宜开箱检查'
  };

  const getWeatherIcon = (condition: string) => {
    switch (condition.toLowerCase()) {
      case 'rain': return <CloudRain className="w-8 h-8 text-blue-400" />;
      case 'cloudy': return <Cloud className="w-8 h-8 text-gray-400" />;
      case 'sunny': return <Sun className="w-8 h-8 text-amber-400 animate-spin-slow" />; // Added custom animation class
      default: return <Sun className="w-8 h-8 text-amber-400" />;
    }
  };

  return (
    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg overflow-hidden relative">
      {/* Decorative background circles */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
      
      <div className="relative z-10 flex justify-between items-start">
        <div>
          <h3 className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">当前天气</h3>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-black">{weather.temp}°</span>
            <div className="flex flex-col">
               <span className="text-sm font-medium">{weather.condition === 'Sunny' ? '晴朗' : '多云'}</span>
               <span className="text-xs text-blue-100 opacity-80">体感 26°</span>
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
            <div className="w-2 h-2 rounded-full bg-green-400"></div>
            <span className="text-xs font-bold text-white/90">{weather.forecast}</span>
         </div>
      </div>
    </div>
  );
};
