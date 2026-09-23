import { expect, test } from '@playwright/test';

test.describe('published resource library', () => {
  test('presents every guide inside the branded library', async ({ page }) => {
    await page.goto('/resources');

    // 50 launch guides + 10 added 2026-09-22.
    await expect(page.locator('.resource-card')).toHaveCount(60);
    await expect(page.getByRole('link', { name: 'Final Finish Epoxy home' })).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0);
  });

  test('renders a sourced guide with canonical and structured data', async ({ page }) => {
    await page.goto('/resources/basement-concrete-floor-coating/');

    await expect(page.getByRole('link', { name: 'Final Finish Epoxy home' })).toBeVisible();
    // Frontmatter title is schema-constrained to 29-33 characters (src/content.config.ts), so
    // the rendered H1 is "Basement Floor Coating Basics", not a literal restatement of the slug.
    await expect(page.getByRole('heading', { level: 1, name: /basement floor coating basics/i })).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/resources\/basement-concrete-floor-coating\/$/);
    const schemas = page.locator('script[type="application/ld+json"]');
    const schemaTypes = await schemas.evaluateAll((nodes) => nodes.flatMap((node) => {
      const data = JSON.parse(node.textContent ?? '{}');
      return data['@graph']?.map((item: { '@type'?: string }) => item['@type']) ?? [data['@type']];
    }));
    // Step 32: guides now emit `Article` (with a real datePublished/dateModified pair) rather
    // than `BlogPosting` — see src/lib/seo/schema.ts buildArticleSchema.
    expect(schemaTypes).toEqual(expect.arrayContaining(['Article', 'BreadcrumbList']));
  });
});
