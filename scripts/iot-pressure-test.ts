import 'dotenv/config';
import { setTimeout as sleep } from 'timers/promises';

const baseUrl = process.env.IOT_BASE_URL || 'http://127.0.0.1:3001/api';
const token = process.env.IOT_API_TOKEN || process.env.API_TOKEN || '';
const deviceCount = Number(process.env.IOT_DEVICE_COUNT || 20);
const rounds = Number(process.env.IOT_ROUNDS || 200);
const intervalMs = Number(process.env.IOT_INTERVAL_MS || 200);

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
};

const random = (min: number, max: number) => min + Math.random() * (max - min);

const sendOne = async (deviceId: string) => {
  const payload = {
    deviceId,
    timestamp: Date.now(),
    qos: 1,
    sensors: [
      { type: 'inside_temperature', value: Number(random(15, 38).toFixed(2)), unit: 'C' },
      { type: 'inside_humidity', value: Number(random(20, 95).toFixed(2)), unit: '%' },
      { type: 'outside_temperature', value: Number(random(10, 35).toFixed(2)), unit: 'C' },
      { type: 'outside_humidity', value: Number(random(20, 95).toFixed(2)), unit: '%' },
      { type: 'weight', value: Number(random(20, 60).toFixed(2)), unit: 'kg' },
      { type: 'bees_in', value: Number(random(0, 40).toFixed(0)), unit: 'count' },
      { type: 'bees_out', value: Number(random(0, 40).toFixed(0)), unit: 'count' },
      { type: 'hornet_count', value: Number(random(0, 3).toFixed(0)), unit: 'count' }
    ]
  };
  const res = await fetch(`${baseUrl}/iot/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
};

const run = async () => {
  if (!token) {
    throw new Error('Missing token: set IOT_API_TOKEN or API_TOKEN in environment');
  }
  const started = Date.now();
  let ok = 0;
  let fail = 0;
  for (let r = 0; r < rounds; r += 1) {
    const tasks: Promise<void>[] = [];
    for (let i = 0; i < deviceCount; i += 1) {
      const deviceId = `pi5-${String(i + 1).padStart(3, '0')}`;
      tasks.push(
        sendOne(deviceId)
          .then(() => { ok += 1; })
          .catch(() => { fail += 1; })
      );
    }
    await Promise.all(tasks);
    if (intervalMs > 0) await sleep(intervalMs);
  }
  const elapsed = Date.now() - started;
  const total = ok + fail;
  const qps = total > 0 ? total / (elapsed / 1000) : 0;
  console.log(JSON.stringify({ ok, fail, total, elapsedMs: elapsed, qps }, null, 2));
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
