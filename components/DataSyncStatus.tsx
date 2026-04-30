import React, { useEffect, useState } from 'react';
import { dataSyncService } from '../services/dataSyncService';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface DataSyncStatusProps {
  className?: string;
}

export const DataSyncStatus: React.FC<DataSyncStatusProps> = ({ className = '' }) => {
  const [status, setStatus] = useState({
    isOnline: true,
    cacheSize: 0,
    subscriberCount: 0,
    lastSyncTimes: {} as Record<string, number>
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [alerts, setAlerts] = useState<string[]>([]);

  useEffect(() => {
    const updateStatus = () => {
      const currentStatus = dataSyncService.getSyncStatus();
      setStatus(currentStatus);

      // 检查同步延迟
      const newAlerts: string[] = [];
      const now = Date.now();
      Object.entries(currentStatus.lastSyncTimes).forEach(([key, time]) => {
        const delay = now - time;
        if (delay > 10000) { // 超过10秒未同步
          newAlerts.push(`数据 ${key} 同步延迟: ${Math.round(delay / 1000)}秒`);
        }
      });
      setAlerts(newAlerts);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleForceSync = () => {
    Object.keys(status.lastSyncTimes).forEach(key => {
      dataSyncService.forceSync(key);
    });
  };

  const getSyncStatusColor = (lastSyncTime: number) => {
    const delay = Date.now() - lastSyncTime;
    if (delay < 5000) return 'text-green-500';
    if (delay < 10000) return 'text-yellow-500';
    return 'text-red-500';
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* 主要状态指示器 */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {status.isOnline ? (
            <Wifi className="w-5 h-5 text-green-500" />
          ) : (
            <WifiOff className="w-5 h-5 text-red-500" />
          )}
          <div>
            <div className="text-sm font-medium text-gray-900">
              {status.isOnline ? '数据同步正常' : '离线模式'}
            </div>
            <div className="text-xs text-gray-500">
              {status.subscriberCount} 个数据订阅 | {status.cacheSize} 个缓存
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {alerts.length > 0 && (
            <div className="flex items-center gap-1 text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs">{alerts.length}</span>
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleForceSync();
            }}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            title="强制刷新"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 展开的详细信息 */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-3 space-y-3">
          {/* 告警信息 */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-yellow-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                同步告警
              </div>
              {alerts.map((alert, index) => (
                <div key={index} className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
                  {alert}
                </div>
              ))}
            </div>
          )}

          {/* 同步状态详情 */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-700">同步状态详情</div>
            {Object.entries(status.lastSyncTimes).map(([key, time]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{key}</span>
                <div className="flex items-center gap-2">
                  <Clock className={`w-3 h-3 ${getSyncStatusColor(time)}`} />
                  <span className={getSyncStatusColor(time)}>
                    {formatTime(time)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={handleForceSync}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs hover:bg-blue-100"
            >
              <RefreshCw className="w-3 h-3" />
              立即同步
            </button>
            <button
              onClick={() => dataSyncService.clearCache()}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg text-xs hover:bg-gray-100"
            >
              清除缓存
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// 数据同步错误边界
export class DataSyncErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[DataSync] 数据同步错误:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">数据同步出错</span>
          </div>
          <p className="text-sm text-red-600 mt-2">
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
