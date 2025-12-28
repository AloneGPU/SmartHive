import mysql from 'mysql2/promise';
import { BeehiveData } from '../types';

// Database configuration
const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '2006520Zlt',
  database: 'tmp'
};

// Create a connection pool
const pool = mysql.createPool(DB_CONFIG);

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
    timestamp: row.timestamp || Date.now(),
    temperature: row.temperature || 0,
    humidity: row.humidity || 0,
    weight: row.weight || 0,
    beesIn: row.beesIn || 0,
    beesOut: row.beesOut || 0,
    batteryLevel: row.batteryLevel || 0,
    hornetsDetected: row.hornetsDetected || 0
  };
};

/**
 * Fetch live beehive data from database
 */
export const fetchLiveHiveDataFromDB = async (): Promise<BeehiveData> => {
  try {
    // Try to get data from hive_data table first
    let [rows] = await pool.execute(
      'SELECT * FROM hive_data ORDER BY id DESC LIMIT 1'
    );
    
    if (Array.isArray(rows) && rows.length > 0) {
      return mapHiveDataToBeehiveData(rows[0]);
    }
    
    // Fallback to beehive_data table if hive_data doesn't have data
    [rows] = await pool.execute(
      'SELECT * FROM beehive_data ORDER BY id DESC LIMIT 1'
    );
    
    if (Array.isArray(rows) && rows.length > 0) {
      return mapHiveDataToBeehiveData(rows[0]);
    }
    
    // Return mock data if no records found
    return {
      timestamp: Date.now(),
      temperature: 34.8,
      humidity: 52,
      weight: 25.1,
      beesIn: 1350,
      beesOut: 1200,
      batteryLevel: 98,
      hornetsDetected: 0
    };
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
    // Use direct query instead of prepared statement for better compatibility
    const query = `SELECT * FROM hive_data ORDER BY id DESC LIMIT ${limit}`;
    const [rows] = await pool.execute(query);
    
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map(mapHiveDataToBeehiveData);
    }
    
    // Fallback to beehive_data table if hive_data doesn't have data
    const fallbackQuery = `SELECT * FROM beehive_data ORDER BY id DESC LIMIT ${limit}`;
    const [fallbackRows] = await pool.execute(fallbackQuery);
    
    return (fallbackRows as any[]).map(mapHiveDataToBeehiveData);
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
    await pool.execute(
      'INSERT INTO hive_data (timestamp, temperature, humidity, weight, beesIn, beesOut, batteryLevel, hornetsDetected) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [Date.now(), data.temperature, data.humidity, data.weight, data.beesIn, data.beesOut, data.batteryLevel, data.hornetsDetected]
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
  try {
    // Create hive_data table if it doesn't exist
    const createHiveDataTableQuery = `
      CREATE TABLE IF NOT EXISTS hive_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        temperature FLOAT NOT NULL,
        humidity FLOAT NOT NULL,
        weight FLOAT NOT NULL,
        beesIn INT NOT NULL,
        beesOut INT NOT NULL,
        batteryLevel INT NOT NULL,
        hornetsDetected INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    await pool.execute(createHiveDataTableQuery);
    console.log('Created hive_data table successfully');
    
    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};
