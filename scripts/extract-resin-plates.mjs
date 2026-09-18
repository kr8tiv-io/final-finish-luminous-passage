/**
 * Resin plates — the alpha-keyed elements Acts 1, 4 and 7 composite over paper.
 *
 * Two deliverables come out of one pour film:
 *   1. `resin-front-{2048,1024}.{png,webp}` — the poured front at its widest,
 *      cut from the still window the storyboard names (frames 200-235 of 241).
 *   2. `resin-swirl-cobalt.webm` (+ `.png` still) — a seamless VP9-with-alpha
 *      loop cut from frames 60-120 and recoloured toward cobalt.
 *
 * WHY THE MATTE IS KEYED OFF THE UNGRADED SOURCE
 * `grade-pearl-pour.mjs` exists to neutralise the pour's warm metallic cast.
 * That is right for the picture and fatal for a key: after the grade, resin and
 * concrete sit on the same cool grey axis (measured separation d = 0.94 on the
 * best single channel — i.e. the two populations overlap). The ungraded source
 * still holds the separation, so the alpha is solved on
 * `assets/films/source/epoxy-pour.mp4` and applied to the pearl-graded RGB.
 * The two are frame-locked by construction: the grade is a filter chain over the
 * same 241 frames at 24/1, which `grade-pearl-pour.mjs` asserts on every run.
 *
 * WHY THE KEY IS NOT A COLORKEY
 * The concrete is defocused background, so it is not one colour — it is a
 * *narrow* colour at *zero* local contrast. A per-pixel colorkey either eats the
 * pale resin that shares its hue or leaves the concrete's darker speckle behind.
 * The matte is therefore two soft terms ANDed together (low chroma AND flat),
 * then confined to the connected region that touches the frame border. The
 * border constraint is what makes holes in the middle of the pool impossible:
 * background is by definition the part you can reach from outside the frame.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const pearlFilm = resolve(root, 'public/videos/follow-floor/1080/epoxy-pour-pearl.mp4');
const rawFilm = resolve(root, 'assets/films/source/epoxy-pour.mp4');
const plateImages = resolve(root, 'public/images/brand/plates');
const plateVideos = resolve(root, 'public/videos/follow-floor/plates');
const staging = resolve(root, '.asset-staging/resin-plates');
const qa = resolve(root, 'output/assets-w3');

const STILL_FROM = 200, STILL_TO = 235;   // storyboard §5, Act 1
const SWIRL_FROM = 60, SWIRL_TO = 120;    // storyboard §5, Act 4
const CROSSFADE = 12;                     // frames of tail dissolved into the head
const FEATHER_BOX = 3;                    // two box passes => ~13 px support, ~9 px visible feather
const MIN_CONCRETE = 0.012;               // a frame with less exposed concrete than this is not a "front"
const COBALT = [0x16, 0x4f, 0x83];        // #164F83
const PAPER = [0xfa, 0xf9, 0xf6];         // #FAF9F6
// Tuned on frame 90 against untinted plates (output/assets-w3/tune-g*.png). At
// gamma 0.85 the duotone lands on ice blue — the pour is mostly high-key, so a
// near-linear ramp never reaches cobalt. 2.0 pushes the midtones down the ramp
// while 0.90 keeps the highlight window narrow enough that the specular ridges
// and the silver flake stay pearl instead of going blue with everything else.
const TINT_GAMMA = 2.0;
const TINT_HIGHLIGHT_LOW = 0.90;

const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const pct = (value) => `${(value * 100).toFixed(2)}%`;

function run(command, args, timeout = 600_000) {
  const result = spawnSync(command, args, { windowsHide: true, encoding: 'utf8', timeout, maxBuffer: 1 << 26 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error?.message}`);
  return result;
}

/** Separable box blur on a float plane. Two passes approximate a gaussian. */
function boxBlur(source, width, height, radius) {
  const rows = new Float32Array(width * height), out = new Float32Array(width * height), span = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    const o = y * width; let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += source[o + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      rows[o + x] = acc / span;
      acc += source[o + Math.min(width - 1, x + radius + 1)] - source[o + Math.min(width - 1, Math.max(0, x - radius))];
    }
  }
  for (let x = 0; x < width; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += rows[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = acc / span;
      acc += rows[Math.min(height - 1, y + radius + 1) * width + x] - rows[Math.min(height - 1, Math.max(0, y - radius)) * width + x];
    }
  }
  return out;
}

const smoothstep = (value, low, high) => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

function extractFrames(film, from, to, directory, tag) {
  mkdirSync(directory, { recursive: true });
  if (readdirSync(directory).some((file) => file.startsWith(tag))) return directory;
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', film, '-vf', `select='between(n,${from},${to})'`, '-vsync', '0', '-start_number', String(from), resolve(directory, `${tag}%03d.png`)]);
  return directory;
}

const loadRgb = async (file) => {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

/** ffmpeg writes `%03d`, so a frame below 100 is zero-padded on disk. */
const frameFile = (directory, tag, n) => resolve(staging, directory, `${tag}${String(n).padStart(3, '0')}.png`);

/**
 * Per-pixel concrete likelihood: low chroma AND low local contrast, both soft.
 * Thresholds come from patch statistics on frame 235 of the ungraded source —
 * concrete chroma 12.3 +/- 1.3 at local sd 1.7 +/- 0.4, against resin chroma
 * 18.5-45.1 at local sd 10.7-14.4. The pale top-right resin (chroma 11.8) is
 * held by the contrast term, the smooth falling column (sd 5.4) by the chroma
 * term; neither survives the product.
 */
function concreteLikelihood({ data, width, height }) {
  const count = width * height;
  const luma = new Float32Array(count), lumaSquared = new Float32Array(count), chroma = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[p] = y; lumaSquared[p] = y * y;
    chroma[p] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  const mean = boxBlur(luma, width, height, 8), meanSquare = boxBlur(lumaSquared, width, height, 8);
  const localSd = new Float32Array(count);
  for (let p = 0; p < count; p++) localSd[p] = Math.sqrt(Math.max(0, meanSquare[p] - mean[p] * mean[p]));
  const flatness = boxBlur(localSd, width, height, 14), chromaSmooth = boxBlur(chroma, width, height, 8);
  const likelihood = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    likelihood[p] = (1 - smoothstep(chromaSmooth[p], 10, 20)) * (1 - smoothstep(flatness[p], 2.5, 8));
  }
  return likelihood;
}

/** Hysteresis flood from the frame border, so the pool interior can never be keyed out. */
function borderRegion(likelihood, width, height, seed = 0.55, grow = 0.20) {
  const region = new Uint8Array(width * height), stack = [];
  const push = (p) => { if (!region[p] && likelihood[p] > seed) { region[p] = 1; stack.push(p); } };
  for (let x = 0; x < width; x++) for (const y of [0, 1, 2, height - 3, height - 2, height - 1]) push(y * width + x);
  for (let y = 0; y < height; y++) for (const x of [0, 1, 2, width - 3, width - 2, width - 1]) push(y * width + x);
  while (stack.length) {
    const p = stack.pop(), x = p % width, y = (p / width) | 0;
    const step = (q) => { if (!region[q] && likelihood[q] > grow) { region[q] = 1; stack.push(q); } };
    if (x > 0) step(p - 1);
    if (x < width - 1) step(p + 1);
    if (y > 0) step(p - width);
    if (y < height - 1) step(p + width);
  }
  return region;
}

function matte(rawFrame) {
  const { width, height } = rawFrame, count = width * height;
  const likelihood = concreteLikelihood(rawFrame);
  const region = borderRegion(likelihood, width, height);
  const alpha = new Float32Array(count);
  for (let p = 0; p < count; p++) alpha[p] = region[p] ? 1 - smoothstep(likelihood[p], 0.20, 0.55) : 1;
  const feathered = boxBlur(boxBlur(alpha, width, height, FEATHER_BOX), width, height, FEATHER_BOX);
  for (let p = 0; p < count; p++) feathered[p] = Math.min(1, Math.max(0, feathered[p]));
  let opaque = 0, clear = 0;
  for (let p = 0; p < count; p++) { if (feathered[p] > 0.98) opaque++; else if (feathered[p] < 0.02) clear++; }
  return { alpha: feathered, width, height, opaque: opaque / count, clear: clear / count };
}

/**
 * Spill suppression. A soft matte over a coloured background carries that
 * background into every partial pixel; unpremultiplying against the measured
 * concrete colour is what stops the plate wearing a grey halo on paper.
 */
function despill(pearl, alpha) {
  const { data, width, height } = pearl, count = width * height;
  let br = 0, bg = 0, bb = 0, n = 0;
  for (let p = 0; p < count; p++) if (alpha[p] < 0.02) { br += data[p * 3]; bg += data[p * 3 + 1]; bb += data[p * 3 + 2]; n++; }
  const background = n ? [br / n, bg / n, bb / n] : [0, 0, 0];
  const rgba = Buffer.alloc(count * 4);
  for (let p = 0; p < count; p++) {
    const a = alpha[p];
    for (let c = 0; c < 3; c++) {
      const observed = data[p * 3 + c];
      // Below 0.15 the division amplifies noise faster than it removes spill,
      // and the pixel is <15% visible anyway, so it is left as observed.
      const value = a >= 0.15 ? (observed - (1 - a) * background[c]) / a : observed;
      rgba[p * 4 + c] = Math.round(Math.min(255, Math.max(0, value)));
    }
    rgba[p * 4 + 3] = Math.round(a * 255);
  }
  return { rgba, width, height, background: background.map((v) => Math.round(v)) };
}

/** Duotone toward cobalt that keeps the pearl speculars: highlights stay themselves. */
function cobalt(rgba, count) {
  const out = Buffer.from(rgba);
  for (let p = 0; p < count; p++) {
    const r = rgba[p * 4], g = rgba[p * 4 + 1], b = rgba[p * 4 + 2];
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const ramp = Math.pow(y, TINT_GAMMA);
    const keep = smoothstep(y, TINT_HIGHLIGHT_LOW, 1.0); // 1 where the pearl highlight must survive untouched
    for (let c = 0; c < 3; c++) {
      const duotone = COBALT[c] + (255 - COBALT[c]) * ramp;
      out[p * 4 + c] = Math.round(Math.min(255, Math.max(0, duotone * (1 - keep) + rgba[p * 4 + c] * keep)));
    }
  }
  return out;
}

/** Fraction of the matte's edge band that is genuinely semi-transparent. */
function edgeBandHistogram(alpha, width, height, radius = 12) {
  const binary = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) binary[p] = alpha[p] > 0.5 ? 1 : 0;
  const spread = boxBlur(binary, width, height, radius);
  let band = 0, semi = 0;
  const buckets = new Array(10).fill(0);
  for (let p = 0; p < width * height; p++) {
    if (spread[p] <= 0.02 || spread[p] >= 0.98) continue; // not near a boundary
    band++;
    buckets[Math.min(9, Math.floor(alpha[p] * 10))]++;
    if (alpha[p] > 0.02 && alpha[p] < 0.98) semi++;
  }
  return { band, semi, ratio: band ? semi / band : 0, buckets };
}

async function writePlate(rgba, width, height, name, sizes) {
  const results = [];
  for (const size of sizes) {
    for (const format of ['png', 'webp']) {
      const file = resolve(plateImages, `${name}-${size}.${format}`);
      const pipeline = sharp(rgba, { raw: { width, height, channels: 4 } }).resize(size, null, { kernel: 'lanczos3' });
      await (format === 'png' ? pipeline.png({ compressionLevel: 9, effort: 10 }) : pipeline.webp({ quality: 92, alphaQuality: 100 })).toFile(file);
      results.push({ file, bytes: statSync(file).size, sha256: digest(file) });
    }
  }
  return results;
}

// ---------------------------------------------------------------- still plate
mkdirSync(plateImages, { recursive: true });
mkdirSync(plateVideos, { recursive: true });
mkdirSync(qa, { recursive: true });
extractFrames(rawFilm, STILL_FROM, STILL_TO, resolve(staging, 'still-raw'), 'r');
extractFrames(pearlFilm, STILL_FROM, STILL_TO, resolve(staging, 'still-pearl'), 'p');

const survey = [];
for (let n = STILL_FROM; n <= STILL_TO; n++) {
  const frame = await loadRgb(frameFile('still-raw', 'r', n));
  const { opaque, clear } = matte(frame);
  survey.push({ n, opaque, clear });
}
const eligible = survey.filter((row) => row.clear >= MIN_CONCRETE);
if (!eligible.length) throw new Error(`No frame in ${STILL_FROM}-${STILL_TO} still shows concrete above ${pct(MIN_CONCRETE)}`);
const chosen = eligible.reduce((best, row) => (row.opaque > best.opaque ? row : best));
process.stdout.write(`frame survey ${STILL_FROM}-${STILL_TO} (resin / concrete):\n`);
for (const row of survey) process.stdout.write(`  ${row.n}: resin ${pct(row.opaque)} concrete ${pct(row.clear)}${row.n === chosen.n ? '  <- chosen' : row.clear < MIN_CONCRETE ? '  (no concrete)' : ''}\n`);

const rawChosen = await loadRgb(frameFile('still-raw', 'r', chosen.n));
const pearlChosen = await loadRgb(frameFile('still-pearl', 'p', chosen.n));
const stillMatte = matte(rawChosen);
const stillPlate = despill(pearlChosen, stillMatte.alpha);
const edge = edgeBandHistogram(stillMatte.alpha, stillMatte.width, stillMatte.height);
const stillFiles = await writePlate(stillPlate.rgba, stillPlate.width, stillPlate.height, 'resin-front', [2048, 1024]);

process.stdout.write(`\nresin-front: frame ${chosen.n}, resin ${pct(chosen.opaque)}, concrete ${pct(chosen.clear)}, spill background rgb(${stillPlate.background.join(',')})\n`);
process.stdout.write(`edge band: ${edge.band} px, semi-transparent ${edge.semi} (${pct(edge.ratio)}) — gate >= 8.00%\n`);
process.stdout.write(`edge alpha histogram (deciles): ${edge.buckets.map((v, i) => `${i / 10}-${(i + 1) / 10}:${v}`).join(' ')}\n`);
for (const file of stillFiles) process.stdout.write(`  ${file.file.replace(root, '').replace(/\\/g, '/')} ${Math.round(file.bytes / 1024)} KiB\n`);

// --------------------------------------------------------- cobalt swirl plate
extractFrames(rawFilm, SWIRL_FROM, SWIRL_TO, resolve(staging, 'swirl-raw'), 'r');
extractFrames(pearlFilm, SWIRL_FROM, SWIRL_TO, resolve(staging, 'swirl-pearl'), 'p');
const swirlWidth = 1280, swirlHeight = 720;
const swirlFrames = [];
for (let n = SWIRL_FROM; n <= SWIRL_TO; n++) {
  const raw = await loadRgb(frameFile('swirl-raw', 'r', n));
  const pearl = await loadRgb(frameFile('swirl-pearl', 'p', n));
  const solved = matte(raw);
  const plate = despill(pearl, solved.alpha);
  const tinted = cobalt(plate.rgba, plate.width * plate.height);
  swirlFrames.push(await sharp(tinted, { raw: { width: plate.width, height: plate.height, channels: 4 } })
    .resize(swirlWidth, swirlHeight, { kernel: 'lanczos3' }).raw().toBuffer());
}
// Seamless loop: the last CROSSFADE frames are dissolved over the first CROSSFADE,
// and the tail is then dropped, so frame L-1 flows into frame 0 with no cut.
const loopLength = swirlFrames.length - CROSSFADE;
const loop = [];
for (let i = 0; i < loopLength; i++) {
  if (i >= CROSSFADE) { loop.push(swirlFrames[i]); continue; }
  const head = swirlFrames[i], tail = swirlFrames[loopLength + i], weight = i / CROSSFADE;
  const blended = Buffer.alloc(head.length);
  for (let b = 0; b < head.length; b++) blended[b] = Math.round(tail[b] * (1 - weight) + head[b] * weight);
  loop.push(blended);
}
const loopDirectory = resolve(staging, 'swirl-loop');
rmSync(loopDirectory, { recursive: true, force: true });
mkdirSync(loopDirectory, { recursive: true });
for (const [index, frame] of loop.entries()) {
  await sharp(frame, { raw: { width: swirlWidth, height: swirlHeight, channels: 4 } })
    .png({ compressionLevel: 6 }).toFile(resolve(loopDirectory, `l${String(index).padStart(3, '0')}.png`));
}
const swirlVideo = resolve(plateVideos, 'resin-swirl-cobalt.webm');
const encode = (crf) => run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '24', '-i', resolve(loopDirectory, 'l%03d.png'),
  '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', String(crf), '-row-mt', '1',
  '-auto-alt-ref', '0', '-lag-in-frames', '0', '-g', '24', '-deadline', 'good', '-cpu-used', '2', swirlVideo]);
let crf = 36;
encode(crf);
while (statSync(swirlVideo).size > 1.5 * 1024 * 1024 && crf < 56) { crf += 4; encode(crf); }
await sharp(loop[0], { raw: { width: swirlWidth, height: swirlHeight, channels: 4 } })
  .png({ compressionLevel: 9, effort: 10 }).toFile(resolve(plateVideos, 'resin-swirl-cobalt.png'));

const loopSeam = (() => {
  const first = loop[0], last = loop[loop.length - 1];
  let sum = 0;
  for (let b = 0; b < first.length; b++) sum += Math.abs(first[b] - last[b]);
  return sum / first.length;
})();
process.stdout.write(`\nresin-swirl-cobalt: ${loop.length} frames @24 fps (${(loop.length / 24).toFixed(2)} s), ${swirlWidth}x${swirlHeight}, crf ${crf}\n`);
process.stdout.write(`  webm ${(statSync(swirlVideo).size / 1024).toFixed(0)} KiB (budget 1536 KiB), still ${(statSync(resolve(plateVideos, 'resin-swirl-cobalt.png')).size / 1024).toFixed(0)} KiB\n`);
process.stdout.write(`  loop seam (mean |last - first| over RGBA): ${loopSeam.toFixed(2)}/255\n`);

// ------------------------------------------------------------------- QA plates
async function composite(plateFile, backdrop, name) {
  const plate = sharp(plateFile);
  const { width, height } = await plate.metadata();
  const under = typeof backdrop === 'string'
    ? await sharp(backdrop).resize(width, height, { fit: 'cover' }).removeAlpha().toBuffer()
    : await sharp({ create: { width, height, channels: 3, background: { r: backdrop[0], g: backdrop[1], b: backdrop[2] } } }).png().toBuffer();
  const file = resolve(qa, `${name}.png`);
  await sharp(under).composite([{ input: await plate.png().toBuffer() }]).png().toFile(file);
  return file;
}
const finishPoster = resolve(root, 'public/images/brand/epoxy-finish-poster.jpg');
const composites = [
  await composite(resolve(plateImages, 'resin-front-2048.png'), PAPER, 'resin-front-over-paper'),
  await composite(resolve(plateImages, 'resin-front-2048.png'), finishPoster, 'resin-front-over-finish-hall'),
  await composite(resolve(plateVideos, 'resin-swirl-cobalt.png'), PAPER, 'resin-swirl-over-paper'),
  await composite(resolve(plateVideos, 'resin-swirl-cobalt.png'), finishPoster, 'resin-swirl-over-finish-hall'),
];
process.stdout.write('\ncomposites:\n');
for (const file of composites) process.stdout.write(`  ${file.replace(root, '').replace(/\\/g, '/')}\n`);

writeFileSync(resolve(qa, 'resin-plates-report.json'), JSON.stringify({
  chosenFrame: chosen.n, survey, edge: { band: edge.band, semi: edge.semi, ratio: edge.ratio, buckets: edge.buckets },
  spillBackground: stillPlate.background, still: stillFiles.map((f) => ({ ...f, file: f.file.replace(root, '').replace(/\\/g, '/') })),
  swirl: { frames: loop.length, width: swirlWidth, height: swirlHeight, crf, bytes: statSync(swirlVideo).size, sha256: digest(swirlVideo), seam: loopSeam },
}, null, 2) + '\n');
if (edge.ratio < 0.08) throw new Error(`Edge band only ${pct(edge.ratio)} semi-transparent; the key is hard.`);
if (statSync(swirlVideo).size > 1.5 * 1024 * 1024) throw new Error(`Swirl loop ${(statSync(swirlVideo).size / 1024).toFixed(0)} KiB exceeds the 1536 KiB budget.`);
if (!existsSync(resolve(plateImages, 'resin-front-1024.webp'))) throw new Error('Phone plate missing.');
