import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const flaggedSlugs = [
  'concrete-cracks-spalling-floor-coating',
  'concrete-polishing-vs-floor-coating',
  'concrete-repair-mortars-floor-coatings',
  'floor-flake-colour-design-guide',
  'garage-floor-preparation-edmonton',
  'healthcare-low-odour-floor-planning',
  'home-gym-floor-coating',
  'hot-tire-pickup-epoxy',
  'how-epoxy-floor-coatings-cure',
  'how-to-clean-coated-garage-floor',
  'how-to-compare-floor-coating-proposals',
  'hybrid-flooring-systems-neutral-guide',
  'metallic-epoxy-expectations',
  'mudroom-floor-coating',
  'office-floor-coating-planning',
  'polyaspartic-flooring-neutral-guide',
  'polyurea-flooring-neutral-guide',
  'primer-in-floor-coating-system',
  'questions-to-ask-floor-coating-contractor',
  'repair-or-replace-coated-floor',
  'scratch-maintenance-coated-floor',
];

test('flagged resource openings give their first heading explanatory prose before another heading', async () => {
  for (const slug of flaggedSlugs) {
    const page = await readFile(new URL(`../src/content/resources/${slug}.mdx`, import.meta.url), 'utf8');
    const body = page.split('---', 3)[2];
    assert.doesNotMatch(body, /^\s*##[^\r\n]+\r?\n\s*\r?\n##/, `${slug} has consecutive opening headings`);
  }
});
