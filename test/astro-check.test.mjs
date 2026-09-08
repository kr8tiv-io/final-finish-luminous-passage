import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('Astro static analysis accepts the resource route and layout contracts', () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'check'], {
    encoding: 'utf8',
    env: { ...process.env, SITE_ENV: 'staging', PUBLIC_SITE_URL: 'https://staging.example.com' },
  }));
});
