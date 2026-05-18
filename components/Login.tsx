import React, { useState } from 'react';
import { User, Shield, Lock, ArrowRight, Eye, EyeOff, LayoutDashboard } from 'lucide-react';

interface LoginProps {
  onLogin: (role: 'user' | 'admin', apiToken?: string, adminSessionToken?: string) => void;
  apiBaseUrl?: string;
}

export const Login: React.FC<LoginProps> = ({ onLogin, apiBaseUrl = '/api' }) => {
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loginUrl = `${apiBaseUrl.replace(/\/$/, '')}/auth/login`;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 普通用户和管理员都调用后端登录接口
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          role === 'admin'
            ? { role: 'admin', password: password.trim() }
            : { role: 'user' }
        )
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          setError(typeof data.message === 'string' ? data.message : '请求过于频繁，请稍后再试');
        } else {
          setError(typeof data.message === 'string' ? data.message : '登录失败，请重试');
        }
        setLoading(false);
        return;
      }

      const token = typeof data.apiToken === 'string' ? data.apiToken.trim() : '';
      const adminSessionToken = typeof data.adminSessionToken === 'string' ? data.adminSessionToken.trim() : '';

      if (role === 'admin') {
        if (!token) {
          setError('服务器配置异常，请联系管理员');
          setLoading(false);
          return;
        }
        onLogin('admin', token, adminSessionToken || undefined);
      } else {
        onLogin('user', token || undefined);
      }
    } catch {
      setError('网络连接失败，请检查网络后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="p-8 text-center bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LayoutDashboard size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">SmartHive</h1>
          <p className="text-indigo-100 text-sm">智慧蜂场管理终端</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-5">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => { setRole('user'); setError(''); setPassword(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${
                role === 'user' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <User size={16} />
              普通用户
            </button>
            <button
              type="button"
              onClick={() => { setRole('admin'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${
                role === 'admin' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Shield size={16} />
              管理员
            </button>
          </div>

          {role === 'admin' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">管理员密码</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                  placeholder="请输入管理员密码"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-500 font-medium bg-red-50 p-3 rounded-lg border border-red-100 flex items-center gap-2">
              <Shield size={12} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                进入系统
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="px-8 pb-6">
          <p className="text-xs text-gray-400 text-center">
            {role === 'admin' ? '管理员可管理系统配置与参数' : '查看蜂箱数据与实时监控'}
          </p>
        </div>
      </div>
    </div>
  );
};
