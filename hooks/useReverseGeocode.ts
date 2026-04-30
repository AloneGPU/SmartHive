import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reverseGeocode } from '../services/dataService';
import { useDebouncedValue } from './useDebouncedValue';

export type ReverseGeocodeResult = {
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  road?: string;
  source?: string;
  errorMessage?: string;
};

export const useReverseGeocode = (params: {
  baseUrl: string;
  token: string;
  latitude: number | null;
  longitude: number | null;
  enabled?: boolean;
}) => {
  const lat = useDebouncedValue(params.latitude, 800);
  const lon = useDebouncedValue(params.longitude, 800);

  const key = useMemo(() => {
    if (lat === null || lon === null) return '';
    // 缓存命中更稳定，避免浮点微抖动
    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
  }, [lat, lon]);

  return useQuery({
    queryKey: ['geocode', params.baseUrl, params.token, key],
    enabled: Boolean(params.enabled ?? true) && Boolean(params.token) && Boolean(key),
    queryFn: async () => {
      if (lat === null || lon === null) return null;
      return (await reverseGeocode(params.baseUrl, params.token, lat, lon)) as ReverseGeocodeResult | null;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1
  });
};
