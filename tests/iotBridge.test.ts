import { describe, expect, it } from 'vitest';
import { mirrorIotSensorsToBeehiveRecord, normalizeSensors, normalizeSensorType } from '../services/iotBridge';

describe('iotBridge', () => {
  it('normalizes sensor aliases to canonical keys', () => {
    expect(normalizeSensorType('temperature')).toBe('inside_temperature');
    expect(normalizeSensorType('inside-temp')).toBe('inside_temperature');
    expect(normalizeSensorType('humidity')).toBe('inside_humidity');
    expect(normalizeSensorType('beesIn')).toBe('bees_in');
    expect(normalizeSensorType('hornetsDetected')).toBe('hornet_count');
  });

  it('normalizes sensor rows and drops invalid values', () => {
    const sensors = normalizeSensors([
      { type: 'temperature', value: '28.1' },
      { type: 'humidity', value: 60.5 },
      { type: 'humidity', value: 61.2 }, // keep last same type
      { type: 'weight', value: 'NaN' }
    ]);
    expect(sensors).toEqual([
      { type: 'inside_temperature', value: 28.1, unit: undefined },
      { type: 'inside_humidity', value: 61.2, unit: undefined }
    ]);
  });

  it('mirrors partial IoT updates into beehive payload with merged shadow', () => {
    const deviceId = `test-device-${Date.now()}`;
    const first = mirrorIotSensorsToBeehiveRecord(deviceId, 1710000000000, [
      { type: 'inside_temperature', value: 31.2 },
      { type: 'inside_humidity', value: 65.5 }
    ]);
    expect(first).not.toBeNull();
    expect(first?.temperature).toBe(31.2);
    expect(first?.humidity).toBe(65.5);
    expect(first?.weight).toBe(0);

    const second = mirrorIotSensorsToBeehiveRecord(deviceId, 1710000002000, [{ type: 'weight', value: 42.6 }]);
    expect(second).not.toBeNull();
    expect(second?.temperature).toBe(31.2);
    expect(second?.humidity).toBe(65.5);
    expect(second?.weight).toBe(42.6);
  });
});
