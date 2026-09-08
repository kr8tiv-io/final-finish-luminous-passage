import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { astroAllowedDomain, deploymentSettings, requireSiteEnvironment, robotsText } from '../src/lib/deployment.js';

test('rejects missing and invalid deployment environments', () => {
	assert.throws(() => requireSiteEnvironment(undefined), /SITE_ENV must be either "staging" or "production"/);
	assert.throws(() => requireSiteEnvironment('preview'), /SITE_ENV must be either "staging" or "production"/);
});

test('uses the deployment environment to make staging non-indexable', () => {
	const staging = deploymentSettings('staging', 'https://review.finalfinishepoxy.ca');
	const production = deploymentSettings('production', 'https://www.finalfinishepoxy.ca');

	assert.equal(staging.noindex, true);
	assert.equal(staging.crawlAllowed, false);
	assert.equal(staging.site.toString(), 'https://review.finalfinishepoxy.ca/');
	assert.equal(staging.canonicalOrigin.toString(), 'https://www.finalfinishepoxy.ca/');
	assert.equal(production.noindex, false);
	assert.equal(production.crawlAllowed, true);
});

test('emits robots directives for the configured deployment URL', () => {
	const staging = deploymentSettings('staging', 'https://review.finalfinishepoxy.ca');
	const production = deploymentSettings('production', 'https://www.finalfinishepoxy.ca');

	assert.match(robotsText(staging), /Disallow: \/\n/);
	assert.doesNotMatch(robotsText(staging), /Sitemap:/);
	assert.match(robotsText(production), /Allow: \/\n/);
	assert.match(robotsText(production), /Sitemap: https:\/\/www\.finalfinishepoxy\.ca\/sitemap-index\.xml/);
});

test('derives the trusted reverse-proxy host from the configured deployment URL', () => {
	assert.deepEqual(astroAllowedDomain(deploymentSettings('staging', 'https://review.finalfinishepoxy.ca')), {
		protocol: 'https',
		hostname: 'review.finalfinishepoxy.ca',
	});
	assert.deepEqual(astroAllowedDomain(deploymentSettings('production', 'https://www.finalfinishepoxy.ca:8443')), {
		protocol: 'https',
		hostname: 'www.finalfinishepoxy.ca',
		port: '8443',
	});
});

test('the build deployment check fails closed when SITE_ENV is missing', () => {
	const environment = { ...process.env };
	delete environment.SITE_ENV;
	const result = spawnSync(process.execPath, ['scripts/validate-deployment-env.mjs'], { encoding: 'utf8', env: environment });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /SITE_ENV must be either "staging" or "production"/);
});

test('the build deployment check accepts an explicit production environment', () => {
	const environment = { ...process.env, SITE_ENV: 'production' };
	delete environment.PUBLIC_SITE_URL;
	const output = execFileSync(process.execPath, ['scripts/validate-deployment-env.mjs'], { encoding: 'utf8', env: environment });
	assert.match(output, /Validated production deployment/);
});

test('offers explicit cross-platform staging and production build commands', async () => {
	const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
	assert.equal(packageJson.scripts['build:staging'], 'node scripts/build-with-env.mjs staging');
	assert.equal(packageJson.scripts['build:production'], 'node scripts/build-with-env.mjs production');
});

test('passes Astro a string site URL from the shared deployment settings', async () => {
	const astroConfig = await readFile('astro.config.mjs', 'utf8');
	assert.match(astroConfig, /site: deployment\.site\.toString\(\)/);
});

test('the explicit production wrapper reaches the build preflight on Windows', () => {
	const result = spawnSync(process.execPath, ['scripts/build-with-env.mjs', 'production'], {
		encoding: 'utf8',
		env: {
			...process.env,
			PUBLIC_SITE_URL: 'https://www.finalfinishepoxy.ca',
			npm_execpath: join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
		},
	});
	assert.doesNotMatch(result.stderr, /spawnSync npm\.cmd EINVAL/);
	assert.match(result.stdout, /Validated production deployment environment/);
});
