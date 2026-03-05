
import React from 'react';
import { ConnectionStatus } from '../types';
import { Database, RefreshCw, Server, Shield, LogOut } from 'lucide-react';

interface Props {
  status: ConnectionStatus;
  onSync: () => void;
  onDisconnect: () => void;
  lastUpdatedAt?: number | null;
  refreshIntervalMs: number;
  onRefreshIntervalChange: (value: number) => void;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  onLogout?: () => void;
}

export const ConnectionHeader: React.FC<Props> = ({ 
  status, 
  onSync, 
  onDisconnect, 
  lastUpdatedAt, 
  refreshIntervalMs, 
  onRefreshIntervalChange,
  isAdmin,
  onOpenAdmin,
  onLogout
}) => {
  const lastUpdatedLabel = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '未更新';
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
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-100">
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">更新于 {lastUpdatedLabel}</span>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-100">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">自动刷新</span>
              <select
                value={refreshIntervalMs}
                onChange={(event) => onRefreshIntervalChange(Number(event.target.value))}
                className="text-[10px] font-bold text-gray-600 bg-transparent outline-none"
              >
                <option value={0}>关闭</option>
                <option value={5000}>5 秒</option>
                <option value={15000}>15 秒</option>
                <option value={30000}>30 秒</option>
                <option value={60000}>60 秒</option>
              </select>
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

            {isAdmin && (
              <button
                onClick={onOpenAdmin}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                title="管理员控制台"
              >
                <Shield size={16} />
              </button>
            )}

            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="退出登录"
            >
              <LogOut size={16} />
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
