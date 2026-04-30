import { test, expect } from '@playwright/test';

test('loads login and can enter dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /登录/i })).toBeVisible();
  await page.getByRole('button', { name: /普通用户/i }).click();
  await expect(page.getByRole('heading', { name: /指标总览/i })).toBeVisible();
});

test('navigation works', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /普通用户/i }).click();
  await page.getByRole('link', { name: /指标细分/i }).click();
  await expect(page.getByRole('heading', { name: /指标细分/i })).toBeVisible();
  await page.getByRole('link', { name: /数据详情/i }).click();
  await expect(page.getByRole('heading', { name: /数据详情/i })).toBeVisible();
});

test('filter bar can change range', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /普通用户/i }).click();
  await page.getByRole('button', { name: /近7天/i }).click();
  await expect(page.getByRole('button', { name: /近7天/i })).toHaveAttribute('data-active', 'true');
});

test('command palette opens with ctrl+k', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /普通用户/i }).click();
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await expect(page.getByRole('dialog', { name: /全局搜索/i })).toBeVisible();
});

test('tour shows on first login', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('SMART_HIVE_TOUR_DONE'));
  await page.reload();
  await page.getByRole('button', { name: /普通用户/i }).click();
  await expect(page.getByRole('dialog', { name: /新手引导/i })).toBeVisible();
});

