import { describe, expect, it } from 'vitest';
import { __testAggregateBucketCache, parseMqttPayload } from '../services/mqttIngestService';
import zlib from 'zlib';

describe('MQTT payload parser', () => {
  it('parses valid payload', () => {
    const payload = Buffer.from(JSON.stringify({
      deviceId: 'pi5-001',
      timestamp: 1710000000000,
      sensors: [
        { type: 'temperature', value: 26.4, unit: 'C' },
        { type: 'humidity', value: 67.2, unit: '%' }
      ]
    }));
    const parsed = parseMqttPayload(payload);
    expect(parsed).not.toBeNull();
    expect(parsed?.deviceId).toBe('pi5-001');
    expect(parsed?.sensors.length).toBe(2);
  });

  it('returns null for invalid payload', () => {
    const payload = Buffer.from('not-json');
    const parsed = parseMqttPayload(payload);
    expect(parsed).toBeNull();
  });

  it('parses compressed payload', () => {
    const raw = {
      deviceId: 'pi5-009',
      timestamp: 1710000000000,
      sensors: [
        { type: 'light', value: 188.2, unit: 'lx' }
      ]
    };
    const compressed = zlib.deflateSync(Buffer.from(JSON.stringify(raw), 'utf-8')).toString('base64');
    const payload = Buffer.from(JSON.stringify({
      compressed: true,
      codec: 'zlib+base64',
      payload: compressed
    }));
    const parsed = parseMqttPayload(payload);
    expect(parsed?.deviceId).toBe('pi5-009');
    expect(parsed?.sensors[0].type).toBe('light');
  });

  it('aggregates hourly bucket using archive semantics', () => {
    const record = __testAggregateBucketCache('pi5-001', String(Math.floor(1710000000000 / 3600000)), {
      inside_temperature: {
        samples: [
          { value: 20, timestamp: 1710000000000 },
          { value: 22, timestamp: 1710000010000 }
        ]
      },
      inside_humidity: {
        samples: [
          { value: 60, timestamp: 1710000000000 },
          { value: 66, timestamp: 1710000010000 }
        ]
      },
      weight: {
        samples: [
          { value: 10, timestamp: 1710000000000 },
          { value: 12.5, timestamp: 1710000010000 }
        ]
      },
      bees_in: {
        samples: [
          { value: 100, timestamp: 1710000000000 },
          { value: 108, timestamp: 1710000010000 }
        ]
      },
      bees_out: {
        samples: [
          { value: 50, timestamp: 1710000000000 },
          { value: 53, timestamp: 1710000010000 }
        ]
      },
      hornet_count: {
        samples: [
          { value: 0, timestamp: 1710000000000 },
          { value: 3, timestamp: 1710000005000 },
          { value: 1, timestamp: 1710000010000 }
        ]
      }
    });

    expect(record?.insideTemperature).toBe(21);
    expect(record?.insideHumidity).toBe(63);
    expect(record?.weight).toBe(12.5);
    expect(record?.beesIn).toBe(8);
    expect(record?.beesOut).toBe(3);
    expect(record?.hornetsDetected).toBe(3);
  });
});
