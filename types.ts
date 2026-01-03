
export type ConnectionMode = 'DATABASE' | 'CLOUD';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface HiveConfig {
  lastHarvestDate: number | null; // Timestamp of last harvest
  startFarmingDate: number | null; // Timestamp when farming started
  targetWeight: number; // Target weight for harvest in kg (default e.g. 50)
}

export interface BeehiveData {
  timestamp: number;
  temperature: number; // Celsius
  humidity: number; // Percentage
  weight: number; // kg
  beesIn: number; // Count
  beesOut: number; // Count
  hornetsDetected: number; // Count from YOLO
  latitude?: number; // GPS latitude
  longitude?: number; // GPS longitude
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

export interface PhysicalAssessmentResult {
  生产效率: number; // 0-100
  控温能力: number; // 0-100
  归巢防御: number; // 0-100
  lastUpdated: number;
}