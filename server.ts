import express from 'express';
import cors from 'cors';
import {
  testDatabaseConnection,
  fetchLiveHiveDataFromDB,
  fetchHistoryDataFromDB,
  insertBeehiveData,
  initializeDatabase
} from './services/databaseService';
import { BeehiveData } from './types';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Token verification middleware
const verifyToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Unauthorized: Missing or invalid Authorization header'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  // Fixed token - hardcoded in backend
  const FIXED_TOKEN = '123456789';//令牌密码
  
  if (token !== FIXED_TOKEN) {
    return res.status(401).json({
      message: 'Unauthorized: Invalid token'
    });
  }
  
  // Add token to request for future use if needed
  (req as any).token = token;
  next();
};

// Health check endpoint - no token required
app.get('/api/health', async (req, res) => {
  try {
    const isConnected = await testDatabaseConnection();
    res.status(200).json({
      status: 'ok',
      databaseConnected: isConnected,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Protected API endpoints with token verification

// Get latest beehive data
app.get('/api/beehive/latest', verifyToken, async (req, res) => {
  try {
    const data = await fetchLiveHiveDataFromDB();
    if (data === null) {
      res.status(404).json({
        message: 'No beehive data found in database'
      });
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch live beehive data',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get historical beehive data
app.get('/api/beehive/history', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 40;
    const data = await fetchHistoryDataFromDB(limit);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch historical beehive data',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Insert new beehive data
app.post('/api/beehive', verifyToken, async (req, res) => {
  try {
    const data = req.body as Omit<BeehiveData, 'timestamp'>;
    await insertBeehiveData(data);
    res.status(201).json({ message: 'Beehive data inserted successfully' });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to insert beehive data',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize database table
    await initializeDatabase();
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
      console.log(`API Endpoints:`);
      console.log(`  GET  http://localhost:${PORT}/api/health`);
      console.log(`  GET  http://localhost:${PORT}/api/beehive/latest (requires token)`);
      console.log(`  GET  http://localhost:${PORT}/api/beehive/history?limit=40 (requires token)`);
      console.log(`  POST http://localhost:${PORT}/api/beehive (requires token)`);
      console.log('Token format: Authorization: Bearer [your_token]');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
