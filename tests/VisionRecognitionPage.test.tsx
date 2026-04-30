import { render, screen } from '@testing-library/react';
import { VisionRecognitionPage } from '../components/VisionRecognitionPage';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('VisionRecognitionPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ success: true }), text: async () => '' })) as any
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('普通用户：未配置视频流地址时显示简洁提示', () => {
    render(<VisionRecognitionPage config={{ isActive: true, apiToken: 'test-token', videoStreamUrl: '' } as any} />);
    expect(screen.getByText(/视频流尚未配置/i)).toBeInTheDocument();
  });

  it('普通用户：配置视频流后显示视频元素', () => {
    render(<VisionRecognitionPage config={{ isActive: true, apiToken: 'test-token', videoStreamUrl: '/api/live.m3u8', videoStreamMode: 'video' } as any} />);
    expect(document.querySelector('video')).toBeInTheDocument();
  });

  it('配置MJPEG模式后渲染图像流', () => {
    render(<VisionRecognitionPage config={{ isActive: true, apiToken: 'test-token', videoStreamUrl: '/api/stream.mjpg', videoStreamMode: 'mjpeg' } as any} />);
    expect(screen.getByAltText('实时视频画面')).toBeInTheDocument();
  });

  it('管理员：点击重连会保留并显示视频来源', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<VisionRecognitionPage isAdmin config={{ isActive: true, apiToken: 'test-token', videoStreamUrl: '/api/live.m3u8', videoStreamMode: 'video' } as any} />);
    await user.click(screen.getByRole('button', { name: /重连/i }));
    expect(document.querySelector('video')).toBeInTheDocument();
    expect(screen.getByText('/api/live.m3u8')).toBeInTheDocument();
  });
});
