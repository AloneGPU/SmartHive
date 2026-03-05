// server.ts
import express from "express";
import cors from "cors";
import dotenv2 from "dotenv";

// services/databaseService.ts
import * as mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();
var DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "smarthive",
  port: parseInt(process.env.DB_PORT || "3306")
};
var pool = mysql.createPool({
  ...DB_CONFIG,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});
var testDatabaseConnection = async () => {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    console.error("Database connection error:", error);
    return false;
  }
};
var mapHiveDataToBeehiveData = (row) => {
  return {
    timestamp: row.timestamp !== null && row.timestamp !== void 0 ? row.timestamp : Date.now(),
    temperature: row.temperature !== null && row.temperature !== void 0 ? row.temperature : 0,
    humidity: row.humidity !== null && row.humidity !== void 0 ? row.humidity : 0,
    weight: row.weight !== null && row.weight !== void 0 ? row.weight : 0,
    beesIn: row.beesIn !== null && row.beesIn !== void 0 ? row.beesIn : 0,
    beesOut: row.beesOut !== null && row.beesOut !== void 0 ? row.beesOut : 0,
    hornetsDetected: row.hornetsDetected !== null && row.hornetsDetected !== void 0 ? row.hornetsDetected : 0,
    latitude: row.latitude !== null && row.latitude !== void 0 ? row.latitude : void 0,
    longitude: row.longitude !== null && row.longitude !== void 0 ? row.longitude : void 0
  };
};
var fetchLiveHiveDataFromDB = async () => {
  try {
    let [rows] = await pool.execute(
      "SELECT * FROM hive_data ORDER BY id DESC LIMIT 1"
    );
    if (Array.isArray(rows) && rows.length > 0) {
      return mapHiveDataToBeehiveData(rows[0]);
    }
    return null;
  } catch (error) {
    console.error("Error fetching live beehive data:", error);
    throw error;
  }
};
var fetchHistoryDataFromDB = async (limit = 40) => {
  try {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 1e3);
    const query = `SELECT * FROM hive_data ORDER BY id DESC LIMIT ${safeLimit}`;
    const [rows] = await pool.execute(query);
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map(mapHiveDataToBeehiveData);
    }
    return [];
  } catch (error) {
    console.error("Error fetching history data:", error);
    throw error;
  }
};
var insertBeehiveData = async (data) => {
  try {
    const validatedData = {
      temperature: Math.max(-50, Math.min(100, data.temperature || 0)),
      humidity: Math.max(0, Math.min(100, data.humidity || 0)),
      weight: Math.max(0, Math.min(1e3, data.weight || 0)),
      beesIn: Math.max(0, Math.floor(data.beesIn || 0)),
      beesOut: Math.max(0, Math.floor(data.beesOut || 0)),
      hornetsDetected: Math.max(0, Math.floor(data.hornetsDetected || 0)),
      latitude: data.latitude !== void 0 ? Math.max(-90, Math.min(90, data.latitude)) : null,
      longitude: data.longitude !== void 0 ? Math.max(-180, Math.min(180, data.longitude)) : null
    };
    await pool.execute(
      "INSERT INTO hive_data (timestamp, temperature, humidity, weight, beesIn, beesOut, hornetsDetected, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Date.now(), validatedData.temperature, validatedData.humidity, validatedData.weight, validatedData.beesIn, validatedData.beesOut, validatedData.hornetsDetected, validatedData.latitude, validatedData.longitude]
    );
  } catch (error) {
    console.error("Error inserting beehive data:", error);
    throw error;
  }
};
var initializeDatabase = async () => {
  let connection;
  try {
    try {
      connection = await pool.getConnection();
      await connection.ping();
      connection.release();
    } catch (err) {
      if (err.code === "ER_BAD_DB_ERROR") {
        console.log(`Database '${DB_CONFIG.database}' not found. Attempting to create it...`);
        const adminPool = mysql.createPool({
          ...DB_CONFIG,
          database: void 0
          // Connect without selecting a database
        });
        await adminPool.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\``);
        await adminPool.end();
        console.log(`Database '${DB_CONFIG.database}' created successfully.`);
      } else {
        throw err;
      }
    }
    const createHiveDataTableQuery = `
      CREATE TABLE IF NOT EXISTS hive_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        temperature FLOAT NOT NULL,
        humidity FLOAT NOT NULL,
        weight FLOAT NOT NULL,
        beesIn INT NOT NULL,
        beesOut INT NOT NULL,
        hornetsDetected INT NOT NULL,
        latitude FLOAT,
        longitude FLOAT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_timestamp (timestamp),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await pool.execute(createHiveDataTableQuery);
    console.log("Created hive_data table successfully (if it did not exist)");
    console.log("Database initialization completed successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  }
};

// server.ts
dotenv2.config();
var app = express();
var PORT = parseInt(process.env.PORT || "3001", 10);
var corsOptions = {
  origin: process.env.NODE_ENV === "production" ? process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:5173"] : true,
  // 开发环境允许所有源
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
var verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Unauthorized: Missing or invalid Authorization header"
    });
  }
  const token = authHeader.split(" ")[1];
  const FIXED_TOKEN = process.env.API_TOKEN || "123456789";
  if (token !== FIXED_TOKEN) {
    return res.status(401).json({
      message: "Unauthorized: Invalid token"
    });
  }
  req.token = token;
  next();
};
var hexToAscii = (hex) => {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  let result = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isNaN(code)) {
      result += String.fromCharCode(code);
    }
  }
  return result;
};
var parseNmeaCoord = (raw, hemi, isLat) => {
  if (!raw || !hemi) return null;
  const degLength = isLat ? 2 : 3;
  const degrees = parseInt(raw.slice(0, degLength), 10);
  const minutes = parseFloat(raw.slice(degLength));
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null;
  let value = degrees + minutes / 60;
  if (hemi === "S" || hemi === "W") value = -value;
  return value;
};
var extractNmeaSentences = (text) => {
  const results = [];
  const parts = text.split("$").slice(1);
  for (const part of parts) {
    const line = part.split(/\r?\n/)[0];
    if (line) results.push(`$${line}`);
  }
  return results;
};
var parseNmeaFromText = (text) => {
  const sentences = extractNmeaSentences(text);
  const findSentence = (type) => {
    return sentences.find((s) => s.length > 6 && s.slice(3, 6) === type);
  };
  const tryParse = (type) => {
    const line = findSentence(type);
    if (!line) return null;
    const fields = line.split(",");
    if (type === "RMC") {
      if (fields[2] !== "A") return null;
      const lat = parseNmeaCoord(fields[3], fields[4], true);
      const lon = parseNmeaCoord(fields[5], fields[6], false);
      if (lat === null || lon === null) return null;
      return { lat, lon };
    }
    if (type === "GGA") {
      const fix = parseInt(fields[6], 10);
      if (!Number.isFinite(fix) || fix <= 0) return null;
      const lat = parseNmeaCoord(fields[2], fields[3], true);
      const lon = parseNmeaCoord(fields[4], fields[5], false);
      if (lat === null || lon === null) return null;
      return { lat, lon };
    }
    if (type === "GLL") {
      if (fields[6] !== "A") return null;
      const lat = parseNmeaCoord(fields[1], fields[2], true);
      const lon = parseNmeaCoord(fields[3], fields[4], false);
      if (lat === null || lon === null) return null;
      return { lat, lon };
    }
    return null;
  };
  return tryParse("RMC") || tryParse("GGA") || tryParse("GLL");
};
var geocodeCache = /* @__PURE__ */ new Map();
var geocodeCacheTtlMs = 10 * 60 * 1e3;
var geocodeCacheMaxSize = 200;
var getGeocodeCacheKey = (lat, lon) => `${lat.toFixed(6)},${lon.toFixed(6)}`;
app.get("/api/health", async (req, res) => {
  try {
    const isConnected = await testDatabaseConnection();
    res.status(200).json({
      status: "ok",
      databaseConnected: isConnected,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Health check failed",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
app.get("/api/beehive/latest", verifyToken, async (req, res) => {
  try {
    const data = await fetchLiveHiveDataFromDB();
    if (data === null) {
      res.status(404).json({
        message: "No beehive data found in database"
      });
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch live beehive data",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
app.get("/api/beehive/history", verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 40;
    const data = await fetchHistoryDataFromDB(limit);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch historical beehive data",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
app.get("/api/geocode/reverse", verifyToken, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ message: "Invalid latitude or longitude" });
  }
  const amapKey = process.env.GAODE_API_KEY;
  if (!amapKey) {
    return res.status(500).json({ message: "GAODE_API_KEY is not configured" });
  }
  const cacheKey = getGeocodeCacheKey(lat, lon);
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.status(200).json(cached.data);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5e3);
  try {
    const response = await fetch(`https://restapi.amap.com/v3/geocode/regeo?location=${lon},${lat}&key=${amapKey}&radius=1000&extensions=base&batch=false&roadlevel=0`, { signal: controller.signal });
    if (!response.ok) {
      return res.status(502).json({ message: "Geocode provider error" });
    }
    const data = await response.json();
    if (data?.status !== "1") {
      return res.status(502).json({ message: data?.info || "Geocode provider error" });
    }
    const addressInfo = data?.regeocode?.addressComponent || {};
    const province = addressInfo.province || "";
    const city = Array.isArray(addressInfo.city) ? "" : addressInfo.city || addressInfo.province || "";
    const district = addressInfo.district || "";
    const road = addressInfo.township || addressInfo.streetNumber?.street || "";
    const address = data?.regeocode?.formatted_address || [province, city, district, road].filter(Boolean).join(" ");
    const payload = {
      address: address || `\u8702\u7BB1\u4F4D\u7F6E - ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      province,
      city,
      district,
      road,
      source: "gaode"
    };
    geocodeCache.set(cacheKey, { data: payload, expiresAt: Date.now() + geocodeCacheTtlMs });
    if (geocodeCache.size > geocodeCacheMaxSize) {
      const firstKey = geocodeCache.keys().next().value;
      if (firstKey) geocodeCache.delete(firstKey);
    }
    res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ message: "Geocode request failed", error: message });
  } finally {
    clearTimeout(timeoutId);
  }
});
app.post("/api/beehive", verifyToken, async (req, res) => {
  try {
    const body = req.body;
    const data = body;
    if (typeof data.latitude !== "number" || typeof data.longitude !== "number") {
      const rawText = typeof body.gpsRawText === "string" ? body.gpsRawText : "";
      const rawHex = typeof body.gpsRawHex === "string" ? body.gpsRawHex : "";
      const decoded = rawHex ? hexToAscii(rawHex) : "";
      const parsed = parseNmeaFromText(`${rawText}
${decoded}`);
      if (parsed) {
        data.latitude = parsed.lat;
        data.longitude = parsed.lon;
      }
    }
    if (typeof data.temperature !== "number" || typeof data.humidity !== "number" || typeof data.weight !== "number") {
      return res.status(400).json({
        message: "Invalid data format: temperature, humidity, and weight must be numbers"
      });
    }
    await insertBeehiveData(data);
    res.status(201).json({
      message: "Beehive data inserted successfully",
      timestamp: Date.now()
    });
  } catch (error) {
    console.error("Error inserting beehive data:", error);
    res.status(500).json({
      message: "Failed to insert beehive data",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
var validateEnvironment = () => {
  const warnings = [];
  if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === "") {
    warnings.push("\u26A0\uFE0F  \u8B66\u544A: DB_PASSWORD \u672A\u8BBE\u7F6E\uFF0C\u6570\u636E\u5E93\u8FDE\u63A5\u53EF\u80FD\u5931\u8D25");
  }
  if (process.env.API_TOKEN === "123456789" || !process.env.API_TOKEN) {
    warnings.push("\u26A0\uFE0F  \u5B89\u5168\u8B66\u544A: \u4F7F\u7528\u9ED8\u8BA4 API_TOKEN\uFF0C\u751F\u4EA7\u73AF\u5883\u8BF7\u4FEE\u6539\u4E3A\u590D\u6742\u5BC6\u7801");
  }
  if (warnings.length > 0) {
    console.warn("\n\u73AF\u5883\u53D8\u91CF\u68C0\u67E5:");
    warnings.forEach((warning) => console.warn(warning));
    console.warn("");
  }
};
var startServer = async () => {
  try {
    validateEnvironment();
    try {
      await initializeDatabase();
    } catch (dbError) {
      console.warn("Warning: Database initialization failed. The server will start, but database features may not work.");
      console.warn("Error details:", dbError instanceof Error ? dbError.message : String(dbError));
      console.warn("Please check your .env file and ensure MySQL is running.");
    }
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`========================================`);
      console.log(`  \u667A\u6167\u8702\u573A\u7BA1\u7406\u7CFB\u7EDF - \u540E\u7AEF\u670D\u52A1\u5668`);
      console.log(`========================================`);
      console.log(`\u2705 \u540E\u7AEF\u670D\u52A1\u5668\u542F\u52A8\u6210\u529F\uFF01`);
      console.log(``);
      console.log(`\u670D\u52A1\u5668\u5730\u5740: http://0.0.0.0:${PORT}`);
      console.log(`\u672C\u5730\u8BBF\u95EE: http://localhost:${PORT}`);
      console.log(``);
      console.log(`API \u7AEF\u70B9:`);
      console.log(`  GET  /api/health (\u5065\u5EB7\u68C0\u67E5\uFF0C\u65E0\u9700token)`);
      console.log(`  GET  /api/beehive/latest (\u83B7\u53D6\u6700\u65B0\u6570\u636E\uFF0C\u9700\u8981token)`);
      console.log(`  GET  /api/beehive/history?limit=40 (\u83B7\u53D6\u5386\u53F2\u6570\u636E\uFF0C\u9700\u8981token)`);
      console.log(`  POST /api/beehive (\u63D2\u5165\u6570\u636E\uFF0C\u9700\u8981token)`);
      console.log(``);
      console.log(`Token \u683C\u5F0F: Authorization: Bearer ${process.env.API_TOKEN || "123456789"}`);
      console.log(``);
      console.log(`\u{1F4A1} \u63D0\u793A: \u6309 Ctrl+C \u53EF\u4EE5\u505C\u6B62\u540E\u7AEF\u670D\u52A1`);
      console.log(`========================================`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};
startServer();
