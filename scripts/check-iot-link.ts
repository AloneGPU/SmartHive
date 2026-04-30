import 'dotenv/config';

const baseUrl = process.env.IOT_BASE_URL || 'http://127.0.0.1:3001/api';
const token = process.env.IOT_API_TOKEN || process.env.API_TOKEN || '';
const deviceId = process.env.IOT_DEVICE_ID || 'pi5-link-check';

const headers: Record<string, string> = {
  'Content-Type': 'application/json'
};
if (token) headers.Authorization = `Bearer ${token}`;

const ensureOk = async (res: Response, context: string) => {
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${context} failed: HTTP ${res.status} ${detail}`);
  }
};

const run = async () => {
  if (!token) {
    throw new Error('Missing token: set IOT_API_TOKEN or API_TOKEN');
  }

  const health = await fetch(`${baseUrl}/health`);
  await ensureOk(health, 'health');
  const healthBody = await health.json().catch(() => ({}));
  if (!healthBody?.databaseConnected) {
    throw new Error('Health check failed: databaseConnected=false (请先确认 MySQL 连接与权限)');
  }

  const now = Date.now();
  const ingestPayload = {
    deviceId,
    timestamp: now,
    qos: 1,
    sensorValues: {
      inside_temperature: 28.3,
      inside_humidity: 63.2,
      outside_temperature: 23.6,
      outside_humidity: 58.1,
      weight: 41.25,
      bees_in: 18,
      bees_out: 16,
      hornet_count: 0
    }
  };
  const ingestRes = await fetch(`${baseUrl}/iot/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify(ingestPayload)
  });
  await ensureOk(ingestRes, 'iot/ingest');
  const ingestBody = await ingestRes.json().catch(() => ({}));

  await new Promise((resolve) => setTimeout(resolve, 300));

  const latestRes = await fetch(`${baseUrl}/iot/latest?deviceId=${encodeURIComponent(deviceId)}`, { headers });
  await ensureOk(latestRes, 'iot/latest');
  const latestRows = (await latestRes.json()) as Array<{ sensorType?: string; timestamp?: number }>;

  const historyRes = await fetch(
    `${baseUrl}/iot/history?deviceId=${encodeURIComponent(deviceId)}&start=${now - 60_000}&end=${Date.now()}&limit=200`,
    { headers }
  );
  await ensureOk(historyRes, 'iot/history');
  const historyRows = (await historyRes.json()) as Array<{ timestamp?: number }>;

  const pipelineRes = await fetch(`${baseUrl}/iot/pipeline-status?deviceId=${encodeURIComponent(deviceId)}`, { headers });
  await ensureOk(pipelineRes, 'iot/pipeline-status');
  const pipeline = await pipelineRes.json();

  const summary = {
    deviceId,
    ingest: ingestBody,
    latestCount: Array.isArray(latestRows) ? latestRows.length : 0,
    latestTypes: Array.isArray(latestRows) ? Array.from(new Set(latestRows.map((r) => String(r.sensorType || '')))).filter(Boolean).sort() : [],
    historyCount: Array.isArray(historyRows) ? historyRows.length : 0,
    pipeline
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!Array.isArray(latestRows) || latestRows.length === 0) {
    throw new Error('Link check failed: latest rows are empty');
  }
  if (!Array.isArray(historyRows) || historyRows.length === 0) {
    throw new Error('Link check failed: history rows are empty');
  }
};

run().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
