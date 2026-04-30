import React, { useState, useEffect } from 'react';
import { Activity, TrendingUp, Clock, Filter } from 'lucide-react';

interface Event {
  id: string;
  timestamp: number;
  type: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  category: string;
}

interface EventLogProps {
  events?: Event[];
}

export const EventLog: React.FC<EventLogProps> = ({ events: propEvents }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<'all' | 'info' | 'warning' | 'error'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    setEvents(Array.isArray(propEvents) ? propEvents : []);
  }, [propEvents]);

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return new Date(timestamp).toLocaleDateString('zh-CN');
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'info':
        return <Activity className="w-4 h-4 text-blue-500" />;
      case 'warning':
        return <TrendingUp className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <Activity className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'info':
        return 'border-l-blue-500 bg-blue-50';
      case 'warning':
        return 'border-l-yellow-500 bg-yellow-50';
      case 'error':
        return 'border-l-red-500 bg-red-50';
      default:
        return 'border-l-gray-500 bg-gray-50';
    }
  };

  const filteredEvents = events.filter(event => {
    if (filter !== 'all' && event.type !== filter) return false;
    if (categoryFilter !== 'all' && event.category !== categoryFilter) return false;
    return true;
  });

  const categories = Array.from(new Set(events.map(event => event.category)));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">事件日志</h2>
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="all">全部类型</option>
              <option value="info">信息</option>
              <option value="warning">警告</option>
              <option value="error">错误</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="all">全部分类</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>暂无相关事件记录</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredEvents.map((event) => (
              <div key={event.id} className={`p-4 border-l-4 ${getEventColor(event.type)}`}>
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium text-gray-900">{event.title}</h3>
                      <span className="text-xs text-gray-500">{formatTime(event.timestamp)}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{event.description}</p>
                    <div className="flex items-center space-x-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {event.category}
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        event.type === 'info' ? 'bg-blue-100 text-blue-700' :
                        event.type === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {event.type === 'info' ? '信息' : event.type === 'warning' ? '警告' : '错误'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {filteredEvents.length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>共 {filteredEvents.length} 条记录</span>
            <span>最后更新: {formatTime(Date.now())}</span>
          </div>
        </div>
      )}
    </div>
  );
};
