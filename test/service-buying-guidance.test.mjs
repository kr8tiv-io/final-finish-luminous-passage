import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const servicePage = (name) => readFile(new URL(`../src/pages/services/${name}`, import.meta.url), 'utf8');
const hasHeading = (page, text) => assert.match(page, new RegExp(`<h2[^>]*>${text}</h2>`));

test('residential service page gives a buyer a preparation, finish, winter-care, and quote path', async () => {
  const page = await servicePage('residential-epoxy-flooring.astro');

  for (const expected of [
    'winter-salt-concrete-floor-damage',
    'how-to-clean-coated-garage-floor',
    'how-to-compare-floor-coating-proposals',
  ]) assert.match(page, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  hasHeading(page, 'What we assess before choosing a finish');
  hasHeading(page, 'Choose the look around how the room is used');
});

test('commercial service page makes traffic, downtime, and return-to-service planning visible', async () => {
  const page = await servicePage('commercial-epoxy-flooring.astro');

  for (const expected of [
    'commercial-flooring-downtime-planning',
    'warehouse-floor-coating-planning',
    'questions-to-ask-floor-coating-contractor',
  ]) assert.match(page, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  hasHeading(page, 'Plan around traffic before selecting texture');
  hasHeading(page, 'Make downtime a written operating plan');
});

test('concrete service page explains condition, moisture boundaries, and scope changes', async () => {
  const page = await servicePage('concrete-solutions.astro');

  for (const expected of [
    'concrete-moisture-testing-floor-coatings',
    'concrete-cracks-spalling-floor-coating',
    'concrete-repair-mortars-floor-coatings',
  ]) assert.match(page, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  hasHeading(page, 'Condition comes before a coating recommendation');
  hasHeading(page, 'Moisture is a system question, not a promise');
});
