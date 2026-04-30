import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { VisionRecognitionPage } from '../components/VisionRecognitionPage';
import React from 'react';

// Mock the hooks
vi.mock('../hooks/useIotRealtime', () => ({
  useIotRealtime: () => ({
    sensorMap: new Map()
  })
}));

describe('VisionRecognitionPage Stability', () => {
  const mockConfig = {
    videoStreamUrl: 'http://10.150.182.114:5001/stream',
    videoStreamMode: 'mjpeg' as const,
    visionDeviceId: 'test-device',
    apiToken: 'test-token'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders correctly with mjpeg stream', () => {
    render(<VisionRecognitionPage config={mockConfig} isAdmin={true} />);
    
    const img = screen.getByAltText('实时视频画面');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src');
    expect(img.getAttribute('src')).toContain('http://10.150.182.114:5001/stream');
  });

  it('renders correctly with video stream', () => {
    const videoConfig = { ...mockConfig, videoStreamMode: 'video' as const };
    render(<VisionRecognitionPage config={videoConfig} isAdmin={true} />);
    
    const video = document.querySelector('video');
    expect(video).toBeInTheDocument();
  });

  it('handles "aborted" error gracefully without showing error UI', async () => {
    render(<VisionRecognitionPage config={mockConfig} isAdmin={true} />);
    const img = screen.getByAltText('实时视频画面');

    // Simulate an abort error by passing it in a way that the component's logic will catch
    await act(async () => {
      // markStreamError is called with the event object
      fireEvent.error(img, { 
        target: {
          error: {
            message: 'The operation was aborted',
            name: 'AbortError',
            code: 4
          }
        }
      });
    });

    // Error UI should NOT be present for abort errors
    expect(screen.queryByText(/MJPEG 流加载失败/)).not.toBeInTheDocument();
  });

  it('triggers reconnection on real stream errors', async () => {
    vi.useFakeTimers();
    render(<VisionRecognitionPage config={mockConfig} isAdmin={true} />);
    const img = screen.getByAltText('实时视频画面');

    // Simulate a real error
    await act(async () => {
      fireEvent.error(img, { message: 'Network Error' });
    });

    // Should show error message
    expect(screen.getByText(/视频流加载失败/)).toBeInTheDocument();

    // Advance time to trigger automatic reconnection (1s for first attempt)
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    // Reconnection should have cleared the error (it resets error state and reloads)
    expect(screen.queryByText(/视频流加载失败/)).not.toBeInTheDocument();
    
    vi.useRealTimers();
  });

  it('tracks performance metrics: first frame time', async () => {
    render(<VisionRecognitionPage config={mockConfig} isAdmin={true} />);
    const img = screen.getByAltText('实时视频画面');

    // Simulate load event
    await act(async () => {
      fireEvent.load(img);
    });

    // Metrics should be visible in admin view
    expect(screen.getByText(/首帧:/)).toBeInTheDocument();
  });
});
