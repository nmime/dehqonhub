// @requirements REQ-FRONTEND-JOURNEY-001 REQ-FRONTEND-SSR-007
// Evidence for: REQ-FRONTEND-JOURNEY-001 REQ-FRONTEND-SSR-007
import { expect, test } from '@playwright/test';

test('Vike sends meaningful SSR HTML and hydrates client-side navigation in place', async ({ page, request }) => {
  const serverResponse = await request.get('/');
  expect(serverResponse.status()).toBe(200);
  expect(serverResponse.headers()['content-type']).toContain('text/html');
  const serverHtml = await serverResponse.text();
  expect(serverHtml).toContain('A dependable home for the pages people return to.');
  expect(serverHtml).toMatch(/<script\b/iu);

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

  await page.goto('/problems');
  await expect(page.getByRole('heading', { level: 1, name: 'API problem types' })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.hydrationNavigationProof = 'preserved';
  });
  await page.getByRole('link', { name: 'AgriTech' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'A dependable home for the pages people return to.' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/');
  expect(await page.evaluate(() => document.documentElement.dataset.hydrationNavigationProof)).toBe('preserved');
  expect(hydrationErrors).toEqual([]);
});
