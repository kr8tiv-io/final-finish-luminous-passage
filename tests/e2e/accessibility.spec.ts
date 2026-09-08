import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';

const { source: axeSource } = axeCore;

const routes = ['/', '/projects', '/floor-visualizer', '/contact', '/resources/basement-concrete-floor-coating/'];

for (const route of routes) {
  test(`${route} has no automated WCAG A or AA violations`, async ({ page }) => {
    // Vite can perform one dependency-optimization reload on the first dev-server visit.
    // Wait for the page to settle before injecting axe so the execution context is stable.
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      const audit = await (window as typeof window & { axe: { run: (context: Document, options: object) => Promise<{ violations: unknown[] }> } }).axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return audit.violations;
    });

    expect(violations).toEqual([]);
  });
}
