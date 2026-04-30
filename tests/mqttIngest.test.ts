import { describe, expect, it } from 'vitest';
import { parseMqttPayload } from '../services/mqttIngestService';
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
});
