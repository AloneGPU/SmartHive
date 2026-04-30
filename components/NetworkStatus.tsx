import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertTriangle, RefreshCw, X } from 'lucide-react';

interface NetworkStatusProps {
  isOnline?: boolean;
  connectionStatus?: 'connecting' | 'connected' | 'disconnected';
  lastUpdated?: number | null;
  onRetry?: () => void;
}

export const NetworkStatus: React.FC<NetworkStatusProps> = ({
  isOnline = navigator.onLine,
  connectionStatus = 'disconnected',
  lastUpdated,
  onRetry
}) => {
  const [showOfflineBanner, setShowOfflineBanner] = useState(!isOnline);
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [timeSinceUpdate, setTimeSinceUpdate] = useState<string>('');

  // 监听网络状态
  useEffect(() => {
    const handleOnline = () => {
      setShowOfflineBanner(false);
      setShowReconnectPrompt(true);
    };

    const handleOffline = () => {
      setShowOfflineBanner(true);
      setShowReconnectPrompt(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 计算距离上次更新的时间
  useEffect(() => {
    if (!lastUpdated) {
      setTimeSinceUpdate('暂无数据');
      return;
    }

    const updateTime = () => {
      const seconds = Math.floor((Date.now() - lastUpdated) / 1000);
      if (seconds < 60) {
        setTimeSinceUpdate(`${seconds}秒前更新`);
      } else if (seconds < 3600) {
        setTimeSinceUpdate(`${Math.floor(seconds / 60)}分钟前更新`);
      } else {
        setTimeSinceUpdate(`${Math.floor(seconds / 3600)}小时前更新`);
      }
    };

    updateTime();
    const timer = setInterval(updateTime, 10000);

    return () => clearInterval(timer);
  }, [lastUpdated]);

  // 离线横幅
  if (showOfflineBanner) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WifiOff className="w-5 h-5" />
            <div>
              <p className="font-medium">网络连接已断开</p>
              <p className="text-sm text-red-100">请检查您的网络连接</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 连接状态提示
  if (connectionStatus === 'connecting') {
    return (
      <div className="fixed top-4 right-4 z-40 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 shadow-lg flex items-center gap-3">
        <RefreshCw className="w-5 h-5 text-yellow-600 animate-spin" />
        <span className="text-yellow-800 text-sm font-medium">正在连接服务器...</span>
      </div>
    );
  }

  // 断开连接提示
  if (connectionStatus === 'disconnected' && isOnline) {
    return (
      <div className="fixed top-4 right-4 z-40 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 shadow-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-orange-800 text-sm font-medium">服务器连接已断开</p>
            <p className="text-orange-600 text-xs mt-1">{timeSinceUpdate}</p>
            {onRetry && (
              <button
                onClick={() => {
                  setShowReconnectPrompt(false);
                  onRetry();
                }}
                className="mt-2 px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 transition-colors"
              >
                重新连接
              </button>
            )}
          </div>
          <button
            onClick={() => setShowReconnectPrompt(false)}
            className="text-orange-400 hover:text-orange-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // 网络恢复提示
  if (showReconnectPrompt && connectionStatus === 'connected') {
    return (
      <div className="fixed top-4 right-4 z-40 bg-green-50 border border-green-200 rounded-lg px-4 py-3 shadow-lg">
        <div className="flex items-center gap-3">
          <Wifi className="w-5 h-5 text-green-600" />
          <span className="text-green-800 text-sm font-medium">网络已恢复</span>
          <button
            onClick={() => setShowReconnectPrompt(false)}
            className="text-green-400 hover:text-green-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // 连接正常时显示状态指示器
  if (connectionStatus === 'connected') {
    return (
      <div className="fixed bottom-4 right-4 z-40 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>{timeSinceUpdate}</span>
        </div>
      </div>
    );
  }

  return null;
};

// 空状态组件
export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}> = ({ icon, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        {icon || <AlertTriangle className="w-8 h-8 text-gray-400" />}
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 text-center max-w-md mb-4">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

// 错误状态组件
export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}> = ({ title = '出现错误', message, onRetry, retryLabel = '重试' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 text-center max-w-md mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          {retryLabel}
        </button>
      )}
    </div>
  );
};

// 加载状态组件
export const LoadingState: React.FC<{
  message?: string;
}> = ({ message = '加载中...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
};
