import { spawnSync } from 'node:child_process';
import { requireSiteEnvironment } from '../src/lib/deployment.js';

const siteEnvironment = requireSiteEnvironment(process.argv[2]);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('build-with-env must be run through npm.');
const result = spawnSync(process.execPath, [npmCli, 'run', 'build'], {
	stdio: 'inherit',
	env: { ...process.env, SITE_ENV: siteEnvironment },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
