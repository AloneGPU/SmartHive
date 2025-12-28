
import React from 'react';
import { ConnectionStatus } from '../types';
import { Database, RefreshCw, Server } from 'lucide-react';

interface Props {
  status: ConnectionStatus;
  onSync: () => void;
  onDisconnect: () => void;
}

export const ConnectionHeader: React.FC<Props> = ({ status, onSync, onDisconnect }) => {
  return (
    <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md">
              <Database size={20} />
            </div>
            <span className="text-xl font-bold text-gray-800 tracking-tight">SmartHive <span className="text-indigo-600">DB</span></span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
               <Server size={14} className="text-gray-400" />
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">MySQL 同步模式</span>
            </div>

            <button
              onClick={status === 'connected' ? onDisconnect : onSync}
              disabled={status === 'connecting'}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                status === 'connected'
                  ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status === 'connected' ? (
                <>
                  <RefreshCw size={16} className="animate-spin-slow" /> 已同步
                </>
              ) : status === 'connecting' ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> 正在握手...
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                  连接数据库
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .animate-spin-slow { animation: spin 3s linear infinite; }
      `}</style>
    </div>
  );
};
