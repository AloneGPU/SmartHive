import { render, screen } from '@testing-library/react';
import { CalendarSelector } from '../components/CalendarSelector';
import { describe, it, expect, vi } from 'vitest';

describe('CalendarSelector', () => {
  it('renders controlled visible month and triggers month change', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const onVisibleMonthChange = vi.fn();
    const onDateSelect = vi.fn();
    const selectedDate = new Date(2026, 2, 15);
    const visibleMonth = new Date(2026, 2, 1);

    render(
      <CalendarSelector
        selectedDate={selectedDate}
        visibleMonth={visibleMonth}
        onVisibleMonthChange={onVisibleMonthChange}
        onDateSelect={onDateSelect}
        hasData={() => false}
      />
    );

    expect(screen.getByRole('heading', { name: /2026.*三月/ })).toBeInTheDocument();
    await user.click(screen.getByLabelText('下个月'));
    expect(onVisibleMonthChange).toHaveBeenCalledTimes(1);
  });
});
