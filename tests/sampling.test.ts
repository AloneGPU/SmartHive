import { describe, it, expect } from 'vitest';
import { downsampleBeehiveData } from '../services/utils';
import { BeehiveData } from '../types';

describe('LTTB Sampling Logic', () => {
  it('should not downsample if data points are less than threshold', () => {
    const data: BeehiveData[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: Date.now() + i * 1000,
      temperature: 20 + i,
      humidity: 50,
      weight: 100,
      beesIn: 0,
      beesOut: 0,
      hornetsDetected: 0
    }));

    const result = downsampleBeehiveData(data, 20);
    expect(result.points.length).toBe(10);
    expect(result.sample.mode).toBe('none');
  });

  it('should downsample data while preserving peaks', () => {
    // Create 100 points with one significant peak
    const data: BeehiveData[] = Array.from({ length: 100 }, (_, i) => ({
      timestamp: 1000000 + i * 1000,
      temperature: i === 50 ? 50 : 20, // Peak at index 50
      humidity: 50,
      weight: 100,
      beesIn: 0,
      beesOut: 0,
      hornetsDetected: 0
    }));

    const result = downsampleBeehiveData(data, 10);
    expect(result.points.length).toBe(10);
    expect(result.sample.mode).toBe('lttb');
    
    // Check if the peak is preserved
    const temperatures = result.points.map(p => p.temperature);
    expect(temperatures).toContain(50);
  });

  it('should handle empty data', () => {
    const result = downsampleBeehiveData([], 10);
    expect(result.points).toEqual([]);
    expect(result.sample.rawCount).toBe(0);
  });
});
