import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BeehiveData } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';

interface PerformanceOptimizedGridProps {
  data: BeehiveData[];
  className?: string;
}

interface VirtualizedItem {
  id: number;
  index: number;
  data: BeehiveData;
  top: number;
  height: number;
}

// 虚拟化渲染的配置
const ROW_HEIGHT = 60;
const VISIBLE_ROWS = 5;
const BUFFER_ROWS = 5;

// 检测是否为移动端
function isMobileDevice() {
  return window.innerWidth < 768;
}

// 防抖函数
function debounce<T extends (...args: any[]) => any>(func: T, delay: number): T {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  }) as T;
}

export const PerformanceOptimizedGrid: React.FC<PerformanceOptimizedGridProps> = ({
  data,
  className = ''
}) => {
  const { isMobile } = useIsMobile();
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [filteredData, setFilteredData] = useState<BeehiveData[]>(data);
  const [searchTerm, setSearchTerm] = useState('');
  const sortRef = useRef<{ key: string; direction: 'asc' | 'desc' }>({ key: 'timestamp', direction: 'desc' });

  const containerRef = useRef<HTMLDivElement>(null);

  // 计算容器高度
  useEffect(() => {
    if (containerRef.current) {
      const height = containerRef.current.clientHeight;
      setContainerHeight(height);
    }
  }, []);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = debounce(() => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    }, 100);

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 搜索和排序优化
  useEffect(() => {
    let processedData = [...data];

    // 搜索过滤
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      processedData = processedData.filter(item => {
        return Object.values(item).some(value => {
          if (value === null || value === undefined) return false;
          if (typeof value === 'string') {
            return value.toLowerCase().includes(term);
          }
          if (typeof value === 'number') {
            return value.toString().includes(term);
          }
          return false;
        });
      });
    }

    // 排序
    const { key, direction } = sortRef.current;
    processedData.sort((a, b) => {
      const aValue = a[key as keyof BeehiveData];
      const bValue = b[key as keyof BeehiveData];

      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return direction === 'asc' ? 1 : -1;
      if (bValue === undefined) return direction === 'asc' ? -1 : 1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      return 0;
    });

    setFilteredData(processedData);
  }, [data, searchTerm]);

  // 计算虚拟化项目
  const virtualizedItems = useMemo(() => {
    if (!containerHeight) return [];

    const startIndex = Math.floor(scrollTop / ROW_HEIGHT);
    const endIndex = Math.min(
      Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS,
      filteredData.length
    );

    const items: VirtualizedItem[] = [];
    const containerScrollHeight = filteredData.length * ROW_HEIGHT;

    for (let i = Math.max(0, startIndex - BUFFER_ROWS); i < endIndex; i++) {
      if (i >= filteredData.length) break;
      items.push({
        id: i,
        index: i,
        data: filteredData[i],
        top: i * ROW_HEIGHT,
        height: ROW_HEIGHT
      });
    }

    return items;
  }, [filteredData, scrollTop, containerHeight, ROW_HEIGHT]);

  // 处理滚动
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // 处理排序
  const handleSort = (key: string) => {
    const direction = sortRef.current.key === key && sortRef.current.direction === 'asc' ? 'desc' : 'asc';
    sortRef.current = { key, direction };
  };

  // 获取排序指示器
  const getSortIndicator = (key: string) => {
    if (sortRef.current.key !== key) return null;
    return sortRef.current.direction === 'asc' ? '▲' : '▼';
  };

  // 渲染单元格
  const renderCell = (key: string, value: any, data: BeehiveData) => {
    const timestamp = new Date(Number(data.timestamp));

    switch (key) {
      case 'timestamp':
        return (
          <div className="text-xs text-gray-500">
            {timestamp.toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        );
      case 'temperature':
        return (
          <div className="flex items-center gap-1">
            <span className="text-orange-600 font-medium">{value.toFixed(1)}°C</span>
            {value > 35 && <span className="text-xs bg-red-100 text-red-600 px-1 rounded">高温</span>}
            {value < 10 && <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">低温</span>}
          </div>
        );
      case 'humidity':
        return (
          <div className="flex items-center gap-1">
            <span className="text-blue-600 font-medium">{value.toFixed(0)}%</span>
            {value > 80 && <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">过高</span>}
            {value < 30 && <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">过低</span>}
          </div>
        );
      case 'beesIn':
        return (
          <div className="flex items-center gap-1">
            <span className="text-green-600">↓</span>
            <span>{value || 0}</span>
          </div>
        );
      case 'beesOut':
        return (
          <div className="flex items-center gap-1">
            <span className="text-blue-600">↑</span>
            <span>{value || 0}</span>
          </div>
        );
      case 'hornetsDetected':
        return (
          <div className="flex items-center gap-1">
            <span className="text-red-600 font-medium">{value || 0}</span>
            {value > 2 && <span className="text-xs bg-red-100 text-red-600 px-1 rounded">警告</span>}
          </div>
        );
      default:
        return <span>{value}</span>;
    }
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* 搜索栏 */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="搜索数据..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-500">
            {filteredData.length} 条记录
          </span>
        </div>
      </div>

      {/* 虚拟化列表容器 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          height: '500px',
          overflow: 'auto',
          position: 'relative'
        }}
      >
        {/* 占位元素，用于撑开容器 */}
        <div
          style={{
            height: filteredData.length * ROW_HEIGHT,
            position: 'relative'
          }}
        >
          {/* 虚拟化项目 */}
          {virtualizedItems.map(item => (
            <div
              key={item.id}
              className={item.index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
              style={{
                position: 'absolute',
                top: item.top,
                left: 0,
                right: 0,
                height: item.height,
                transform: `translateY(${item.top}px)`
              }}
            >
              <div className="flex items-center p-4 h-full">
                {Object.keys(item.data).filter(key =>
                  ['timestamp', 'temperature', 'humidity', 'beesIn', 'beesOut', 'hornetsDetected'].includes(key)
                ).map(key => (
                  <div
                    key={key}
                    className="flex-1 min-w-0 pr-4"
                    style={{ flex: key === 'timestamp' ? 0.8 : 1 }}
                    onClick={() => handleSort(key)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 uppercase tracking-wider">
                        {key === 'timestamp' ? '时间' : key === 'temperature' ? '温度' :
                         key === 'humidity' ? '湿度' :
                         key === 'beesIn' ? '进蜂' :
                         key === 'beesOut' ? '出蜂' : '马蜂检测'}
                        {getSortIndicator(key)}
                      </span>
                    </div>
                    {renderCell(key, item.data[key as keyof BeehiveData], item.data)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部信息 */}
      <div className="bg-gray-50 px-4 py-2 text-sm text-gray-500 border-t border-gray-200">
        {filteredData.length > 0 ? `显示 ${virtualizedItems.length}/${filteredData.length} 条记录` : '暂无数据'}
      </div>
    </div>
  );
};