import { render, screen, waitFor } from '@testing-library/react';
import { Login } from '../components/Login';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';

describe('Login Component', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls onLogin with "user" when logging in as user without token', async () => {
    const onLogin = vi.fn();
    const user = userEvent.setup();
    render(<Login onLogin={onLogin} apiBaseUrl="/api" />);

    const submitButton = screen.getByText(/进入系统/i);
    await user.click(submitButton);

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith('user');
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('calls onLogin with "admin" when backend accepts password', async () => {
    const onLogin = vi.fn();
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, role: 'admin', apiToken: 'server-token-xyz' })
    } as Response);

    const user = userEvent.setup();
    render(<Login onLogin={onLogin} apiBaseUrl="/api" />);

    await user.click(screen.getByText('管理员'));
    await user.type(screen.getByPlaceholderText('请输入管理员密码'), 'secret');
    await user.click(screen.getByRole('button', { name: /进入系统/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith('admin', 'server-token-xyz');
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ role: 'admin', password: 'secret' })
      })
    );
  });

  it('shows error when admin login fails', async () => {
    const onLogin = vi.fn();
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: '管理员密码错误' })
    } as Response);

    const user = userEvent.setup();
    render(<Login onLogin={onLogin} apiBaseUrl="/api" />);

    await user.click(screen.getByText('管理员'));
    await user.type(screen.getByPlaceholderText('请输入管理员密码'), 'wrong');
    await user.click(screen.getByRole('button', { name: /进入系统/i }));

    await waitFor(() => {
      expect(screen.getByText(/管理员密码错误/i)).toBeInTheDocument();
    });
    expect(onLogin).not.toHaveBeenCalled();
  });
});
