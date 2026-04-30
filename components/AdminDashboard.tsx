import React, { useMemo, useState } from 'react';
import { Globe, Save, TestTube, AlertTriangle, CheckCircle, Video, Shield, Database, Trash2, ClipboardCheck } from 'lucide-react';
import { CustomAIConfig } from '../types';
import {
  createStaleDataReport,
  executeStaleDataCleanup,
  fetchStaleCleanupOperation,
  getFriendlyErrorMessage,
  StaleDataReportResponse
} from '../services/dataService';

interface AdminDashboardProps {
  config: CustomAIConfig;
  adminSessionToken?: string;
  onUpdateConfig: (config: CustomAIConfig) => void;
  onLogout: () => void;
}

type QwenModelCategory = '通用模型' | '代码与数学';

interface QwenModelOption {
  value: string;
  label: string;
  category: QwenModelCategory;
  strengths: string;
  note?: string;
  deprecated?: boolean;
}

const QWEN_MODEL_OPTIONS: QwenModelOption[] = [
  {
    value: 'qwen3-max',
    label: 'Qwen3-Max',
    category: '通用模型',
    strengths: '复杂任务能力最强，支持思考模式与内置工具调用',
    note: '旗舰模型，适合高难度分析与决策场景。'
  },
  {
    value: 'qwen3.5-plus',
    label: 'Qwen3.5-Plus',
    category: '通用模型',
    strengths: '效果、速度、成本均衡',
    note: '支持文本/图像/视频输入，纯文本效果可媲美 Qwen3-Max。'
  },
  {
    value: 'qwen-plus',
    label: 'Qwen-Plus（兼容别名）',
    category: '通用模型',
    strengths: '均衡型，适合日常生产环境',
    note: '当前与 qwen-plus 新快照能力对齐，便于旧配置迁移。'
  },
  {
    value: 'qwen3.5-flash',
    label: 'Qwen3.5-Flash',
    category: '通用模型',
    strengths: '简单任务速度快、成本低',
    note: '适合高并发、低成本场景。'
  },
  {
    value: 'qwen-flash',
    label: 'Qwen-Flash（兼容别名）',
    category: '通用模型',
    strengths: '轻量快速，适合常规问答',
    note: 'Qwen3 系列稳定别名。'
  },
  {
    value: 'qwen-long',
    label: 'Qwen-Long',
    category: '通用模型',
    strengths: '超长上下文处理',
    note: '适合长文本分析、信息抽取、总结摘要与分类打标。'
  },
  {
    value: 'qwen-turbo',
    label: 'Qwen-Turbo（旧版）',
    category: '通用模型',
    strengths: '历史兼容型号',
    note: '官方建议迁移到 Qwen-Flash。',
    deprecated: true
  },
  {
    value: 'qwen3-coder-plus',
    label: 'Qwen3-Coder-Plus',
    category: '代码与数学',
    strengths: 'Coding Agent 能力强，擅长工具调用与环境交互',
    note: '适合代码生成、重构、调试与自动化开发流程。'
  },
  {
    value: 'qwen3-coder-flash',
    label: 'Qwen3-Coder-Flash',
    category: '代码与数学',
    strengths: '轻量代码模型，响应快',
    note: '适合低成本代码补全与常规编程问答。'
  },
  {
    value: 'qwen-math-plus',
    label: 'Qwen-Math-Plus',
    category: '代码与数学',
    strengths: '数学推理与解题能力强',
    note: '适合复杂公式、步骤化推导与数学分析。'
  }
];

const QWEN_MODEL_CATEGORIES: QwenModelCategory[] = ['通用模型', '代码与数学'];
const FALLBACK_CONFIG: CustomAIConfig = {
  apiKey: '',
  modelName: 'qwen-flash',
  apiBaseUrl: '/api',
  apiToken: '',
  gaodeApiKey: '',
  videoStreamUrl: '/api/vision/stream.mjpg',
  videoStreamMode: 'mjpeg',
  visionDeviceId: 'pi5-vision-client',
  isActive: true
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ config, adminSessionToken, onUpdateConfig, onLogout }) => {
  const [tempConfig, setTempConfig] = useState<CustomAIConfig>(config ?? FALLBACK_CONFIG);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResults, setSaveResults] = useState<Array<{ id: '基础' | '服务' | '视频'; ok: boolean; message?: string }> | null>(null);
  const [streamProbeResult, setStreamProbeResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    contentType?: string;
    checkedAt?: number;
  } | null>(null);
  const [staleReport, setStaleReport] = useState<StaleDataReportResponse | null>(null);
  const [staleLoading, setStaleLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [operationLookupId, setOperationLookupId] = useState('');
  const [operationLookupResult, setOperationLookupResult] = useState<any>(null);

  const normalizeBaseUrl = (rawBaseUrl: string) => {
    return rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
  };

  const normalizeConfig = (c: CustomAIConfig): CustomAIConfig => {
    return {
      ...c,
      apiBaseUrl: normalizeBaseUrl(c.apiBaseUrl || '/api'),
      apiToken: c.apiToken || '',
      apiKey: c.apiKey || '',
      modelName: c.modelName || 'qwen-flash',
      gaodeApiKey: (c.gaodeApiKey || '').trim(),
      videoStreamUrl: c.videoStreamUrl || '/api/vision/stream.mjpg',
      videoStreamMode: c.videoStreamMode === 'video' ? 'video' : 'mjpeg',
      videoStreamSource: c.videoStreamSource === 'proxy' ? 'proxy' : 'direct',
      visionDeviceId: (c.visionDeviceId || 'pi5-vision-client').trim() || 'pi5-vision-client',
      isActive: Boolean(c.isActive)
    };
  };

  const selectedModel = useMemo(() => {
    const modelName = (tempConfig.modelName || 'qwen-flash').trim() || 'qwen-flash';
    const found = QWEN_MODEL_OPTIONS.find((m) => m.value === modelName);
    if (found) return found;
    return {
      value: modelName,
      label: `${modelName}（自定义）`,
      category: '通用模型' as QwenModelCategory,
      strengths: '当前模型不在预设列表中，系统将按该模型名直接调用。',
      note: '如果调用失败，请在此下拉中选择官方可用模型。'
    };
  }, [tempConfig.modelName]);

  const getStatusMessage = (status: number, statusText: string) => {
    if (status === 200) return '连接测试成功！';
    if (status === 403) return '访问被拒绝，请检查角色权限或接口访问策略';
    if (status >= 500) return '服务器内部错误，请检查后端服务日志';
    return `连接失败: ${status} ${statusText}`;
  };

  const postConfigPart = async (baseUrl: string, token: string, body: Record<string, unknown>) => {
    const response = await fetch(`${baseUrl}/config`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(adminSessionToken ? { 'X-Admin-Session': adminSessionToken } : {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `HTTP ${response.status} ${response.statusText}`);
    }
  };

  // 确保 config 存在
  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-2">配置加载失败</h3>
        <p className="text-gray-500 text-center max-w-sm">
          无法加载系统配置，请重试或联系技术支持。
        </p>
        <button
          onClick={onLogout}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          返回登录
        </button>
      </div>
    );
  }

  const testConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const baseUrl = normalizeBaseUrl(tempConfig.apiBaseUrl);

      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tempConfig.apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setTestResult({ success: true, message: '连接测试成功！' });
      } else {
        setTestResult({ success: false, message: getStatusMessage(response.status, response.statusText) });
      }
    } catch (error) {
      setTestResult({ success: false, message: `连接错误: ${error}` });
    } finally {
      setIsTesting(false);
    }
  };

  const probeVideoStream = async () => {
    if (!tempConfig.videoStreamUrl?.trim()) {
      setStreamProbeResult({ success: false, message: '请先填写实时视频流地址' });
      return;
    }
    setIsProbing(true);
    setStreamProbeResult(null);
    try {
      const baseUrl = normalizeBaseUrl(tempConfig.apiBaseUrl);
      const normalizedDeviceId = (tempConfig.visionDeviceId || 'pi5-vision-client').trim() || 'pi5-vision-client';
      const streamUrlForProbe = (() => {
        const raw = (tempConfig.videoStreamUrl || '').trim();
        if (!/\/api\/vision\/stream\.mjpg(?:\?|$)/i.test(raw)) return raw;
        try {
          const parsed = raw.startsWith('/') ? new URL(raw, window.location.origin) : new URL(raw);
          if (!parsed.searchParams.get('deviceId')) {
            parsed.searchParams.set('deviceId', normalizedDeviceId);
          }
          return raw.startsWith('/') ? `${parsed.pathname}${parsed.search}` : parsed.toString();
        } catch {
          return raw;
        }
      })();

      // 后端从服务器侧真实请求视频源，用于判断「本服务器能否访问该地址」（与浏览器是否同网无关）。
      const response = await fetch(`${baseUrl}/vision/probe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tempConfig.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          streamUrl: streamUrlForProbe,
          streamMode: tempConfig.videoStreamMode === 'mjpeg' ? 'mjpeg' : 'video'
        })
      });
      const data = await response.json();
      const hint = typeof (data as any)?.hint === 'string' && (data as any).hint ? ` ${(data as any).hint}` : '';

      const result = {
        success: Boolean(data?.success),
        message: `${data?.message || (response.ok ? '探测完成' : '探测失败')}${hint}`.trim(),
        latencyMs: Number(data?.latencyMs) || undefined,
        contentType: data?.contentType || '',
        checkedAt: Number(data?.checkedAt) || Date.now()
      };
      setStreamProbeResult(result);
      if (result.success) {
        const iso = new Date(result.checkedAt || Date.now()).toISOString();
        localStorage.setItem('SMART_HIVE_STREAM_LAST_OK', iso);
      }
    } catch (error) {
      setStreamProbeResult({ success: false, message: `网络异常: ${error}` });
    } finally {
      setIsProbing(false);
    }
  };

  const generateStaleDataReport = async () => {
    setStaleLoading(true);
    setOperationLookupResult(null);
    try {
      const cfg = normalizeConfig(tempConfig);
      const report = await createStaleDataReport(cfg.apiBaseUrl, cfg.apiToken, {
        createdBy: 'admin',
        rules: [
          { tableName: 'hive_data', retentionDays: 180, maxDeleteRows: 20000 },
          { tableName: 'iot_telemetry', retentionDays: 90, maxDeleteRows: 50000 },
          { tableName: 'vision_recognition', retentionDays: 60, maxDeleteRows: 10000 }
        ]
      });
      setStaleReport(report);
      setOperationLookupId(report.operationId);
      setTestResult({ success: true, message: '过时数据报告已生成，请确认后执行清理。' });
    } catch (error) {
      setTestResult({ success: false, message: getFriendlyErrorMessage(error, '生成过时数据报告失败') });
    } finally {
      setStaleLoading(false);
    }
  };

  const runStaleDataCleanup = async () => {
    if (!staleReport) {
      setTestResult({ success: false, message: '请先生成报告，再执行清理。' });
      return;
    }
    setCleanupLoading(true);
    try {
      const cfg = normalizeConfig(tempConfig);
      const result = await executeStaleDataCleanup(cfg.apiBaseUrl, cfg.apiToken, {
        operationId: staleReport.operationId,
        reportHash: staleReport.report.reportHash,
        confirmationToken: staleReport.confirmationToken,
        confirmText,
        operator: 'admin'
      });
      setTestResult({
        success: true,
        message: `清理完成，备份路径：${result.backupPath}`
      });
      const latest = await fetchStaleCleanupOperation(cfg.apiBaseUrl, cfg.apiToken, staleReport.operationId);
      setOperationLookupResult(latest);
    } catch (error) {
      setTestResult({ success: false, message: getFriendlyErrorMessage(error, '执行清理失败') });
    } finally {
      setCleanupLoading(false);
    }
  };

  const lookupCleanupOperation = async () => {
    if (!operationLookupId.trim()) return;
    setStaleLoading(true);
    try {
      const cfg = normalizeConfig(tempConfig);
      const op = await fetchStaleCleanupOperation(cfg.apiBaseUrl, cfg.apiToken, operationLookupId.trim());
      setOperationLookupResult(op);
    } catch (error) {
      setTestResult({ success: false, message: getFriendlyErrorMessage(error, '查询任务状态失败') });
    } finally {
      setStaleLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-24">
      {/* 步骤指示器 */}
      <div className="flex items-center justify-between px-2 mb-8">
        {[1, 2, 3].map((step) => (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                currentStep === step ? 'bg-indigo-600 text-white shadow-lg scale-110' : 
                currentStep > step ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {currentStep > step ? <CheckCircle className="w-6 h-6" /> : step}
              </div>
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                currentStep === step ? 'text-indigo-600' : 'text-gray-400'
              }`}>
                {step === 1 ? '基础' : step === 2 ? '服务' : '视频'}
              </span>
            </div>
            {step < 3 && <div className={`flex-1 h-0.5 mx-4 ${currentStep > step ? 'bg-green-500' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* 步骤 1: 基础 API 配置 */}
      {currentStep === 1 && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-indigo-50 rounded-2xl">
              <Globe className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">基础配置</h2>
              <p className="text-sm text-gray-500">连接蜂箱服务器的核心参数</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 ml-1">API基础URL</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                  <Globe className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={tempConfig.apiBaseUrl}
                  onChange={(e) => setTempConfig(prev => ({ ...prev, apiBaseUrl: e.target.value }))}
                  placeholder="http://localhost:3001 或 /api"
                  className="block w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all text-base"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 ml-1">API Token</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                  <Shield className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={tempConfig.apiToken}
                  onChange={(e) => setTempConfig(prev => ({ ...prev, apiToken: e.target.value }))}
                  placeholder="输入API访问令牌"
                  className="block w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all text-base"
                />
              </div>
            </div>
            <button
              onClick={testConnection}
              disabled={isTesting}
              className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-bold hover:bg-indigo-100 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <TestTube className={`w-5 h-5 ${isTesting ? 'animate-spin' : ''}`} />
              {isTesting ? '正在测试连接...' : '测试连接'}
            </button>
          </div>
        </div>
      )}

      {/* 步骤 2: 服务配置 */}
      {currentStep === 2 && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-green-50 rounded-2xl">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">服务配置</h2>
              <p className="text-sm text-gray-500">AI 与地图等服务参数</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 ml-1">通义千问 API Key（可选）</label>
              <input
                type="password"
                value={tempConfig.apiKey || ''}
                onChange={(e) => setTempConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="可选：输入通义千问 API Key"
                className="block w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-green-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 ml-1">高德地图 API Key（可选）</label>
              <input
                type="password"
                value={tempConfig.gaodeApiKey || ''}
                onChange={(e) => setTempConfig(prev => ({ ...prev, gaodeApiKey: e.target.value }))}
                placeholder="可选：输入高德地图 API Key"
                className="block w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-green-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 ml-1">模型名称</label>
              <select
                value={tempConfig.modelName || 'qwen-flash'}
                onChange={(e) => setTempConfig(prev => ({ ...prev, modelName: e.target.value }))}
                className="block w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-green-500 transition-all appearance-none"
              >
                {selectedModel.value && !QWEN_MODEL_OPTIONS.some((m) => m.value === selectedModel.value) ? (
                  <option value={selectedModel.value}>{selectedModel.label}</option>
                ) : null}
                {QWEN_MODEL_CATEGORIES.map((category) => (
                  <optgroup key={`model-group-${category}`} label={category}>
                    {QWEN_MODEL_OPTIONS.filter((m) => m.category === category).map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}{model.deprecated ? '（旧版）' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-2">
                <div className="text-xs font-bold text-green-800">当前模型强项：{selectedModel.label}</div>
                <div className="text-xs text-green-700 mt-1 leading-relaxed">{selectedModel.strengths}</div>
                {selectedModel.note ? (
                  <div className="text-[11px] text-green-700/90 mt-1">{selectedModel.note}</div>
                ) : null}
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 space-y-2">
                <div className="text-xs font-bold text-gray-800">可调用模型与强项（官方汇总）</div>
                {QWEN_MODEL_CATEGORIES.map((category) => (
                  <div key={`model-tip-${category}`}>
                    <div className="text-[11px] font-bold text-gray-700">{category}</div>
                    <div className="mt-1 space-y-1">
                      {QWEN_MODEL_OPTIONS.filter((m) => m.category === category).map((model) => (
                        <div key={`model-tip-item-${model.value}`} className="text-[11px] text-gray-600 leading-relaxed">
                          <span className="font-semibold text-gray-800">{model.label}</span>
                          {model.deprecated ? <span className="text-amber-700 ml-1">[旧版]</span> : null}
                          ：{model.strengths}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl">
              <div>
                <div className="font-bold text-gray-900">启用 AI 助手</div>
                <div className="text-xs text-gray-500 mt-0.5">使用模型分析蜂群</div>
              </div>
              <button
                onClick={() => setTempConfig(prev => ({ ...prev, isActive: !prev.isActive }))}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  tempConfig.isActive ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  tempConfig.isActive ? 'translate-x-7' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 步骤 3: 视频与保存 */}
      {currentStep === 3 && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-purple-50 rounded-2xl">
              <Video className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">视频配置</h2>
              <p className="text-sm text-gray-500">配置蜂箱实时画面地址并保存</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 ml-1">视频流地址</label>
              <input
                type="text"
                value={tempConfig.videoStreamUrl || ''}
                onChange={(e) => setTempConfig(prev => ({ ...prev, videoStreamUrl: e.target.value }))}
                placeholder="例如 /api/vision/stream.mjpg（后端中转）"
                className="block w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 ml-1">视觉设备 ID</label>
              <input
                type="text"
                value={tempConfig.visionDeviceId || 'pi5-vision-client'}
                onChange={(e) => setTempConfig(prev => ({ ...prev, visionDeviceId: e.target.value }))}
                placeholder="例如 pi5-vision-client"
                className="block w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-500 transition-all"
              />
              <p className="text-xs text-gray-500">
                需与树莓派端 MQTT `client_id` 一致，用于前端读取 `hornet_count` 告警。
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 ml-1">传输模式</label>
              <select
                value={tempConfig.videoStreamMode || 'video'}
                onChange={(e) => setTempConfig(prev => ({ ...prev, videoStreamMode: e.target.value as 'video' | 'mjpeg' }))}
                className="block w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-500 transition-all appearance-none"
              >
                <option value="video">标准视频流 (HLS/MP4)</option>
                <option value="mjpeg">MJPEG (树莓派常用)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 ml-1">视频流模式</label>
              <select
                value={tempConfig.videoStreamSource || 'direct'}
                onChange={(e) => setTempConfig(prev => ({ ...prev, videoStreamSource: e.target.value as 'direct' | 'proxy' }))}
                className="block w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-purple-500 transition-all appearance-none"
              >
                <option value="direct">直接模式 (同一网络)</option>
                <option value="proxy">中转模式 (跨网络)</option>
              </select>
              <p className="text-xs text-gray-500">
                直接模式：前端直接访问设备视频流，需在同一网络环境。
                中转模式：通过后端服务器中转视频流，支持跨网络访问。
              </p>
            </div>
            <button
              onClick={probeVideoStream}
              disabled={isProbing}
              className="w-full py-4 bg-purple-50 text-purple-700 rounded-2xl font-bold hover:bg-purple-100 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Video className={`w-5 h-5 ${isProbing ? 'animate-pulse' : ''}`} />
              {isProbing ? '正在探测视频流...' : '立即探测'}
            </button>

            {saveResults ? (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-sm font-black text-gray-900">保存结果</div>
                <div className="mt-3 space-y-2 text-sm">
                  {saveResults.map((r) => (
                    <div key={r.id} className="flex items-start justify-between gap-3">
                      <div className="font-bold text-gray-800">{r.id}</div>
                      <div className={`text-right ${r.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                        {r.ok ? '成功' : (r.message || '失败')}
                      </div>
                    </div>
                  ))}
                </div>
                {saveResults.some((r) => !r.ok) ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const cfg = normalizeConfig(tempConfig);
                      const baseUrl = cfg.apiBaseUrl;
                      const token = cfg.apiToken;
                      const pending = saveResults.filter((r) => !r.ok).map((r) => r.id);
                      setIsSaving(true);
                      try {
                        const next: typeof saveResults = [];
                        for (const id of ['基础', '服务', '视频'] as const) {
                          const prev = saveResults.find((r) => r.id === id);
                          if (!prev) continue;
                          if (!pending.includes(id)) {
                            next.push(prev);
                            continue;
                          }
                          try {
                            if (id === '基础') {
                              const res = await fetch(`${baseUrl}/health`, {
                                method: 'GET',
                                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                              });
                              if (!res.ok) throw new Error(getStatusMessage(res.status, res.statusText));
                              await postConfigPart(baseUrl, token, { apiToken: token });
                            }
                            if (id === '服务') {
                              await postConfigPart(baseUrl, token, { gaodeApiKey: cfg.gaodeApiKey, qwenApiKey: cfg.apiKey });
                            }
                            if (id === '视频') {
                              await postConfigPart(baseUrl, token, {
                                videoStreamUrl: cfg.videoStreamUrl,
                                videoStreamMode: cfg.videoStreamMode,
                                visionDeviceId: cfg.visionDeviceId
                              });
                            }
                            next.push({ id, ok: true });
                          } catch (e) {
                            console.error(`Config part retry failed: ${id}`, e);
                            next.push({ id, ok: false, message: e instanceof Error ? e.message : String(e) });
                          }
                        }
                        setSaveResults(next);
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    disabled={isSaving}
                    className="mt-4 w-full py-3 rounded-2xl bg-white border border-gray-200 text-gray-800 font-bold active:scale-95 disabled:opacity-60"
                  >
                    {isSaving ? '正在重试...' : '重试失败项'}
                  </button>
                ) : null}
              </div>
            ) : null}

            <button
              onClick={async () => {
                const cfg = normalizeConfig(tempConfig);
                const baseUrl = cfg.apiBaseUrl;
                const token = cfg.apiToken;
                setIsSaving(true);
                setSaveResults(null);
                setTestResult(null);
                const results: Array<{ id: '基础' | '服务' | '视频'; ok: boolean; message?: string }> = [];
                try {
                  try {
                    // 使用当前有效的token进行验证，而不是新的token
                    const currentToken = config.apiToken || token;
                    const res = await fetch(`${baseUrl}/health`, {
                      method: 'GET',
                      headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' }
                    });
                    if (!res.ok) throw new Error(getStatusMessage(res.status, res.statusText));
                    // 保存API Token时也使用当前有效的token
                    await postConfigPart(baseUrl, currentToken, { apiToken: token });
                    results.push({ id: '基础', ok: true });
                  } catch (e) {
                    console.error('Config part failed: 基础', e);
                    results.push({ id: '基础', ok: false, message: e instanceof Error ? e.message : String(e) });
                  }

                  try {
                    // 使用当前有效的token进行验证
                    const currentToken = config.apiToken || token;
                    await postConfigPart(baseUrl, currentToken, { gaodeApiKey: cfg.gaodeApiKey, qwenApiKey: cfg.apiKey });
                    results.push({ id: '服务', ok: true });
                  } catch (e) {
                    console.error('Config part failed: 服务', e);
                    results.push({ id: '服务', ok: false, message: e instanceof Error ? e.message : String(e) });
                  }

                  try {
                    // 使用当前有效的token进行验证
                    const currentToken = config.apiToken || token;
                    await postConfigPart(baseUrl, currentToken, {
                      videoStreamUrl: cfg.videoStreamUrl,
                      videoStreamMode: cfg.videoStreamMode,
                      videoStreamSource: cfg.videoStreamSource,
                      visionDeviceId: cfg.visionDeviceId
                    });
                    results.push({ id: '视频', ok: true });
                  } catch (e) {
                    console.error('Config part failed: 视频', e);
                    results.push({ id: '视频', ok: false, message: e instanceof Error ? e.message : String(e) });
                  }

                  onUpdateConfig(cfg);
                  setSaveResults(results);
                  if (results.some((r) => !r.ok)) {
                    setTestResult({ success: false, message: '部分配置保存失败，但成功项已应用。请在本页点击“重试失败项”。' });
                  } else {
                    setTestResult({ success: true, message: '配置保存成功！' });
                  }
                } finally {
                  setIsSaving(false);
                }
              }}
              disabled={isSaving}
              className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-60"
            >
              <Save className={`w-6 h-6 ${isSaving ? 'animate-spin' : ''}`} />
              {isSaving ? '正在保存...' : '保存并应用'}
            </button>

            <div className="pt-4 border-t border-gray-100 space-y-4">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-gray-900">过时数据清理</h3>
              </div>
              <button
                onClick={generateStaleDataReport}
                disabled={staleLoading}
                className="w-full py-3 bg-amber-50 text-amber-700 rounded-2xl font-bold hover:bg-amber-100 transition-all active:scale-95"
              >
                {staleLoading ? '正在生成报告...' : '生成过时数据分析报告'}
              </button>
              {staleReport ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-gray-700 space-y-2">
                  <div><span className="font-bold">任务ID：</span>{staleReport.operationId}</div>
                  <div><span className="font-bold">确认令牌：</span>{staleReport.confirmationToken}</div>
                  <div><span className="font-bold">待清理总量：</span>{staleReport.report.summary.totalPlannedDeleteRows} 行</div>
                  <div><span className="font-bold">估算备份：</span>{(staleReport.report.summary.estimatedBackupBytes / (1024 * 1024)).toFixed(2)} MB</div>
                  <div><span className="font-bold">AI建议：</span>{staleReport.report.aiInsights.recommendation}</div>
                  <div className="pt-2">
                    <div className="text-xs font-bold text-gray-700 mb-2">分表明细</div>
                    <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white">
                      <table className="w-full text-xs">
                        <thead className="bg-amber-100/60 text-gray-700">
                          <tr>
                            <th className="px-2 py-2 text-left whitespace-nowrap">表名</th>
                            <th className="px-2 py-2 text-right whitespace-nowrap">保留天数</th>
                            <th className="px-2 py-2 text-right whitespace-nowrap">候选量</th>
                            <th className="px-2 py-2 text-right whitespace-nowrap">计划清理</th>
                            <th className="px-2 py-2 text-right whitespace-nowrap">估算体积(MB)</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">风险</th>
                          </tr>
                        </thead>
                        <tbody>
                          {staleReport.report.tableSummaries.map((item) => (
                            <tr key={item.tableName} className="border-t border-amber-100">
                              <td className="px-2 py-2 font-semibold text-gray-800">{item.tableName}</td>
                              <td className="px-2 py-2 text-right">{item.retentionDays}</td>
                              <td className="px-2 py-2 text-right">{item.candidateRows}</td>
                              <td className="px-2 py-2 text-right font-bold">{item.plannedDeleteRows}</td>
                              <td className="px-2 py-2 text-right">{(item.estimatedBytes / (1024 * 1024)).toFixed(2)}</td>
                              <td className="px-2 py-2 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-full ${
                                  item.riskLevel === 'high'
                                    ? 'bg-red-100 text-red-700'
                                    : item.riskLevel === 'medium'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {item.riskLevel}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-bold text-gray-700">输入确认口令后执行（必须为 CONFIRM_CLEANUP）</label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="CONFIRM_CLEANUP"
                      className="block w-full px-3 py-2 bg-white border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <button
                    onClick={runStaleDataCleanup}
                    disabled={cleanupLoading}
                    className="w-full mt-2 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Trash2 className={`w-5 h-5 ${cleanupLoading ? 'animate-pulse' : ''}`} />
                    {cleanupLoading ? '正在执行清理...' : '确认并执行清理'}
                  </button>
                </div>
              ) : null}

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2">
                <label className="text-xs font-bold text-gray-700">按任务ID查询清理审计状态</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={operationLookupId}
                    onChange={(e) => setOperationLookupId(e.target.value)}
                    placeholder="stale_cleanup_xxx"
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={lookupCleanupOperation}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                  </button>
                </div>
                {operationLookupResult ? (
                  <div className="text-xs text-gray-700 leading-relaxed">
                    状态：<span className="font-bold">{operationLookupResult.status}</span>
                    {operationLookupResult.backupPath ? `，备份：${operationLookupResult.backupPath}` : ''}
                    {operationLookupResult.errorMessage ? `，错误：${operationLookupResult.errorMessage}` : ''}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部固定导航按钮 */}
      <div className="fixed bottom-24 left-4 right-4 flex items-center gap-4 z-40">
        {currentStep > 1 && (
          <button
            onClick={() => setCurrentStep(prev => prev - 1)}
            className="flex-1 py-4 bg-white border-2 border-gray-100 text-gray-600 rounded-2xl font-bold shadow-xl active:scale-95 transition-all"
          >
            上一步
          </button>
        )}
        {currentStep < 3 && (
          <button
            onClick={() => setCurrentStep(prev => prev + 1)}
            className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl active:scale-95 transition-all"
          >
            下一步
          </button>
        )}
      </div>

      {/* 退出按钮 */}
      <div className="text-center mt-8">
        <button onClick={onLogout} className="text-sm font-bold text-gray-400 hover:text-red-500 transition-colors">
          退出管理员模式
        </button>
      </div>

      {/* 浮动提示 */}
      {(testResult || streamProbeResult) && (
        <div className="fixed top-20 left-4 right-4 animate-in fade-in slide-in-from-top-4 z-50">
          <div className={`p-4 rounded-2xl shadow-2xl border flex items-start gap-3 ${
            (testResult?.success || streamProbeResult?.success) ? 'bg-white border-green-100' : 'bg-white border-red-100'
          }`}>
            <div className={`p-2 rounded-xl ${
              (testResult?.success || streamProbeResult?.success) ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
            }`}>
              {(testResult?.success || streamProbeResult?.success) ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              <div className="text-sm font-black text-gray-900">系统消息</div>
              <div className="text-xs text-gray-500 mt-1 leading-relaxed">{testResult?.message || streamProbeResult?.message}</div>
            </div>
            <button onClick={() => { setTestResult(null); setStreamProbeResult(null); }} className="text-gray-300">
              <Save className="w-4 h-4 rotate-45" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
