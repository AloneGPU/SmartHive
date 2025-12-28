import React from 'react';
import { ConnectionMode, ConnectionStatus } from '../types';
import { Bluetooth, Signal, Wifi } from 'lucide-react';

interface Props {
  mode: ConnectionMode;
  status: ConnectionStatus;
  onToggleMode: (mode: ConnectionMode) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const ConnectionHeader: React.FC<Props> = ({ mode, status, onToggleMode, onConnect, onDisconnect }) => {
  return (
    <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center text-white font-bold shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </div>
            <span className="text-xl font-bold text-gray-800 tracking-tight">SmartHive</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Toggle */}
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => onToggleMode('BLE')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
                  mode === 'BLE' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Bluetooth size={14} /> BLE
              </button>
              <button
                onClick={() => onToggleMode('MQTT')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
                  mode === 'MQTT' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Signal size={14} /> 4G
              </button>
            </div>

            {/* Connection Status Button */}
            <button
              onClick={status === 'connected' ? onDisconnect : onConnect}
              disabled={status === 'connecting'}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                status === 'connected'
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : status === 'connecting'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status === 'connected' ? (
                <>
                  <Wifi size={16} /> 已连接
                </>
              ) : status === 'connecting' ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-yellow-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  连接中...
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  连接
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};