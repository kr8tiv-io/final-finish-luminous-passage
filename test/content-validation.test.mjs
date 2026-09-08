import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('the full resource library passes the launch-content validation gate', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-content.mjs'], { encoding: 'utf8' });
  assert.match(output, /50 resources validated/);
  assert.match(output, /900–1300 words/);
});
