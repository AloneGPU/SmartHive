
export type ConnectionMode = 'DATABASE' | 'CLOUD';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  road?: string;
  source?: string;
  status?: 'resolving' | 'resolved' | 'error';
  errorMessage?: string;
}

export interface HiveConfig {
  lastHarvestDate: number | null; // Timestamp of last harvest
  startFarmingDate: number | null; // Timestamp when farming started
  targetWeight: number; // Target weight for harvest in kg (default e.g. 50)
  plannedHarvestDate?: number | null; // User planned harvest date
  aiEstimatedHarvestDate?: number | null; // AI suggested harvest date
  notificationDays?: number; // Days in advance for harvest notification
}

export interface BeehiveData {
  timestamp: number;
  temperature: number; // Celsius
  humidity: number; // Percentage
  insideTemperature?: number; // Celsius
  insideHumidity?: number; // Percentage
  outsideTemperature?: number; // Celsius
  outsideHumidity?: number; // Percentage
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
  events: Array<{
    type: 'info' | 'warning' | 'critical';
    msg: string;
    timestamp?: number;
  }>;
  detailedAnalysis?: {
    environment: string;
    behavior: string;
    production: string;
    risks: string;
  };
  lastUpdated: number;
}

export interface CustomAIConfig {
  apiKey: string; // Qwen API Key
  modelName: string;
  apiBaseUrl: string;
  apiToken: string; // 访问后端 API 的授权令牌
  gaodeApiKey?: string; // 高德地图 API Key
  videoStreamUrl?: string; // 实时视频流地址
  videoStreamMode?: 'video' | 'mjpeg'; // 视频流播放模式
  videoStreamSource?: 'direct' | 'proxy'; // 视频流源模式：direct（直接）或 proxy（中转）
  visionDeviceId?: string; // IoT 设备ID（用于胡蜂告警数据源）
  isActive: boolean;
}

export interface PhysicalAssessmentResult {
  生产效率: number; // 0-100
  控温能力: number; // 0-100
  归巢防御: number; // 0-100
  lastUpdated: number;
}

export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

export interface VisionRecognitionResult {
  id: string;
  imageUrl: string;
  timestamp: number;
  result: {
    type: string;
    confidence: number;
    description: string;
  };
}

export interface IotTelemetryPoint {
  id?: number;
  timestamp: number;
  deviceId: string;
  sensorType: string;
  value: number;
  unit?: string;
  qos?: number;
  meta?: Record<string, any>;
}

export interface IotDeviceStatus {
  deviceId: string;
  online: boolean;
  lastSeenAt: number;
  lastRssi?: number;
  lastIp?: string;
  packetsReceived: number;
  packetsDropped: number;
}
