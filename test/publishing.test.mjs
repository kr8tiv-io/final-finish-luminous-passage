import test from 'node:test';
import assert from 'node:assert/strict';
import { canPublish, relatedEntries, resourcePath, visibleResources } from '../src/lib/publishing.js';

const approved = { id: 'ready', data: { draft: false, reviewStatus: 'approved' } };
const pending = { id: 'pending', data: { draft: true, reviewStatus: 'needs-review' } };

test('production visibility excludes drafts and unapproved resources', () => {
  assert.deepEqual(visibleResources([approved, pending], 'production'), [approved]);
  assert.equal(canPublish(approved), true);
  assert.equal(canPublish(pending), false);
});

test('production related links cannot point to hidden drafts', () => {
  const current = { ...approved, data: { ...approved.data, relatedResources: ['pending'] } };
  assert.deepEqual(relatedEntries(current, [approved, pending], 'production'), []);
});

test('staging includes review-gated resources and exposes a stable resource path', () => {
  assert.deepEqual(visibleResources([approved, pending], 'staging'), [approved, pending]);
  assert.equal(resourcePath({ id: 'garage-floor-preparation-edmonton' }), '/resources/garage-floor-preparation-edmonton/');
});
