import React from 'react';
import { Bell, Info, AlertTriangle, Clock } from 'lucide-react';

interface Event {
  id: string;
  time: string;
  type: 'info' | 'warning' | 'critical';
  msg: string;
}

export const EventLog: React.FC = () => {
  const [events] = React.useState<Event[]>([
    { id: '1', time: '10:45', type: 'info', msg: '蜂群进入活跃期，出勤率大幅上升' },
    { id: '2', time: '09:12', type: 'warning', msg: '箱内湿度偏高，请注意通风' },
    { id: '3', time: '昨天', type: 'info', msg: '重量增长 0.45kg，流蜜状态良好' },
  ]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 flex items-center gap-2">
        <Bell size={18} className="text-indigo-500" />
        <h3 className="font-bold text-gray-800">系统事件日志</h3>
      </div>
      <div className="p-2 overflow-y-auto flex-1 max-h-[300px]">
        {events.map(event => (
          <div key={event.id} className="flex gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div className={`mt-1 shrink-0 ${
              event.type === 'critical' ? 'text-red-500' : 
              event.type === 'warning' ? 'text-amber-500' : 'text-blue-500'
            }`}>
              {event.type === 'info' ? <Info size={16}/> : <AlertTriangle size={16}/>}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-0.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                   event.type === 'critical' ? 'bg-red-50 text-red-600' : 
                   event.type === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {event.type.toUpperCase()}
                </span>
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Clock size={10}/> {event.time}
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