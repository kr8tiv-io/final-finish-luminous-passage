import { expect, test } from '@playwright/test';

const publicRoutes = [
  ['/services', 'Epoxy flooring services, built around the slab.'],
  ['/services/residential-epoxy-flooring', 'Residential epoxy flooring for the spaces you live with.'],
  ['/services/commercial-epoxy-flooring', 'Commercial floors that present the space clearly.'],
  ['/services/concrete-solutions', 'A finished floor can only be as considered as the concrete beneath it.'],
  ['/finishes', 'Three finish families. Thirty ways to begin.'],
  ['/projects', 'The floor is the evidence.'],
  ['/resources', 'Clear answers before you coat a floor.'],
  ['/about', 'A local finish, with a real name behind it.'],
  ['/process', 'How a floor actually goes.'],
  ['/warranty', 'Warranty is a document, not a slogan.'],
  ['/areas/edmonton/', 'Epoxy floors in Edmonton, finished properly.'],
] as const;

for (const [route, heading] of publicRoutes) {
  test(`${route} has a unique page proposition`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${route.replaceAll('/', '\\/')}$`));
  });
}

test('quote form starts with the project location and preserves direct calling', async ({ page }) => {
  await page.goto('/contact#quote');
  await expect(page.getByRole('heading', { level: 1, name: 'Tell Denis about the floor.' })).toBeVisible();
  await expect(page.getByLabel('City or postal code')).toBeVisible();
  await expect(page.getByRole('link', { name: /Call Denis/i }).first()).toHaveAttribute('href', 'tel:+17809911651');
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
});

test('guided quote completes all six steps and confirms the reference', async ({ page }) => {
  await page.route('**/api/quote', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reference: 'FFE-TEST123' }) });
  });
  await page.goto('/contact#quote');

  await page.getByLabel('City or postal code').fill('Edmonton, AB');
  await page.getByRole('button', { name: 'Continue to space type' }).click();
  await page.getByLabel('Garage').check();
  await page.getByRole('button', { name: 'Continue to size and condition' }).click();
  await page.getByLabel('Two-car garage').check();
  await page.getByLabel('Cracks').check();
  await page.getByRole('button', { name: 'Continue to finish' }).click();
  await page.getByLabel('Decorative flake').check();
  await page.getByRole('button', { name: 'Continue to timing' }).click();
  await page.getByLabel('Within 1–3 months').check();
  await page.getByRole('button', { name: 'Continue to contact details' }).click();
  await page.getByLabel('Name').fill('Alex Smith');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('alex@example.com');
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('780-555-0199');
  await page.getByLabel('Phone call').check();
  await page.getByLabel(/I agree Final Finish may contact me/i).check();
  await page.getByRole('button', { name: 'Send quote request' }).click();

  await expect(page.getByRole('heading', { name: 'Your project is in Denis’s inbox.' })).toBeVisible();
  await expect(page.getByText('FFE-TEST123')).toBeVisible();
});

test('health endpoint exposes a cache-safe deployment probe', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  await expect(response.json()).resolves.toMatchObject({ status: 'ok', service: 'final-finish-epoxy' });
});
