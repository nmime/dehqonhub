// @requirements REQ-FRONTEND-JOURNEY-001 REQ-FRONTEND-SSR-007
// Evidence for: REQ-FRONTEND-JOURNEY-001 REQ-FRONTEND-SSR-007
import { expect, test } from '@playwright/test';

test('Astro serves stable content and hydrates its interactive product shell', async ({ page }) => {
  const hydrationErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydration|did not match|server html/iu.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    if (/hydration|did not match|server html/iu.test(error.message)) {
      hydrationErrors.push(error.message);
    }
  });

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'A focused foundation for your next product.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Preview user app' })).toHaveAttribute('href', '/app');

  const languageSwitcher = page.getByRole('combobox', { name: 'Language' });
  await expect(languageSwitcher).toBeVisible();
  await languageSwitcher.click();
  await page.getByRole('option', { name: 'Russian' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  expect(hydrationErrors).toEqual([]);
});
