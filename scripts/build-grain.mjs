/**
 * The site's grain tile (2026-09-22, Matt: "a soft overlay of the whole site ... a
 * transparent noise"). `public/images/brand/grain-160.png`, 160 x 160, seamless by
 * construction (every pixel is independent), grey + alpha.
 *
 * Each pixel is either a light or a dark speck with its own small alpha, so the one
 * tile reads as grain on the white paper and on the films alike without a blend mode
 * (see design-system.css: Safari repaints a fixed blend layer on every scroll). A
 * light 2x2 smoothing gives the specks a filmic softness instead of a digital hiss.
 * Deterministic: the same bytes on every run.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/images/brand/grain-160.png');
const N = 160;

let seed = 0x9e3779b9;
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Signed noise in [-1, 1], gently smoothed with its right and lower neighbours
// (wrapping, so the tile stays seamless).
const raw = new Float32Array(N * N);
for (let i = 0; i < raw.length; i += 1) raw[i] = rand() * 2 - 1;
const soft = new Float32Array(N * N);
for (let y = 0; y < N; y += 1) {
  for (let x = 0; x < N; x += 1) {
    const at = (xx, yy) => raw[((yy + N) % N) * N + ((xx + N) % N)];
    soft[y * N + x] = at(x, y) * 0.55 + (at(x + 1, y) + at(x, y + 1) + at(x - 1, y) + at(x, y - 1)) * 0.1125;
  }
}

const pixels = Buffer.alloc(N * N * 2);
for (let i = 0; i < soft.length; i += 1) {
  const v = Math.max(-1, Math.min(1, soft[i] * 1.6));
  // Light specks are white, dark specks near-ink; alpha grows with distance from 0.
  pixels[i * 2] = v >= 0 ? 255 : 23;
  pixels[i * 2 + 1] = Math.round(Math.abs(v) ** 1.35 * 38);
}

await sharp(pixels, { raw: { width: N, height: N, channels: 2 } })
  .png({ compressionLevel: 9, palette: false })
  .toFile(out);
const meta = await sharp(out).metadata();
console.log(`${out}: ${meta.width}x${meta.height}, ${meta.channels} channels`);
