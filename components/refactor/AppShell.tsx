import { NavLink, useLocation as useRouteLocation } from 'react-router-dom';
import { RefreshCw, Shield, LayoutGrid, Activity, Database, MessageSquare, Video } from 'lucide-react';
import { ConnectionHeader } from '../ConnectionHeader';
import { useAppContext } from '../../context/AppContext';
import { CommandPalette } from './CommandPalette';
import { OnboardingTour } from './OnboardingTour';
import { useState } from 'react';

export const AppShell = (props: { children: React.ReactNode }) => {
  const { auth, connectionStatus, hiveData, handleLogout, handleSync } = useAppContext();
  const routeLocation = useRouteLocation();
  const [isSyncing, setIsSyncing] = useState(false);

  const onSync = async () => {
    setIsSyncing(true);
    await handleSync();
    setTimeout(() => setIsSyncing(false), 1000);
  };

  const navItems = [
    { to: '/overview', label: '总览', icon: <LayoutGrid className="w-5 h-5" /> },
    { to: '/breakdown', label: '细分', icon: <Activity className="w-5 h-5" /> },
    { to: '/detail', label: '详情', icon: <Database className="w-5 h-5" /> },
    { to: '/chat', label: 'AI问答', icon: <MessageSquare className="w-5 h-5" /> },
    { to: '/vision', label: '视觉', icon: <Video className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 sm:pb-0 font-sans text-[16px] leading-relaxed">
      <ConnectionHeader
        status={connectionStatus}
        lastUpdated={hiveData?.timestamp}
        onLogout={handleLogout}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-6">
        {/* 桌面端导航 */}
        <div className="hidden sm:flex items-center justify-between gap-3 mb-6">
          <nav className="flex items-center gap-2" aria-label="主导航">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            {auth.role === 'admin' && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-2 ${
                    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <Shield className="w-4 h-4" />
                管理后台
              </NavLink>
            )}
          </nav>
          <button
            type="button"
            onClick={onSync}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-sm font-bold text-gray-700 shadow-sm transition-all active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 text-indigo-500 ${isSyncing ? 'animate-spin' : ''}`} />
            同步数据
          </button>
        </div>

        <main className="space-y-6 sm:space-y-8">{props.children}</main>
      </div>

      {/* 移动端底部固定导航栏 - 拇指可触达区域 */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-1 z-50 flex items-center justify-around safe-area-inset-bottom shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 px-1 min-w-[64px] transition-all ${
                isActive ? 'text-indigo-600' : 'text-gray-400'
              }`
            }
          >
            <div className={`p-1.5 rounded-xl transition-all ${
              routeLocation.pathname.startsWith(item.to) ? 'bg-indigo-50' : ''
            }`}>
              {item.icon}
            </div>
            <span className="text-[11px] font-bold mt-1 tracking-tight">{item.label}</span>
          </NavLink>
        ))}
        {auth.role === 'admin' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 px-1 min-w-[64px] transition-all ${
                isActive ? 'text-indigo-600' : 'text-gray-400'
              }`
            }
          >
            <div className={`p-1.5 rounded-xl transition-all ${
              routeLocation.pathname.startsWith('/admin') ? 'bg-indigo-50' : ''
            }`}>
              <Shield className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold mt-1 tracking-tight">管理</span>
          </NavLink>
        )}
      </nav>

      <CommandPalette />
      <OnboardingTour />
    </div>
  );
};

