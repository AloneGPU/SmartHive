import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

type Rng = () => number;

const mulberry32 = (seed: number): Rng => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const round = (v: number, digits: number) => {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
};

const parseArg = (name: string) => {
  const idx = process.argv.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx < 0) return undefined;
  const a = process.argv[idx];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  return process.argv[idx + 1];
};

const hasFlag = (name: string) => process.argv.includes(name);

const toMs = (isoLike: string) => {
  const d = new Date(isoLike);
  const t = d.getTime();
  if (!Number.isFinite(t)) throw new Error(`Invalid date: ${isoLike}`);
  return t;
};

const startOfHour = (ms: number) => {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
};

const addHours = (ms: number, hours: number) => ms + hours * 60 * 60 * 1000;

type SensorRow = {
  timestamp: number;
  device_id: string;
  sensor_type: string;
  value: number;
  unit: string | null;
  qos: number;
  meta_json: string | null;
};

type HiveRow = {
  timestamp: number;
  temperature: number;
  humidity: number;
  weight: number;
  beesIn: number;
  beesOut: number;
  hornetsDetected: number;
  latitude: number | null;
  longitude: number | null;
};

async function main() {
  dotenv.config();

  const deviceId = parseArg('--deviceId') || 'pi5-vision-client';
  const from = parseArg('--from') || '2026-02-01T00:00:00';
  const to = parseArg('--to') || new Date().toISOString();
  const seed = Number(parseArg('--seed') || '20260201');
  const cleanup = !hasFlag('--no-clean');
  const dryRun = hasFlag('--dry-run');

  const fromMs = startOfHour(toMs(from));
  const toMsRaw = toMs(to);
  const toMsHour = startOfHour(toMsRaw);
  if (toMsHour <= fromMs) throw new Error(`range too small: from=${from} to=${to}`);

  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || '3306');
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'smarthive';

  const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true });
  console.log(`[seed] connected mysql ${user}@${host}:${port}/${database}`);
  console.log(`[seed] deviceId=${deviceId}`);
  console.log(`[seed] range=${new Date(fromMs).toISOString()} ~ ${new Date(toMsHour).toISOString()} (hourly)`);
  console.log(`[seed] seed=${seed} cleanup=${cleanup} dryRun=${dryRun}`);

  // Ensure tables exist (minimal subset needed for seeding)
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS hive_data (
      id INT AUTO_INCREMENT PRIMARY KEY,
      timestamp BIGINT NOT NULL,
      temperature DECIMAL(5,2),
      humidity DECIMAL(5,2),
      weight DECIMAL(6,2),
      beesIn INT,
      beesOut INT,
      hornetsDetected INT DEFAULT 0,
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_timestamp (timestamp),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS iot_telemetry (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      timestamp BIGINT NOT NULL,
      device_id VARCHAR(64) NOT NULL,
      sensor_type VARCHAR(64) NOT NULL,
      value DOUBLE NOT NULL,
      unit VARCHAR(32),
      qos TINYINT DEFAULT 0,
      meta_json JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_iot_ts (timestamp),
      INDEX idx_iot_device_ts (device_id, timestamp),
      INDEX idx_iot_device_sensor_ts (device_id, sensor_type, timestamp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS iot_device_status (
      device_id VARCHAR(64) PRIMARY KEY,
      online TINYINT(1) NOT NULL DEFAULT 1,
      last_seen_at BIGINT NOT NULL,
      last_rssi INT NULL,
      last_ip VARCHAR(64) NULL,
      packets_received BIGINT NOT NULL DEFAULT 0,
      packets_dropped BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (cleanup) {
    const delIotSql = `DELETE FROM iot_telemetry WHERE device_id=? AND timestamp>=? AND timestamp<=?`;
    const delHiveSql = `DELETE FROM hive_data WHERE timestamp>=? AND timestamp<=?`;
    if (!dryRun) {
      const [r1] = await conn.execute(delIotSql, [deviceId, fromMs, toMsHour + 60 * 60 * 1000 - 1]);
      const [r2] = await conn.execute(delHiveSql, [fromMs, toMsHour + 60 * 60 * 1000 - 1]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a1 = (r1 as any).affectedRows ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a2 = (r2 as any).affectedRows ?? 0;
      console.log(`[seed] cleanup done: iot_telemetry=${a1} hive_data=${a2}`);
    } else {
      console.log(`[seed] dry-run cleanup: ${delIotSql} / ${delHiveSql}`);
    }
  }

  const rng = mulberry32(seed);

  // Base location (成都附近作为示例，可用 --lat/--lon 覆盖)
  const baseLat = Number(parseArg('--lat') || '30.5728');
  const baseLon = Number(parseArg('--lon') || '104.0668');

  // Start values
  let weight = 42 + rng() * 3; // kg
  let beesInCum = Math.floor(200 + rng() * 100);
  let beesOutCum = Math.floor(190 + rng() * 100);
  let packets = 0;

  const sensorTypes: Array<{ type: string; unit: string | null }> = [
    { type: 'inside_temperature', unit: 'C' },
    { type: 'inside_humidity', unit: '%' },
    { type: 'outside_temperature', unit: 'C' },
    { type: 'outside_humidity', unit: '%' },
    { type: 'weight', unit: 'kg' },
    { type: 'bees_in', unit: 'count' },
    { type: 'bees_out', unit: 'count' },
    { type: 'gps_lat', unit: 'deg' },
    { type: 'gps_lon', unit: 'deg' },
    { type: 'hornet_count', unit: 'count' },
    { type: 'light', unit: 'lx' }
  ];

  const iotRows: SensorRow[] = [];
  const hiveRows: HiveRow[] = [];

  for (let t = fromMs; t <= toMsHour; t = addHours(t, 1)) {
    const d = new Date(t);
    const hour = d.getHours();
    const dayIndex = Math.floor((t - fromMs) / (24 * 3600 * 1000));

    // Daily/season-ish variation (simple)
    const outsideTempBase = 12 + 6 * Math.sin((2 * Math.PI * hour) / 24) + 1.5 * Math.sin((2 * Math.PI * dayIndex) / 14);
    const insideTempBase = outsideTempBase + 14 + 1.8 * Math.sin((2 * Math.PI * (hour - 6)) / 24);
    const outsideHumBase = 55 + 12 * Math.sin((2 * Math.PI * (hour + 3)) / 24) - 6 * Math.sin((2 * Math.PI * dayIndex) / 10);
    const insideHumBase = outsideHumBase + 10 + 5 * Math.sin((2 * Math.PI * (hour - 2)) / 24);

    const outsideTemp = round(outsideTempBase + (rng() - 0.5) * 1.2, 2);
    const insideTemp = round(insideTempBase + (rng() - 0.5) * 1.0, 2);
    const outsideHum = round(clamp(outsideHumBase + (rng() - 0.5) * 6, 20, 95), 2);
    const insideHum = round(clamp(insideHumBase + (rng() - 0.5) * 5, 25, 98), 2);

    // Light: daytime high
    const light = round(clamp((Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12)) * 700) + (rng() * 60), 0, 900), 1);

    // Weight: slowly increasing with noise
    weight = clamp(weight + (rng() - 0.5) * 0.08 + (hour === 6 ? 0.03 : 0), 30, 120);
    const weightNow = round(weight, 2);

    // Bees activity: more in daytime
    const activity = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12));
    const inInc = Math.floor(activity * (20 + rng() * 60));
    const outInc = Math.floor(activity * (18 + rng() * 55));
    beesInCum += inInc;
    beesOutCum += outInc;

    // Hornets: rare spikes
    const spike = rng() < 0.03 ? 1 + Math.floor(rng() * 4) : 0;
    const hornets = spike > 0 ? spike : (rng() < 0.08 ? 1 : 0);

    // GPS: small jitter around base
    const lat = round(baseLat + (rng() - 0.5) * 0.0008, 6);
    const lon = round(baseLon + (rng() - 0.5) * 0.0008, 6);

    packets += 1;
    const qos = 1;
    const meta = {
      agg: {
        mode: 'seed',
        bucketMs: 60 * 60 * 1000,
        start: t,
        end: t + 60 * 60 * 1000 - 1
      }
    };
    const metaJson = JSON.stringify(meta);

    const byType: Record<string, number> = {
      inside_temperature: insideTemp,
      inside_humidity: insideHum,
      outside_temperature: outsideTemp,
      outside_humidity: outsideHum,
      weight: weightNow,
      bees_in: beesInCum,
      bees_out: beesOutCum,
      gps_lat: lat,
      gps_lon: lon,
      hornet_count: hornets,
      light
    };

    // Store IoT at hour end (consistent with hourly aggregation logic)
    const ts = t + 60 * 60 * 1000 - 1;
    for (const st of sensorTypes) {
      iotRows.push({
        timestamp: ts,
        device_id: deviceId,
        sensor_type: st.type,
        value: byType[st.type],
        unit: st.unit,
        qos,
        meta_json: metaJson
      });
    }

    // Store hive_data hourly too (frontend overview/history uses it)
    hiveRows.push({
      timestamp: ts,
      temperature: insideTemp,
      humidity: insideHum,
      weight: weightNow,
      beesIn: beesInCum,
      beesOut: beesOutCum,
      hornetsDetected: hornets,
      latitude: lat,
      longitude: lon
    });
  }

  console.log(`[seed] prepared rows: iot_telemetry=${iotRows.length} hive_data=${hiveRows.length}`);

  const insertIotChunk = async (rows: SensorRow[]) => {
    const values = rows.map((r) => [
      r.timestamp,
      r.device_id,
      r.sensor_type,
      r.value,
      r.unit,
      r.qos,
      r.meta_json
    ]);
    await conn.query(
      'INSERT INTO iot_telemetry (timestamp, device_id, sensor_type, value, unit, qos, meta_json) VALUES ?',
      [values]
    );
  };

  const insertHiveChunk = async (rows: HiveRow[]) => {
    const values = rows.map((r) => [
      r.timestamp,
      r.temperature,
      r.humidity,
      r.weight,
      r.beesIn,
      r.beesOut,
      r.hornetsDetected,
      r.latitude,
      r.longitude
    ]);
    await conn.query(
      'INSERT INTO hive_data (timestamp, temperature, humidity, weight, beesIn, beesOut, hornetsDetected, latitude, longitude) VALUES ?',
      [values]
    );
  };

  const chunkSize = 1000;

  if (!dryRun) {
    for (let i = 0; i < iotRows.length; i += chunkSize) {
      await insertIotChunk(iotRows.slice(i, i + chunkSize));
    }
    for (let i = 0; i < hiveRows.length; i += chunkSize) {
      await insertHiveChunk(hiveRows.slice(i, i + chunkSize));
    }
    const lastSeenAt = iotRows[iotRows.length - 1]?.timestamp || Date.now();
    await conn.execute(
      `INSERT INTO iot_device_status (device_id, online, last_seen_at, packets_received, packets_dropped)
       VALUES (?, 1, ?, ?, 0)
       ON DUPLICATE KEY UPDATE online=1, last_seen_at=VALUES(last_seen_at), packets_received=VALUES(packets_received)`,
      [deviceId, lastSeenAt, packets]
    );
    console.log('[seed] insert done.');
  } else {
    console.log('[seed] dry-run: skip insert.');
  }

  await conn.end();
  console.log('[seed] done.');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});

