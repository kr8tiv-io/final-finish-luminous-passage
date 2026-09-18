/**
 * Colour plate for the Act 3 2.5D stair (Step 20, option B).
 *
 * Source: `public/images/brand/pearl-stair-v2.jpg` (1672 x 941) — the approved
 * pearl stair still. `EXPERIENCE-STORYBOARD.md` §5 asks for a 2x upscale of at
 * least 3344 px so the `stair-dolly` can push in without the plate going soft,
 * plus a phone rung.
 *
 * Outputs
 *   assets/stair/pearl-stair-v2-2x.jpg          3344 x 1882, lanczos3, the master
 *   assets/stair/pearl-stair-v2-1024.jpg        1024 wide, the phone master
 *   public/images/brand/stair/pearl-stair-v2-2048.{webp,jpg}   desktop web rung
 *   public/images/brand/stair/pearl-stair-v2-1024.{webp,jpg}   phone web rung
 *
 * The web rungs are cut from the 2x master, not from the original, so the runtime
 * plate and the depth map share one resampling history. Their pixel height is the
 * single `plateHeight()` function below, which `scripts/build-stair-depth.mjs`
 * imports — a depth map one row taller than its colour map is a sub-pixel shear
 * across the whole picture, and the two scripts must not each round it themselves.
 *
 * No retouching, no generative fill, no new footage: this is a resample of an
 * owned file (CLAUDE.md B6).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const STAIR_SOURCE = resolve(root, 'public/images/brand/pearl-stair-v2.jpg');
export const SOURCE_WIDTH = 1672;
export const SOURCE_HEIGHT = 941;

/** One rounding rule for every rung, shared with the depth builder. */
export const plateHeight = (width) => Math.round((width * SOURCE_HEIGHT) / SOURCE_WIDTH);

export const RUNGS = Object.freeze([
  Object.freeze({ width: 2048, tag: '2048' }),
  Object.freeze({ width: 1024, tag: '1024' }),
]);

const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

async function main() {
  const meta = await sharp(STAIR_SOURCE).metadata();
  if (meta.width !== SOURCE_WIDTH || meta.height !== SOURCE_HEIGHT) {
    throw new Error(`Stair still changed: expected ${SOURCE_WIDTH}x${SOURCE_HEIGHT}, got ${meta.width}x${meta.height}`);
  }

  const assetsDir = resolve(root, 'assets/stair');
  const webDir = resolve(root, 'public/images/brand/stair');
  mkdirSync(assetsDir, { recursive: true });
  mkdirSync(webDir, { recursive: true });

  const masterWidth = SOURCE_WIDTH * 2;
  const master = resolve(assetsDir, 'pearl-stair-v2-2x.jpg');
  await sharp(STAIR_SOURCE)
    .resize({ width: masterWidth, height: plateHeight(masterWidth), kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(master);

  const phoneMaster = resolve(assetsDir, 'pearl-stair-v2-1024.jpg');
  await sharp(master)
    .resize({ width: 1024, height: plateHeight(1024), kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(phoneMaster);

  const written = [{ file: master }, { file: phoneMaster }];
  for (const { width, tag } of RUNGS) {
    const height = plateHeight(width);
    const webp = resolve(webDir, `pearl-stair-v2-${tag}.webp`);
    const jpg = resolve(webDir, `pearl-stair-v2-${tag}.jpg`);
    await sharp(master).resize({ width, height, kernel: sharp.kernel.lanczos3, fit: 'fill' }).webp({ quality: 82 }).toFile(webp);
    await sharp(master).resize({ width, height, kernel: sharp.kernel.lanczos3, fit: 'fill' }).jpeg({ quality: 86, mozjpeg: true }).toFile(jpg);
    written.push({ file: webp }, { file: jpg });
  }

  const rows = [];
  for (const { file } of written) {
    const info = await sharp(file).metadata();
    rows.push({
      file: file.replace(root, '').replace(/\\/g, '/').replace(/^\//, ''),
      width: info.width,
      height: info.height,
      bytes: statSync(file).size,
      sha256: digest(file),
    });
  }

  const masterMeta = await sharp(master).metadata();
  console.log(JSON.stringify({
    source: { file: 'public/images/brand/pearl-stair-v2.jpg', width: meta.width, height: meta.height, sha256: digest(STAIR_SOURCE) },
    kernel: 'lanczos3',
    gates: {
      masterAtLeast3344Wide: { width: masterMeta.width, pass: masterMeta.width >= 3344 },
      aspectPreserved: {
        source: Number((SOURCE_WIDTH / SOURCE_HEIGHT).toFixed(5)),
        master: Number((masterMeta.width / masterMeta.height).toFixed(5)),
        pass: Math.abs(SOURCE_WIDTH / SOURCE_HEIGHT - masterMeta.width / masterMeta.height) < 0.002,
      },
    },
    files: rows,
  }, null, 2));
}

if (existsSync(STAIR_SOURCE) && process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
