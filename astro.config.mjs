// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { astroAllowedDomain, deploymentSettings } from './src/lib/deployment.js';

const deployment = deploymentSettings(process.env.SITE_ENV, process.env.PUBLIC_SITE_URL);

// https://astro.build/config
export default defineConfig({
  site: deployment.site.toString(),
  // Keep the client-facing local review free of developer overlays.
  devToolbar: { enabled: false },
  integrations: [
    react(),
    mdx(),
    // Sitemap only in production (staging is noindex/disallow-all — see src/lib/deployment.js
    // robotsText). `filter` excludes the local-review-only `/dev/*` tree (already 404s in
    // production, see src/pages/dev/surface.astro) and the 404 page itself, in case a future
    // Astro/integration version ever starts treating error pages as normal routes.
    // `/lab/*` is the staging-only spike tree (404 in production); on-demand routes still
    // reach the integration's route list, so it is filtered here too. `serialize` lists each
    // URL in its canonical form (BaseLayout): guides keep their trailing slash
    // (resourcePath), every other page has none. A sitemap URL that differs from the
    // page's own canonical is a conflicting signal.
    ...(deployment.crawlAllowed ? [sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        return !path.startsWith('/dev/') && !path.startsWith('/lab/') && path !== '/404' && path !== '/404/';
      },
      serialize: (item) => {
        const url = new URL(item.url);
        if (url.pathname !== '/' && url.pathname.endsWith('/') && !/^\/resources\/[^/]+\/$/.test(url.pathname)) {
          url.pathname = url.pathname.slice(0, -1);
          item.url = url.toString();
        }
        return item;
      },
    })] : []),
  ],

  // Trust forwarded host/client-IP headers only for this exact deployment origin.
  security: { allowedDomains: [astroAllowedDomain(deployment)] },

  // Three.js lives in a capability-gated dynamic chunk; it never blocks the static/LCP path.
  vite: {
    // Dependency optimization belongs to this checkout, not the shared package
    // junction: two local previews must never invalidate each other's modules.
    cacheDir: fileURLToPath(new URL(
      process.argv.includes('check') ? './.astro/check-vite'
        : process.argv.includes('build') ? './.astro/build-vite' : './.astro/vite',
      import.meta.url,
    )),
    optimizeDeps: { include: ['react', 'react-dom/client', 'framer-motion', 'gsap', 'gsap/SplitText', 'gsap/Flip', '@react-three/fiber', '@react-three/drei', 'three', 'zod'] },
    build: { chunkSizeWarningLimit: 1000 },
    // Worktrees can share a node_modules junction. Allow only that resolved
    // dependency directory, retaining Vite's strict file-serving restrictions.
    server: {
      // Test traces contain HTML: watching them would trigger page reloads
      // while browser assertions and trace writes are still in progress.
      watch: { ignored: ['**/output/**'] },
      fs: { allow: [
      fileURLToPath(new URL('.', import.meta.url)),
      realpathSync(fileURLToPath(new URL('./node_modules', import.meta.url))),
    ] } },
  },

  adapter: node({
    mode: 'standalone'
  })
});
