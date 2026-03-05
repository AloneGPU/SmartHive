
import React, { useMemo } from 'react';
import { Bell, Info, AlertTriangle, Clock, Sparkles } from 'lucide-react';
import { BeehiveData, AIAnalysisResult } from '../types';

interface Event {
  id: string;
  time: number;
  type: 'info' | 'warning' | 'critical';
  msg: string;
  source: 'system' | 'ai';
}

interface Props {
  data: BeehiveData | null;
  history: any[];
  lastUpdatedAt?: number | null;
  aiAnalysis?: AIAnalysisResult | null; // Added prop for AI events
}

export const EventLog: React.FC<Props> = ({ data, history, lastUpdatedAt, aiAnalysis }) => {
  const formatTime = (value: number) => new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const events = useMemo<Event[]>(() => {
    if (!data) return [];
    const list: Event[] = [];
    const latestTimestamp = typeof data.timestamp === 'number' ? data.timestamp : Date.now();
    
    // 1. 系统同步事件
    if (lastUpdatedAt) {
      list.push({ id: 'sync', time: lastUpdatedAt, type: 'info', msg: '系统同步完成', source: 'system' });
    }

    // 2. 实时传感器告警 (硬规则)
    if (data.hornetsDetected > 0) {
      list.push({ id: 'hornet', time: latestTimestamp, type: 'critical', msg: `疑似胡蜂入侵 ${data.hornetsDetected} 只`, source: 'system' });
    }
    if (data.temperature > 36) {
      list.push({ id: 'temp-high', time: latestTimestamp, type: 'warning', msg: '箱内温度偏高，建议通风降温', source: 'system' });
    } else if (data.temperature < 31) {
      list.push({ id: 'temp-low', time: latestTimestamp, type: 'warning', msg: '箱内温度偏低，建议保温', source: 'system' });
    }
    if (data.humidity > 80) {
      list.push({ id: 'hum-high', time: latestTimestamp, type: 'warning', msg: '箱内湿度偏高，请注意通风', source: 'system' });
    } else if (data.humidity < 40) {
      list.push({ id: 'hum-low', time: latestTimestamp, type: 'warning', msg: '箱内湿度偏低，注意补湿', source: 'system' });
    }

    // 3. 历史趋势事件 (硬规则)
    if (history.length > 1) {
      const newest = history[history.length - 1];
      const prev = history[history.length - 2];
      const newestWeight = newest?.weight ?? 0;
      const prevWeight = prev?.weight ?? 0;
      const delta = newestWeight - prevWeight;
      if (Number.isFinite(delta) && Math.abs(delta) > 0.05) {
        const rawTimestamp = typeof newest.timestamp === 'number' ? newest.timestamp : latestTimestamp;
        const eventTimestamp = rawTimestamp < 1_000_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
        list.push({
          id: 'weight',
          time: eventTimestamp,
          type: 'info',
          msg: `重量变化 ${delta > 0 ? '+' : ''}${delta.toFixed(2)}kg`,
          source: 'system'
        });
      }
    }

    // 4. AI 生成的事件
    if (aiAnalysis?.events) {
      aiAnalysis.events.forEach((evt, idx) => {
        list.push({
          id: `ai-${idx}-${evt.timestamp || Date.now()}`,
          time: evt.timestamp || aiAnalysis.lastUpdated || Date.now(),
          type: evt.type,
          msg: evt.msg,
          source: 'ai'
        });
      });
    }

    // 按时间倒序排序
    return list.sort((a, b) => b.time - a.time).slice(0, 10);
  }, [data, history, lastUpdatedAt, aiAnalysis]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 flex items-center gap-2">
        <Bell size={18} className="text-indigo-500" />
        <h3 className="font-bold text-gray-800">系统事件日志</h3>
      </div>
      <div className="p-2 overflow-y-auto flex-1 max-h-[300px]">
        {events.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-400">暂无事件</div>
        ) : events.map(event => (
          <div key={event.id} className="flex gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div className={`mt-1 shrink-0 ${
              event.type === 'critical' ? 'text-red-500' : 
              event.type === 'warning' ? 'text-amber-500' : 'text-blue-500'
            }`}>
              {event.source === 'ai' ? (
                 <Sparkles size={16} className="text-yellow-500" />
              ) : event.type === 'info' ? (
                 <Info size={16}/> 
              ) : (
                 <AlertTriangle size={16}/>
              )}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-0.5">
                <div className="flex items-center gap-2">
                   <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      event.type === 'critical' ? 'bg-red-50 text-red-600' : 
                      event.type === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                   }`}>
                     {event.type.toUpperCase()}
                   </span>
                   {event.source === 'ai' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-600 flex items-center gap-1">
                        AI 分析
                      </span>
                   )}
                </div>
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Clock size={10}/> {formatTime(event.time)}
                </span>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed">{event.msg}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
