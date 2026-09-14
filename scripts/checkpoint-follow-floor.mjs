import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, open, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Recoverable source/media checkpoint when this Windows checkout cannot write
// Git objects. No commits, hooks, resets, file deletion or credential reads.
const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(root, 'output', 'checkpoints', stamp);
const names = [...new Set([
  ...git('diff', '--name-only', 'HEAD', '-z').split('\0'),
  ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
].filter(Boolean))].sort();
if (names.length > 3000) throw new Error('Unexpected checkpoint scope; review before copying.');
await mkdir(destination, { recursive: true });
const files = [];
for (const name of names) {
  const source = path.resolve(root, name);
  const relative = path.relative(root, source);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).includes('.git')) throw new Error('Invalid checkpoint path.');
  let info;
  try { info = await stat(source); } catch { files.push({ path: name, deleted: true }); continue; }
  if (!info.isFile()) continue;
  const target = path.join(destination, 'files', relative);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  const bytes = await readFile(target);
  files.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
// Media patches can exceed Node's buffered child-process limit. Stream Git's
// stdout directly to the checkpoint file, retaining bounded stderr reporting.
const patch = await open(path.join(destination, 'tracked.patch'), 'wx');
try {
  execFileSync('git', ['diff', 'HEAD', '--binary', '--no-ext-diff'], {
    cwd: root, stdio: ['ignore', patch.fd, 'pipe'], windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
} finally { await patch.close(); }
await writeFile(path.join(destination, 'checkpoint.json'), JSON.stringify({
  capturedAt: new Date().toISOString(), baseCommit: git('rev-parse', 'HEAD').trim(),
  branch: git('branch', '--show-current').trim(), root, files,
  note: 'Working-tree checkpoint, not a Git commit. Source media and user changes are preserved.',
}, null, 2));
console.log(JSON.stringify({ destination, files: files.length, bytes: files.reduce((sum, file) => sum + (file.bytes || 0), 0) }));
