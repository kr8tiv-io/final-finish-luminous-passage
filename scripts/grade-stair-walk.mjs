/**
 * Pearl grade for the Act 3 walkway film (Step 20, option A).
 *
 * Source: `assets/films/source/epoxy-walkway.mp4` — 1920x1080, 145 frames at 24/1,
 * a real camera walk toward the stair at dusk. `HARVEST.md` keeps it for the stair
 * chapter precisely because it has intentional camera motion; what Matt rejected is
 * the *surface*: a high-contrast speckled terrazzo floor and a warm sodium light
 * patch that fight the pearl/cobalt palette.
 *
 * Target: `assets/films/source/epoxy-walkway-pearl.mp4` — same pixel size, same 145
 * frames, same 24/1 cadence. Nothing here touches timing, framing or geometry, so
 * the walk is byte-for-byte the same move; only the picture is regraded.
 * `scripts/encode-journey-films.mjs --only walkway-pearl` then builds the delivery
 * ladder from this file, exactly as every other film is laddered.
 *
 * ---------------------------------------------------------------------------
 * PARAMETER DELTAS vs `scripts/grade-pearl-pour.mjs` (the approved pour recipe)
 * ---------------------------------------------------------------------------
 * Kept, unchanged:
 *   colorchannelmixer rr=0.70 rg=0.16 rb=0.06 / gr=0.08 gg=1.05 gb=0.15 /
 *                     br=0.12 bg=0.36 bb=0.88
 *     The pour's warm-metallic neutraliser. It is the whole answer to the warm
 *     light patch: measured on the 120x120 block at (1280,680) of frame 60 the
 *     patch goes from R-B = +96.1 (sodium orange) to R-B = -3.8 (pearl-cool).
 *     No second, patch-local correction is needed, so none is applied — a keyed
 *     local grade would have to track the patch as the camera walks.
 *
 * Changed:
 *   eq=saturation  0.52 -> 0.42   The dusk sky is far more saturated than the
 *                                 pour's studio grey; 0.52 left a magenta band
 *                                 over the parapet. 0.42 holds the sky neutral
 *                                 without draining the stone.
 *   eq=contrast    1.02 -> 0.98   The pour is high-key and wanted a touch more
 *                                 snap. This clip's problem is the opposite: the
 *                                 speckle lives in contrast, so the grade gives a
 *                                 little back instead of taking more.
 *   eq=brightness  0.055 -> 0.04  Less lift is needed once gamma is doing the work.
 *   eq=gamma       (absent) -> 1.26
 *                                 NEW. The pour needed no midtone lift; this clip
 *                                 is a night exterior whose floor sits at mean
 *                                 luma 34/255. Gamma 1.26 lifts the midtones to
 *                                 mean 79/255 without clipping the light pool.
 *
 * Added (no counterpart in the pour recipe):
 *   A two-level, depth-aware smoothing of the floor only, composited with
 *   `maskedmerge` against a positional ramp:
 *       level 1  gblur sigma 3.5, ramp opening at  y = 538 + 140*|x-960|/960
 *       level 2  gblur sigma 9,   ramp opening 90 px further down, over 260 px
 *   The ramp is a V that follows the floor/wall junction, so the blur never
 *   reaches the stair: the stair's floor line runs y = 495 (frame 0) to y = 530
 *   (frame 144) at the centre column, measured with a 3-row luma gradient, and
 *   the first ramp opens 8 px below the lowest of those. Two levels rather than
 *   one because the speckle is perspective-scaled — aggregate near the horizon is
 *   a few pixels across and a single large sigma turned the far floor to paste.
 *
 * GATE (printed on every run, computed from real decodes, never asserted blind):
 *   frame count + fps parity with the source; speckle variance on a fixed floor
 *   crop; warm-patch R-B; poster vs a fresh frame-0 extract.
 *
 * "Speckle variance" is the variance of the residual after subtracting a 13x13
 * local mean on the crop. That is the definition that means *texture* rather than
 * *shading*: the raw crop variance also carries the floor's lighting falloff, which
 * the midtone lift multiplies, and which the grade is not trying to remove. The run
 * prints raw variance and a contrast-normalised raw variance too, so the choice is
 * visible rather than hidden, and it prints the same numbers for a colour-only
 * control grade — if the metric were measuring the colour pass instead of the blur,
 * that control would move.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const source = resolve(root, 'assets/films/source/epoxy-walkway.mp4');
const target = resolve(root, 'assets/films/source/epoxy-walkway-pearl.mp4');
const poster = resolve(root, 'public/images/brand/epoxy-walkway-pearl-poster.jpg');
const referencePoster = resolve(root, 'public/images/brand/epoxy-walkway-poster.jpg');
const staging = resolve(root, '.asset-staging/stair-walk');

const SOURCE_FRAMES = 145;
const SOURCE_RATE = '24/1';
/** Fixed floor crop for the speckle gate — pure aggregate, clear of the light pool. */
const SPECKLE_CROP = Object.freeze({ left: 250, top: 820, width: 360, height: 200 });
/** Fixed block over the warm light patch, located by max mean (R-B) on frame 60. */
const WARM_BLOCK = Object.freeze({ left: 1280, top: 680, width: 120, height: 120 });
const GATE_FRAME = 60;

const ramp = (start, span) => `clip((Y-(${start}+140*abs(X-960)/960))*255/${span},0,255)`;
const positionalMask = (start, span) => `geq=r='${ramp(start, span)}':g='${ramp(start, span)}':b='${ramp(start, span)}'`;
const SMOOTH = `format=gbrp,split=3[p0][s1][m1];[s1]gblur=sigma=3.5:steps=2[b1];[m1]${positionalMask(538, 60)}[k1];[p0][b1][k1]maskedmerge,split=3[p1][s2][m2];[s2]gblur=sigma=9:steps=3[b2];[m2]${positionalMask(628, 260)}[k2];[p1][b2][k2]maskedmerge,format=yuv420p`;
const COLOUR = 'colorchannelmixer=rr=0.70:rg=0.16:rb=0.06:gr=0.08:gg=1.05:gb=0.15:br=0.12:bg=0.36:bb=0.88,eq=saturation=0.42:contrast=0.98:brightness=0.04:gamma=1.26';
const FILTER = `${SMOOTH},${COLOUR}`;

const replace = process.argv.includes('--replace');
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function run(command, args, timeout = 600_000) {
  const result = spawnSync(command, args, { windowsHide: true, encoding: 'utf8', timeout });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error?.message}`);
  return result;
}

function probe(file) {
  const args = ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name,r_frame_rate,nb_read_frames,nb_frames,pix_fmt', '-show_entries', 'format=duration', '-of', 'json', file];
  const metadata = JSON.parse(run(ffprobe, args, 120_000).stdout);
  const stream = metadata.streams?.[0] ?? {};
  return {
    width: stream.width,
    height: stream.height,
    codec: stream.codec_name,
    pixFmt: stream.pix_fmt,
    rate: stream.r_frame_rate,
    frames: Number(stream.nb_read_frames || stream.nb_frames),
    duration: Number(metadata.format?.duration),
  };
}

/** Decode one frame of one file into `.asset-staging/stair-walk/`, with an optional extra filter. */
function frameTo(file, index, out, extra = null) {
  if (existsSync(out)) return out;
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', file];
  if (extra) args.push('-filter_complex', `select=eq(n\\,${index}),${extra}`);
  else args.push('-vf', `select=eq(n\\,${index})`);
  args.push('-frames:v', '1', out);
  run(ffmpeg, args, 300_000);
  return out;
}

async function speckleStats(file) {
  const { data, info } = await sharp(file).extract(SPECKLE_CROP).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const radius = 6;
  let total = 0;
  for (const value of data) total += value;
  const mean = total / data.length;
  let rawAccumulator = 0;
  for (const value of data) rawAccumulator += (value - mean) ** 2;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < w; x += 1) {
      rowSum += data[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + rowSum;
    }
  }
  const box = (x0, y0, x1, y1) => integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
  let accumulator = 0;
  let count = 0;
  for (let y = radius; y < h - radius; y += 1) {
    for (let x = radius; x < w - radius; x += 1) {
      const local = box(x - radius, y - radius, x + radius + 1, y + radius + 1) / ((2 * radius + 1) ** 2);
      accumulator += (data[y * w + x] - local) ** 2;
      count += 1;
    }
  }
  const rawVariance = rawAccumulator / data.length;
  return {
    mean: Number(mean.toFixed(2)),
    speckleVariance: Number((accumulator / count).toFixed(3)),
    rawVariance: Number(rawVariance.toFixed(1)),
    // Variance at a matched exposure: the grade multiplies whatever shading survives.
    normalisedRawVariance: Number((rawVariance / mean ** 2).toFixed(5)),
  };
}

async function warmPatch(file) {
  const { data, info } = await sharp(file).extract(WARM_BLOCK).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = info.width * info.height;
  for (let i = 0; i < pixels; i += 1) {
    r += data[i * channels];
    g += data[i * channels + 1];
    b += data[i * channels + 2];
  }
  return { r: Number((r / pixels).toFixed(1)), g: Number((g / pixels).toFixed(1)), b: Number((b / pixels).toFixed(1)), warmth: Number(((r - b) / pixels).toFixed(1)) };
}

/** Mean absolute difference, in percent of full scale, between two same-size images. */
async function meanAbsoluteDifference(left, right) {
  const a = await sharp(left).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(right).raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    throw new Error(`Size mismatch: ${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height}`);
  }
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 1) sum += Math.abs(a.data[i] - b.data[i]);
  return Number(((sum / a.data.length / 255) * 100).toFixed(4));
}

/* -------------------------------------------------------------------------- */

if (!existsSync(source)) throw new Error(`Missing source: ${source}`);
mkdirSync(staging, { recursive: true });
mkdirSync(dirname(poster), { recursive: true });

const sourceMetadata = probe(source);
if (sourceMetadata.rate !== SOURCE_RATE || sourceMetadata.frames !== SOURCE_FRAMES) {
  throw new Error(`Source timing changed: expected ${SOURCE_FRAMES} frames at ${SOURCE_RATE}, got ${sourceMetadata.frames} at ${sourceMetadata.rate}`);
}

if (replace) {
  // The explicit replacement mode is limited to the two generated files; the
  // source path is never a target here.
  for (const generated of [target, poster]) if (existsSync(generated)) unlinkSync(generated);
}

if (!existsSync(target)) {
  run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-n', '-i', source,
    '-an', '-filter_complex', FILTER,
    // Master quality, not delivery quality: the ladder re-encodes this at crf 26/27,
    // so crf 18 is already transparent for it while keeping the tracked source near
    // the size of the ungraded original (this file is plain git, not LFS).
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-g', '6', '-keyint_min', '6', '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-threads', '2', target,
  ]);
}

const targetMetadata = probe(target);
if (targetMetadata.frames !== sourceMetadata.frames) throw new Error(`Frame count drift: ${targetMetadata.frames} != ${sourceMetadata.frames}`);
if (targetMetadata.rate !== sourceMetadata.rate) throw new Error(`Frame rate drift: ${targetMetadata.rate} != ${sourceMetadata.rate}`);
if (targetMetadata.width !== sourceMetadata.width || targetMetadata.height !== sourceMetadata.height) {
  throw new Error(`Frame size drift: ${targetMetadata.width}x${targetMetadata.height}`);
}

const reference = await sharp(referencePoster).metadata();
if (!existsSync(poster)) {
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', '-i', target, '-frames:v', '1', '-vf', `scale=${reference.width}:${reference.height}`, '-q:v', '2', poster]);
}

/* ---- gates ---- */

const gateSource = frameTo(source, GATE_FRAME, resolve(staging, `source-f${GATE_FRAME}.png`));
const gateTarget = frameTo(target, GATE_FRAME, resolve(staging, `pearl-f${GATE_FRAME}.png`));
const gateControl = frameTo(source, GATE_FRAME, resolve(staging, `colour-only-f${GATE_FRAME}.png`), COLOUR);
const freshFrameZero = frameTo(target, 0, resolve(staging, 'pearl-f0-1280.png'), `scale=${reference.width}:${reference.height}`);
const posterPng = resolve(staging, 'poster-decoded.png');
if (!existsSync(posterPng)) run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', poster, posterPng]);

const before = await speckleStats(gateSource);
const after = await speckleStats(gateTarget);
const control = await speckleStats(gateControl);
const posterDelta = await meanAbsoluteDifference(posterPng, freshFrameZero);

const report = {
  source: {
    file: 'assets/films/source/epoxy-walkway.mp4',
    ...sourceMetadata,
    bytes: statSync(source).size,
    sha256: digest(source),
  },
  target: {
    file: 'assets/films/source/epoxy-walkway-pearl.mp4',
    ...targetMetadata,
    bytes: statSync(target).size,
    sha256: digest(target),
  },
  poster: {
    file: 'public/images/brand/epoxy-walkway-pearl-poster.jpg',
    width: reference.width,
    height: reference.height,
    bytes: statSync(poster).size,
    sha256: digest(poster),
  },
  filter: FILTER,
  gates: {
    frameParity: { pass: targetMetadata.frames === sourceMetadata.frames, source: sourceMetadata.frames, target: targetMetadata.frames },
    rateParity: { pass: targetMetadata.rate === sourceMetadata.rate, source: sourceMetadata.rate, target: targetMetadata.rate },
    speckle: {
      crop: SPECKLE_CROP,
      frame: GATE_FRAME,
      before,
      after,
      colourOnlyControl: control,
      speckleReductionPercent: Number((100 * (1 - after.speckleVariance / before.speckleVariance)).toFixed(2)),
      normalisedRawReductionPercent: Number((100 * (1 - after.normalisedRawVariance / before.normalisedRawVariance)).toFixed(2)),
      pass: after.speckleVariance <= before.speckleVariance * 0.5,
    },
    warmPatch: {
      block: WARM_BLOCK,
      before: await warmPatch(gateSource),
      after: await warmPatch(gateTarget),
    },
    posterVsFreshFrameZero: { meanAbsDiffPercent: posterDelta, pass: posterDelta < 1 },
  },
};

console.log(JSON.stringify(report, null, 2));
const failures = Object.entries(report.gates).filter(([, gate]) => gate.pass === false).map(([name]) => name);
if (failures.length) {
  console.error(`FAILED GATES: ${failures.join(', ')}`);
  process.exitCode = 1;
}
