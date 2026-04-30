import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface CalendarSelectorProps {
  startDate: Date;
  endDate: Date;
  onRangeSelect: (start: Date, end: Date) => void;
  hasData: (date: Date) => boolean;
  visibleMonth?: Date;
  onVisibleMonthChange?: (month: Date) => void;
}

export const CalendarSelector: React.FC<CalendarSelectorProps> = ({
  startDate,
  endDate,
  onRangeSelect,
  hasData,
  visibleMonth,
  onVisibleMonthChange
}) => {
  const safeStart = startDate instanceof Date && Number.isFinite(startDate.getTime()) ? startDate : new Date();
  const safeEnd = endDate instanceof Date && Number.isFinite(endDate.getTime()) ? endDate : safeStart;
  const [currentMonth, setCurrentMonth] = useState(new Date(safeStart.getFullYear(), safeStart.getMonth(), 1));
  const monthValue = visibleMonth || currentMonth;

  useEffect(() => {
    if (visibleMonth) return;
    const next = new Date(safeStart.getFullYear(), safeStart.getMonth(), 1);
    if (next.getFullYear() === currentMonth.getFullYear() && next.getMonth() === currentMonth.getMonth()) {
      return;
    }
    setCurrentMonth(next);
  }, [currentMonth, safeStart, visibleMonth]);

  // 获取当月的天数
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // 获取当月第一天是星期几
  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  // 生成日历数据
  const generateCalendarDays = () => {
    const year = monthValue.getFullYear();
    const month = monthValue.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayOfMonth = getFirstDayOfMonth(year, month);
    
    const days = [];
    
    // 添加上月的占位天数
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push({ day: null, isCurrentMonth: false, date: null });
    }
    
    // 添加当月的天数
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      days.push({
        day,
        isCurrentMonth: true,
        date
      });
    }
    
    return days;
  };

  // 切换到上个月
  const goToPrevMonth = () => {
    const next = new Date(monthValue.getFullYear(), monthValue.getMonth() - 1, 1);
    if (onVisibleMonthChange) {
      onVisibleMonthChange(next);
      return;
    }
    setCurrentMonth(next);
  };

  // 切换到下个月
  const goToNextMonth = () => {
    const next = new Date(monthValue.getFullYear(), monthValue.getMonth() + 1, 1);
    if (onVisibleMonthChange) {
      onVisibleMonthChange(next);
      return;
    }
    setCurrentMonth(next);
  };

  // 切换到今天
  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (onVisibleMonthChange) {
      onVisibleMonthChange(nextMonth);
    } else {
      setCurrentMonth(nextMonth);
    }
    onRangeSelect(today, today);
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
  };

  const isInRange = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const s = new Date(safeStart);
    s.setHours(0, 0, 0, 0);
    const e = new Date(safeEnd);
    e.setHours(0, 0, 0, 0);
    return d >= s && d <= e;
  };

  const handleDateClick = (date: Date) => {
    const clickedDate = new Date(date);
    clickedDate.setHours(0, 0, 0, 0);

    // 如果当前选中的是一个范围，点击则重新开始选择
    if (!isSameDay(safeStart, safeEnd)) {
      onRangeSelect(clickedDate, clickedDate);
      return;
    }

    // 如果当前选中是一个点
    if (clickedDate < safeStart) {
      // 如果点在当前点之前，则设为新的起点
      onRangeSelect(clickedDate, clickedDate);
    } else if (isSameDay(clickedDate, safeStart)) {
      // 如果点在当前点上，保持不变或取消选择（这里保持点选择）
      onRangeSelect(clickedDate, clickedDate);
    } else {
      // 如果点在当前点之后，检查是否超过31天
      const diffTime = Math.abs(clickedDate.getTime() - safeStart.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 31) {
        // 超过31天，重置为单点选择
        onRangeSelect(clickedDate, clickedDate);
      } else {
        // 设置为结束点
        onRangeSelect(safeStart, clickedDate);
      }
    }
  };

  // 月份名称
  const monthNames = [
    '一月', '二月', '三月', '四月', '五月', '六月',
    '七月', '八月', '九月', '十月', '十一月', '十二月'
  ];

  // 星期名称
  const weekNames = ['日', '一', '二', '三', '四', '五', '六'];

  const calendarDays = generateCalendarDays();
  const monthName = monthNames[monthValue.getMonth()];
  const year = monthValue.getFullYear();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      {/* 日历头部 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <CalendarIcon className="w-5 h-5 mr-2 text-blue-600" />
          选择日期
        </h3>
        <button
          onClick={goToToday}
          className="text-sm px-3 py-1 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
        >
          今天
        </button>
      </div>

      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={goToPrevMonth}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="上个月"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h4 className="text-md font-medium text-gray-800">
          {year}年 {monthName}
        </h4>
        <button
          onClick={goToNextMonth}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="下个月"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekNames.map((day, index) => (
          <div key={index} className="text-center text-xs font-medium text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* 日历网格 */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((item, index) => {
          if (!item.isCurrentMonth) {
            return (
              <div key={index} className="h-10 flex items-center justify-center text-gray-200">
                {item.day}
              </div>
            );
          }

          const isSelected = item.date && isInRange(item.date);
          const isStart = item.date && isSameDay(item.date, safeStart);
          const isEnd = item.date && isSameDay(item.date, safeEnd);
          const isBetween = isSelected && !isStart && !isEnd;

          const hasDataOnDate = item.date ? hasData(item.date) : false;

          return (
            <button
              key={index}
              onClick={() => item.date && handleDateClick(item.date)}
              className={`h-10 flex items-center justify-center rounded-full transition-all relative ${
                isStart || isEnd
                  ? 'bg-blue-600 text-white font-medium z-10'
                  : isBetween
                  ? 'bg-blue-100 text-blue-700 font-medium rounded-none'
                  : item.date && hasDataOnDate
                  ? 'hover:bg-blue-50 text-gray-900 font-medium'
                  : 'hover:bg-gray-50 text-gray-600'
              } ${isStart && !isSameDay(safeStart, safeEnd) ? 'rounded-r-none' : ''} ${isEnd && !isSameDay(safeStart, safeEnd) ? 'rounded-l-none' : ''}`}
            >
              {item.day}
              {item.date && hasDataOnDate && !isSelected && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-600" />
              )}
            </button>
          );
        })}
      </div>

      {/* 选中日期显示 */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-sm text-gray-500">选中范围</div>
        <div className="text-sm font-medium text-gray-900 mt-1">
          {isSameDay(safeStart, safeEnd) ? (
            safeStart.toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long'
            })
          ) : (
            <>
              {safeStart.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
              <span className="mx-2">至</span>
              {safeEnd.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
              <span className="ml-2 text-xs text-gray-500">
                ({Math.ceil(Math.abs(safeEnd.getTime() - safeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1}天)
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
