import { render, screen } from '@testing-library/react';
import { AdminDashboard } from '../components/AdminDashboard';
import { describe, it, expect, vi } from 'vitest';

describe('AdminDashboard', () => {
  it('renders loading error when config is missing', () => {
    const onUpdateConfig = vi.fn();
    const onLogout = vi.fn();
    render(<AdminDashboard config={null as any} onUpdateConfig={onUpdateConfig} onLogout={onLogout} />);
    expect(screen.getByText(/配置加载失败/i)).toBeInTheDocument();
    expect(screen.getByText(/返回登录/i)).toBeInTheDocument();
  });

  it('renders config form when config is provided', () => {
    const mockConfig = {
      apiKey: 'test-key',
      modelName: 'qwen-turbo',
      apiBaseUrl: 'http://localhost:3000',
      apiToken: 'test-token',
      videoStreamUrl: '/api/live.m3u8',
      videoStreamMode: 'video',
      isActive: true
    };
    const onUpdateConfig = vi.fn();
    const onLogout = vi.fn();
    
    render(<AdminDashboard config={mockConfig} onUpdateConfig={onUpdateConfig} onLogout={onLogout} />);
    
    expect(screen.getByDisplayValue('http://localhost:3000')).toBeInTheDocument();
    expect(screen.getByText(/基础配置/i)).toBeInTheDocument();
    expect(screen.getByText(/测试连接/i)).toBeInTheDocument();
  });
});
