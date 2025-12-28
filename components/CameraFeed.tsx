import React from 'react';
import { AlertTriangle, Camera } from 'lucide-react';

interface Props {
  hornetsDetected: number;
}

export const CameraFeed: React.FC<Props> = ({ hornetsDetected }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Camera size={18} className="text-gray-500" />
          实时监控 (YOLOv8)
        </h3>
        <span className="flex items-center gap-1 text-xs text-green-600 font-medium bg-green-100 px-2 py-1 rounded">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          LIVE
        </span>
      </div>

      <div className="relative aspect-video bg-gray-900 group">
        {/* Placeholder Image simulating video feed */}
        <img 
          src="https://picsum.photos/800/450?grayscale&blur=2" 
          alt="Beehive Entrance Feed" 
          className="w-full h-full object-cover opacity-80"
        />
        
        {/* Simulated YOLO Bounding Box */}
        {hornetsDetected > 0 && (
          <div className="absolute top-1/3 left-1/4 w-24 h-24 border-2 border-red-500 bg-red-500/10 animate-pulse flex flex-col items-center justify-between p-1 shadow-[0_0_15px_rgba(239,68,68,0.6)]">
             <span className="text-[10px] font-bold bg-red-600 text-white px-1 rounded-sm shadow">
               马蜂 ({(0.85 + Math.random() * 0.1).toFixed(2)})
             </span>
          </div>
        )}

        {/* Overlay Info */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          <div className="bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm font-mono">
            {new Date().toLocaleTimeString()}
          </div>
          {hornetsDetected > 0 ? (
             <div className="bg-red-600 text-white text-xs px-2 py-1 rounded backdrop-blur-sm font-bold flex items-center gap-1 animate-bounce">
               <AlertTriangle size={12} />
               WARNING: HORNET
             </div>
          ) : (
            <div className="bg-blue-500/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm font-medium">
               SAFE
             </div>
          )}
        </div>
      </div>
    </div>
  );
};