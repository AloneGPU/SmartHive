import React, { useState } from 'react';
import { 
  Settings, Save, Database, Server, Key, Globe, 
  ShieldCheck, AlertTriangle, LogOut, Activity,
  Cpu, CheckCircle, X
} from 'lucide-react';
import { CustomAIConfig, ConnectionStatus } from '../types';

interface AdminDashboardProps {
  config: CustomAIConfig;
  onUpdateConfig: (config: CustomAIConfig) => void;
  onLogout: () => void;
  connectionStatus: ConnectionStatus;
  lastUpdatedAt: number | null;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  config, 
  onUpdateConfig, 
  onLogout,
  connectionStatus,
  lastUpdatedAt
}) => {
  const [tempConfig, setTempConfig] = useState<CustomAIConfig>(config);
  const [activeSection, setActiveSection] = useState<'ai' | 'backend' | 'system'>('ai');
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    onUpdateConfig(tempConfig);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleChange = (key: keyof CustomAIConfig, value: string | boolean) => {
    setTempConfig(prev => ({ ...prev, [key]: value }));
    setIsSaved(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16 font-sans">
      {/* Admin Header */}
      <div className="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white shadow-md">
                <ShieldCheck size={20} />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight">管理控制台</span>
                <span className="text-xs text-slate-400 block -mt-1">SmartHive Admin</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full border border-white/10">
                 <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-400' : 'bg-red-400'}`}></div>
                 <span className="text-xs font-medium text-slate-200">
                    {connectionStatus === 'connected' ? '系统在线' : '连接断开'}
                 </span>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
              >
                <LogOut size={16} />
                退出登录
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1 space-y-2">
            <button
              onClick={() => setActiveSection('ai')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeSection === 'ai' 
                  ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' 
                  : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Cpu size={18} />
              AI 模型配置
            </button>
            <button
              onClick={() => setActiveSection('backend')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeSection === 'backend' 
                  ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' 
                  : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Server size={18} />
              后端服务连接
            </button>
            <button
              onClick={() => setActiveSection('system')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeSection === 'system' 
                  ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' 
                  : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Activity size={18} />
              系统状态概览
            </button>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            
            {activeSection === 'ai' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <Cpu size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">AI 决策引擎配置</h2>
                    <p className="text-sm text-gray-500">配置通义千问 (Qwen) 或兼容 OpenAI 格式的大模型参数</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${tempConfig.isActive ? 'bg-indigo-600' : 'bg-gray-300'}`}
                           onClick={() => handleChange('isActive', !tempConfig.isActive)}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${tempConfig.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-sm font-bold text-gray-700">启用 AI 实时分析</span>
                    </div>
                    <span className="text-xs text-gray-400">关闭后将停止周期性健康评估</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                        <Key size={12} /> API Key
                      </label>
                      <input 
                        type="password"
                        value={tempConfig.apiKey}
                        onChange={(e) => handleChange('apiKey', e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        placeholder="sk-..."
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                        <Database size={12} /> 模型名称
                      </label>
                      <select 
                        value={tempConfig.modelName}
                        onChange={(e) => handleChange('modelName', e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all appearance-none"
                      >
                        <option value="qwen-turbo">qwen-turbo (标准速度)</option>
                        <option value="qwen-plus">qwen-plus (增强能力)</option>
                        <option value="qwen-max">qwen-max (最强性能)</option>
                        <option value="qwen-max-longcontext">qwen-max-longcontext (长上下文)</option>
                      </select>
                      <p className="text-[10px] text-gray-400">选择通义千问系列模型，不同模型计费标准不同</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'backend' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <Server size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">后端服务连接</h2>
                    <p className="text-sm text-gray-500">配置数据同步服务器地址与鉴权令牌</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                        <Database size={12} /> 模型名称
                      </label>
                      <select
                        value={tempConfig.modelName}
                        onChange={(e) => handleChange('modelName', e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all appearance-none cursor-pointer"
                      >
                        <option value="qwen-turbo">qwen-turbo (快速)</option>
                        <option value="qwen-plus">qwen-plus (增强)</option>
                        <option value="qwen-max">qwen-max (最强)</option>
                        <option value="qwen-max-longcontext">qwen-max-longcontext (长文本)</option>
                      </select>
                      <p className="text-[10px] text-gray-400">指向部署的 Node.js 后端服务地址</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                        <ShieldCheck size={12} /> API Access Token
                      </label>
                      <input 
                        type="password"
                        value={tempConfig.apiToken}
                        onChange={(e) => handleChange('apiToken', e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        placeholder="backend-secret-token"
                      />
                      <p className="text-[10px] text-gray-400">用于访问受保护的后端接口 (对应 .env 中的 API_TOKEN)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'system' && (
               <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-in fade-in slide-in-from-right-4 duration-500">
                 <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                   <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                     <Activity size={24} />
                   </div>
                   <div>
                     <h2 className="text-lg font-bold text-gray-800">系统状态概览</h2>
                     <p className="text-sm text-gray-500">当前运行环境与连接状态诊断</p>
                   </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                       <p className="text-xs font-bold text-gray-500 uppercase mb-2">连接状态</p>
                       <div className="flex items-center gap-2">
                          {connectionStatus === 'connected' ? (
                             <CheckCircle className="text-green-500" size={20} />
                          ) : connectionStatus === 'connecting' ? (
                             <Activity className="text-blue-500 animate-pulse" size={20} />
                          ) : (
                             <X className="text-red-500" size={20} />
                          )}
                          <span className={`font-bold ${
                             connectionStatus === 'connected' ? 'text-green-700' : 
                             connectionStatus === 'connecting' ? 'text-blue-700' : 'text-red-700'
                          }`}>
                             {connectionStatus === 'connected' ? '正常连接' : 
                              connectionStatus === 'connecting' ? '正在连接...' : '连接断开'}
                          </span>
                       </div>
                    </div>

                    <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                       <p className="text-xs font-bold text-gray-500 uppercase mb-2">上次数据同步</p>
                       <p className="font-mono text-gray-700 font-bold">
                          {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : '--'}
                       </p>
                    </div>

                    <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 md:col-span-2">
                       <p className="text-xs font-bold text-gray-500 uppercase mb-2">安全建议</p>
                       <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                          <p>生产环境建议定期更换 API Token 和 AI API Key，并确保后端服务仅允许受信 IP 访问。</p>
                       </div>
                    </div>
                 </div>
               </div>
            )}

            {/* Global Save Button */}
            <div className="fixed bottom-6 right-6 z-50">
               <button
                 onClick={handleSave}
                 disabled={isSaved}
                 className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold shadow-lg transition-all transform hover:scale-105 active:scale-95 ${
                   isSaved 
                   ? 'bg-green-500 text-white' 
                   : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-300'
                 }`}
               >
                 {isSaved ? <CheckCircle size={20} /> : <Save size={20} />}
                 {isSaved ? '已保存配置' : '保存所有更改'}
               </button>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};
