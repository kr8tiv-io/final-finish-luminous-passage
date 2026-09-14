import { expect, test } from '@playwright/test';

const publicRoutes = [
  ['/services', 'Epoxy flooring services, built around the slab.'],
  ['/services/residential-epoxy-flooring', 'Residential epoxy flooring for the spaces you live with.'],
  ['/services/commercial-epoxy-flooring', 'Commercial floors that present the space clearly.'],
  ['/services/concrete-solutions', 'A finished floor can only be as considered as the concrete beneath it.'],
  ['/finishes', 'Three finish families. Thirty ways to begin.'],
  ['/projects', 'The floor is the evidence.'],
  ['/resources', 'Clear answers before you coat a floor.'],
] as const;

for (const [route, heading] of publicRoutes) {
  test(`${route} has a unique page proposition`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${route.replaceAll('/', '\\/')}$`));
  });
}

test('quote form starts with project location and preserves direct calling', async ({ page }) => {
  await page.goto('/contact#quote', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Let’s talk about your space.' })).toBeVisible();
  await expect(page.getByLabel('City or postal code')).toBeVisible();
  await expect(page.getByRole('link', { name: /Call Denis/i }).first()).toHaveAttribute('href', 'tel:+17809911651');
  await expect(page.getByText('Step 1 of 3', { exact: true })).toBeVisible();
});

test('quote handoff delivers the selected project details to the local route fixture', async ({ page }) => {
  let delivered: Record<string, unknown> | undefined;
  await page.route('**/api/quote', async (route) => {
    delivered = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reference: 'FFE-TEST123' }) });
  });
  await page.goto('/contact?finish=blue-hour&space=basement#quote', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Cobalt Terrazzo', { exact: true })).toBeVisible();
  await page.getByLabel('City or postal code').fill('Edmonton, AB');
  await page.getByRole('button', { name: 'Continue to project details' }).click();
  await page.getByLabel('Approximate size').selectOption('two-car');
  await page.getByLabel('Finish direction').selectOption('metallic');
  await page.getByRole('button', { name: 'Continue to contact details' }).click();
  await page.getByLabel('Name').fill('Alex Smith');
  await page.getByLabel('Email (optional)').fill('alex@example.com');
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('780-555-0199');
  await page.getByLabel(/I agree Final Finish may contact me/i).check();
  await page.getByRole('button', { name: 'Send quote request' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you. Your project details are on their way.' })).toBeVisible();
  await expect(page.getByText('FFE-TEST123')).toBeVisible();
  expect(delivered).toMatchObject({
    location: 'Edmonton, AB', spaceType: 'basement', sizeBand: 'two-car', finishInterest: 'metallic',
    name: 'Alex Smith', email: 'alex@example.com', phone: '780-555-0199', consent: true, visualizerFinishId: 'blue-hour',
  });
});

test('health endpoint exposes a cache-safe deployment probe', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  await expect(response.json()).resolves.toMatchObject({ status: 'ok', service: 'final-finish-epoxy' });
});
