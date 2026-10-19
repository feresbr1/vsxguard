import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

const REMOVED_MD = [
  '| Extension Identifier | Removal Date | Type |',
  '|---|---|---|',
  ...Array.from({ length: 2300 }, (_, i) => `| filler${i}.ext | 1/1/2025 | Spam |`),
  '| evil.stealer | 10/15/2026 | Malware |',
  '| fake.prettier-vscode | 10/17/2026 | Impersonation |',
].join('\n');

test.describe('with mocked data', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://raw.githubusercontent.com/**', (route) =>
      route.fulfill({
        status: 200,
        body: REMOVED_MD,
        headers: { 'access-control-allow-origin': '*' },
      }),
    );
    await page.route('https://open-vsx.org/**', (route) => {
      const url = route.request().url();
      const fresh = url.endsWith('/eamodio/gitlens/2026.10.170513');
      const old = url.endsWith('/esbenp/prettier-vscode/12.4.0');
      if (!fresh && !old) {
        return route.fulfill({
          status: 404,
          body: '{}',
          headers: { 'access-control-allow-origin': '*' },
        });
      }
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({
          timestamp: fresh
            ? new Date(Date.now() - 86_400_000).toISOString()
            : '2026-03-16T19:14:43Z',
          verified: true,
          downloadCount: 1e6,
        }),
      });
    });
  });

  test('checks a pasted list end to end', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await expect(page.getByTestId('data-status')).toContainText('loaded live');
    await expect(page.getByTestId('removed-count')).toHaveText('2,302');

    await page
      .getByLabel('Extension list')
      .fill(
        [
          'esbenp.prettier-vscode@12.4.0',
          'Evil.Stealer@1.0.0',
          'fake.prettier-vscode@1.0.0',
          'eamodio.gitlens@2026.10.170513',
          'not an extension line',
        ].join('\n'),
      );
    await page.getByRole('button', { name: 'Check extensions' }).click();
    await expect(page.getByTestId('verdict')).toHaveText('1 malicious extension: uninstall now');
    const results = page.getByTestId('result');
    await expect(results).toHaveCount(3);
    await expect(results.nth(0)).toContainText('Evil.Stealer');
    await expect(results.nth(0)).toContainText(
      'removed from the Marketplace on 2026-10-15 (Malware)',
    );
    await expect(results.nth(1)).toContainText('Removed');
    await expect(results.nth(2)).toContainText('Fresh');
    await expect(page.getByText('1 other extension had no findings.')).toBeVisible();
    await expect(page.getByText('Ignored 1 line')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('explains invalid input', async ({ page }) => {
    await page.goto('./');
    await page.getByLabel('Extension list').fill('hello world');
    await page.getByRole('button', { name: 'Check extensions' }).click();
    await expect(page.getByRole('alert')).toContainText('No extension ids found');
  });

  test('searches and filters the removal list', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('data-status')).toContainText('loaded live');
    await page.getByRole('button', { name: 'Malware', exact: true }).click();
    await expect(page.getByTestId('removed-row')).toHaveCount(1);
    await expect(page.getByTestId('removed-row').first()).toContainText('evil.stealer');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByLabel('Search removed extensions').fill('prettier');
    await expect(page.getByTestId('removed-row')).toHaveCount(1);
    await page.getByLabel('Search removed extensions').fill('esbenp.prettier-vscode-real');
    await expect(page.getByText('is not on Microsoft')).toBeVisible();
  });

  test('falls back to the bundled snapshot when GitHub is unreachable', async ({ page }) => {
    await page.unroute('https://raw.githubusercontent.com/**');
    await page.route('https://raw.githubusercontent.com/**', (route) => route.abort());
    await page.goto('./');
    await expect(page.getByTestId('data-status')).toContainText('from snapshot');
    await expect(page.getByTestId('removed-row').first()).toBeVisible();
  });
});

test.describe('live', () => {
  test.skip(!process.env.LIVE && !process.env.E2E_BASE_URL, 'set LIVE=1 to hit the real sources');

  test('the sample list finds real removals', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await expect(page.getByTestId('data-status')).toContainText('loaded live', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Try a sample list' }).click();
    await expect(page.getByTestId('verdict')).toContainText('malicious extension', {
      timeout: 30_000,
    });
    expect(errors).toEqual([]);
  });
});
