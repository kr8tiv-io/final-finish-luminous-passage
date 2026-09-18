import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

function run(today) {
	return spawnSync(process.execPath, ['scripts/check-review-freshness.mjs'], {
		encoding: 'utf8',
		env: { ...process.env, FFE_TODAY: today },
	});
}

test('the fixture review snapshot expires 2026-10-09 (verifiedAt + refreshAfterDays)', async () => {
	const { rating } = JSON.parse(await readFile('src/data/customer-proof.json', 'utf8'));
	assert.equal(rating.verifiedAt, '2026-09-09T02:08:00Z');
	assert.equal(rating.refreshAfterDays, 30);
});

test('passes and prints the expiry date while today is outside the 7-day refresh window', () => {
	const result = run('2026-09-18');
	assert.equal(result.status, 0);
	assert.match(result.stdout, /2026-10-09/);
	assert.match(result.stdout, /fresh/);
});

test('fails and prints the expiry date once today enters the 7-day refresh window', () => {
	const result = run('2026-10-03');
	assert.equal(result.status, 1);
	assert.match(result.stderr, /2026-10-09/);
	assert.match(result.stderr, /refresh window/);
});

test('falls back to the real system clock when FFE_TODAY is unset', () => {
	const environment = { ...process.env };
	delete environment.FFE_TODAY;
	const result = spawnSync(process.execPath, ['scripts/check-review-freshness.mjs'], { encoding: 'utf8', env: environment });
	// The suite runs well before 2026-10-02 (the start of the warning window), so this must pass.
	assert.equal(result.status, 0);
	assert.match(result.stdout, /2026-10-09/);
});
