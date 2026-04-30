import mysql from 'mysql2/promise';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import dotenv from 'dotenv';

if (process.env.DOTENV_CONFIG_PATH) {
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH });
}

type SeedRow = {
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

const toInt = (value: string | undefined, fallback: number) => {
  const n = Number.parseInt(value || '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const round = (n: number, digits: number) => {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const seededRandom = (seed: number) => {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
};

const daysInMonth = (year: number, month1to12: number) => {
  return new Date(year, month1to12, 0).getDate();
};

const buildRowsForMonth = (year: number, month1to12: number, rowsPerDay: number) => {
  const tzBase = new Date();
  const seedBase = Date.UTC(year, month1to12 - 1, 1, tzBase.getHours(), tzBase.getMinutes(), tzBase.getSeconds());
  const rand = seededRandom(seedBase);
  const rows: SeedRow[] = [];

  const baseLat = Number.isFinite(Number(process.env.SEED_BASE_LAT))
    ? Number(process.env.SEED_BASE_LAT)
    : 23.1291;
  const baseLon = Number.isFinite(Number(process.env.SEED_BASE_LON))
    ? Number(process.env.SEED_BASE_LON)
    : 113.2644;

  const baseWeight = Number.isFinite(Number(process.env.SEED_BASE_WEIGHT))
    ? Number(process.env.SEED_BASE_WEIGHT)
    : 24.5;

  const dim = daysInMonth(year, month1to12);
  const hours = rowsPerDay === 3 ? [8, 14, 20] : Array.from({ length: rowsPerDay }, (_, i) => Math.round(24 * (i + 1) / (rowsPerDay + 1)));

  for (let day = 1; day <= dim; day++) {
    for (let i = 0; i < rowsPerDay; i++) {
      const hour = hours[i] ?? 12;
      const dt = new Date(year, month1to12 - 1, day, hour, 0, 0, 0);
      const t = dt.getTime();

      const dayPhase = (hour / 24) * Math.PI * 2;
      const tempWave = Math.sin(dayPhase - Math.PI / 2);
      const humWave = Math.cos(dayPhase);

      const seasonal = (day - 1) / (dim - 1);
      const dailyBaseTemp = 12 + seasonal * 3;
      const temperature = round(clamp(dailyBaseTemp + tempWave * 3 + (rand() - 0.5) * 1.2, 2, 28), 2);

      const dailyBaseHum = 60 + (1 - seasonal) * 6;
      const humidity = round(clamp(dailyBaseHum + humWave * 8 + (rand() - 0.5) * 5, 30, 95), 2);

      const weightTrend = ((day - 1) / dim) * 0.9;
      const weightNoise = (rand() - 0.5) * 0.2;
      const weight = round(clamp(baseWeight + weightTrend + weightNoise, 5, 90), 2);

      const warmFactor = clamp((temperature - 5) / 18, 0, 1);
      const activity = clamp(0.15 + warmFactor * 0.8 + (rand() - 0.5) * 0.15, 0, 1);
      const beesIn = Math.round(20 + activity * 420 + rand() * 120);
      const beesOut = Math.round(15 + activity * 390 + rand() * 110);

      const hornetsDetected = day % 23 === 0 && hour === 14 ? 1 : 0;

      const missingGps = (day % 12 === 0) && hour === 20;
      const latitude = missingGps ? null : round(baseLat + ((day % 100) / 10000) + (rand() - 0.5) * 0.00002, 8);
      const longitude = missingGps ? null : round(baseLon + ((day % 100) / 10000) + (rand() - 0.5) * 0.00002, 8);

      rows.push({
        timestamp: t,
        temperature,
        humidity,
        weight,
        beesIn,
        beesOut,
        hornetsDetected,
        latitude,
        longitude
      });
    }
  }

  return rows;
};

const buildRows = (count: number, baseMs: number) => {
  const rand = seededRandom(baseMs);
  const rows: SeedRow[] = [];

  const baseLat = Number.isFinite(Number(process.env.SEED_BASE_LAT))
    ? Number(process.env.SEED_BASE_LAT)
    : 23.1291;
  const baseLon = Number.isFinite(Number(process.env.SEED_BASE_LON))
    ? Number(process.env.SEED_BASE_LON)
    : 113.2644;

  const baseWeight = Number.isFinite(Number(process.env.SEED_BASE_WEIGHT))
    ? Number(process.env.SEED_BASE_WEIGHT)
    : 25;

  for (let i = 0; i < count; i++) {
    const t = baseMs - i * 60_000;
    const dayPhase = (i % 1440) / 1440;
    const tempWave = Math.sin(dayPhase * Math.PI * 2);
    const humWave = Math.cos(dayPhase * Math.PI * 2);

    const temperature = round(clamp(30 + tempWave * 4 + (rand() - 0.5) * 1.6, 18, 42), 2);
    const humidity = round(clamp(55 + humWave * 12 + (rand() - 0.5) * 6, 20, 95), 2);

    const weightNoise = (rand() - 0.5) * 0.3;
    const weightTrend = (i / count) * 1.2;
    const weight = round(clamp(baseWeight + weightTrend + weightNoise, 5, 90), 2);

    const activity = clamp(0.3 + Math.max(0, tempWave) * 0.9 + (rand() - 0.5) * 0.2, 0, 1);
    const beesIn = Math.round(50 + activity * 600 + rand() * 180);
    const beesOut = Math.round(40 + activity * 560 + rand() * 160);

    const hornetsDetected = i % 17 === 0 ? 1 + (i % 3) : 0;

    const missingGps = i % 10 === 0;
    const latitude = missingGps ? null : round(baseLat + (i % 100) / 10000, 8);
    const longitude = missingGps ? null : round(baseLon + (i % 100) / 10000, 8);

    rows.push({
      timestamp: t,
      temperature,
      humidity,
      weight,
      beesIn,
      beesOut,
      hornetsDetected,
      latitude,
      longitude
    });
  }

  return rows;
};

const ensureTable = async (conn: mysql.Connection) => {
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
};

const insertRows = async (conn: mysql.Connection, rows: SeedRow[]) => {
  const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
  const sql = `
    INSERT INTO hive_data (
      timestamp,
      temperature,
      humidity,
      weight,
      beesIn,
      beesOut,
      hornetsDetected,
      latitude,
      longitude
    ) VALUES ${placeholders}
  `;

  const values: Array<number | null> = [];
  for (const r of rows) {
    values.push(
      r.timestamp,
      r.temperature,
      r.humidity,
      r.weight,
      r.beesIn,
      r.beesOut,
      r.hornetsDetected,
      r.latitude,
      r.longitude
    );
  }
  await conn.execute(sql, values);
};

const parseArgs = (argv: string[]) => {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2);
    const v = argv[i + 1];
    if (v && !v.startsWith('--')) {
      args[key] = v;
      i++;
    } else {
      args[key] = 'true';
    }
  }
  return args;
};

const promptPasswordIfNeeded = async (current: string) => {
  if (current) return current;
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question('请输入 MySQL 密码（输入时会显示明文）: ');
    return answer;
  } finally {
    rl.close();
  }
};

const parseMonth = (value: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const host = args.host || process.env.DB_HOST || 'localhost';
  const port = toInt(args.port || process.env.DB_PORT, 3306);
  const user = args.user || process.env.DB_USER || 'root';
  const database = args.db || process.env.DB_NAME || 'moni';
  const password = await promptPasswordIfNeeded(args.password || process.env.DB_PASSWORD || '');

  const monthArg = args.month || '';
  const monthParsed = monthArg ? parseMonth(monthArg) : null;
  const targetYear = monthParsed?.year ?? new Date().getFullYear();
  const targetMonth = monthParsed?.month ?? 2;
  const rowsPerDay = Math.max(1, toInt(args.perDay || process.env.SEED_PER_DAY, 3));
  const truncate = (args.truncate || '').toLowerCase() === 'true' || args.truncate === '1';
  const plannedRows = daysInMonth(targetYear, targetMonth) * rowsPerDay;

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    charset: 'utf8mb4'
  });

  try {
    console.log(JSON.stringify({
      host,
      port,
      user,
      database,
      month: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      rowsPerDay,
      plannedRows,
      truncate
    }, null, 2));

    await conn.beginTransaction();
    await ensureTable(conn);

    if (truncate) {
      await conn.execute('TRUNCATE TABLE hive_data');
    }

    const rows = buildRowsForMonth(targetYear, targetMonth, rowsPerDay);
    await insertRows(conn, rows);
    await conn.commit();

    const [[result]] = await conn.query<any[]>(
      'SELECT COUNT(*) AS total, MIN(timestamp) AS minTs, MAX(timestamp) AS maxTs FROM hive_data'
    );
    const total = result?.total ?? 0;
    const minTs = result?.minTs ?? null;
    const maxTs = result?.maxTs ?? null;

    console.log(JSON.stringify({ inserted: rows.length, total, minTs, maxTs }, null, 2));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    await conn.end();
  }
};

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`Seed failed: ${msg}`);
  process.exitCode = 1;
});
