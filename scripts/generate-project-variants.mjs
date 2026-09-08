import sharp from 'sharp';
import { access, mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const sourceDir = 'assets/source-project-photos/originals';
const outputRoot = process.env.PROJECT_ASSET_OUTPUT_ROOT || 'public/images/projects/generated';
const projectRoot = dirname(outputRoot);
const stagingParent = '.asset-staging';
const transactionMarker = join(stagingParent, 'project-variants-transaction.json');
const outputDirs = ['avif', 'webp', 'jpeg', 'thumbnails'];
const backupPrefix = 'generated-backup-';
const stagePrefix = 'project-variants-';

const pathExists = async (path) => access(path).then(() => true).catch(() => false);
const directoryExists = async (path) => readdir(path).then(() => true).catch(() => false);
const atomicWriteJson = async (path, value) => {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
};

const runValidation = (runtimeRoot) => new Promise((fulfill, reject) => {
  const child = spawn(process.execPath, ['scripts/validate-project-assets.mjs', '--runtime-root', resolve(runtimeRoot)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) return fulfill(stdout.trim());
    reject(new Error(`asset validation failed (exit ${code})\n${stdout}${stderr}`));
  });
});

const isOwnedTransactionPath = (path, prefix) => {
  if (typeof path !== 'string' || path.includes('..') || isAbsolute(path)) return false;
  const normalizedPath = normalize(path);
  const normalizedPrefix = normalize(join(stagingParent, prefix));
  return normalizedPath.startsWith(normalizedPrefix) && normalizedPath.length > normalizedPrefix.length;
};

const recoverInterruptedTransaction = async () => {
  await mkdir(stagingParent, { recursive: true });
  const projectEntries = await readdir(projectRoot).catch(() => []);
  const legacyBackups = projectEntries.filter((file) => file.startsWith(`${basename(outputRoot)}.backup-`));
  if (legacyBackups.length) throw new Error(`refusing to run with unowned backup tree(s) under public: ${legacyBackups.join(', ')}`);

  if (!(await pathExists(transactionMarker))) {
    const stagingEntries = await readdir(stagingParent).catch(() => []);
    const unownedBackups = stagingEntries.filter((file) => file.startsWith(backupPrefix));
    if (unownedBackups.length) throw new Error(`refusing to run with unowned asset backup tree(s): ${unownedBackups.join(', ')}`);
    return;
  }

  let marker;
  try {
    marker = JSON.parse(await readFile(transactionMarker, 'utf8'));
  } catch (error) {
    throw new Error(`refusing to run with unreadable transaction marker: ${error.message}`);
  }
  const markerValid = marker?.version === 1
    && typeof marker.transactionId === 'string'
    && /^[a-z0-9-]+$/i.test(marker.transactionId)
    && marker.outputRoot === outputRoot
    && isOwnedTransactionPath(marker.stageRoot, stagePrefix)
    && isOwnedTransactionPath(marker.backupRoot, backupPrefix)
    && normalize(marker.stageRoot) === normalize(join(stagingParent, `${stagePrefix}${marker.transactionId}`))
    && normalize(marker.backupRoot) === normalize(join(stagingParent, `${backupPrefix}${marker.transactionId}`));
  if (!markerValid) throw new Error('refusing to run with foreign or malformed asset transaction marker');

  const outputPresent = await directoryExists(outputRoot);
  const backupPresent = await directoryExists(marker.backupRoot);
  const validateIfPresent = async (path) => {
    if (!(await directoryExists(path))) return false;
    try {
      await runValidation(path);
      return true;
    } catch { return false; }
  };
  const outputValid = await validateIfPresent(outputRoot);
  const backupValid = await validateIfPresent(marker.backupRoot);

  if (!outputPresent && backupValid) {
    await mkdir(dirname(outputRoot), { recursive: true });
    await rename(marker.backupRoot, outputRoot);
    await rm(marker.stageRoot, { recursive: true, force: true });
    await rm(transactionMarker, { force: true });
    console.log('recovered interrupted asset promotion from owned backup');
    return;
  }
  if (outputValid && !backupPresent) {
    await rm(marker.stageRoot, { recursive: true, force: true });
    await rm(transactionMarker, { force: true });
    return;
  }
  if (outputValid && backupValid) {
    await rm(marker.backupRoot, { recursive: true, force: true });
    await rm(marker.stageRoot, { recursive: true, force: true });
    await rm(transactionMarker, { force: true });
    return;
  }
  throw new Error(`refusing unresolved asset transaction (output=${outputPresent}, backup=${backupPresent}, outputValid=${outputValid}, backupValid=${backupValid})`);
};

const chooseThumbnailSize = (width, height) => {
  const scale = Math.min(1, 640 / width, 480 / height);
  const maxWidth = Math.max(1, Math.round(width * scale));
  const maxHeight = Math.max(1, Math.round(height * scale));
  let best = { width: maxWidth, height: maxHeight, drift: Math.abs(maxWidth / maxHeight - width / height) };
  for (let targetWidth = maxWidth; targetWidth > 0; targetWidth -= 1) {
    const targetHeight = Math.max(1, Math.round(targetWidth * height / width));
    if (targetHeight > maxHeight) continue;
    const drift = Math.abs(targetWidth / targetHeight - width / height);
    if (drift < best.drift || (drift === best.drift && targetWidth * targetHeight > best.width * best.height)) best = { width: targetWidth, height: targetHeight, drift };
  }
  return best;
};

await recoverInterruptedTransaction();
if (process.argv.includes('--recover-only')) process.exit(0);

const sourceFiles = (await readdir(sourceDir)).filter((file) => /\.(jpe?g|png|webp|avif)$/i.test(file)).sort();
const stagedRoot = await mkdtemp(join(stagingParent, stagePrefix));
const transactionId = basename(stagedRoot).slice(stagePrefix.length);
const backupRoot = join(stagingParent, `${backupPrefix}${transactionId}`);
const updateMarker = (phase) => atomicWriteJson(transactionMarker, { version: 1, transactionId, outputRoot, stageRoot: stagedRoot, backupRoot, phase });

const promoteWithRollback = async () => {
  let previousMoved = false;
  let promoted = false;
  try {
    await updateMarker('prepared');
    if (await directoryExists(outputRoot)) {
      await rename(outputRoot, backupRoot);
      previousMoved = true;
      await updateMarker('backup-moved');
      if (process.env.PROJECT_ASSET_TEST_INTERRUPT_AFTER_BACKUP === '1') process.exit(97);
    }
    await rename(stagedRoot, outputRoot);
    promoted = true;
    await updateMarker('promoted');
  } catch (error) {
    if (!promoted) {
      if (await directoryExists(outputRoot) && previousMoved) await rm(outputRoot, { recursive: true, force: true });
      if (previousMoved && await directoryExists(backupRoot)) await rename(backupRoot, outputRoot);
      await rm(transactionMarker, { force: true });
    }
    throw error;
  }
  try {
    await updateMarker('cleanup-pending');
    if (previousMoved) {
      if (process.env.PROJECT_ASSET_TEST_FAIL_BACKUP_CLEANUP === '1') throw new Error('simulated backup cleanup failure');
      await rm(backupRoot, { recursive: true, force: true });
    }
    await rm(transactionMarker, { force: true });
  } catch (error) {
    throw new Error(`asset promotion committed; backup cleanup is pending and transaction marker was retained: ${error.message}`);
  }
};

try {
  for (const directory of outputDirs) await mkdir(join(stagedRoot, directory), { recursive: true });
  let completed = 0;
  for (const file of sourceFiles) {
    const stem = basename(file, extname(file));
    const source = sharp(join(sourceDir, file));
    const metadata = await source.metadata();
    const swap = [5, 6, 7, 8].includes(metadata.orientation);
    const width = swap ? metadata.height : metadata.width;
    const height = swap ? metadata.width : metadata.height;
    const thumbnail = chooseThumbnailSize(width, height);
    const targets = [
      ['avif', `${stem}.avif`, source.clone().rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).avif({ quality: 62, effort: 5 })],
      ['webp', `${stem}.webp`, source.clone().rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76, smartSubsample: true })],
      ['jpeg', `${stem}.jpg`, source.clone().rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true, progressive: true })],
      ['thumbnails', `${stem}.webp`, source.clone().rotate().resize({ width: thumbnail.width, height: thumbnail.height, fit: 'fill' }).webp({ quality: 78 })],
    ];
    for (const [directory, output, pipeline] of targets) {
      const temporary = join(stagedRoot, directory, `${output}.tmp`);
      await pipeline.toFile(temporary);
      await rename(temporary, join(stagedRoot, directory, output));
    }
    completed += 1;
  }
  const validation = await runValidation(stagedRoot);
  await promoteWithRollback();
  console.log(`generated ${completed}/${sourceFiles.length} source variants`);
  console.log(`staged validation: ${validation}`);
} finally {
  await rm(stagedRoot, { recursive: true, force: true });
}
