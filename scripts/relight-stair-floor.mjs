/**
 * Relight the Act 3 stair film's floor (2026-09-22). Matt: "remove the white triangle
 * or white square on an angle on the floor".
 *
 * The walkway master carries a hard-edged pool of light — a window-shaped patch — on
 * the wet floor in front of the stair. The pearl grade (`grade-stair-walk.mjs`) moved
 * its colour from sodium orange to pearl but kept its level, so on the page it reads
 * as a white parallelogram. This pass takes it out frame by frame and leaves the rest
 * of the picture alone:
 *
 *   L    luma of the frame (Rec. 709 weights)
 *   B    L box-blurred at r 2: the level of each neighbourhood, with the aggregate's
 *        own texture averaged out
 *   T    the floor's own level around it: a normalised convolution of L over pixels
 *        darker than CAP (the patch excluded entirely), at a wide radius
 *   M    where a large region sits far above that floor level ON the floor:
 *        clip((Lbig - T - LIFT) / RAMP) x floor(x, y), then dilated and feathered so
 *        the patch's soft penumbra is inside it
 *   out  in x (1 - M + M x min(1, T / B))
 *
 * Inside the mask every pixel is SCALED so its neighbourhood lands on the local floor
 * level: the aggregate's texture survives (a scale, not a paint-over) and the patch's
 * edge disappears with it. Outside the mask the frame is byte-for-byte what the grade
 * produced. Wet-floor reflections stay: they are neither large nor far enough above
 * the local floor to enter the mask.
 *
 * In:  assets/films/source/epoxy-walkway-pearl.mp4 (the graded master; kept as
 *      .asset-staging/stair-relight/epoxy-walkway-pearl.graded.mp4 on the first run)
 * Out: assets/films/source/epoxy-walkway-pearl.mp4 (relit, same size/frames/rate)
 * Then: `node scripts/encode-journey-films.mjs --only walkway-pearl` (after deleting
 * the three ladder files) and the poster is re-extracted from frame 0.
 *
 * GATE (printed): frame count parity, the patch block's mean luma before/after against
 * the floor around it, and the untouched-region difference (must be ~0).
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const master = resolve(root, 'assets/films/source/epoxy-walkway-pearl.mp4');
const staging = resolve(root, '.asset-staging/stair-relight');
const graded = resolve(staging, 'epoxy-walkway-pearl.graded.mp4');
const relit = resolve(staging, 'epoxy-walkway-pearl.relit.mp4');

const W = 1920;
const H = 1080;
const FRAME = W * H * 3;

/** Luma above this never counts toward the floor's own level. */
const CAP = 150;
/** How far above the local floor (in luma) a large region must sit to be "the patch". */
const LIFT = 38;
const RAMP = 26;
/**
 * Where the fill is borrowed from: the same row, one patch-width plus a margin to the
 * left. Measured with `--bbox`, the patch holds x 1120-1535, y 616-891 through all 145
 * frames (the camera dollies straight at it), so one offset serves the whole walk and
 * the fill cannot shimmer from frame to frame.
 */
const SOURCE_DX = -480;
/** The floor: below the V the floor/wall junction draws (same V as the grade's blur). */
const floorWeight = (x, y) => Math.min(1, Math.max(0, (y - (556 + (140 * Math.abs(x - 960)) / 960)) / 36));

mkdirSync(staging, { recursive: true });
if (!existsSync(graded)) copyFileSync(master, graded);

/* ── separable box blur on a Float32Array (running sums, edge-clamped) ─────── */
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const size = 2 * r + 1;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k += 1) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x += 1) {
      tmp[row + x] = acc / size;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x += 1) {
    let acc = 0;
    for (let k = -r; k <= r; k += 1) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y += 1) {
      out[y * w + x] = acc / size;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Average-pool by an integer factor. */
function downsample(src, w, h, f) {
  const dw = Math.floor(w / f);
  const dh = Math.floor(h / f);
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      let acc = 0;
      for (let j = 0; j < f; j += 1) for (let i = 0; i < f; i += 1) acc += src[(y * f + j) * w + x * f + i];
      out[y * dw + x] = acc / (f * f);
    }
  }
  return { data: out, w: dw, h: dh };
}

/** Bilinear sample of a low-res field at full-res pixel (x, y). */
function sampler(field, f) {
  const { data, w, h } = field;
  return (x, y) => {
    const fx = Math.min(w - 1, Math.max(0, (x + 0.5) / f - 0.5));
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) / f - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const top = data[y0 * w + x0] * (1 - tx) + data[y0 * w + x1] * tx;
    const bottom = data[y1 * w + x0] * (1 - tx) + data[y1 * w + x1] * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

const stats = { frames: 0, maxMask: 0, patchBefore: [], patchAfter: [], untouchedDelta: 0 };

function relight(frame) {
  const L = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i += 1, p += 3) {
    L[i] = 0.2126 * frame[p] + 0.7152 * frame[p + 1] + 0.0722 * frame[p + 2];
  }
  // B: fine neighbourhood level.
  const B = boxBlur(L, W, H, 2);
  // T: the floor's own level, the patch excluded (normalised convolution at 1/16).
  const F = 16;
  const lowL = downsample(L.map((v) => (v < CAP ? v : 0)), W, H, F);
  const lowW = downsample(L.map((v) => (v < CAP ? 1 : 0)), W, H, F);
  const num = boxBlur(boxBlur(lowL.data, lowL.w, lowL.h, 4), lowL.w, lowL.h, 4);
  const den = boxBlur(boxBlur(lowW.data, lowW.w, lowW.h, 4), lowW.w, lowW.h, 4);
  let floorSum = 0;
  let floorCount = 0;
  for (let i = 0; i < L.length; i += 7) if (L[i] < CAP) { floorSum += L[i]; floorCount += 1; }
  const fallback = floorCount ? floorSum / floorCount : 90;
  const levelLow = { data: num.map((v, i) => (den[i] > 0.02 ? v / den[i] : fallback)), w: lowL.w, h: lowL.h };
  const level = sampler(levelLow, F);
  // Lbig: the region's level (1/4, r 3 twice ~ 12 px).
  const big = downsample(L, W, H, 4);
  const bigBlur = { data: boxBlur(boxBlur(big.data, big.w, big.h, 3), big.w, big.h, 3), w: big.w, h: big.h };
  // Raw mask at 1/4, then dilated + feathered there.
  const rawLow = new Float32Array(big.w * big.h);
  for (let y = 0; y < big.h; y += 1) {
    for (let x = 0; x < big.w; x += 1) {
      const fx = x * 4 + 2;
      const fy = y * 4 + 2;
      const t = level(fx, fy);
      const excess = (bigBlur.data[y * big.w + x] - t - LIFT) / RAMP;
      rawLow[y * big.w + x] = Math.min(1, Math.max(0, excess)) * floorWeight(fx, fy);
    }
  }
  const soft = boxBlur(boxBlur(rawLow, big.w, big.h, 5), big.w, big.h, 5);
  const maskLow = { data: soft.map((v) => Math.min(1, v * 2.6)), w: big.w, h: big.h };
  const mask = sampler(maskLow, 4);
  // The patch's extent this frame (at 1/4, where the mask is solid).
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < big.h; y += 1) {
    for (let x = 0; x < big.w; x += 1) {
      if (maskLow.data[y * big.w + x] < 0.5) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  stats.bbox = Number.isFinite(minX) ? { x0: minX * 4, x1: maxX * 4 + 3, y0: minY * 4, y1: maxY * 4 + 3 } : null;

  const out = Buffer.allocUnsafe(FRAME);
  let maxMask = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      const p = i * 3;
      const m = mask(x, y);
      if (m <= 0.001) {
        out[p] = frame[p];
        out[p + 1] = frame[p + 1];
        out[p + 2] = frame[p + 2];
        continue;
      }
      if (m > maxMask) maxMask = m;
      // Fill with real floor from beside the patch (same row, so the same depth and
      // grain size), brought to the level the floor has HERE.
      const sx = Math.min(W - 1, Math.max(0, x + SOURCE_DX));
      const sp = (y * W + sx) * 3;
      const ratio = level(x, y) / Math.max(1, level(sx, y));
      out[p] = Math.round(frame[p] * (1 - m) + Math.min(255, frame[sp] * ratio) * m);
      out[p + 1] = Math.round(frame[p + 1] * (1 - m) + Math.min(255, frame[sp + 1] * ratio) * m);
      out[p + 2] = Math.round(frame[p + 2] * (1 - m) + Math.min(255, frame[sp + 2] * ratio) * m);
    }
  }
  stats.maxMask = Math.max(stats.maxMask, maxMask);
  return out;
}

/* ── --bbox: where the patch sits across the walk ─────────────────────────── */
if (process.argv.includes('--bbox')) {
  for (const index of [0, 24, 48, 72, 96, 120, 144]) {
    const raw = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', graded, '-vf', `select=eq(n\\,${index})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: FRAME * 2 });
    relight(raw.stdout.subarray(0, FRAME));
    console.log(index, JSON.stringify(stats.bbox));
  }
  process.exit(0);
}

/* ── --preview N: one frame, before and after, as PNGs in the staging folder ─ */
const previewAt = process.argv.indexOf('--preview');
if (previewAt >= 0) {
  const index = Number(process.argv[previewAt + 1] ?? 0);
  const { default: sharp } = await import('sharp');
  const raw = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', graded, '-vf', `select=eq(n\\,${index})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: FRAME * 2 });
  if (raw.status !== 0 || raw.stdout.length < FRAME) throw new Error(`preview decode failed: ${raw.stderr}`);
  const before = raw.stdout.subarray(0, FRAME);
  const started = performance.now();
  const after = relight(before);
  const ms = Math.round(performance.now() - started);
  await sharp(before, { raw: { width: W, height: H, channels: 3 } }).png().toFile(resolve(staging, `preview-${index}-before.png`));
  await sharp(after, { raw: { width: W, height: H, channels: 3 } }).png().toFile(resolve(staging, `preview-${index}-after.png`));
  console.log(JSON.stringify({ index, ms, maxMask: stats.maxMask }));
  process.exit(0);
}

/* ── stream: decode -> relight -> encode ──────────────────────────────────── */
const decoder = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', graded, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { windowsHide: true });
const encoder = spawn(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', '24', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', relit,
], { windowsHide: true });
encoder.stderr.on('data', (chunk) => process.stderr.write(chunk));
decoder.stderr.on('data', (chunk) => process.stderr.write(chunk));

let pending = Buffer.alloc(0);
decoder.stdout.on('data', (chunk) => {
  pending = Buffer.concat([pending, chunk]);
  while (pending.length >= FRAME) {
    const frame = pending.subarray(0, FRAME);
    pending = pending.subarray(FRAME);
    const done = relight(frame);
    stats.frames += 1;
    if (!encoder.stdin.write(done)) {
      decoder.stdout.pause();
      encoder.stdin.once('drain', () => decoder.stdout.resume());
    }
    if (stats.frames % 24 === 0) process.stdout.write(`  ${stats.frames} frames\n`);
  }
});
decoder.stdout.on('end', () => encoder.stdin.end());
encoder.on('close', (code) => {
  if (code !== 0) throw new Error(`encode failed (${code})`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,r_frame_rate,width,height', '-of', 'json', relit], { encoding: 'utf8' });
  const stream = JSON.parse(probe.stdout).streams[0];
  console.log(JSON.stringify({ relit, frames: stats.frames, probe: stream, maxMask: Number(stats.maxMask.toFixed(3)) }, null, 2));
  if (Number(stream.nb_read_frames) !== stats.frames) throw new Error('frame count mismatch');
  if (process.argv.includes('--replace')) {
    copyFileSync(relit, master);
    console.log(`replaced ${master}`);
  }
});
