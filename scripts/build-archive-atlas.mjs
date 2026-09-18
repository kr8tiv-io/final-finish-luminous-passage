/**
 * Act 6's archive lattice reads all 96 project thumbnails as ONE texture.
 *
 * Ninety-six separate <img> requests is the thing the act cannot afford: the
 * storyboard budgets the lattice at a 2048 px atlas on phones and lists atlas
 * memory as Act 6's headline risk. So both rungs are packed here, with a UV
 * table that names every tile.
 *
 * ORDER IS THE PAGE'S ORDER. Tiles are laid out by `sourcePageOrder` from
 * `src/data/project-photo-pairs.json`, so the lattice reads in the same
 * sequence as finalfinishepoxy.ca/projects. `approvalRequired` rides along on
 * every entry because Act 6 renders unapproved tiles at 60% opacity with no
 * caption (storyboard §6) — the atlas must carry that fact, not re-derive it.
 *
 * KTX2 IS OUT OF SCOPE for this wave. The storyboard's eventual target is
 * `archive-atlas-4096.ktx2`; that needs a Basis/KTX2 toolchain this repo does
 * not carry yet, so these are WebP and the ledger records the gap.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'src/data/project-photo-pairs.json');
const thumbnailRoot = resolve(root, 'public/images/projects/generated/thumbnails');
const outputRoot = resolve(root, 'public/images/projects/atlas');

const COLUMNS = 12, ROWS = 8;
const RUNGS = [
  { name: 'archive-atlas-4096', tile: [320, 240], quality: 82 },
  { name: 'archive-atlas-2048', tile: [160, 120], quality: 80 },
];

const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.assets.length !== COLUMNS * ROWS) throw new Error(`Grid is ${COLUMNS}x${ROWS} = ${COLUMNS * ROWS}; manifest has ${manifest.assets.length} assets`);

// Page order is the layout order. A duplicate or a gap would silently shuffle
// the lattice, so both are refused rather than sorted around.
const ordered = [...manifest.assets].sort((a, b) => a.sourcePageOrder - b.sourcePageOrder);
const seen = new Set(ordered.map((asset) => asset.sourcePageOrder));
if (seen.size !== ordered.length) throw new Error('sourcePageOrder has duplicates');
for (const [index, asset] of ordered.entries()) {
  if (asset.sourcePageOrder !== index) throw new Error(`sourcePageOrder is not dense: expected ${index}, got ${asset.sourcePageOrder} (${asset.id})`);
}

mkdirSync(outputRoot, { recursive: true });
const rungs = [];
for (const { name, tile, quality } of RUNGS) {
  const [tileWidth, tileHeight] = tile;
  const width = COLUMNS * tileWidth, height = ROWS * tileHeight;
  const composites = [];
  for (const [index, asset] of ordered.entries()) {
    const file = resolve(thumbnailRoot, asset.variants.thumbnail.split('/').pop());
    composites.push({
      input: await sharp(file).resize(tileWidth, tileHeight, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).removeAlpha().toBuffer(),
      left: (index % COLUMNS) * tileWidth,
      top: Math.floor(index / COLUMNS) * tileHeight,
    });
  }
  const file = resolve(outputRoot, `${name}.webp`);
  await sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite(composites).webp({ quality, effort: 6 }).toFile(file);
  rungs.push({ name, file, width, height, tileWidth, tileHeight, bytes: statSync(file).size, sha256: digest(file) });
  process.stdout.write(`${name}.webp: ${width}x${height}, ${COLUMNS}x${ROWS} tiles of ${tileWidth}x${tileHeight}, ${Math.round(statSync(file).size / 1024)} KiB\n`);
}

const base = rungs[0];
const tiles = ordered.map((asset, index) => {
  const column = index % COLUMNS, row = Math.floor(index / COLUMNS);
  const x = column * base.tileWidth, y = row * base.tileHeight;
  return {
    id: asset.id,
    sourcePageOrder: asset.sourcePageOrder,
    index, column, row,
    approvalRequired: asset.approvalRequired,
    thumbnail: asset.variants.thumbnail,
    // GL convention: origin bottom-left, v increasing upward. Feed straight
    // into a three.js Texture as offset = [u, v] and repeat = [w, h].
    uv: {
      u: x / base.width,
      v: 1 - (y + base.tileHeight) / base.height,
      w: base.tileWidth / base.width,
      h: base.tileHeight / base.height,
    },
    // DOM/canvas convention: origin top-left, pixels in the 4096-rung atlas.
    pixel: { x, y, w: base.tileWidth, h: base.tileHeight },
  };
});

const atlas = {
  version: 1,
  generatedBy: 'scripts/build-archive-atlas.mjs',
  source: { manifest: 'src/data/project-photo-pairs.json', thumbnails: '/images/projects/generated/thumbnails/', fit: 'cover', position: 'centre' },
  order: 'sourcePageOrder ascending — the order finalfinishepoxy.ca/projects lists them',
  uvOrigin: 'bottom-left',
  pixelOrigin: 'top-left',
  grid: { columns: COLUMNS, rows: ROWS, count: tiles.length },
  rungs: rungs.map((rung) => ({
    name: rung.name,
    src: `/images/projects/atlas/${rung.name}.webp`,
    width: rung.width, height: rung.height,
    tileWidth: rung.tileWidth, tileHeight: rung.tileHeight,
    bytes: rung.bytes, sha256: rung.sha256,
  })),
  tiles,
};
const atlasJson = resolve(outputRoot, 'archive-atlas.json');
writeFileSync(atlasJson, JSON.stringify(atlas, null, 2) + '\n');

// Prove the table: re-cut each tile out of the written atlas and compare it to
// an independent resize of its own thumbnail. A shifted or transposed grid
// lands on a neighbour's photo and blows straight past this threshold.
const atlasPixels = await sharp(base.file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let worst = { id: null, diff: 0 }, total = 0;
for (const tile of tiles) {
  const expected = await sharp(resolve(thumbnailRoot, tile.thumbnail.split('/').pop()))
    .resize(base.tileWidth, base.tileHeight, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  let sum = 0;
  for (let row = 0; row < base.tileHeight; row++) {
    const atlasOffset = ((tile.pixel.y + row) * base.width + tile.pixel.x) * 3, tileOffset = row * base.tileWidth * 3;
    for (let i = 0; i < base.tileWidth * 3; i++) sum += Math.abs(atlasPixels.data[atlasOffset + i] - expected[tileOffset + i]);
  }
  const diff = sum / (base.tileWidth * base.tileHeight * 3) / 255 * 100;
  total += diff;
  if (diff > worst.diff) worst = { id: tile.id, diff };
}
const mean = total / tiles.length;
// Control: the same comparison against a neighbour's tile, so the number above
// is only meaningful if this one is far larger.
const neighbour = await (async () => {
  const expected = await sharp(resolve(thumbnailRoot, tiles[1].thumbnail.split('/').pop()))
    .resize(base.tileWidth, base.tileHeight, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  let sum = 0;
  for (let row = 0; row < base.tileHeight; row++) {
    const atlasOffset = ((tiles[0].pixel.y + row) * base.width + tiles[0].pixel.x) * 3, tileOffset = row * base.tileWidth * 3;
    for (let i = 0; i < base.tileWidth * 3; i++) sum += Math.abs(atlasPixels.data[atlasOffset + i] - expected[tileOffset + i]);
  }
  return sum / (base.tileWidth * base.tileHeight * 3) / 255 * 100;
})();

process.stdout.write(`archive-atlas.json: ${tiles.length} tiles, ${Math.round(statSync(atlasJson).size / 1024)} KiB\n`);
process.stdout.write(`unapproved tiles (render at 60% opacity): ${tiles.filter((tile) => tile.approvalRequired).length}/${tiles.length}\n`);
process.stdout.write(`UV placement check: mean ${mean.toFixed(3)}%, worst ${worst.diff.toFixed(3)}% (${worst.id})\n`);
process.stdout.write(`  control, tile 0 rect vs tile 1 photo: ${neighbour.toFixed(3)}% — the check above is only a pass because it is far below this\n`);
if (mean > 2) throw new Error(`Atlas tiles do not match their UV rects (mean ${mean.toFixed(3)}%)`);
if (neighbour < mean * 4) throw new Error('Placement check is not discriminating; a wrong grid would pass');
