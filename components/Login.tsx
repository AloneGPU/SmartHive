import React, { useState } from 'react';
import { User, Shield, Lock, ArrowRight, Eye, EyeOff, LayoutDashboard } from 'lucide-react';

interface LoginProps {
  onLogin: (role: 'user' | 'admin') => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate network delay
    setTimeout(() => {
      if (role === 'admin') {
        if (password === 'admin123') {
          onLogin('admin');
        } else {
          setError('管理员密码错误');
          setLoading(false);
        }
      } else {
        // User login - simplified for demo, or could check a user password
        onLogin('user');
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col md:flex-row h-auto md:h-[500px]">
        {/* Left Side - Visual */}
        <div className="hidden md:flex md:w-1/2 bg-indigo-600 p-8 flex-col justify-between text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-6">
              <LayoutDashboard size={24} className="text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-2">SmartHive</h2>
            <p className="text-indigo-200 text-sm">智慧蜂场管理终端</p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="w-full md:w-1/2 p-8 flex flex-col justify-center">
          <div className="md:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <LayoutDashboard size={16} className="text-white" />
            </div>
            <span className="text-xl font-bold text-gray-800">SmartHive</span>
          </div>

          <h3 className="text-2xl font-bold text-gray-800 mb-6">欢迎回来</h3>

          {/* Role Switcher */}
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => { setRole('user'); setError(''); setPassword(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
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
              onClick={() => { setRole('admin'); setError(''); setPassword(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                role === 'admin' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Shield size={16} />
              管理员
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {role === 'admin' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">管理员密码</label>
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
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {role === 'user' && (
               <div className="p-4 bg-blue-50 text-blue-700 text-sm rounded-xl border border-blue-100">
                  普通用户无需密码即可访问监控看板。
               </div>
            )}

            {error && (
              <div className="text-xs text-red-500 font-medium bg-red-50 p-2 rounded-lg border border-red-100 flex items-center gap-1">
                 <Shield size={12} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {role === 'admin' ? '验证身份并登录' : '进入系统'}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-xs text-gray-400">
              {role === 'admin' 
                ? '' 
                : '如需管理后台配置，请切换至管理员登录'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
