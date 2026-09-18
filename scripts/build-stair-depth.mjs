/**
 * Procedural piecewise-planar depth map for the Act 3 2.5D stair (Step 20, option B).
 *
 * No monocular-depth model is available offline and none may be downloaded, so the
 * depth is *authored* from the picture's own geometry rather than inferred. The
 * measurements below are taken from `public/images/brand/pearl-stair-v2.jpg`
 * (1672 x 941) and re-verified against the file on every run — if the still is ever
 * replaced, `verifyNosings()` fails instead of silently producing a depth map for a
 * picture that no longer exists.
 *
 * ---------------------------------------------------------------------------
 * MEASURED, IN SOURCE PIXELS
 * ---------------------------------------------------------------------------
 * Tread nosings (row-wise mean |dI/dy| over the central band x in [0.30W, 0.70W],
 * local maxima with gradient >= 12):
 *
 *     418  383  352  324  297  273  250  229  209  192  175  160
 *      n=0                                                  n=11
 *
 * Floor line (base of the bottom riser, where the stair meets the polished slab): 434.
 * Landing surface: 144..160.  Back parapet: 102..144.  Sky above 102.
 * Wall/balustrade top edge on both flanks: about 70.
 *
 * Stair/balustrade boundary, straight in the image (fitted to vertical-edge scans at
 * rows 120, 200, 300, 430):
 *     left(y)  = 574.8 - 0.623 y        right(y) = 1106.8 + 0.610 y
 * Floor/wall boundary below the stair (scans at rows 430, 470):
 *     left(y)  = 225  - 2.20 (y - 434)  right(y) = 1384 + 2.20 (y - 434)
 *
 * ---------------------------------------------------------------------------
 * DERIVED GEOMETRY
 * ---------------------------------------------------------------------------
 * Nosing n sits at height n*R and distance d0 + n*T, so its image row is a Moebius
 * function of n:  y(n) = (a*n + b)/(n + g).  Fitting the twelve rows above gives
 *
 *     g = d0/T = 20.34,  rmse 0.45 px, worst residual 0.98 px
 *
 * (Including row 434 in the fit pushes rmse to 3.79 px and worst to 8.41 px, which is
 * how we know 434 is the floor line and not a thirteenth nosing.) So every riser's
 * distance in tread units is simply 20.34 + n, and the top riser is 1.541x the
 * distance of the bottom one — that is measurement, not assumption.
 *
 * The one assumption is the camera's eye height in risers, H_c/R = 8.8 (a 1.5 m eye
 * on a 0.17 m riser). It fixes the horizon row at y(8.8) = 196, which is what turns
 * the foreground slab into a plane: for a ground plane 1/d is affine in y, so
 *     d_floor(y) = 20.34 * (434 - 196) / (y - 196) tread units,
 * putting the bottom of the frame at 6.50 T — 3.13x nearer than the stair's foot.
 * Halving or doubling that assumption moves the frame-bottom distance between 5.9 T
 * and 7.2 T; it does not reorder anything.
 *
 * Side walls are vertical planes parallel to the view axis, so their distance is
 * d = K / |x - 836.5|, with K anchored on the measured floor/wall junction at row
 * 434. That anchoring makes the wall continuous with the floor by construction (both
 * read 20.34 T at the junction) and within 3 % of it a hundred rows further down.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS WRITTEN
 * ---------------------------------------------------------------------------
 * Disparity, not distance: `value = D_NEAR / d`, so 65535 is the nearest surface
 * (the frame's bottom edge) and small values are far. Inverse depth is the quantity
 * that is linear across a plane in image space, so a piecewise-planar scene stays
 * piecewise-linear in the file and quantises evenly. `DepthPlate.tsx` inverts it.
 *
 * Band edges are left hard — one output pixel wide, no blur — because the riser
 * edges are the whole point of the set piece ("risers as vertical steps with
 * hardened edges"). The sky is clamped to 108 T rather than sent to infinity so the
 * displaced mesh stays inside a sane frustum.
 *
 * Nothing is inpainted. `DepthPlate.tsx` instead overscans the plate by 3.8 %, which
 * is what keeps the rise and the <= 2 deg pitch from opening a hole at the top edge.
 *
 * Outputs (16-bit greyscale PNG, same pixel size as the matching colour rung):
 *   public/images/brand/stair/pearl-stair-v2-depth-2048.png
 *   public/images/brand/stair/pearl-stair-v2-depth-1024.png
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { RUNGS, SOURCE_HEIGHT, SOURCE_WIDTH, STAIR_SOURCE, plateHeight, root } from './build-stair-plate.mjs';

/* ---- measured constants (source pixels) ---- */
export const NOSING_ROWS = Object.freeze([418, 383, 352, 324, 297, 273, 250, 229, 209, 192, 175, 160]);
const FLOOR_LINE = 434;
const LANDING_TOP = 144;
const PARAPET_TOP = 102;
const WALL_TOP = 70;
const PRINCIPAL_X = 836.5;

const stairLeft = (y) => 574.8 - 0.623 * y;
const stairRight = (y) => 1106.8 + 0.610 * y;
const floorLeft = (y) => 225 - 2.2 * (y - FLOOR_LINE);
const floorRight = (y) => 1384 + 2.2 * (y - FLOOR_LINE);

/* ---- derived geometry (tread units) ---- */
const TREADS_TO_FOOT = 20.34;      // d0/T from the Moebius fit
const EYE_ROW = 196;               // horizon row implied by H_c/R = 8.8
const LANDING_BACK = 38;           // landing back edge / parapet face
const SKY_DISTANCE = 108;          // clamp, not infinity
const NEAR_DISTANCE = (TREADS_TO_FOOT * (FLOOR_LINE - EYE_ROW)) / (SOURCE_HEIGHT - EYE_ROW); // 6.498 T

const K_LEFT = TREADS_TO_FOOT * (PRINCIPAL_X - 225);
const K_RIGHT = TREADS_TO_FOOT * (1384 - PRINCIPAL_X);

/** Distance in tread units at a source-pixel coordinate. */
export function stairDistance(xs, ys) {
  if (ys > FLOOR_LINE) {
    if (xs >= floorLeft(ys) && xs <= floorRight(ys)) {
      return (TREADS_TO_FOOT * (FLOOR_LINE - EYE_ROW)) / (ys - EYE_ROW);
    }
    return wallDistance(xs);
  }
  if (ys <= WALL_TOP && (xs < stairLeft(ys) || xs > stairRight(ys))) return SKY_DISTANCE;
  if (xs < stairLeft(ys) || xs > stairRight(ys)) return wallDistance(xs);
  if (ys > NOSING_ROWS[NOSING_ROWS.length - 1]) {
    let n = 0;
    while (n < NOSING_ROWS.length && ys <= NOSING_ROWS[n]) n += 1;
    return TREADS_TO_FOOT + n;
  }
  if (ys > LANDING_TOP) {
    // Landing: a horizontal plane, so interpolate inverse distance, not distance.
    const t = (NOSING_ROWS[NOSING_ROWS.length - 1] - ys) / (NOSING_ROWS[NOSING_ROWS.length - 1] - LANDING_TOP);
    const front = TREADS_TO_FOOT + NOSING_ROWS.length;
    return 1 / ((1 - t) / front + t / LANDING_BACK);
  }
  if (ys > PARAPET_TOP) return LANDING_BACK;
  return SKY_DISTANCE;
}

function wallDistance(xs) {
  const offset = Math.abs(xs - PRINCIPAL_X);
  const k = xs < PRINCIPAL_X ? K_LEFT : K_RIGHT;
  const distance = offset < 1 ? SKY_DISTANCE : k / offset;
  return Math.min(SKY_DISTANCE, Math.max(NEAR_DISTANCE, distance));
}

/** Disparity in [0,1], 1 = nearest. */
export const stairDisparity = (xs, ys) => Math.min(1, Math.max(0, NEAR_DISTANCE / stairDistance(xs, ys)));

/* -------------------------------------------------------------------------- */

/**
 * Re-measure the nosings from the still and fail if the picture no longer has an
 * edge where the table says it does. A control run over twelve rows offset by 8 px
 * is printed alongside: if the check could not fail, that control would also pass.
 */
async function verifyNosings() {
  const { data, info } = await sharp(STAIR_SOURCE).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const x0 = Math.round(w * 0.3);
  const x1 = Math.round(w * 0.7);
  const gradient = new Float64Array(h);
  for (let y = 1; y < h; y += 1) {
    let sum = 0;
    for (let x = x0; x < x1; x += 1) sum += Math.abs(data[y * w + x] - data[(y - 1) * w + x]);
    gradient[y] = sum / (x1 - x0);
  }
  const score = (rows) => rows.map((row) => {
    let best = { row, gradient: 0 };
    for (let y = row - 4; y <= row + 4; y += 1) {
      if (y > 0 && y < h && gradient[y] > best.gradient) best = { row: y, gradient: Number(gradient[y].toFixed(1)) };
    }
    return best;
  });
  const measured = score(NOSING_ROWS);
  const control = score(NOSING_ROWS.map((row) => row + 8));
  const weakest = Math.min(...measured.map((entry) => entry.gradient));
  const controlWeakest = Math.min(...control.map((entry) => entry.gradient));
  if (weakest < 12) throw new Error(`Nosing rows no longer match the still: weakest gradient ${weakest}`);
  return { measured, weakestGradient: weakest, controlWeakestGradient: controlWeakest };
}

/* -------------------------------------------------------------------------- */
/* 16-bit greyscale PNG, written here rather than through sharp                 */
/*                                                                             */
/* sharp 0.35 / libvips 8.18 accepts `raw: { depth: 'ushort' }`, reports the    */
/* file as `1 x ushort`, writes `bitDepth 16, colorType 0` into IHDR — and      */
/* still quantises the samples to 8-bit steps. Measured on an 8x4 ramp:         */
/* 4096 came back as 4112, i.e. round(4096/65535*255)*257. A depth map that     */
/* looks 16-bit and carries 8-bit precision is exactly the kind of silent       */
/* downgrade this repo has been bitten by, so the encoder is explicit and the   */
/* round-trip is asserted below.                                               */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** PNG scanline filtering: None / Sub / Up, chosen per row by the standard heuristic. */
function filterRows(samples, width, height) {
  const bpp = 2;
  const stride = width * bpp;
  const out = Buffer.alloc(height * (stride + 1));
  const raw = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) raw.writeUInt16BE(samples[y * width + x], x * bpp);
    const candidates = [Buffer.from(raw), Buffer.alloc(stride), Buffer.alloc(stride)];
    for (let i = 0; i < stride; i += 1) {
      candidates[1][i] = (raw[i] - (i >= bpp ? raw[i - bpp] : 0)) & 0xff;
      candidates[2][i] = (raw[i] - previous[i]) & 0xff;
    }
    let bestType = 0;
    let bestScore = Infinity;
    for (let type = 0; type < 3; type += 1) {
      let score = 0;
      for (let i = 0; i < stride; i += 1) {
        const v = candidates[type][i];
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; bestType = type; }
    }
    out[y * (stride + 1)] = bestType;
    candidates[bestType].copy(out, y * (stride + 1) + 1);
    raw.copy(previous);
  }
  return out;
}

function encodeGrey16Png(width, height, samples) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 16;  // bit depth
  ihdr[9] = 0;   // colour type: greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filterRows(samples, width, height), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Independent decoder, used only to prove the file holds the samples it should. */
function decodeGrey16Png(buffer) {
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colourType: data[9] };
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  const { width, height } = header;
  const stride = width * 2;
  const raw = inflateSync(Buffer.concat(idat));
  const samples = new Uint16Array(width * height);
  const line = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const type = raw[y * (stride + 1)];
    raw.copy(line, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i += 1) {
      if (type === 1) line[i] = (line[i] + (i >= 2 ? line[i - 2] : 0)) & 0xff;
      else if (type === 2) line[i] = (line[i] + previous[i]) & 0xff;
      else if (type !== 0) throw new Error(`Unexpected PNG filter ${type}`);
    }
    for (let x = 0; x < width; x += 1) samples[y * width + x] = line.readUInt16BE(x * 2);
    line.copy(previous);
  }
  return { header, samples };
}

async function writeDepth(width) {
  const height = plateHeight(width);
  const pixels = new Uint16Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const ys = ((y + 0.5) * SOURCE_HEIGHT) / height;
    for (let x = 0; x < width; x += 1) {
      const xs = ((x + 0.5) * SOURCE_WIDTH) / width;
      pixels[y * width + x] = Math.round(stairDisparity(xs, ys) * 65535);
    }
  }
  const file = resolve(root, 'public/images/brand/stair', `pearl-stair-v2-depth-${width}.png`);
  writeFileSync(file, encodeGrey16Png(width, height, pixels));

  const decoded = decodeGrey16Png(readFileSync(file));
  if (decoded.header.bitDepth !== 16 || decoded.header.colourType !== 0) {
    throw new Error(`Depth rung ${width}: IHDR says bitDepth ${decoded.header.bitDepth} colourType ${decoded.header.colourType}`);
  }
  let mismatches = 0;
  let distinct = new Set();
  for (let i = 0; i < pixels.length; i += 1) {
    if (decoded.samples[i] !== pixels[i]) mismatches += 1;
    if (i % 991 === 0) distinct.add(decoded.samples[i]);
  }
  if (mismatches) throw new Error(`Depth rung ${width}: ${mismatches} samples did not round-trip`);
  // A file quantised to 8-bit steps would have every sample a multiple of 257.
  const eightBitSteps = [...distinct].every((value) => value % 257 === 0);
  if (eightBitSteps) throw new Error(`Depth rung ${width}: every sampled value is a multiple of 257 — this is 8-bit data in a 16-bit container`);

  const meta = await sharp(file).metadata();
  return {
    file: file.replace(root, '').replace(/\\/g, '/').replace(/^\//, ''),
    width: meta.width,
    height: meta.height,
    depth: meta.depth,
    channels: meta.channels,
    bitDepth: decoded.header.bitDepth,
    roundTripMismatches: mismatches,
    distinctSampledValues: distinct.size,
    bytes: statSync(file).size,
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  };
}

mkdirSync(resolve(root, 'public/images/brand/stair'), { recursive: true });
const nosings = await verifyNosings();
const files = [];
for (const { width } of RUNGS) files.push(await writeDepth(width));

/* ---- the depth table the component and the gates both reason about ---- */
const probes = {
  frameBottom: stairDistance(SOURCE_WIDTH / 2, SOURCE_HEIGHT - 1),
  floorMid: stairDistance(SOURCE_WIDTH / 2, 700),
  floorLine: stairDistance(SOURCE_WIDTH / 2, FLOOR_LINE - 0.5),
  bottomRiser: stairDistance(SOURCE_WIDTH / 2, 426),
  topRiser: stairDistance(SOURCE_WIDTH / 2, 167),
  landing: stairDistance(SOURCE_WIDTH / 2, 152),
  parapet: stairDistance(SOURCE_WIDTH / 2, 120),
  sky: stairDistance(SOURCE_WIDTH / 2, 60),
  leftWallAtEdge: stairDistance(10, 300),
};

console.log(JSON.stringify({
  source: { file: 'public/images/brand/pearl-stair-v2.jpg', width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
  fit: { treadsToFoot: TREADS_TO_FOOT, eyeRow: EYE_ROW, nearDistanceTreads: Number(NEAR_DISTANCE.toFixed(3)) },
  nosings,
  distancesTreads: Object.fromEntries(Object.entries(probes).map(([key, value]) => [key, Number(value.toFixed(2))])),
  disparities: Object.fromEntries(Object.entries(probes).map(([key, value]) => [key, Number((NEAR_DISTANCE / value).toFixed(4))])),
  parallaxRatioBackWallOverBottomRiser: Number((probes.parapet / probes.bottomRiser).toFixed(3)),
  files,
}, null, 2));
