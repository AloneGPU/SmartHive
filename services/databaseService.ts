import * as mysql from 'mysql2/promise';
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
    // Only query hive_data table, beehive_data table might not exist
    const query = `SELECT * FROM hive_data ORDER BY id DESC LIMIT ${limit}`;
    const [rows] = await pool.execute(query);
    
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
    await pool.execute(
      'INSERT INTO hive_data (timestamp, temperature, humidity, weight, beesIn, beesOut, hornetsDetected, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [Date.now(), data.temperature, data.humidity, data.weight, data.beesIn, data.beesOut, data.hornetsDetected, data.latitude, data.longitude]
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
        hornetsDetected INT NOT NULL,
        latitude FLOAT,
        longitude FLOAT,
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
