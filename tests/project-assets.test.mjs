import assert from 'node:assert/strict';
import { access, link, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import manifest from '../src/data/project-photo-pairs.json' with { type: 'json' };

const runtimeVariants = ['avif', 'webp', 'jpeg', 'thumbnail'];
const pathExists = (path) => access(path).then(() => true).catch(() => false);
const runNode = (script, args = [], options = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, output }));
});
const runValidator = (args = []) => runNode('scripts/validate-project-assets.mjs', args);
const hardlinkRuntimeTree = async (source, destination) => {
  await mkdir(destination, { recursive: true });
  for (const directory of ['avif', 'webp', 'jpeg', 'thumbnails']) {
    const sourceDirectory = `${source}/${directory}`;
    const destinationDirectory = `${destination}/${directory}`;
    await mkdir(destinationDirectory, { recursive: true });
    for (const file of await readdir(sourceDirectory)) await link(`${sourceDirectory}/${file}`, `${destinationDirectory}/${file}`);
  }
};

test('manifest contains the expected sourced inventory', () => {
  assert.equal(manifest.assetCount, 96);
  assert.equal(manifest.assets.length, 96);
  assert.equal(manifest.source.collectedAt, '2026-08-31T08:12:16.197Z');
  assert.equal(manifest.approvalRequired, true);
});

test('all candidate groups and curated pairs are nonempty and approval gated', () => {
  assert.ok(manifest.pairCandidates.every((group) => group.assetIds.length > 0));
  assert.equal(manifest.pairCandidates.length, 12);
  assert.equal(manifest.curatedPairCandidates.length, 6);
  assert.ok(manifest.curatedPairCandidates.every((pair) => pair.beforeAssetIds.length && pair.afterAssetIds.length && pair.approvalRequired));
  assert.ok(manifest.assets.every((asset) => asset.approvalRequired));
});

test('every runtime variant and archive source exists and decodes', async () => {
  for (const asset of manifest.assets) {
    assert.equal(await pathExists(asset.archivePath), true, asset.archivePath);
    for (const variant of runtimeVariants) {
      const path = asset.variants[variant];
      assert.match(path, /^\/images\/projects\/generated\/(avif|webp|jpeg|thumbnails)\//);
      const file = `public${path}`;
      assert.equal(await pathExists(file), true, file);
      await sharp(file).metadata();
    }
  }
});

test('deploy payload excludes archival originals and stale derivatives', async () => {
  assert.equal(await pathExists('public/images/projects/originals'), false);
  for (const [directory, extension] of [['avif', '.avif'], ['webp', '.webp'], ['jpeg', '.jpg'], ['thumbnails', '.webp']]) {
    const files = (await readdir(`public/images/projects/generated/${directory}`)).filter((file) => file.endsWith(extension));
    assert.equal(files.length, 96, directory);
  }
  assert.match(manifest.source.runtimeFallbackPolicy, /optimized public JPEG/);
  assert.match(manifest.source.runtimeFallbackPolicy, /never runtime fallbacks/);
  assert.ok(manifest.assets.every((asset) => asset.archivePath.startsWith('assets/source-project-photos/')));
});

test('strict validator rejects unexpected and temporary derivative files', async () => {
  const unexpected = 'public/images/projects/generated/avif/.validation-unexpected.tmp';
  await writeFile(unexpected, 'fixture');
  try {
    const result = await runValidator();
    assert.notEqual(result.code, 0);
    assert.match(result.output, /stale, \.tmp, or unexpected generated file detected/);
  } finally {
    await rm(unexpected, { force: true });
  }
});

test('validator rejects a nested non-canonical manifest URL', async () => {
  const fixture = `.asset-staging/manifest-fixture-${randomUUID()}.json`;
  const nestedManifest = structuredClone(manifest);
  nestedManifest.assets[0].variants.avif = `/images/projects/generated/avif/nested/${nestedManifest.assets[0].id}.avif`;
  await mkdir('.asset-staging', { recursive: true });
  await writeFile(fixture, `${JSON.stringify(nestedManifest)}\n`, 'utf8');
  try {
    const result = await runValidator(['--manifest', fixture]);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /path must be canonical/);
  } finally {
    await rm(fixture, { force: true });
  }
});

test('generator recovers an interrupted promotion from its owned backup', async () => {
  const marker = '.asset-staging/project-variants-transaction.json';
  const transactionId = `test-recovery-${randomUUID().slice(0, 8)}`;
  const backup = `.asset-staging/generated-backup-${transactionId}`;
  const stage = `.asset-staging/project-variants-${transactionId}`;
  const output = `.asset-staging/test-output-${transactionId}/generated`;
  await mkdir('.asset-staging', { recursive: true });
  await rm(marker, { force: true });
  await rm(backup, { recursive: true, force: true });
  await rm(stage, { recursive: true, force: true });
  await hardlinkRuntimeTree('public/images/projects/generated', backup);
  assert.equal(await pathExists(`${backup}/thumbnails/photo+2025-07-27,+10+51+35+am.webp`), true);
  const copiedValidation = await runValidator(['--runtime-root', backup]);
  assert.equal(copiedValidation.code, 0, copiedValidation.output);
  await writeFile(marker, `${JSON.stringify({ version: 1, transactionId, outputRoot: output, stageRoot: stage, backupRoot: backup, phase: 'backup-moved' })}\n`, 'utf8');
  try {
    const result = await runNode('scripts/generate-project-variants.mjs', ['--recover-only'], { env: { ...process.env, PROJECT_ASSET_OUTPUT_ROOT: output } });
    assert.equal(result.code, 0, result.output);
    assert.equal(await pathExists(output), true);
    assert.equal(await pathExists(backup), false);
    assert.equal(await pathExists(marker), false);
  } finally {
    await rm(output, { recursive: true, force: true });
    await rm(`.asset-staging/test-output-${transactionId}`, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    await rm(marker, { force: true });
    await rm(stage, { recursive: true, force: true });
  }
});

test('committed output survives partial backup cleanup and refuses unsafe recovery', async () => {
  const marker = '.asset-staging/project-variants-transaction.json';
  const transactionId = `test-cleanup-${randomUUID().slice(0, 8)}`;
  const backup = `.asset-staging/generated-backup-${transactionId}`;
  const stage = `.asset-staging/project-variants-${transactionId}`;
  const output = `.asset-staging/test-output-${transactionId}/generated`;
  await mkdir('.asset-staging', { recursive: true });
  await rm(marker, { force: true });
  await rm(backup, { recursive: true, force: true });
  await rm(stage, { recursive: true, force: true });
  await rm(`.asset-staging/test-output-${transactionId}`, { recursive: true, force: true });
  await hardlinkRuntimeTree('public/images/projects/generated', output);
  await hardlinkRuntimeTree('public/images/projects/generated', backup);
  const damagedFile = `${backup}/avif/${(await readdir('public/images/projects/generated/avif'))[0]}`;
  await rm(damagedFile, { force: true });
  await writeFile(marker, `${JSON.stringify({ version: 1, transactionId, outputRoot: output, stageRoot: stage, backupRoot: backup, phase: 'cleanup-pending' })}\n`, 'utf8');
  try {
    const result = await runNode('scripts/generate-project-variants.mjs', ['--recover-only'], { env: { ...process.env, PROJECT_ASSET_OUTPUT_ROOT: output } });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /refusing unresolved asset transaction/);
    const outputValidation = await runValidator(['--runtime-root', output]);
    assert.equal(outputValidation.code, 0, outputValidation.output);
    assert.equal(await pathExists(output), true);
    assert.equal(await pathExists(backup), true);
    assert.equal(await pathExists(marker), true);
  } finally {
    await rm(`.asset-staging/test-output-${transactionId}`, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    await rm(marker, { force: true });
    await rm(stage, { recursive: true, force: true });
  }
});

test('generator refuses an unowned backup instead of silently deploying it', async () => {
  const foreign = `.asset-staging/generated-backup-foreign-${randomUUID()}`;
  await mkdir(foreign, { recursive: true });
  try {
    const result = await runNode('scripts/generate-project-variants.mjs', ['--recover-only']);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /unowned asset backup/);
  } finally {
    await rm(foreign, { recursive: true, force: true });
  }
});
