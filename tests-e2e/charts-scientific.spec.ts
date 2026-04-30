import { test, expect } from '@playwright/test';

test('科学图表面板可切换并显示统计', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /普通用户/i }).click();
  await page.getByRole('link', { name: /指标细分/i }).click();
  await expect(page.getByText(/数据分析控制台/i)).toBeVisible();
  await page.getByRole('button', { name: '相关' }).click();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: '密度' }).click();
  await expect(page.getByText(/标准差/i)).toBeVisible();
});

test('移动端布局下图表区域可见', async ({ page, isMobile }) => {
  test.skip(!isMobile, '仅在移动项目执行');
  await page.goto('/');
  await page.getByRole('button', { name: /普通用户/i }).click();
  await page.getByRole('link', { name: /指标细分/i }).click();
  await expect(page.getByText(/数据分析控制台/i)).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
});
