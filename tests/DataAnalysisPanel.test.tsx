import { render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { DataAnalysisPanel } from '../components/DataAnalysisPanel';
import { describe, it, expect, vi } from 'vitest';

vi.mock('echarts-for-react', () => {
  return {
    default: () => <div data-testid="echarts-panel">ECharts</div>
  };
});

vi.mock('framer-motion', () => {
  return {
    motion: {
      div: ({ children }: { children: ReactNode }) => <div>{children}</div>
    }
  };
});

describe('DataAnalysisPanel', () => {
  it('renders empty state when historyData is empty', () => {
    render(<DataAnalysisPanel historyData={[]} currentData={null} />);
    expect(screen.getByText(/暂无可分析数据/i)).toBeInTheDocument();
  });

  it('renders charts when historyData is provided', () => {
    const mockData = [
      { timestamp: Date.now(), temperature: 25, humidity: 60, weight: 40, beesIn: 10, beesOut: 10 }
    ];
    render(<DataAnalysisPanel historyData={mockData} currentData={null} />);
    expect(screen.queryByText(/暂无分析数据/i)).not.toBeInTheDocument();
    expect(screen.getByText(/图例：/i)).toBeInTheDocument();
    expect(screen.getByTestId('echarts-panel')).toBeInTheDocument();
  });
});
