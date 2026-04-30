import type { BeehiveData, IotDeviceStatus, IotTelemetryPoint } from '../types';

export type IotSensorInput = {
  type: string;
  value: number;
  unit?: string;
};

const SENSOR_ALIAS_MAP: Record<string, string> = {
  temp: 'inside_temperature',
  temperature: 'inside_temperature',
  in_temp: 'inside_temperature',
  inside_temp: 'inside_temperature',
  inside_temperature: 'inside_temperature',
  hum: 'inside_humidity',
  humidity: 'inside_humidity',
  in_humi: 'inside_humidity',
  in_hum: 'inside_humidity',
  inside_hum: 'inside_humidity',
  inside_humidity: 'inside_humidity',
  out_temp: 'outside_temperature',
  outside_temp: 'outside_temperature',
  outside_temperature: 'outside_temperature',
  out_humi: 'outside_humidity',
  out_hum: 'outside_humidity',
  outside_hum: 'outside_humidity',
  outside_humidity: 'outside_humidity',
  hive_weight: 'weight',
  weight_kg: 'weight',
  hx711_weight: 'weight',
  beesin: 'bees_in',
  bees_in: 'bees_in',
  bee_in: 'bees_in',
  in_count: 'bees_in',
  beesout: 'bees_out',
  bees_out: 'bees_out',
  bee_out: 'bees_out',
  out_count: 'bees_out',
  hornets: 'hornet_count',
  hornet: 'hornet_count',
  hornet_count: 'hornet_count',
  hornets_detected: 'hornet_count',
  hornetsdetected: 'hornet_count',
  // GPS
  lat: 'latitude',
  latitude: 'latitude',
  gps_lat: 'latitude',
  gpslatitude: 'latitude',
  gps_latitude: 'latitude',
  lon: 'longitude',
  lng: 'longitude',
  longitude: 'longitude',
  gps_lon: 'longitude',
  gps_lng: 'longitude',
  gpslongitude: 'longitude',
  gps_longitude: 'longitude',
  // Vision metrics (stored in iot_telemetry only; optional for dashboards)
  fps: 'vision_fps',
  latency_ms: 'vision_latency_ms'
};

const toSensorKey = (value: string) => value.trim().toLowerCase().replace(/[.\-\s]+/g, '_');

export const normalizeSensorType = (rawType: string): string => {
  const key = toSensorKey(rawType || '');
  if (!key) return '';
  return SENSOR_ALIAS_MAP[key] || key;
};

export const normalizeSensors = (sensors: Array<{ type?: unknown; value?: unknown; unit?: unknown }>): IotSensorInput[] => {
  if (!Array.isArray(sensors) || sensors.length === 0) return [];
  const byType = new Map<string, IotSensorInput>();
  for (const sensor of sensors) {
    const type = normalizeSensorType(String(sensor?.type || ''));
    const value = Number(sensor?.value);
    if (!type || !Number.isFinite(value)) continue;
    const unit = typeof sensor?.unit === 'string' && sensor.unit.trim() ? sensor.unit.trim() : undefined;
    byType.set(type, { type, value, unit });
  }
  return Array.from(byType.values());
};

const normalizeTimestamp = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return n;
};

const storageBucketMinutesRaw = Number(process.env.MQTT_STORAGE_BUCKET_MINUTES || '60');
const storageBucketMinutes = Number.isFinite(storageBucketMinutesRaw) ? Math.max(0, storageBucketMinutesRaw) : 60;
const storageBucketMs = storageBucketMinutes > 0 ? storageBucketMinutes * 60 * 1000 : 0;

const lastPersistBucketBySensor = new Map<string, number>();
const lastMirrorBucketByDevice = new Map<string, number>();

export const getStorageBucketMinutes = () => storageBucketMinutes;

const bucketAt = (timestamp: number) => {
  if (storageBucketMs <= 0) return null;
  return Math.floor(normalizeTimestamp(timestamp) / storageBucketMs);
};

export const selectTelemetryPointsForPersistence = (points: IotTelemetryPoint[]): IotTelemetryPoint[] => {
  if (!Array.isArray(points) || points.length === 0) return [];
  if (storageBucketMs <= 0) return points;
  const selected: IotTelemetryPoint[] = [];
  for (const point of points) {
    const bucket = bucketAt(point.timestamp);
    if (bucket === null) {
      selected.push(point);
      continue;
    }
    const key = `${point.deviceId}:${point.sensorType}`;
    const last = lastPersistBucketBySensor.get(key);
    if (last === bucket) continue;
    lastPersistBucketBySensor.set(key, bucket);
    selected.push(point);
  }
  return selected;
};

export const shouldPersistMirrorForDevice = (deviceId: string, timestamp: number): boolean => {
  if (!deviceId) return false;
  if (storageBucketMs <= 0) return true;
  const bucket = bucketAt(timestamp);
  if (bucket === null) return true;
  const last = lastMirrorBucketByDevice.get(deviceId);
  if (last === bucket) return false;
  lastMirrorBucketByDevice.set(deviceId, bucket);
  return true;
};

export const buildIotDeviceStatus = (
  deviceId: string,
  statusRaw: any,
  timestamp: number,
  points: number
): IotDeviceStatus => ({
  deviceId,
  online: statusRaw?.online ?? true,
  lastSeenAt: normalizeTimestamp(timestamp),
  lastRssi: Number.isFinite(Number(statusRaw?.rssi)) ? Number(statusRaw.rssi) : undefined,
  lastIp: typeof statusRaw?.ip === 'string' ? statusRaw.ip : undefined,
  packetsReceived: Number.isFinite(Number(statusRaw?.packetsReceived)) ? Number(statusRaw.packetsReceived) : points,
  packetsDropped: Number.isFinite(Number(statusRaw?.packetsDropped)) ? Number(statusRaw.packetsDropped) : 0
});

type HiveShadow = {
  temperature?: number;
  humidity?: number;
  insideTemperature?: number;
  insideHumidity?: number;
  outsideTemperature?: number;
  outsideHumidity?: number;
  weight?: number;
  beesIn?: number;
  beesOut?: number;
  hornetsDetected?: number;
  latitude?: number;
  longitude?: number;
  updatedAt: number;
};

const hiveShadowByDevice = new Map<string, HiveShadow>();

const shouldMirrorToBeehive = () => {
  const raw = String(process.env.IOT_MIRROR_TO_BEEHIVE || 'true').trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off' || raw === 'no');
};

const clampNonNegativeInt = (value: number | undefined, fallback = 0) => {
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.max(0, Math.round(Number(value)));
};

export const mirrorIotSensorsToBeehiveRecord = (deviceId: string, timestamp: number, sensors: IotSensorInput[]): BeehiveData | null => {
  if (!shouldMirrorToBeehive()) return null;
  if (!deviceId || !Array.isArray(sensors) || sensors.length === 0) return null;

  const prev = hiveShadowByDevice.get(deviceId) || { updatedAt: 0 };
  const next: HiveShadow = { ...prev, updatedAt: normalizeTimestamp(timestamp) };
  let touched = false;

  for (const sensor of sensors) {
    if (sensor.type === 'inside_temperature') {
      next.insideTemperature = sensor.value;
      next.temperature = sensor.value;
      touched = true;
    } else if (sensor.type === 'inside_humidity') {
      next.insideHumidity = sensor.value;
      next.humidity = sensor.value;
      touched = true;
    } else if (sensor.type === 'outside_temperature') {
      next.outsideTemperature = sensor.value;
      touched = true;
    } else if (sensor.type === 'outside_humidity') {
      next.outsideHumidity = sensor.value;
      touched = true;
    } else if (sensor.type === 'weight') {
      next.weight = sensor.value;
      touched = true;
    } else if (sensor.type === 'bees_in') {
      next.beesIn = sensor.value;
      touched = true;
    } else if (sensor.type === 'bees_out') {
      next.beesOut = sensor.value;
      touched = true;
    } else if (sensor.type === 'hornet_count') {
      next.hornetsDetected = sensor.value;
      touched = true;
    } else if (sensor.type === 'latitude') {
      const lat = Number(sensor.value);
      if (Number.isFinite(lat) && lat >= -90 && lat <= 90) {
        next.latitude = lat;
        touched = true;
      }
    } else if (sensor.type === 'longitude') {
      const lon = Number(sensor.value);
      if (Number.isFinite(lon) && lon >= -180 && lon <= 180) {
        next.longitude = lon;
        touched = true;
      }
    }
  }

  if (!touched) return null;

  hiveShadowByDevice.set(deviceId, next);
  const primaryTemperature =
    Number.isFinite(Number(next.insideTemperature))
      ? Number(next.insideTemperature)
      : Number.isFinite(Number(next.temperature))
        ? Number(next.temperature)
        : Number(next.outsideTemperature ?? 0);
  const primaryHumidity =
    Number.isFinite(Number(next.insideHumidity))
      ? Number(next.insideHumidity)
      : Number.isFinite(Number(next.humidity))
        ? Number(next.humidity)
        : Number(next.outsideHumidity ?? 0);

  return {
    timestamp: next.updatedAt,
    temperature: primaryTemperature,
    humidity: primaryHumidity,
    insideTemperature: Number.isFinite(Number(next.insideTemperature)) ? Number(next.insideTemperature) : undefined,
    insideHumidity: Number.isFinite(Number(next.insideHumidity)) ? Number(next.insideHumidity) : undefined,
    outsideTemperature: Number.isFinite(Number(next.outsideTemperature)) ? Number(next.outsideTemperature) : undefined,
    outsideHumidity: Number.isFinite(Number(next.outsideHumidity)) ? Number(next.outsideHumidity) : undefined,
    weight: Number(next.weight ?? 0),
    beesIn: clampNonNegativeInt(next.beesIn, 0),
    beesOut: clampNonNegativeInt(next.beesOut, 0),
    hornetsDetected: clampNonNegativeInt(next.hornetsDetected, 0),
    ...(Number.isFinite(Number(next.latitude)) ? { latitude: Number(next.latitude) } : {}),
    ...(Number.isFinite(Number(next.longitude)) ? { longitude: Number(next.longitude) } : {})
  };
};
