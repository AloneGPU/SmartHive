import { BeehiveData } from '../types';

// Initial baseline
let currentData: BeehiveData = {
  timestamp: Date.now(),
  temperature: 34.5,
  humidity: 55,
  weight: 24.2,
  beesIn: 1240,
  beesOut: 1150,
  batteryLevel: 88,
  hornetsDetected: 0,
};

// Simulate small fluctuations
export const getSimulatedData = (): BeehiveData => {
  const randomFactor = (min: number, max: number) => Math.random() * (max - min) + min;
  
  // Randomly detect a hornet occasionally
  const detectHornet = Math.random() > 0.9;

  currentData = {
    timestamp: Date.now(),
    temperature: Number((currentData.temperature + randomFactor(-0.2, 0.2)).toFixed(1)),
    humidity: Math.min(100, Math.max(0, Math.round(currentData.humidity + randomFactor(-1, 1)))),
    weight: Number((currentData.weight + randomFactor(-0.01, 0.05)).toFixed(2)), // Weight tends to go up slightly with honey
    beesIn: currentData.beesIn + Math.floor(randomFactor(0, 15)),
    beesOut: currentData.beesOut + Math.floor(randomFactor(0, 15)),
    batteryLevel: Math.max(0, currentData.batteryLevel - 0.01),
    hornetsDetected: detectHornet ? 1 : 0,
  };

  return { ...currentData };
};

export const getHistoryData = (points: number = 20) => {
  const history = [];
  let tempBase = 32;
  let weightBase = 22;
  const now = Date.now();
  
  for (let i = points; i > 0; i--) {
    history.push({
      time: new Date(now - i * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      temp: Number((tempBase + Math.random() * 4).toFixed(1)),
      weight: Number((weightBase + Math.random() * 0.5 + (points - i) * 0.1).toFixed(2)),
    });
  }
  return history;
};