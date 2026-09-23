import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('the full resource library passes the launch-content validation gate', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-content.mjs'], { encoding: 'utf8' });
  // Fifty launch guides plus the ten added on 2026-09-22; the count only ever grows.
  const count = Number(/(\d+) resources validated/.exec(output)?.[1]);
  assert.ok(count >= 60, `expected at least 60 validated guides, found ${count}`);
  assert.match(output, /source alignment, internal links, review metadata, reader-purpose structure/);
  assert.doesNotMatch(output, /words/);
});
