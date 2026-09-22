// Builds the paper "fog" edges the homepage acts use to move between film and paper.
//
// Every film act on the homepage begins covered by paper and ends covered by paper;
// the edge of that paper is what the visitor sees move. White Desert does this with
// cloud; we do it with mist in the page's own paper colour, so a fog that finishes
// rising IS the next white section and there is no seam to find.
//
// Two edges, one generator:
//   fog    soft, layered mist — the default for every act.
//   resin  broad, liquid lobes with a short (but never hard) falloff — Act 7 only,
//          the poured-resin reveal of "Find your finish." No lit meniscus: the colour
//          is flat paper all the way to the edge, so no bright line can form.
//
// The RGB channels are a flat #FAF9F6. Only alpha varies, and it reaches exactly 1
// on the bottom rows so the image can butt against a solid paper block without a
// visible join. Output: public/images/brand/fog/{fog,resin}-{rise,fall}-{2048,1024}.webp
//
// Run: node scripts/build-fog.mjs
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('public/images/brand/fog');
mkdirSync(OUT, { recursive: true });
const PAPER = [250, 249, 246];

// Deterministic value noise (no Math.random: the file must rebuild byte-identically).
const hash = (x, y, seed) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const smooth = (t) => t * t * (3 - 2 * t);
const valueNoise = (x, y, seed) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
};
const fbm = (x, y, seed, octaves) => {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
};
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const EDGES = {
  // A tall, soft mist: two scales of undulation, a wide falloff.
  fog: (u, v) => {
    const broad = fbm(u * 2.6, v * 1.2, 11, 4) - 0.5;
    const puffs = fbm(u * 8.5, v * 4.5, 29, 4) - 0.5;
    const field = v + broad * 0.36 + puffs * 0.2;
    return smoothstep(0.28, 0.74, field);
  },
  // Broad liquid lobes, a short falloff (about 3% of the height).
  resin: (u, v) => {
    const lobes = fbm(u * 2.1, 0.35, 7, 3) - 0.5;
    const ripple = fbm(u * 7.5, 0.8, 41, 2) - 0.5;
    const field = v + lobes * 0.42 + ripple * 0.06;
    return smoothstep(0.47, 0.53, field);
  },
};

async function build(name, width, height) {
  const data = Buffer.alloc(width * height * 4);
  const edge = EDGES[name];
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    // Hard guarantees at the ends: fully clear on the top rows, fully paper on the
    // bottom rows, so the element can sit flush against a solid block.
    const clamp = v < 0.04 ? 0 : v > 0.94 ? 1 : null;
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const a = clamp ?? edge(u, v);
      const i = (y * width + x) * 4;
      data[i] = PAPER[0];
      data[i + 1] = PAPER[1];
      data[i + 2] = PAPER[2];
      data[i + 3] = Math.round(a * 255);
    }
  }
  // `-rise`: clear at the top, paper at the bottom — the edge of a fog climbing over a
  // film. `-fall`: the same image flipped — the edge of a fog lifting off one. Flipping
  // in the file rather than in CSS keeps every fog transform a plain translate.
  const rise = `${OUT}/${name}-rise-${width}.webp`;
  const fall = `${OUT}/${name}-fall-${width}.webp`;
  const image = sharp(data, { raw: { width, height, channels: 4 } });
  await image.clone().webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(rise);
  await image.clone().flip().webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(fall);
  return [rise, fall];
}

for (const name of Object.keys(EDGES)) {
  for (const [w, h] of [[2048, 720], [1024, 420]]) {
    for (const file of await build(name, w, h)) {
      console.log(`${file.slice(resolve('.').length + 1)}  ${w}x${h}  ${(statSync(file).size / 1024).toFixed(1)} KB`);
    }
  }
}
