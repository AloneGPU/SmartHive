import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatPage } from '../pages/ChatPage';

vi.mock('../context/AppContext', () => {
  return {
    useAppContext: () => ({
      aiConfig: { apiKey: '', modelName: 'qwen-turbo', apiBaseUrl: '/api', apiToken: 'test', isActive: true }
    })
  };
});

vi.mock('../components/AIChatWindow', () => {
  return {
    AIChatWindow: () => <div data-testid="ai-chat-window" />
  };
});

describe('ChatPage', () => {
  it('renders AI chat page', () => {
    render(<ChatPage />);
    expect(screen.getByText(/AI问答/i)).toBeInTheDocument();
    expect(screen.getByTestId('ai-chat-window')).toBeInTheDocument();
  });
});

