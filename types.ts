
export type ConnectionMode = 'DATABASE' | 'CLOUD';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface BeehiveData {
  timestamp: number;
  temperature: number; // Celsius
  humidity: number; // Percentage
  weight: number; // kg
  beesIn: number; // Count
  beesOut: number; // Count
  batteryLevel: number; // Percentage
  hornetsDetected: number; // Count from YOLO
}

export interface AIAnalysisResult {
  healthScore: number;
  summary: string;
  recommendations: string[];
  lastUpdated: number;
}

export interface CustomAIConfig {
  apiKey: string;
  modelName: string;
  apiBaseUrl: string;
  apiToken: string; // 新增：访问后端 API 的授权令牌
  isActive: boolean;
}
