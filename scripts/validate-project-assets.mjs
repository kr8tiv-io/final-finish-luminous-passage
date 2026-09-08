import sharp from 'sharp';
import { access, readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const exists = async (path) => access(path).then(() => true).catch(() => false);
const runtimeFlag = process.argv.indexOf('--runtime-root');
const runtimeArgument = runtimeFlag >= 0 ? process.argv[runtimeFlag + 1] : undefined;
const runtimeRoot = runtimeArgument || 'public/images/projects/generated';
const manifestFlag = process.argv.indexOf('--manifest');
const manifestArgument = manifestFlag >= 0 ? process.argv[manifestFlag + 1] : undefined;
const manifestPath = manifestArgument || 'src/data/project-photo-pairs.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const expectedByDirectory = { avif: new Set(), webp: new Set(), jpeg: new Set(), thumbnails: new Set() };
let decoded = 0;

expect(runtimeFlag < 0 || Boolean(runtimeArgument), '--runtime-root requires a path');
const runtimeEntries = await readdir(runtimeRoot).catch(() => []);
expect(runtimeEntries.length === 4 && ['avif', 'webp', 'jpeg', 'thumbnails'].every((directory) => runtimeEntries.includes(directory)), `${runtimeRoot}: runtime root must contain only the four generated directories`);

expect(manifest.assetCount === 96, `expected assetCount=96, got ${manifest.assetCount}`);
expect(manifest.assets.length === 96, `expected 96 manifest assets, got ${manifest.assets.length}`);
expect(manifest.approvalRequired === true, 'manifest approvalRequired must be true');
expect(manifest.source.collectedAt === '2026-08-31T08:12:16.197Z', 'collectedAt must remain deterministic');
expect(/optimized public JPEG/i.test(manifest.source.runtimeFallbackPolicy), 'runtime fallback policy must name optimized public JPEG');
expect(!manifest.assets.some((asset) => Object.values(asset.variants).some((path) => path.includes('assets/source-project-photos'))), 'archival paths must not be runtime variants');
expect(manifest.pairCandidates.every((group) => group.assetIds.length > 0), 'every candidate group must be nonempty');
expect(manifest.curatedPairCandidates.every((pair) => pair.approvalRequired === true), 'curated candidates must require approval');

for (const asset of manifest.assets) {
  expect(asset.approvalRequired === true, `${asset.id}: approvalRequired must be true`);
  expect(asset.archivePath.startsWith('assets/source-project-photos/originals/'), `${asset.id}: archive path is outside archival directory`);
  expect(!asset.archivePath.startsWith('public/'), `${asset.id}: archive path must not be public`);
  const archive = asset.archivePath;
  expect(await exists(archive), `${asset.id}: missing archive ${archive}`);
  const sourceMetadata = await sharp(archive).metadata();
  const swap = [5, 6, 7, 8].includes(sourceMetadata.orientation);
  const sourceWidth = swap ? sourceMetadata.height : sourceMetadata.width;
  const sourceHeight = swap ? sourceMetadata.width : sourceMetadata.height;
  for (const [directory, path] of Object.entries({ avif: asset.variants.avif, webp: asset.variants.webp, jpeg: asset.variants.jpeg, thumbnails: asset.variants.thumbnail })) {
    const expectedPrefix = `/images/projects/generated/${directory}/`;
    const expectedPath = `${expectedPrefix}${basename(path)}`;
    expect(path === expectedPath, `${asset.id}: ${directory} path must be canonical (${expectedPath})`);
    const relativePath = path.startsWith(expectedPrefix) ? path.slice(expectedPrefix.length) : '';
    const file = join(runtimeRoot, directory, relativePath);
    expect(await exists(file), `${asset.id}: missing ${directory} ${file}`);
    if (await exists(file)) {
      const metadata = await sharp(file).metadata(); decoded += 1;
      const ratioDrift = Math.abs((metadata.width / metadata.height) - (sourceWidth / sourceHeight));
      expect(ratioDrift <= 0.002, `${asset.id}: ${directory} ratio drift ${ratioDrift}`);
      if (directory === 'thumbnails') expect(metadata.width <= 640 && metadata.height <= 480, `${asset.id}: thumbnail exceeds 640x480`);
      if (directory !== 'thumbnails') expect(metadata.width <= (directory === 'jpeg' ? 2000 : 2400) && metadata.height <= (directory === 'jpeg' ? 2000 : 2400), `${asset.id}: ${directory} exceeds max dimensions`);
    }
    expectedByDirectory[directory].add(basename(path));
  }
}
for (const [directory, expected] of Object.entries(expectedByDirectory)) {
  const actual = new Set(await readdir(join(runtimeRoot, directory)).catch(() => []));
  expect(actual.size === 96, `${directory}: expected 96 files, got ${actual.size}`);
  expect([...expected].every((file) => actual.has(file)), `${directory}: manifest references missing generated file`);
  expect([...actual].every((file) => expected.has(file)), `${directory}: stale, .tmp, or unexpected generated file detected`);
}
expect(!(await exists('public/images/projects/originals')), 'public must not contain archival originals');
const projectEntries = await readdir('public/images/projects').catch(() => []);
expect(!projectEntries.some((file) => file.startsWith('generated.backup-')), 'public must not contain generated backup trees');
expect(manifest.assets.every((asset) => !asset.variants.fallback || asset.variants.fallback.startsWith('/images/projects/generated/jpeg/')), 'fallbacks must point to public JPEG derivatives');
if (failures.length) { console.error(JSON.stringify({ failures }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ assetCount: manifest.assetCount, decodedPaths: decoded, candidateGroups: manifest.pairCandidates.length, curatedPairCandidates: manifest.curatedPairCandidates.length, staleFiles: 0 }, null, 2));
