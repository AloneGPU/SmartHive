import React, { useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { Menu, X, Settings, BarChart3, Cloud, Home } from 'lucide-react';

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  className?: string;
}

interface NavItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  badge?: string | number;
}

const navItems: NavItem[] = [
  {
    id: 'overview',
    name: '总览',
    icon: <Home className="w-5 h-5" />
  },
  {
    id: 'analytics',
    name: '数据分析',
    icon: <BarChart3 className="w-5 h-5" />
  },
  {
    id: 'weather',
    name: '天气监控',
    icon: <Cloud className="w-5 h-5" />
  },
  {
    id: 'settings',
    name: '设置',
    icon: <Settings className="w-5 h-5" />
  }
];

export const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({
  children,
  className = ''
}) => {
  const { isMobile } = useIsMobile();
  const [activeNav, setActiveNav] = useState('overview');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  if (isMobile) {
    // 移动端布局
    return (
      <div className={`min-h-screen bg-gray-50 ${className}`}>
        {/* 顶部导航栏 */}
        <header className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-50">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleMenu}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-bold text-gray-900">智能蜂箱</h1>
            </div>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>

          {/* 移动端菜单 */}
          {isMenuOpen && (
            <div className="absolute top-full left-0 right-0 bg-white shadow-lg border-t border-gray-200">
              <div className="py-2">
                {navItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveNav(item.id);
                      closeMenu();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      activeNav === item.id
                        ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    {item.icon}
                    <span className="font-medium">{item.name}</span>
                    {item.badge && (
                      <span className="ml-auto bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </header>

        {/* 主要内容 */}
        <main className="pt-16 pb-20 px-4">
          {children}
        </main>

        {/* 底部导航栏 */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
          <div className="grid grid-cols-4">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveNav(item.id);
                  closeMenu();
                }}
                className={`flex flex-col items-center justify-center py-2 text-xs transition-colors ${
                  activeNav === item.id
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {item.icon}
                <span className="mt-1">{item.name}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    );
  }

  // 桌面端布局
  return (
    <div className={`min-h-screen bg-gray-50 ${className}`}>
      {/* 侧边栏 */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-900">智能蜂箱系统</h1>
          <p className="text-sm text-gray-500 mt-1">蜂箱监控与管理系统</p>
        </div>

        <nav className="mt-6">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`w-full flex items-center gap-3 px-6 py-3 text-left transition-colors ${
                activeNav === item.id
                  ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600'
                  : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              {item.icon}
              <span className="font-medium">{item.name}</span>
              {item.badge && (
                <span className="ml-auto bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* 用户信息 */}
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
            <div>
              <p className="text-sm font-medium text-gray-900">管理员</p>
              <p className="text-xs text-gray-500">admin@example.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 主要内容 */}
      <main className="ml-64 min-h-screen">
        {/* 顶部工具栏 */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {navItems.find(item => item.id === activeNav)?.name}
            </h2>
            <div className="flex items-center gap-4">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Settings className="w-5 h-5" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* 页面内容 */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
};