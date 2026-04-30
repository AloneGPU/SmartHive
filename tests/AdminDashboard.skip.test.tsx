import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdminDashboard } from '../components/AdminDashboard';

const baseConfig = {
  apiKey: 'test-qwen',
  modelName: 'qwen-turbo',
  apiBaseUrl: 'http://localhost:3001',
  apiToken: 'token-1',
  gaodeApiKey: 'gaode-1',
  videoStreamUrl: '/api/live.m3u8',
  videoStreamMode: 'video',
  isActive: true
} as any;

type Scenario = { basicFail?: boolean; serviceFail?: boolean; videoFail?: boolean };

const mockFetch = (scenario: Scenario) => {
  const fetchMock = vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (u.endsWith('/health')) {
      if (scenario.basicFail) {
        return {
          ok: false,
          status: 500,
          statusText: 'ERR',
          json: async () => ({}),
          text: async () => 'health fail'
        } as any;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
        text: async () => ''
      } as any;
    }
    if (u.endsWith('/config')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const isService = Object.prototype.hasOwnProperty.call(body, 'gaodeApiKey') || Object.prototype.hasOwnProperty.call(body, 'qwenApiKey');
      const isVideo = Object.prototype.hasOwnProperty.call(body, 'videoStreamUrl') || Object.prototype.hasOwnProperty.call(body, 'videoStreamMode');
      if (isService && scenario.serviceFail) {
        return { ok: false, status: 500, statusText: 'ERR', json: async () => ({}), text: async () => 'service fail' } as any;
      }
      if (isVideo && scenario.videoFail) {
        return { ok: false, status: 500, statusText: 'ERR', json: async () => ({}), text: async () => 'video fail' } as any;
      }
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({}), text: async () => '' } as any;
    }
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({}), text: async () => '' } as any;
  });
  vi.stubGlobal('fetch', fetchMock as any);
  return fetchMock;
};

describe('AdminDashboard 配置失败跳过', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('基础失败时，仍可保存服务/视频并进入末页', async () => {
    const fetchMock = mockFetch({ basicFail: true });
    const onUpdateConfig = vi.fn();
    const onLogout = vi.fn();
    const user = (await import('@testing-library/user-event')).default.setup();

    render(<AdminDashboard config={baseConfig} onUpdateConfig={onUpdateConfig} onLogout={onLogout} />);
    await user.click(screen.getByRole('button', { name: /下一步/i }));
    await user.click(screen.getByRole('button', { name: /下一步/i }));
    await user.click(screen.getByRole('button', { name: /保存并应用/i }));

    expect(await screen.findByText(/保存结果/i)).toBeInTheDocument();
    expect(onUpdateConfig).toHaveBeenCalledTimes(1);
    const configCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/config'));
    expect(configCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('服务失败时，后续视频仍可保存', async () => {
    const fetchMock = mockFetch({ serviceFail: true });
    const onUpdateConfig = vi.fn();
    const onLogout = vi.fn();
    const user = (await import('@testing-library/user-event')).default.setup();

    render(<AdminDashboard config={baseConfig} onUpdateConfig={onUpdateConfig} onLogout={onLogout} />);
    await user.click(screen.getByRole('button', { name: /下一步/i }));
    await user.click(screen.getByRole('button', { name: /下一步/i }));
    await user.click(screen.getByRole('button', { name: /保存并应用/i }));

    expect(await screen.findByText(/保存结果/i)).toBeInTheDocument();
    expect(onUpdateConfig).toHaveBeenCalledTimes(1);
    const configCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/config'));
    expect(configCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('视频失败时，基础/服务仍可保存', async () => {
    const fetchMock = mockFetch({ videoFail: true });
    const onUpdateConfig = vi.fn();
    const onLogout = vi.fn();
    const user = (await import('@testing-library/user-event')).default.setup();

    render(<AdminDashboard config={baseConfig} onUpdateConfig={onUpdateConfig} onLogout={onLogout} />);
    await user.click(screen.getByRole('button', { name: /下一步/i }));
    await user.click(screen.getByRole('button', { name: /下一步/i }));
    await user.click(screen.getByRole('button', { name: /保存并应用/i }));

    expect(await screen.findByText(/保存结果/i)).toBeInTheDocument();
    expect(onUpdateConfig).toHaveBeenCalledTimes(1);
    const configCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/config'));
    expect(configCalls.length).toBeGreaterThanOrEqual(3);
  });
});

