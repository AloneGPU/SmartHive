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
  password: process.env.DB_PASSWORD || "2006520Zlt",
  database: process.env.DB_NAME || "tmp",
  port: parseInt(process.env.DB_PORT || "3306")
};
var pool = mysql.createPool(DB_CONFIG);
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
    const query = `SELECT * FROM hive_data ORDER BY id DESC LIMIT ${limit}`;
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
    await pool.execute(
      "INSERT INTO hive_data (timestamp, temperature, humidity, weight, beesIn, beesOut, hornetsDetected, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Date.now(), data.temperature, data.humidity, data.weight, data.beesIn, data.beesOut, data.hornetsDetected, data.latitude, data.longitude]
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
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
var PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());
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
app.post("/api/beehive", verifyToken, async (req, res) => {
  try {
    const data = req.body;
    await insertBeehiveData(data);
    res.status(201).json({ message: "Beehive data inserted successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Failed to insert beehive data",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
var startServer = async () => {
  try {
    try {
      await initializeDatabase();
    } catch (dbError) {
      console.warn("Warning: Database initialization failed. The server will start, but database features may not work.");
      console.warn("Error details:", dbError instanceof Error ? dbError.message : String(dbError));
      console.warn("Please check your .env file and ensure MySQL is running.");
    }
    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
      console.log(`API Endpoints:`);
      console.log(`  GET  http://localhost:${PORT}/api/health`);
      console.log(`  GET  http://localhost:${PORT}/api/beehive/latest (requires token)`);
      console.log(`  GET  http://localhost:${PORT}/api/beehive/history?limit=40 (requires token)`);
      console.log(`  POST http://localhost:${PORT}/api/beehive (requires token)`);
      console.log(`Token format: Authorization: Bearer ${process.env.API_TOKEN || "123456789"}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};
startServer();
