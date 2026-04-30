import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, LogOut } from 'lucide-react';
import { ConnectionStatus } from '../types';

interface ConnectionHeaderProps {
  status: ConnectionStatus;
  lastUpdated?: number;
  onLogout: () => void;
}

export const ConnectionHeader: React.FC<ConnectionHeaderProps> = ({
  status,
  lastUpdated,
  onLogout
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return <Wifi className="w-5 h-5 text-green-500" />;
      case 'connecting':
        return <RefreshCw className="w-5 h-5 text-yellow-500 animate-spin" />;
      case 'disconnected':
      default:
        return <WifiOff className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return '已连接';
      case 'connecting':
        return '连接中...';
      case 'disconnected':
      default:
        return '未连接';
    }
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '从未';
    const diff = currentTime.getTime() - lastUpdated;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    return new Date(lastUpdated).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-4 sm:mb-6">
      <div className="flex items-center justify-between gap-2">
        {/* 左侧：连接状态（定位已移到“实时物联网监控”面板，避免重复） */}
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-colors ${
            status === 'connected' ? 'bg-green-50' : status === 'connecting' ? 'bg-yellow-50' : 'bg-red-50'
          }`}>
            {getStatusIcon()}
            <span className={`text-xs font-bold hidden xs:inline ${
              status === 'connected' ? 'text-green-700' : status === 'connecting' ? 'text-yellow-700' : 'text-red-700'
            }`}>
              {getStatusText()}
            </span>
          </div>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden md:flex flex-col items-end mr-2">
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">最后更新</div>
            <div className="text-xs font-semibold text-gray-600">{formatLastUpdated()}</div>
          </div>
          
          <button
            onClick={onLogout}
            className="p-2 sm:px-3 sm:py-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition-all active:scale-95"
            title="退出登录"
          >
            <LogOut className="w-5 h-5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline ml-1.5 text-sm font-bold">退出</span>
          </button>
        </div>
      </div>
    </div>
  );
};
