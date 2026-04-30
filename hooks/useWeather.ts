import { useState, useEffect, useCallback } from 'react';
import { WeatherData } from '../components/WeatherWidget';

interface UseWeatherProps {
  latitude: number;
  longitude: number;
  enabled?: boolean;
}

export const useWeather = ({ latitude, longitude, enabled = true }: UseWeatherProps) => {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async () => {
    if (!enabled || !latitude || !longitude) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,uv_index,precipitation,pressure_msl&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=7`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setWeatherData(data);
    } catch (error) {
      console.error('获取天气数据失败:', error);
      setError(error instanceof Error ? error.message : '获取天气数据失败');
    } finally {
      setLoading(false);
    }
  }, [latitude, longitude, enabled]);

  useEffect(() => {
    if (enabled && latitude && longitude) {
      fetchWeather();
    }
  }, [fetchWeather]);

  // 自动刷新（每30分钟）
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      if (weatherData) {
        fetchWeather();
      }
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchWeather, enabled, weatherData]);

  return {
    weatherData,
    loading,
    error,
    refetch: fetchWeather,
    enabled
  };
};