import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Package the staging build as a static preview for Hostinger shared hosting.
 *
 *   1. copy dist/client to dist/static-preview
 *   2. add deploy/static-preview/.htaccess (headers, /areas 301s, slash-less pages,
 *      ErrorDocument) and /_astro/.htaccess (immutable hashed bundles)
 *   3. render the on-demand /404 route from the built server into 404.html
 *   4. zip the folder, files at the archive root, forward-slash paths
 *
 * Build first with the preview's own origin, e.g.
 *   PUBLIC_SITE_URL=https://<preview>.hostingersite.com npm run build:staging
 * then run `npm run package:static-preview` and deploy the zip (Hostinger MCP
 * `hosting_deployStaticWebsite`, which replaces the whole site). Purge the host's
 * cache after a redeploy: cached HTML can point at bundles the deploy replaced.
 *
 * A static preview has no /api routes: the quote form shows its "call Denis" message.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const client = join(root, 'dist', 'client');
const entry = join(root, 'dist', 'server', 'entry.mjs');
const out = join(root, 'dist', 'static-preview');
const port = Number(process.env.PREVIEW_RENDER_PORT ?? 4390);

if (!existsSync(join(client, 'index.html')) || !existsSync(entry)) {
  throw new Error('dist/client or dist/server is missing: run `npm run build:staging` first.');
}

rmSync(out, { recursive: true, force: true });
cpSync(client, out, { recursive: true });
cpSync(join(root, 'deploy', 'static-preview', '.htaccess'), join(out, '.htaccess'));
mkdirSync(join(out, '_astro'), { recursive: true });
cpSync(join(root, 'deploy', 'static-preview', '_astro.htaccess'), join(out, '_astro', '.htaccess'));

// Render /404 with the same server the build produced.
const server = spawn(process.execPath, [entry], {
  cwd: root,
  env: { ...process.env, SITE_ENV: process.env.SITE_ENV ?? 'staging', HOST: '127.0.0.1', PORT: String(port) },
  stdio: 'ignore',
});
try {
  let response;
  for (let attempt = 0; attempt < 60 && !response; attempt++) {
    await new Promise((done) => setTimeout(done, 500));
    try { response = await fetch(`http://127.0.0.1:${port}/this-page-does-not-exist`); } catch { /* not up yet */ }
  }
  if (!response) throw new Error('the built server did not start');
  const body = await response.text();
  if (response.status !== 404 || body.length < 500) throw new Error(`unexpected 404 render: ${response.status}, ${body.length} bytes`);
  writeFileSync(join(out, '404.html'), body);
} finally {
  server.kill();
}

// Zip with the platform's own tool (no extra dependency).
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
const zip = join(root, 'dist', `client_${stamp}.zip`);
const result = process.platform === 'win32'
  ? spawnSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory('${out}', '${zip}', [IO.Compression.CompressionLevel]::Optimal, $false)`], { stdio: 'inherit' })
  : spawnSync('zip', ['-r', '-q', zip, '.'], { cwd: out, stdio: 'inherit' });
if (result.status !== 0) throw new Error('zipping failed');
console.log(`static preview: ${out}\narchive: ${zip}`);
