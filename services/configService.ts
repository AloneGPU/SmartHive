import fs from 'fs';
import path from 'path';

interface Config {
  gaodeApiKey?: string;
  qwenApiKey?: string;
  apiToken?: string;
  corsOrigin?: string;
  videoStreamUrl?: string;
  videoStreamMode?: 'video' | 'mjpeg';
  videoStreamSource?: 'direct' | 'proxy';
  visionDeviceId?: string;
}

const configPath = path.join(process.cwd(), 'config.json');

// 确保配置文件存在
export const ensureConfigFile = (): void => {
  if (!fs.existsSync(configPath)) {
    const defaultConfig: Config = {
      apiToken: process.env.API_TOKEN || '',
      gaodeApiKey: process.env.GAODE_API_KEY || '',
      qwenApiKey: process.env.QWEN_API_KEY || '',
      corsOrigin: process.env.CORS_ORIGIN || 'https://yourdomain.com',
      videoStreamUrl: process.env.VIDEO_STREAM_URL || '/api/vision/stream.mjpg',
      videoStreamMode: process.env.VIDEO_STREAM_MODE === 'video' ? 'video' : 'mjpeg',
      videoStreamSource: process.env.VIDEO_STREAM_SOURCE === 'proxy' ? 'proxy' : 'direct',
      visionDeviceId: process.env.VISION_DEVICE_ID || 'pi5-vision-client'
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log('Created default config file:', configPath);
  }
};

// 读取配置
export const readConfig = (): Config => {
  ensureConfigFile();
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Error reading config file:', error);
    return {};
  }
};

// 写入配置
export const writeConfig = (config: Config): void => {
  try {
    const currentConfig = readConfig();
    const updatedConfig = { ...currentConfig, ...config };
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
    console.log('Config updated successfully');
  } catch (error) {
    console.error('Error writing config file:', error);
  }
};

// 加载配置到环境变量
export const loadConfigToEnv = (): void => {
  const config = readConfig();
  if (config.gaodeApiKey) {
    process.env.GAODE_API_KEY = config.gaodeApiKey;
  }
  if (config.qwenApiKey) {
    process.env.QWEN_API_KEY = config.qwenApiKey;
  }
  if (config.apiToken) {
    process.env.API_TOKEN = config.apiToken;
  }
  if (config.corsOrigin) {
    process.env.CORS_ORIGIN = config.corsOrigin;
  }
  if (config.videoStreamUrl) {
    process.env.VIDEO_STREAM_URL = config.videoStreamUrl;
  }
  if (config.videoStreamMode) {
    process.env.VIDEO_STREAM_MODE = config.videoStreamMode;
  }
  if (config.videoStreamSource) {
    process.env.VIDEO_STREAM_SOURCE = config.videoStreamSource;
  }
  if (config.visionDeviceId) {
    process.env.VISION_DEVICE_ID = config.visionDeviceId;
  }
};
