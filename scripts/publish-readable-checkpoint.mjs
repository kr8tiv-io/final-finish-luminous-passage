// Private review checkpoint; never changes the working index, local branches, or main.
// Uses the existing authenticated GitHub CLI, without reading/exporting its credential.
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repository = 'kr8tiv-io/final-finish-luminous-passage';
const branch = 'review/cinematic-readability-2026-09-14';
const parent = 'c9468d1ed295f13597dcecfe1ff81f0a15a1602f';
const mainBaseline = 'e182dcf775eefcf17d0f6a4292df1edcdeab3664';
const output = resolve('output/readable-checkpoint');
const publish = process.argv.includes('--publish');
const api = (path, body) => JSON.parse(execFileSync('gh', [
  'api', `repos/${repository}${path ? '/' + path : ''}`,
  ...(body ? ['--method', 'POST', '--input', '-'] : []),
], { input: body ? JSON.stringify(body) : undefined, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024, windowsHide: true }));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const uploadBlob = bytes => new Promise((resolveUpload, rejectUpload) => {
  const child = execFile('gh', ['api', `repos/${repository}/git/blobs`, '--method', 'POST', '--input', '-'],
    { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024, windowsHide: true, timeout: 60000 },
    (error, stdout) => {
      if (error) return rejectUpload(new Error('GitHub blob upload failed; reference publication was not attempted.'));
      try { resolveUpload(JSON.parse(stdout)); } catch { rejectUpload(new Error('Invalid GitHub blob response.')); }
    });
  child.stdin.on('error', rejectUpload);
  child.stdin.end(JSON.stringify({ content: bytes.toString('base64'), encoding: 'base64' }));
});
const blobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const excluded = new Set(['_seo_rewrite_resources.py', 'continue.md']);
const local = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
const files = [...new Set(local)].filter(path => !excluded.has(path) && existsSync(path)
  && !path.startsWith('.playwright-cli/') && !path.startsWith('output/')
  && !path.startsWith('.github/workflows/') && (!path.startsWith('.env') || path === '.env.example'));
if (!api('').private) throw Error('Review repository must remain private.');
if (api('git/ref/heads/main').object.sha !== mainBaseline) throw Error('Main changed; review the new baseline before publication.');
const base = api(`git/trees/${parent}?recursive=1`);
if (base.truncated) throw Error('Cannot verify a truncated base tree.');
const old = new Map(base.tree.filter(entry => entry.type === 'blob').map(entry => [entry.path, entry]));
const lfsPath = path => ['assets/source-project-photos/originals/', 'assets/brand/source/', 'public/images/projects/generated/'].some(prefix => path.startsWith(prefix));
const changed = [];
for (const path of files) {
  let bytes = readFileSync(path);
  const sourceHash = sha256(bytes);
  if (lfsPath(path)) {
    bytes = Buffer.from(`version https://git-lfs.github.com/spec/v1\noid sha256:${sourceHash}\nsize ${bytes.length}\n`);
    if (old.get(path)?.sha !== blobSha(bytes)) throw Error('New LFS object requires separate verified upload: ' + path);
  } else if (/\.(?:[cm]?[jt]sx?|json|ya?ml|mdx?|astro|css|py|toml|txt|sh|ps1|svg)$/.test(path) || ['.gitignore', '.gitattributes', '.env.example'].includes(path)) {
    bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    // Bounded guard, not a comprehensive secret audit. Never print a matched value.
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bsk-proj-[A-Za-z0-9_-]{30,}/.test(bytes.toString())) throw Error('Credential-pattern review required: ' + path);
  }
  const sha = blobSha(bytes);
  if (old.get(path)?.sha !== sha) changed.push({ path, mode: old.get(path)?.mode ?? '100644', type: 'blob', sha, bytes, sourceHash });
}
mkdirSync(output, { recursive: true });
const manifest = { repository, branch, parent, mainBaseline, filesChecked: files.length, changed: changed.map(({ path, sha, bytes, sourceHash }) => ({ path, sha, bytes: bytes.length, sourceHash })), preservesRemoteOnlyFiles: true, deletes: [], uploadBytes: changed.reduce((sum, entry) => sum + entry.bytes.length, 0) };
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ branch, filesChecked: files.length, changed: changed.length, uploadBytes: manifest.uploadBytes, deletions: 0 }));
if (!publish) process.exit(0);
if (existsSync(resolve(output, 'published.json'))) throw Error('Checkpoint already published; do not duplicate.');
// No source file may change between preparation and publishing.
for (const entry of changed) if (sha256(readFileSync(entry.path)) !== entry.sourceHash) throw Error('Source changed: ' + entry.path);
let nextUpload = 0;
let completedUploads = 0;
await Promise.all(Array.from({ length: Math.min(3, changed.length) }, async () => {
  while (nextUpload < changed.length) {
    const entry = changed[nextUpload++];
    const result = await uploadBlob(entry.bytes);
    if (result.sha !== entry.sha) throw Error('Uploaded blob mismatch: ' + entry.path);
    completedUploads++;
    if (completedUploads % 20 === 0) console.log(JSON.stringify({ verifiedBlobs: completedUploads, total: changed.length }));
  }
}));
const tree = api('git/trees', { base_tree: base.sha, tree: changed.map(({ path, mode, type, sha }) => ({ path, mode, type, sha })) });
const verification = api(`git/trees/${tree.sha}?recursive=1`);
const intended = new Map(old);
for (const entry of changed) intended.set(entry.path, entry);
const actual = new Map(verification.tree.filter(entry => entry.type === 'blob').map(entry => [entry.path, entry]));
if (verification.truncated || actual.size !== intended.size || [...intended].some(([path, entry]) => actual.get(path)?.sha !== entry.sha)) throw Error('Full remote tree verification failed.');
const commit = api('git/commits', { message: 'feat: readable cinematic journey and private review evidence', tree: tree.sha, parents: [parent] });
api('git/refs', { ref: `refs/heads/${branch}`, sha: commit.sha });
if (api(`git/ref/heads/${branch}`).object.sha !== commit.sha || api('git/ref/heads/main').object.sha !== mainBaseline) throw Error('Remote reference verification failed.');
const result = { repository, branch, commit: commit.sha, parent, tree: tree.sha, changedFiles: changed.length, fullTreeVerified: true, mainUnchanged: true, deployment: false };
writeFileSync(resolve(output, 'published.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
