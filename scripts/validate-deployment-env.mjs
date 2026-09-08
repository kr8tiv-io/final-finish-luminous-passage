import { requireSiteEnvironment } from '../src/lib/deployment.js';

const environment = requireSiteEnvironment(process.env.SITE_ENV);
console.log(`Validated ${environment} deployment environment.`);
