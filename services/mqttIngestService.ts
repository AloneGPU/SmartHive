import mqtt, { MqttClient } from 'mqtt';
import { insertBeehiveData, insertIotTelemetryBatch, upsertIotDeviceStatus } from './databaseService';
import { realtimeHub } from './realtimeHub';
import type { IotDeviceStatus, IotTelemetryPoint, BeehiveData } from '../types';
import zlib from 'zlib';
import {
  buildIotDeviceStatus,
  getStorageBucketMinutes,
  mirrorIotSensorsToBeehiveRecord,
  normalizeSensors,
  selectTelemetryPointsForPersistence,
  shouldPersistMirrorForDevice
} from './iotBridge';

// 每小时存储的缓存：保留 value+timestamp，便于区分平均值、末值、差值、最大值。
type BucketSensorAgg = { samples: Array<{ value: number; timestamp: number }> };
type DeviceBucketCache = Record<string, Record<string, BucketSensorAgg>>;
interface HourlyCache {
  // deviceId -> bucketKey -> sensorType -> agg
  [deviceId: string]: DeviceBucketCache;
}

const hourlyCache: HourlyCache = {};
// 注意：getStorageBucketMinutes() 允许为 0（表示禁用抽样、全量落库）。
// 这里不能用 `|| 60`，否则会把 0 误当成 60。
const bucketMinutes = Number.isFinite(getStorageBucketMinutes()) ? getStorageBucketMinutes() : 60;
const bucketMs = Math.max(1, bucketMinutes) * 60 * 1000;

type MqttStats = {
  connected: boolean;
  reconnects: number;
  receivedMessages: number;
  persistedPoints: number;
  skippedPointsByBucket: number;
  droppedMessages: number;
  lastError?: string;
  startedAt: number;
  storageBucketMinutes: number;
};

const stats: MqttStats = {
  connected: false,
  reconnects: 0,
  receivedMessages: 0,
  persistedPoints: 0,
  skippedPointsByBucket: 0,
  droppedMessages: 0,
  startedAt: Date.now(),
  storageBucketMinutes: getStorageBucketMinutes()
};

let client: MqttClient | null = null;

export const parseMqttPayload = (buf: Buffer): {
  deviceId: string;
  timestamp: number;
  qos?: number;
  sensors: Array<{ type: string; value: number; unit?: string }>;
  status?: Partial<IotDeviceStatus> & { replay?: boolean; replayType?: string; replayAt?: number };
} | null => {
  try {
    let raw: any = JSON.parse(buf.toString('utf-8'));
    if (raw?.compressed === true && raw?.codec === 'zlib+base64' && typeof raw?.payload === 'string') {
      const inflated = zlib.inflateSync(Buffer.from(raw.payload, 'base64')).toString('utf-8');
      raw = JSON.parse(inflated);
    }
    const sensors = Array.isArray(raw?.sensors) ? raw.sensors : [];
    const normalizedSensors = normalizeSensors(sensors);
    if (!raw?.deviceId || normalizedSensors.length === 0) return null;
    return {
      deviceId: String(raw.deviceId),
      timestamp: Number(raw.timestamp || Date.now()),
      qos: Number.isFinite(Number(raw.qos)) ? Number(raw.qos) : undefined,
      sensors: normalizedSensors,
      status: raw.status && typeof raw.status === 'object' ? raw.status : undefined
    };
  } catch {
    return null;
  }
};

export const startMqttIngestService = () => {
  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883';
  const topic = process.env.MQTT_SENSOR_TOPIC || 'smarthive/+/sensors';
  const qosRaw = Number.isFinite(Number(process.env.MQTT_SUB_QOS)) ? Number(process.env.MQTT_SUB_QOS) : 1;
  const qos: 0 | 1 | 2 = qosRaw <= 0 ? 0 : qosRaw >= 2 ? 2 : 1;
  const clientId = process.env.MQTT_CLIENT_ID || `smarthive-server-${process.pid}`;
  client = mqtt.connect(brokerUrl, {
    clientId,
    reconnectPeriod: 3000,
    keepalive: 30,
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined
  });

  client.on('connect', () => {
    stats.connected = true;
    client?.subscribe(topic, { qos }, (err) => {
      if (err) {
        stats.lastError = err.message;
      }
    });
  });

  client.on('reconnect', () => {
    stats.reconnects += 1;
  });

  client.on('close', () => {
    stats.connected = false;
  });

  client.on('error', (err) => {
    stats.lastError = err.message;
  });

  client.on('message', async (_topic, payload, packet) => {
    stats.receivedMessages += 1;
    const parsed = parseMqttPayload(payload);
    if (!parsed) {
      stats.droppedMessages += 1;
      return;
    }
    
    // 1. Broadcast to frontend for real-time UI updates.
    // If it's a replay/catch-up payload (e.g. device was offline), skip broadcasting to avoid UI “history spam”.
    const isReplay = Boolean((parsed.status as any)?.replay);
    if (!isReplay) {
      realtimeHub.broadcast({
        type: 'iot.telemetry',
        payload: {
          deviceId: parsed.deviceId,
          timestamp: parsed.timestamp,
          sensors: parsed.sensors
        },
        ts: Date.now()
      });
    }

    // 2. Always update device online status
    const points: IotTelemetryPoint[] = parsed.sensors.map((s) => ({
      timestamp: parsed.timestamp,
      deviceId: parsed.deviceId,
      sensorType: s.type,
      value: s.value,
      unit: s.unit,
      qos: packet.qos,
      meta: { topic: _topic }
    }));
    // Replay payload should not affect “online/lastSeenAt” to avoid history data overwriting live status.
    if (!isReplay) {
      const status: IotDeviceStatus = buildIotDeviceStatus(parsed.deviceId, parsed.status, parsed.timestamp, points.length);
      try {
        const statusSaved = await upsertIotDeviceStatus(status);
        if (!statusSaved) {
          stats.lastError = `Failed to upsert device status for ${parsed.deviceId}`;
        }
      } catch (error) {
        stats.lastError = `Failed to upsert device status for ${parsed.deviceId}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    // 3. Persist IoT telemetry (bucket-sampled) to iot_telemetry
    // - 若 MQTT_STORAGE_BUCKET_MINUTES=0：全量落库
    // - 否则：按 bucket 抽样，减少写入量
    const pointsToPersist = selectTelemetryPointsForPersistence(points);
    const skipped = points.length - pointsToPersist.length;
    if (pointsToPersist.length > 0) {
      try {
        const inserted = await insertIotTelemetryBatch(pointsToPersist);
        stats.persistedPoints += Math.max(0, inserted);
        if (inserted <= 0) {
          stats.lastError = `Failed to persist iot_telemetry points for ${parsed.deviceId}`;
        }
      } catch (error) {
        stats.lastError = `Failed to persist iot_telemetry points for ${parsed.deviceId}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    if (skipped > 0) {
      stats.skippedPointsByBucket += skipped;
    }

    // 4. Add data to bucketed cache for later storage (bucket is based on payload timestamp)
    const bucketKey = String(Math.floor(Number(parsed.timestamp || Date.now()) / bucketMs));
    if (!hourlyCache[parsed.deviceId]) hourlyCache[parsed.deviceId] = {};
    if (!hourlyCache[parsed.deviceId][bucketKey]) hourlyCache[parsed.deviceId][bucketKey] = {};

    for (const sensor of parsed.sensors) {
      const byType = hourlyCache[parsed.deviceId][bucketKey];
      if (!byType[sensor.type]) byType[sensor.type] = { samples: [] };
      byType[sensor.type].samples.push({ value: sensor.value, timestamp: parsed.timestamp });
    }

    console.log(`[MQTT] Received data from ${parsed.deviceId}, cached for hourly storage`);

    // Replay/hourly catch-up: persist aggregated beehive record immediately
    if (isReplay) {
      void storeBucketData(parsed.deviceId, bucketKey);
    }
  });
};

const aggregateBucketCache = (
  deviceId: string,
  bucketKey: string,
  bucketCache: Record<string, BucketSensorAgg> | undefined
): BeehiveData | null => {
  if (!bucketCache) return null;

  const sortSamples = (samples: Array<{ value: number; timestamp: number }>) =>
    samples
      .filter((s) => Number.isFinite(Number(s.value)) && Number.isFinite(Number(s.timestamp)))
      .sort((a, b) => a.timestamp - b.timestamp);

  const avg = (samples: Array<{ value: number; timestamp: number }>) => {
    const values = samples.map((s) => Number(s.value)).filter(Number.isFinite);
    if (values.length === 0) return undefined;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const last = (samples: Array<{ value: number; timestamp: number }>) => {
    const ordered = sortSamples(samples);
    return ordered.length > 0 ? ordered[ordered.length - 1].value : undefined;
  };

  const max = (samples: Array<{ value: number; timestamp: number }>) => {
    const values = samples.map((s) => Number(s.value)).filter(Number.isFinite);
    return values.length > 0 ? Math.max(...values) : undefined;
  };

  const delta = (samples: Array<{ value: number; timestamp: number }>) => {
    const ordered = sortSamples(samples);
    if (ordered.length === 0) return undefined;
    if (ordered.length === 1) return 0;
    const first = ordered[0].value;
    const lastValue = ordered[ordered.length - 1].value;
    return Math.max(0, Math.round(lastValue - first));
  };

  const bucketRules: Record<string, (samples: Array<{ value: number; timestamp: number }>) => number | undefined> = {
    inside_temperature: avg,
    inside_humidity: avg,
    outside_temperature: avg,
    outside_humidity: avg,
    weight: last,
    latitude: last,
    longitude: last,
    bees_in: delta,
    bees_out: delta,
    hornet_count: max,
    vision_fps: avg,
    vision_latency_ms: avg
  };

  const aggregatedData: Record<string, number> = {};
  Object.entries(bucketCache).forEach(([sensorType, data]) => {
    const rule = bucketRules[sensorType] || avg;
    const value = rule(data.samples);
    if (Number.isFinite(Number(value))) {
      aggregatedData[sensorType] = Number(value);
    }
  });

  // 构建蜂箱数据记录
  const bucketStartTs = Number(bucketKey) * bucketMs;
  return mirrorIotSensorsToBeehiveRecord(
    deviceId,
    bucketStartTs,
    Object.entries(aggregatedData).map(([type, value]) => ({ type, value }))
  );
};

const aggregateBucketData = (deviceId: string, bucketKey: string): BeehiveData | null => {
  const deviceCache = hourlyCache[deviceId];
  return aggregateBucketCache(deviceId, bucketKey, deviceCache?.[bucketKey]);
};

export const __testAggregateBucketCache = aggregateBucketCache;

const storeBucketData = async (deviceId: string, bucketKey: string) => {
  try {
    const aggregatedData = aggregateBucketData(deviceId, bucketKey);
    if (aggregatedData) {
      const saved = await insertBeehiveData(aggregatedData);
      if (saved) {
        console.log(`[MQTT] Bucket data stored for device ${deviceId} bucket=${bucketKey}`);
        // 清空该 bucket 缓存（成功才删除，失败保留待重试）
        if (hourlyCache[deviceId]) {
          delete hourlyCache[deviceId][bucketKey];
          if (Object.keys(hourlyCache[deviceId]).length === 0) {
            delete hourlyCache[deviceId];
          }
        }
      }
    }
  } catch (error) {
    console.error(`[MQTT] Error storing hourly data:`, error);
    stats.lastError = `Failed to store hourly data: ${error instanceof Error ? error.message : String(error)}`;
  }
};

// 定期检查并存储“已结束的 bucket”
setInterval(() => {
  const now = Date.now();
  const currentBucket = Math.floor(now / bucketMs);
  Object.keys(hourlyCache).forEach((deviceId) => {
    const buckets = Object.keys(hourlyCache[deviceId] || {})
      .map((b) => Number(b))
      .filter((b) => Number.isFinite(b))
      .sort((a, b) => a - b);
    for (const b of buckets) {
      // only store buckets strictly older than current bucket
      if (b < currentBucket) {
        void storeBucketData(deviceId, String(b));
      }
    }
  });
}, 5 * 60 * 1000); // 每5分钟检查一次

export const getMqttIngestStats = () => ({
  ...stats,
  cachedDevices: Object.keys(hourlyCache).length
});
