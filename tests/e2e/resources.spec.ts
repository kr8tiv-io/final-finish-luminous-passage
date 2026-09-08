import { expect, test } from '@playwright/test';

test.describe('published resource library', () => {
  test('presents all 50 guides inside the branded library', async ({ page }) => {
    await page.goto('/resources');

    await expect(page.locator('.resource-card')).toHaveCount(50);
    await expect(page.getByRole('link', { name: 'Final Finish Epoxy home' })).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0);
  });

  test('renders a sourced guide with canonical and structured data', async ({ page }) => {
    await page.goto('/resources/basement-concrete-floor-coating/');

    await expect(page.getByRole('link', { name: 'Final Finish Epoxy home' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /basement concrete floor coating/i })).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/resources\/basement-concrete-floor-coating\/$/);
    const schemas = page.locator('script[type="application/ld+json"]');
    const schemaTypes = await schemas.evaluateAll((nodes) => nodes.flatMap((node) => {
      const data = JSON.parse(node.textContent ?? '{}');
      return data['@graph']?.map((item: { '@type'?: string }) => item['@type']) ?? [data['@type']];
    }));
    expect(schemaTypes).toEqual(expect.arrayContaining(['BlogPosting', 'BreadcrumbList']));
  });
});
