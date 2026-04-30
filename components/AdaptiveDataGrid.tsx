import React, { useState, useMemo } from 'react';
import { BeehiveData } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  ArrowUpDown,
  CheckCircle,
  Clock,
  Search,
  Thermometer,
  Droplets,
  Weight,
  Activity,
  Filter,
  Download
} from 'lucide-react';

interface AdaptiveDataGridProps {
  data: BeehiveData[];
  className?: string;
}

interface Column {
  key: string;
  name: string;
  render: (value: any, data: BeehiveData) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

export const AdaptiveDataGrid: React.FC<AdaptiveDataGridProps> = ({
  data,
  className = ''
}) => {
  const { isMobile } = useIsMobile();
  const [sortBy, setSortBy] = useState<string>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  // 列配置
  const columns: Column[] = [
    {
      key: 'timestamp',
      name: '时间',
      render: (value) => {
        const date = new Date(Number(value));
        return isMobile
          ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          : date.toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
      },
      sortable: true,
      width: isMobile ? '100px' : '160px'
    },
    {
      key: 'temperature',
      name: '温度',
      render: (value, data) => (
        <div className="flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-orange-500" />
          <span>{Number(value).toFixed(1)}°C</span>
          {getTemperatureStatus(Number(value))}
        </div>
      ),
      sortable: true,
      width: '100px'
    },
    {
      key: 'humidity',
      name: '湿度',
      render: (value, data) => (
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-blue-500" />
          <span>{Number(value).toFixed(0)}%</span>
          {getHumidityStatus(Number(value))}
        </div>
      ),
      sortable: true,
      width: '80px'
    },
    {
      key: 'weight',
      name: '重量',
      render: (value, data) => (
        <div className="flex items-center gap-2">
          <Weight className="w-4 h-4 text-green-500" />
          <span>{Number(value).toFixed(1)}kg</span>
        </div>
      ),
      sortable: true,
      width: '80px'
    },
    {
      key: 'beesIn',
      name: '进蜂',
      render: (value, data) => (
        <div className="flex items-center gap-1">
          <span className="text-green-600">↓</span>
          <span>{value || 0}</span>
        </div>
      ),
      sortable: true,
      width: '60px'
    },
    {
      key: 'beesOut',
      name: '出蜂',
      render: (value, data) => (
        <div className="flex items-center gap-1">
          <span className="text-blue-600">↑</span>
          <span>{value || 0}</span>
        </div>
      ),
      sortable: true,
      width: '60px'
    },
    {
      key: 'hornetsDetected',
      name: '马蜂',
      render: (value, data) => (
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-red-500" />
          <span>{Number(value || 0)}</span>
          {Number(value) > 2 && <span className="text-xs bg-red-100 text-red-600 px-1 rounded">警告</span>}
        </div>
      ),
      sortable: true,
      width: '70px'
    }
  ];

  // 获取温度状态
  const getTemperatureStatus = (temp: number) => {
    if (temp > 35) return <span className="text-xs bg-red-100 text-red-600 px-1 rounded">高温</span>;
    if (temp < 10) return <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">低温</span>;
    if (temp < 20) return <span className="text-xs bg-yellow-100 text-yellow-600 px-1 rounded">偏低</span>;
    if (temp > 30) return <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">偏高</span>;
    return <span className="text-xs bg-green-100 text-green-600 px-1 rounded">正常</span>;
  };

  // 获取湿度状态
  const getHumidityStatus = (humidity: number) => {
    if (humidity > 80) return <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">过高</span>;
    if (humidity < 30) return <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">过低</span>;
    return <span className="text-xs bg-green-100 text-green-600 px-1 rounded">正常</span>;
  };

  // 排序数据
  const sortedData = useMemo(() => {
    if (!sortBy) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortBy as keyof BeehiveData];
      const bValue = b[sortBy as keyof BeehiveData];

      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return sortDirection === 'asc' ? 1 : -1;
      if (bValue === undefined) return sortDirection === 'asc' ? -1 : 1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      return 0;
    });
  }, [data, sortBy, sortDirection]);

  // 过滤数据
  const filteredData = useMemo(() => {
    if (!searchTerm) return sortedData;

    const term = searchTerm.toLowerCase();
    return sortedData.filter(item => {
      // 搜索所有文本字段
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
  }, [sortedData, searchTerm]);

  // 处理排序
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDirection('desc');
    }
  };

  // 导出数据
  const exportData = () => {
    const csvContent = [
      columns.map(col => col.name).join(','),
      ...filteredData.map(item =>
        columns.map(col => col.render(item[col.key as keyof BeehiveData], item)).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `蜂箱数据_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // 显示行数提示
  const showRowHint = filteredData.length > 100;
  const displayData = showRowHint ? filteredData.slice(0, 100) : filteredData;

  if (isMobile) {
    // 移动端卡片视图
    return (
      <div className={`space-y-4 ${className}`}>
        {/* 搜索和工具栏 */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索数据..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={exportData}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* 数据卡片 */}
        <div className="space-y-3">
          {displayData.map((item, index) => (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-900">
                  {new Date(Number(item.timestamp)).toLocaleTimeString('zh-CN')}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(Number(item.timestamp)).toLocaleDateString('zh-CN')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {columns.slice(1, 7).map(col => (
                  <div key={col.key} className="flex items-center justify-between">
                    <span className="text-gray-600">{col.name}:</span>
                    {col.render(item[col.key as keyof BeehiveData], item)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 数据过多提示 */}
        {showRowHint && (
          <div className="text-center text-sm text-gray-500 py-4">
            仅显示前100条数据，共{filteredData.length}条
          </div>
        )}
      </div>
    );
  }

  // 桌面端表格视图
  return (
    <div className={`rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索数据..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-500">
            {filteredData.length} 条记录
          </span>
        </div>
        <button
          onClick={exportData}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          <Download className="w-4 h-4" />
          导出
        </button>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 ${
                    col.width ? `w-[${col.width}]` : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.name}
                    {col.sortable && (
                      <ArrowUpDown className={`w-3 h-3 ${sortBy === col.key ? 'text-gray-900' : 'text-gray-400'}`} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displayData.map((item, index) => (
              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-sm ${col.width ? `w-[${col.width}]` : ''}`}
                  >
                    {col.render(item[col.key as keyof BeehiveData], item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 数据过多提示 */}
      {showRowHint && (
        <div className="bg-gray-50 px-4 py-2 text-center text-sm text-gray-500 border-t border-gray-200">
          仅显示前100条数据，共{filteredData.length}条
        </div>
      )}
    </div>
  );
};