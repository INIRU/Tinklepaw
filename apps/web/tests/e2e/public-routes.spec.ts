import { expect, test } from '@playwright/test';

const cases: Array<{ path: string; heading?: string }> = [
  { path: '/' },
  { path: '/login', heading: '로그인' },
  { path: '/terms', heading: '이용약관' },
  { path: '/privacy', heading: '개인정보 처리방침' },
];

for (const entry of cases) {
  test(`public route renders: ${entry.path}`, async ({ page }) => {
    await page.goto(entry.path, { waitUntil: 'networkidle' });

    await expect(page.locator('main')).toBeVisible();
    if (entry.heading) {
      await expect(page.getByRole('heading', { name: entry.heading })).toBeVisible();
    }

    await expect(page.getByText('Application error', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Internal Server Error', { exact: false })).toHaveCount(0);
  });
}

test('main navigation brand link keeps home reachable', async ({ page }) => {
  await page.goto('/terms', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: '방울냥' }).click();
  await expect(page).toHaveURL(/\/$/);
});
