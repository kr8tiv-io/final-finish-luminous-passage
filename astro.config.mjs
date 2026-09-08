// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import { astroAllowedDomain, deploymentSettings } from './src/lib/deployment.js';

const deployment = deploymentSettings(process.env.SITE_ENV, process.env.PUBLIC_SITE_URL);

// https://astro.build/config
export default defineConfig({
  site: deployment.site.toString(),
  integrations: [react(), mdx(), ...(deployment.crawlAllowed ? [sitemap()] : [])],

  // Trust forwarded host/client-IP headers only for this exact deployment origin.
  security: { allowedDomains: [astroAllowedDomain(deployment)] },

  // Three.js lives in a capability-gated dynamic chunk; it never blocks the static/LCP path.
  vite: { build: { chunkSizeWarningLimit: 1000 } },

  adapter: node({
    mode: 'standalone'
  })
});
