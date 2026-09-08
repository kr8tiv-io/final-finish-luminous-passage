import { expect, test } from '@playwright/test';

test('publishes truthful business and website structured data', async ({ page }) => {
  await page.goto('/');
  const graphScript = page.locator('script[type="application/ld+json"][data-site-schema]');
  await expect(graphScript).toHaveCount(1);
  const graph = JSON.parse((await graphScript.textContent()) ?? '{}')['@graph'];
  expect(graph).toEqual(expect.arrayContaining([
    expect.objectContaining({ '@type': 'HomeAndConstructionBusiness', telephone: '+1-780-991-1651', email: 'finalfinishepoxy@gmail.com' }),
    expect.objectContaining({ '@type': 'WebSite', name: 'Final Finish Epoxy' }),
  ]));
  expect(graph[0].areaServed).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Edmonton' }),
  ]));
});

test('blocks crawlers on staging while retaining truthful AI guidance', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  const robotsText = await robots.text();
  expect(robotsText).toContain('Disallow: /');
  expect(robotsText).not.toContain('Sitemap:');

  const llms = await request.get('/llms.txt');
  const copy = await llms.text();
  expect(copy).toContain('Final Finish Epoxy');
  expect(copy).toContain('(780) 991-1651');
  expect(copy).toContain('/resources');
  expect(copy).not.toMatch(/5\.0|best in Edmonton|lifetime warranty/i);
});
