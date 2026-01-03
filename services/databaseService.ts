import * as mysql from 'mysql2/promise';
import { BeehiveData } from '../types';
import dotenv from 'dotenv';

dotenv.config();

// Database configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smarthive',
  port: parseInt(process.env.DB_PORT || '3306')
};

// Create a connection pool with optimized settings
const pool = mysql.createPool({
  ...DB_CONFIG,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

/**
 * Test database connection
 */
export const testDatabaseConnection = async (): Promise<boolean> => {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
};

/**
 * Map hive_data table row to BeehiveData format
 */
const mapHiveDataToBeehiveData = (row: any): BeehiveData => {
  return {
    timestamp: row.timestamp !== null && row.timestamp !== undefined ? row.timestamp : Date.now(),
    temperature: row.temperature !== null && row.temperature !== undefined ? row.temperature : 0,
    humidity: row.humidity !== null && row.humidity !== undefined ? row.humidity : 0,
    weight: row.weight !== null && row.weight !== undefined ? row.weight : 0,
    beesIn: row.beesIn !== null && row.beesIn !== undefined ? row.beesIn : 0,
    beesOut: row.beesOut !== null && row.beesOut !== undefined ? row.beesOut : 0,
    hornetsDetected: row.hornetsDetected !== null && row.hornetsDetected !== undefined ? row.hornetsDetected : 0,
    latitude: row.latitude !== null && row.latitude !== undefined ? row.latitude : undefined,
    longitude: row.longitude !== null && row.longitude !== undefined ? row.longitude : undefined
  };
};

/**
 * Fetch live beehive data from database
 */
export const fetchLiveHiveDataFromDB = async (): Promise<BeehiveData | null> => {
  try {
    // Only query hive_data table, beehive_data table might not exist
    let [rows] = await pool.execute(
      'SELECT * FROM hive_data ORDER BY id DESC LIMIT 1'
    );
    
    if (Array.isArray(rows) && rows.length > 0) {
      return mapHiveDataToBeehiveData(rows[0]);
    }
    
    // Return null if no records found (no mock data)
    return null;
  } catch (error) {
    console.error('Error fetching live beehive data:', error);
    throw error;
  }
};

/**
 * Fetch historical beehive data from database
 */
export const fetchHistoryDataFromDB = async (limit: number = 40): Promise<BeehiveData[]> => {
  try {
    // 参数化查询，防止SQL注入，并限制最大查询数量
    const safeLimit = Math.min(Math.max(1, limit), 1000); // 限制在1-1000之间
    const query = 'SELECT * FROM hive_data ORDER BY id DESC LIMIT ?';
    const [rows] = await pool.execute(query, [safeLimit]);
    
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map(mapHiveDataToBeehiveData);
    }
    
    // Return empty array if no data found (no mock data)
    return [];
  } catch (error) {
    console.error('Error fetching history data:', error);
    throw error;
  }
};

/**
 * Insert new beehive data into database
 */
export const insertBeehiveData = async (data: Omit<BeehiveData, 'timestamp'>): Promise<void> => {
  try {
    // 数据验证和范围检查
    const validatedData = {
      temperature: Math.max(-50, Math.min(100, data.temperature || 0)),
      humidity: Math.max(0, Math.min(100, data.humidity || 0)),
      weight: Math.max(0, Math.min(1000, data.weight || 0)),
      beesIn: Math.max(0, Math.floor(data.beesIn || 0)),
      beesOut: Math.max(0, Math.floor(data.beesOut || 0)),
      hornetsDetected: Math.max(0, Math.floor(data.hornetsDetected || 0)),
      latitude: data.latitude !== undefined ? Math.max(-90, Math.min(90, data.latitude)) : null,
      longitude: data.longitude !== undefined ? Math.max(-180, Math.min(180, data.longitude)) : null
    };

    await pool.execute(
      'INSERT INTO hive_data (timestamp, temperature, humidity, weight, beesIn, beesOut, hornetsDetected, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [Date.now(), validatedData.temperature, validatedData.humidity, validatedData.weight, validatedData.beesIn, validatedData.beesOut, validatedData.hornetsDetected, validatedData.latitude, validatedData.longitude]
    );
  } catch (error) {
    console.error('Error inserting beehive data:', error);
    throw error;
  }
};

/**
 * Initialize database table if it doesn't exist
 */
export const initializeDatabase = async (): Promise<void> => {
  let connection;
  try {
    // Try to connect to the specific database
    try {
      connection = await pool.getConnection();
      await connection.ping();
      connection.release();
    } catch (err: any) {
       // If database does not exist, try to create it
       if (err.code === 'ER_BAD_DB_ERROR') {
          console.log(`Database '${DB_CONFIG.database}' not found. Attempting to create it...`);
          const adminPool = mysql.createPool({
            ...DB_CONFIG,
            database: undefined // Connect without selecting a database
          });
          
          await adminPool.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\``);
          await adminPool.end();
          console.log(`Database '${DB_CONFIG.database}' created successfully.`);
       } else {
         throw err;
       }
    }

    // Create hive_data table if it doesn't exist with indexes for better performance
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
    console.log('Created hive_data table successfully (if it did not exist)');
    
    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    // Do not throw error here, let the server start even if DB fails, 
    // but the endpoints will fail. 
    // Or better, let the server know so it can warn the user.
    throw error;
  }
};
