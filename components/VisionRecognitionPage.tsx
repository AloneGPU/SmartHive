import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, AlertCircle, RefreshCw, Video } from 'lucide-react';
import { CustomAIConfig } from '../types';
import { useIotRealtime } from '../hooks/useIotRealtime';

interface VisionRecognitionPageProps {
  config?: CustomAIConfig;
  isAdmin?: boolean;
}

const HornetAlert = () => (
  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-auto animate-pulse">
    <div className="px-4 py-2 bg-red-600/90 text-white font-bold rounded-full shadow-lg text-sm sm:text-base flex items-center gap-2">
      <AlertCircle className="w-5 h-5" />
      检测到马蜂！
    </div>
  </div>
);

/** 当前页为 HTTPS 且上游为 HTTP 时，浏览器会拦截子资源（Mixed Content）。通过后端 /api/vision/proxy 同域转发可解决（测试阶段常用）。 */
const shouldProxyHttpStream = (absoluteUrl: string): boolean => {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol !== 'https:') return false;
  try {
    const u = new URL(absoluteUrl);
    if (u.protocol !== 'http:') return false;
    if (u.pathname.includes('/vision/proxy')) return false;
    return true;
  } catch {
    return false;
  }
};

const toAbsoluteUrl = (rawUrl: string): string => {
  if (typeof window === 'undefined') return rawUrl;
  if (rawUrl.startsWith('/')) return new URL(rawUrl, window.location.origin).href;
  return rawUrl;
};

const buildVisionProxyUrl = (
  upstreamAbsolute: string,
  apiBase: string,
  token: string,
  streamMode: 'mjpeg' | 'video',
  reloadKey: number
): string => {
  const base = apiBase.startsWith('http')
    ? apiBase.replace(/\/$/, '')
    : `${window.location.origin}${apiBase.startsWith('/') ? '' : '/'}${apiBase.replace(/\/$/, '')}`;
  const params = new URLSearchParams();
  params.set('url', upstreamAbsolute);
  if (token) params.set('token', token);
  if (streamMode === 'mjpeg') params.set('t', String(reloadKey));
  return `${base}/vision/proxy?${params.toString()}`;
};

const setUrlQueryParam = (rawUrl: string, key: string, value: string, overwrite = false): string => {
  if (!rawUrl || !value) return rawUrl;
  try {
    if (rawUrl.startsWith('/')) {
      const parsed = new URL(rawUrl, window.location.origin);
      if (overwrite || !parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, value);
      }
      return `${parsed.pathname}${parsed.search}`;
    }
    const parsed = new URL(rawUrl);
    if (overwrite || !parsed.searchParams.has(key)) {
      parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    if (!overwrite && new RegExp(`(?:[?&])${key}=`).test(rawUrl)) return rawUrl;
    const separator = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
};

export const VisionRecognitionPage: React.FC<VisionRecognitionPageProps> = ({ config, isAdmin = false }) => {
  const streamMode = config?.videoStreamMode === 'mjpeg' ? 'mjpeg' : 'video';
  const videoStreamSource = config?.videoStreamSource === 'proxy' ? 'proxy' : 'direct';
  const directUrl = (config?.videoStreamUrl || '').trim();
  const visionDeviceId = (config?.visionDeviceId || 'pi5-vision-client').trim() || 'pi5-vision-client';
  const apiToken = (config as any)?.apiToken ? String((config as any).apiToken) : '';
  const apiBaseUrl = (() => {
    const raw = (config as any)?.apiBaseUrl ? String((config as any).apiBaseUrl) : '/api';
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  })();
  // 根据视频流模式选择使用直接地址还是中转地址
  const activeUrl = videoStreamSource === 'proxy' ? '/api/vision/stream.mjpg' : directUrl;
  const { sensorMap } = useIotRealtime(visionDeviceId, 30000, {
    baseUrl: apiBaseUrl || '/api',
    token: apiToken,
    enabled: Boolean(apiToken)
  });
  const isHornetDetected = (sensorMap.get('hornet_count')?.value ?? 0) > 0;
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<string>(() => localStorage.getItem('SMART_HIVE_STREAM_LAST_OK') || '');
  const [notice, setNotice] = useState<string | null>(null);
  const [loadStartTime, setLoadStartTime] = useState<number>(Date.now());
  const [firstFrameTime, setFirstFrameTime] = useState<number | null>(null);
  const [errorStats, setErrorStats] = useState<{ count: number; lastError: string | null }>({ count: 0, lastError: null });

  const heartbeatFailCountRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const reconnectingRef = useRef(false);
  const lastMediaHealthyAtRef = useRef(0);

  const refreshStream = () => {
    if (!activeUrl) return;
    setError(null);
    setNotice(null);
    setLoadStartTime(Date.now());
    setFirstFrameTime(null);
    setReloadKey((prev) => prev + 1);
  };

  const markStreamLoaded = () => {
    const now = Date.now();
    const iso = new Date().toISOString();
    localStorage.setItem('SMART_HIVE_STREAM_LAST_OK', iso);
    setLastSuccessAt(iso);
    lastMediaHealthyAtRef.current = now;
    if (loadStartTime > 0 && firstFrameTime === null) {
      setFirstFrameTime(now - loadStartTime);
    }
    setError(null);
    reconnectAttemptRef.current = 0;
  };

  const markStreamError = (e: any) => {
    // 提取可能的错误字符串或名称
    const mediaError = e?.target?.error;
    const errorMessage = mediaError?.message || e?.message || (typeof e === 'string' ? e : '视频流加载失败');
    
    // 提取原始错误对象或事件
    const originalError = e?.event || e?.originalError || e;
    const errorName = originalError?.name || originalError?.nativeEvent?.name || mediaError?.name || '';
    const errorMsgText = (typeof originalError === 'string' 
      ? originalError 
      : (originalError?.message || originalError?.nativeEvent?.message || errorMessage || '')
    ).toLowerCase();
    
    // 诊断是否为主动中止的操作
    const isAbort = 
      errorName === 'AbortError' || 
      errorMsgText.includes('abort') || 
      e === 'abort' ||
      (mediaError?.code === 4 && errorMsgText.includes('abort')); // 4 is MEDIA_ERR_SRC_NOT_SUPPORTED but can be abort

    if (isAbort) {
      console.debug('Stream operation aborted (ignored)');
      return;
    }

    // Mixed Content：HTTPS 页面无法直接嵌入 HTTP 资源（新标签页打开仍可能正常）
    let finalMessage = errorMessage;
    if (window.location.protocol === 'https:') {
      try {
        const abs = toAbsoluteUrl(activeUrl);
        const u = new URL(abs);
        if (u.protocol === 'http:' && !u.pathname.includes('/vision/proxy')) {
          finalMessage =
            '加载失败：HTTPS 页面无法直接加载 HTTP 视频流。请确认后端已启用 /api/vision/proxy，或使用 HTTPS 摄像头地址。';
        }
      } catch {
        /* keep */
      }
    }

    console.error('Stream Error:', { errorMessage, errorName, errorMsgText, isAbort, protocol: window.location.protocol });
    lastMediaHealthyAtRef.current = 0;
    setError(finalMessage);
    setErrorStats(prev => ({ count: prev.count + 1, lastError: finalMessage }));

    // 自动重连：仅管理员需要调试；普通用户手动点「重试」即可，避免误判导致画面反复断开
    if (isAdmin && reconnectAttemptRef.current < 5) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 3000);
      reconnectAttemptRef.current += 1;
      setTimeout(refreshStream, delay);
    }
  };

  const streamUrl = useMemo(() => {
    if (!activeUrl) return '';
    let nextUrl = activeUrl;
    
    // 如果是纯 IP 或域名开头（没有 http/https 也没有 /），自动补全 http://
    if (/^([0-9]{1,3}\.|[a-zA-Z0-9]+[a-zA-Z0-9.-]*\.[a-zA-Z]{2,})/.test(nextUrl) && !nextUrl.startsWith('http')) {
      nextUrl = `http://${nextUrl}`;
    }

    try {
      const apiBaseParsed = new URL(apiBaseUrl || '/api', window.location.origin);
      const parsed = activeUrl.startsWith('/')
        ? new URL(activeUrl, window.location.origin)
        : new URL(activeUrl);
      const sameOrigin = parsed.origin === window.location.origin;
      const sameApiHost = parsed.host === apiBaseParsed.host;
      const isApiPath = parsed.pathname.startsWith('/api/');
      const isVisionRelay = /^\/api\/vision\/stream\.mjpg$/i.test(parsed.pathname);
      if ((sameOrigin || sameApiHost) && isApiPath && apiToken) {
        nextUrl = setUrlQueryParam(nextUrl, 'token', apiToken);
      }
      if (isVisionRelay) {
        nextUrl = setUrlQueryParam(nextUrl, 'deviceId', visionDeviceId);
      }
    } catch {
      if (activeUrl.startsWith('/api/') && apiToken) {
        nextUrl = setUrlQueryParam(nextUrl, 'token', apiToken);
      }
      if (/^\/api\/vision\/stream\.mjpg(?:\?|$)/i.test(activeUrl)) {
        nextUrl = setUrlQueryParam(nextUrl, 'deviceId', visionDeviceId);
      }
    }

    const directForProxy = nextUrl;
    const absoluteDirect = typeof window !== 'undefined' ? toAbsoluteUrl(directForProxy) : directForProxy;
    const isHls = /\.m3u8(\?|$)/i.test(absoluteDirect);

    // HTTPS 页面 + HTTP 上游：走 /api/vision/proxy（url=摄像头原始地址，不把前端的 t 传给设备）
    if (typeof window !== 'undefined' && apiToken && shouldProxyHttpStream(absoluteDirect) && !isHls) {
      return buildVisionProxyUrl(absoluteDirect, apiBaseUrl, apiToken, streamMode, reloadKey);
    }

    if (streamMode === 'mjpeg') {
      nextUrl = setUrlQueryParam(nextUrl, 't', String(reloadKey), true);
    }
    return nextUrl;
  }, [activeUrl, apiBaseUrl, apiToken, reloadKey, streamMode, visionDeviceId]);

  useEffect(() => {
    heartbeatFailCountRef.current = 0;
    reconnectAttemptRef.current = 0;
    reconnectingRef.current = false;
    lastMediaHealthyAtRef.current = 0;
    setNotice(null);
  }, [activeUrl, streamMode]);

  useEffect(() => {
    // 测试阶段：探活仅给管理员用；普通用户避免误触发「自动重连」导致画面反复断开
    if (!isAdmin) return;
    if (!activeUrl) return;
    if (!apiToken) return;

    let disposed = false;
    const intervalMs = 15000;
    const healthyWindowMs = streamMode === 'mjpeg' ? 45000 : 30000;

    const probeOnce = async () => {
      if (disposed) return;
      if (reconnectingRef.current) return;
      if (Date.now() - lastMediaHealthyAtRef.current < healthyWindowMs) return;

      // 在测试阶段，如果是直接请求局域网 IP（比如 10.x.x.x 或 192.x.x.x），
      // 或者当前配置明确指示不需要后端中转探活，我们直接将状态标记为健康，跳过后端的 probe 接口。
      const isLocalIp = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.0\.0\.1|localhost)/.test(
        new URL(streamUrl, window.location.origin).hostname
      );

      if (isLocalIp) {
        heartbeatFailCountRef.current = 0;
        lastMediaHealthyAtRef.current = Date.now();
        return;
      }

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 4500);
      try {
        const response = await fetch(`${apiBaseUrl}/vision/probe`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ streamUrl, streamMode }),
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        const ok = response.ok && Boolean((payload as any)?.success);
        if (ok) {
          heartbeatFailCountRef.current = 0;
          lastMediaHealthyAtRef.current = Date.now();
          return;
        }
        heartbeatFailCountRef.current += 1;
      } catch {
        heartbeatFailCountRef.current += 1;
      } finally {
        clearTimeout(t);
      }

      if (heartbeatFailCountRef.current >= 3) {
        reconnectAttemptRef.current += 1;
        reconnectingRef.current = true;
        heartbeatFailCountRef.current = 0;
        refreshStream();
        setTimeout(() => {
          reconnectingRef.current = false;
          if (reconnectAttemptRef.current >= 2) {
            setNotice('自动重连失败，请检查视频流地址与网络后重试。');
          }
        }, 800);
      }
    };

    const timer = setInterval(() => {
      void probeOnce();
    }, intervalMs);
    void probeOnce();
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [activeUrl, apiBaseUrl, apiToken, streamMode, streamUrl, isAdmin]);

  // 普通用户：只保留视频框 + 胡蜂/马蜂入侵提示，弱化调试信息
  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
        {!activeUrl ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Video className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">视频流尚未配置</p>
          </div>
        ) : (
          <div className="relative bg-black rounded-xl overflow-hidden border border-gray-200">
            {streamMode === 'mjpeg' ? (
              <img
                key={`img-${reloadKey}`}
                src={streamUrl}
                alt="实时视频画面"
                className="w-full max-h-[75vh] object-contain mx-auto"
                onLoad={markStreamLoaded}
                onError={(e) => markStreamError(e)}
              />
            ) : (
              <video
                key={`video-${reloadKey}`}
                src={streamUrl}
                autoPlay
                muted
                controls
                playsInline
                className="w-full max-h-[75vh] object-contain mx-auto"
                onLoadedData={markStreamLoaded}
                onAbort={() => {
                  console.debug('Video operation aborted (expected on reload/unmount)');
                }}
                onError={(e) => markStreamError(e)}
              />
            )}
            {isHornetDetected && <HornetAlert />}
            {error ? (
              <div className="absolute top-3 left-3 right-3 rounded-lg bg-black/60 text-white text-xs sm:text-sm px-3 py-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span className="flex-1">{error}</span>
                <button type="button" onClick={refreshStream} className="px-2 py-1 rounded bg-white/15 hover:bg-white/25">
                  重试
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
            <Camera className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
            实时视频流
          </h2>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
              <Video className="w-3.5 h-3.5" />
              实时流
            </span>
            <button
              onClick={refreshStream}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm disabled:opacity-50"
              disabled={!activeUrl}
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">重连</span>
            </button>
          </div>
        </div>

        {notice ? (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start justify-between gap-3 text-amber-800 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>{notice}</span>
            </div>
            <button type="button" className="text-amber-600" onClick={() => setNotice(null)} aria-label="关闭提示">
              <span className="text-lg leading-none">×</span>
            </button>
          </div>
        ) : null}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {!activeUrl ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Video className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">管理员尚未配置视频流地址</p>
            <p className="text-xs mt-1">请联系管理员在“管理后台 {'>'} 视频配置”中设置</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative bg-black rounded-xl overflow-hidden border border-gray-200">
              {streamMode === 'mjpeg' ? (
                <img
                  key={`img-${reloadKey}`}
                  src={streamUrl}
                  alt="实时视频画面"
                  className="w-full max-h-[70vh] object-contain mx-auto"
                  onLoad={markStreamLoaded}
                  onError={(e) => markStreamError(e)}
                />
              ) : (
                <video
                  key={`video-${reloadKey}`}
                  src={streamUrl}
                  autoPlay
                  muted
                  controls
                  playsInline
                  className="w-full max-h-[70vh] object-contain mx-auto"
                  onLoadedData={markStreamLoaded}
                  onAbort={() => {
                    console.debug('Video operation aborted (expected on reload/unmount)');
                  }}
                  onError={(e) => markStreamError(e)}
                />
              )}
              {isHornetDetected && <HornetAlert />}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 text-xs sm:text-sm">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-gray-500">视频来源</div>
                <div className="mt-1 font-medium text-gray-900 break-all">{activeUrl}</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-gray-500">播放模式</div>
                <div className="mt-1 font-medium text-gray-900">{streamMode === 'mjpeg' ? 'MJPEG 实时图像流' : '视频流（HLS/MP4）'}</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-gray-500">识别设备 ID</div>
                <div className="mt-1 font-medium text-gray-900 break-all">{visionDeviceId}</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-gray-500">最近一次成功播放时间</div>
                <div className="mt-1 font-medium text-gray-900">
                  {lastSuccessAt ? new Date(lastSuccessAt).toLocaleString('zh-CN') : '暂无'}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-gray-500">性能指标 (最近加载)</div>
                <div className="mt-1 font-medium text-gray-900">
                  {firstFrameTime !== null ? `首帧: ${firstFrameTime}ms` : '正在加载...'}
                  <span className={`ml-2 text-xs ${errorStats.count > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    异常: {errorStats.count} 次
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
