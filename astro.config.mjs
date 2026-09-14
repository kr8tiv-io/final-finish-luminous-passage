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
  integrations: [react(), mdx(), ...(deployment.crawlAllowed ? [sitemap()] : [])],

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
