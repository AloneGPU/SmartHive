import { Login } from './components/Login';
import ErrorBoundary from './components/ErrorBoundary';
import { useAppContext, AppProvider } from './context/AppContext';
import { Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { AppShell } from './components/refactor/AppShell';
import { useEffect, lazy, Suspense } from 'react';

const AdminDashboard = lazy(() => import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const VisionRecognitionPage = lazy(() => import('./components/VisionRecognitionPage').then((m) => ({ default: m.VisionRecognitionPage })));
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const BreakdownPage = lazy(() => import('./pages/BreakdownPage').then((m) => ({ default: m.BreakdownPage })));
const DetailPage = lazy(() => import('./pages/DetailPage').then((m) => ({ default: m.DetailPage })));
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })));

const RouteFallback = () => (
  <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">页面加载中...</div>
);

function AppContent() {
  const {
    auth,
    aiConfig,
    handleLogin,
    handleLogout,
    handleUpdateConfig
  } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  // 处理登录后的自动跳转逻辑
  useEffect(() => {
    // 只有当用户刚登录且当前在根路径或者特定的登录触发路径时，才进行自动跳转
    if (auth.isAuthenticated) {
      if (location.pathname === '/' || location.pathname === '/login') {
        if (auth.role === 'admin') {
          navigate('/admin', { replace: true });
        } else {
          navigate('/overview', { replace: true });
        }
      }
    }
  }, [auth.isAuthenticated, auth.role, navigate, location.pathname]);

  // 强制登录检查
  if (!auth.isAuthenticated) {
    return <Login onLogin={handleLogin} apiBaseUrl={aiConfig.apiBaseUrl || '/api'} />;
  }

  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={auth.role === 'admin' ? <Navigate to="/admin" replace /> : <Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/breakdown" element={<BreakdownPage />} />
          <Route path="/detail" element={<DetailPage />} />
          <Route path="/detail/:entityId" element={<DetailPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/vision" element={<VisionRecognitionPage config={aiConfig} isAdmin={auth.role === 'admin'} />} />
          <Route
            path="/admin"
            element={
              auth.role === 'admin' ? (
                <AdminDashboard
                  config={aiConfig}
                  adminSessionToken={auth.adminSessionToken}
                  onUpdateConfig={handleUpdateConfig}
                  onLogout={handleLogout}
                />
              ) : (
                <Navigate to="/overview" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ErrorBoundary onRetry={() => window.location.reload()}>
        <AppContent />
      </ErrorBoundary>
    </AppProvider>
  );
}
