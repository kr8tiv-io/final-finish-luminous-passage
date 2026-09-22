/**
 * Material close-ups, rendered from code (2026-09-22). Deterministic SVG rasterised by
 * sharp/librsvg, so every run writes the same bytes and nothing is AI-generated.
 *
 *   flake(palette)   a full broadcast of irregular chips (5-8 sided, log-normal sizes,
 *                    per-chip tone jitter) on a mottled base, the chips lit as raised
 *                    under a clear coat (feSpecularLighting on the chip alpha), then a
 *                    broad clear-coat sheen and a few mica flashes.
 *   concrete(opts)   a cement-grey slab face: two octaves of turbulence, aggregate
 *                    pits, and (for "ground") the arcs a diamond cup leaves.
 *
 * Out: public/images/brand/texture/<name>.webp
 *   midnight-aggregate   the Act 3 lens (the film's floor is blue-black with pale chips,
 *                        which is the catalogue's Midnight Aggregate)
 *   prep-slab, prep-ground, prep-base, prep-flake, prep-clear   the preparation cutaway
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/images/brand/texture');
mkdirSync(outDir, { recursive: true });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const shade = (h, k) => toHex(hex(h).map((v) => v * k));

/** One irregular chip as a polygon point list. */
function chip(random, cx, cy, size) {
  const sides = 5 + Math.floor(random() * 4);
  const turn = random() * Math.PI * 2;
  const stretch = 0.55 + random() * 0.45;
  const points = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = turn + (i / sides) * Math.PI * 2 + (random() - 0.5) * 0.55;
    const radius = size * (0.55 + random() * 0.45);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * stretch;
    const rx = x * Math.cos(turn) - y * Math.sin(turn);
    const ry = x * Math.sin(turn) + y * Math.cos(turn);
    points.push(`${(cx + rx).toFixed(1)},${(cy + ry).toFixed(1)}`);
  }
  return points.join(' ');
}

/** Log-normal-ish chip size: many small, a few large. */
const chipSize = (random, min, max) => min + (max - min) * random() ** 2.6;

export function flakeSvg({ size = 900, palette, count = 2600, min = 3, max = 19, seed = 7, coverage = 1, raised = true, extra = '', baseTone }) {
  const random = rng(seed);
  const [paletteBase, mid, light] = palette;
  const base = baseTone ?? paletteBase;
  const chips = [];
  for (let i = 0; i < count; i += 1) {
    const s = chipSize(random, min, max);
    const x = random() * size;
    const y = random() * size;
    if (random() > coverage) continue;
    const pick = random();
    const tone = pick < 0.42 ? mid : pick < 0.8 ? light : paletteBase;
    const jitter = 0.82 + random() * 0.3;
    chips.push(`<polygon points="${chip(random, x, y, s)}" fill="${shade(tone, jitter)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="mottle" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="${seed}" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .14 0"/>
    </filter>
    <filter id="raised" x="-5%" y="-5%" width="110%" height="110%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="bump"/>
      <feSpecularLighting in="bump" surfaceScale="2.2" specularConstant="0.9" specularExponent="22" lighting-color="#ffffff" result="spec">
        <feDistantLight azimuth="235" elevation="38"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
      <feOffset in="SourceAlpha" dx="0.8" dy="1.2" result="off"/>
      <feGaussianBlur in="off" stdDeviation="1" result="shadow"/>
      <feColorMatrix in="shadow" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0" result="shadowTint"/>
      <feMerge><feMergeNode in="shadowTint"/><feMergeNode in="SourceGraphic"/><feMergeNode in="specIn"/></feMerge>
    </filter>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".42" stop-color="#fff" stop-opacity=".0"/>
      <stop offset=".52" stop-color="#fff" stop-opacity=".16"/>
      <stop offset=".62" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="${base}"/>
  <rect width="100%" height="100%" filter="url(#mottle)"/>
  <g${raised ? ' filter="url(#raised)"' : ''}>${chips.join('')}</g>
  <rect width="100%" height="100%" fill="url(#sheen)"/>
  ${extra}
</svg>`;
}

export function concreteSvg({ size = 900, tone = '#a9a59d', seed = 3, ground = false, pits = 900 }) {
  const random = rng(seed);
  const holes = [];
  for (let i = 0; i < pits; i += 1) {
    const r = 0.5 + random() ** 3 * 3.2;
    holes.push(`<circle cx="${(random() * size).toFixed(1)}" cy="${(random() * size).toFixed(1)}" r="${r.toFixed(2)}" fill="${shade(tone, 0.55 + random() * 0.2)}" opacity="${(0.35 + random() * 0.5).toFixed(2)}"/>`);
  }
  const arcs = [];
  if (ground) {
    // Diamond-cup passes: overlapping arcs, faint and lighter than the slab.
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        const cx = col * (size / 6) + (row % 2) * (size / 12) + (random() - 0.5) * 30;
        const cy = row * (size / 6) + (random() - 0.5) * 30;
        const r = size * (0.085 + random() * 0.03);
        for (let ring = 0; ring < 5; ring += 1) {
          arcs.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r - ring * 5).toFixed(1)}" fill="none" stroke="#ffffff" stroke-opacity="${(0.05 + random() * 0.05).toFixed(3)}" stroke-width="${(1 + random() * 1.4).toFixed(2)}"/>`);
        }
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="${ground ? 0.85 : 0.7}" numOctaves="2" seed="${seed}" result="fine"/>
      <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${ground ? '.18' : '.26'} 0"/>
    </filter>
    <filter id="cloud" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="4" seed="${seed + 11}" result="c"/>
      <feColorMatrix in="c" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .22 -0.04"/>
    </filter>
    <filter id="stain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.0045" numOctaves="3" seed="${seed + 29}" result="s"/>
      <feColorMatrix in="s" type="matrix" values="0 0 0 0 .32  0 0 0 0 .29  0 0 0 0 .25  0 0 0 .9 -0.38"/>
    </filter>
    <filter id="speck" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="1" seed="${seed + 5}" result="f"/>
      <feColorMatrix in="f" type="matrix" values="0 0 0 0 .18  0 0 0 0 .17  0 0 0 0 .16  1 0 0 0 0" result="a"/>
      <feComponentTransfer in="a"><feFuncA type="discrete" tableValues="0 0 0 0 0 0 0 0 0 .55"/></feComponentTransfer>
    </filter>
    <filter id="speckLight" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="${seed + 17}" result="f"/>
      <feColorMatrix in="f" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 1 0 0 0" result="a"/>
      <feComponentTransfer in="a"><feFuncA type="discrete" tableValues="0 0 0 0 0 0 0 0 0 .4"/></feComponentTransfer>
    </filter>
    <radialGradient id="vignette" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="${tone}"/>
  <rect width="100%" height="100%" filter="url(#cloud)"/>
  <rect width="100%" height="100%" filter="url(#stain)"/>
  <rect width="100%" height="100%" filter="url(#grain)"/>
  <rect width="100%" height="100%" filter="url(#speck)"/>
  <rect width="100%" height="100%" filter="url(#speckLight)"/>
  <rect width="100%" height="100%" fill="url(#vignette)"/>
  <g>${holes.join('')}</g>
  <g>${arcs.join('')}</g>
</svg>`;
}

/** A crack across a ground slab, filled flush with a paler filler. */
export function crackSvg({ size = 900, seed = 12 }) {
  const random = rng(seed);
  const points = [];
  let x = -20;
  let y = size * 0.3;
  while (x < size + 20) {
    points.push([x, y]);
    x += 18 + random() * 34;
    y += (random() - 0.42) * 46;
  }
  const d = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const branch = `M${(size * 0.46).toFixed(1)},${(size * 0.42).toFixed(1)} L${(size * 0.52).toFixed(1)},${(size * 0.55).toFixed(1)} L${(size * 0.5).toFixed(1)},${(size * 0.7).toFixed(1)} L${(size * 0.57).toFixed(1)},${(size * 0.86).toFixed(1)}`;
  const base = concreteSvg({ size, tone: '#b1aca3', seed, ground: true, pits: 1100 });
  // Ragged edges: the strokes are pushed around by turbulence, so the crack and its
  // filler have the torn outline a real one does, not a drawn line's.
  const crack = `<defs><filter id="rag" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${seed + 3}" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="9" xChannelSelector="R" yChannelSelector="G"/>
    </filter><filter id="soft"><feGaussianBlur stdDeviation="2.4"/></filter></defs>
    <g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#rag)">
      <path d="${d}" stroke="#2f2c28" stroke-width="22" opacity=".28" filter="url(#soft)"/>
      <path d="${d}" stroke="#57524a" stroke-width="16" opacity=".75"/>
      <path d="${branch}" stroke="#57524a" stroke-width="10" opacity=".7"/>
      <path d="${d}" stroke="#d6cdbd" stroke-width="11"/>
      <path d="${branch}" stroke="#d6cdbd" stroke-width="6.5"/>
      <path d="${d}" stroke="#ffffff" stroke-width="2.5" opacity=".3" transform="translate(-1.8,-1.8)"/>
    </g>`;
  return base.replace('</svg>', `${crack}</svg>`);
}

/**
 * A metallic marble (the catalogue's Pearl Calacatta: "pearlescent white with silver
 * veins"): elongated turbulence cut into thin bands for the veins, a second softer band
 * for the cloud, a pearl sheen across it. For the finish samples (FinishSamples3D).
 */
export function marbleSvg({ size = 1024, seed = 31 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="veins" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.0032 0.011" numOctaves="5" seed="${seed}" result="t"/>
      <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.4 0 0 0 -0.2" result="a"/>
      <feComponentTransfer in="a" result="band"><feFuncA type="table" tableValues="0 0 0 0 0.85 0 0 0 0 0.6 0 0 0 0"/></feComponentTransfer>
      <feColorMatrix in="band" type="matrix" values="0 0 0 0 .56  0 0 0 0 .61  0 0 0 0 .64  0 0 0 1 0"/>
    </filter>
    <filter id="cloud" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.0022 0.006" numOctaves="4" seed="${seed + 7}" result="c"/>
      <feColorMatrix in="c" type="matrix" values="0 0 0 0 .77  0 0 0 0 .8  0 0 0 0 .81  0 0 0 .75 -0.2"/>
    </filter>
    <filter id="soft"><feGaussianBlur stdDeviation="0.8"/></filter>
    <linearGradient id="pearl" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f1ff" stop-opacity=".35"/>
      <stop offset=".45" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".7" stop-color="#e9f6f4" stop-opacity=".3"/>
      <stop offset="1" stop-color="#fff6ea" stop-opacity=".25"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#f2efe8"/>
  <rect width="100%" height="100%" filter="url(#cloud)"/>
  <g filter="url(#soft)"><rect width="100%" height="100%" filter="url(#veins)"/></g>
  <rect width="100%" height="100%" fill="url(#pearl)"/>
</svg>`;
}

/** The crack alone, on transparency: a decal for the 3D slab (PrepLayers3D). */
export function crackDecalSvg({ size = 1024, seed = 12 }) {
  const random = rng(seed);
  const points = [];
  let x = -20;
  let y = size * 0.46;
  while (x < size * 0.78) {
    points.push([x, y]);
    x += 20 + random() * 36;
    y += (random() - 0.5) * 60;
  }
  const d = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const [bx, by] = points[Math.floor(points.length * 0.55)];
  const branch = `M${bx.toFixed(1)},${by.toFixed(1)} L${(bx + 40).toFixed(1)},${(by + 120).toFixed(1)} L${(bx + 20).toFixed(1)},${(by + 240).toFixed(1)} L${(bx + 70).toFixed(1)},${(by + 380).toFixed(1)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><filter id="rag" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="${seed + 3}" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="10" xChannelSelector="R" yChannelSelector="G"/>
  </filter><filter id="soft"><feGaussianBlur stdDeviation="3"/></filter></defs>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#rag)">
    <path d="${d}" stroke="#1e1b17" stroke-width="30" opacity=".22" filter="url(#soft)"/>
    <path d="${d}" stroke="#4a453d" stroke-width="20"/>
    <path d="${branch}" stroke="#4a453d" stroke-width="13"/>
    <path d="${d}" stroke="#d9cfbd" stroke-width="13"/>
    <path d="${branch}" stroke="#d9cfbd" stroke-width="8"/>
    <path d="${d}" stroke="#ffffff" stroke-width="3" opacity=".3" transform="translate(-2,-2)"/>
  </g>
</svg>`;
}

/** Three different states of the same broadcast, so the process reads as a sequence. */
const BLEND = ['#3b4347', '#8f969a', '#eeece6'];

/** Broadcast into the wet coat: sparse chips on a glossy, still-wet charcoal base. */
export function broadcastSvg({ size = 900, seed = 9 }) {
  const wet = `<defs>
      <linearGradient id="wetStreak" x1="0" y1="0" x2="1" y2="1"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".47" stop-color="#e8f2f6" stop-opacity=".22"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".34"/><stop offset=".53" stop-color="#e8f2f6" stop-opacity=".22"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <radialGradient id="wetPool" cx=".3" cy=".75" r=".5"><stop offset="0" stop-color="#9fb7c4" stop-opacity=".16"/><stop offset="1" stop-color="#9fb7c4" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#wetPool)"/>
    <rect width="100%" height="100%" fill="url(#wetStreak)"/>`;
  return flakeSvg({ size, palette: BLEND, baseTone: '#262d31', seed, count: 520, min: 3, max: 16, extra: wet });
}

/** Scraped back: a full broadcast, dry and matte, flattened, the scraper's long passes in it. */
export function scrapedSvg({ size = 900, seed = 14 }) {
  const random = rng(seed + 40);
  const passes = [];
  for (let i = 0; i < 16; i += 1) {
    const y = random() * size;
    const tilt = (random() - 0.5) * 40;
    passes.push(`<path d="M-20,${y.toFixed(1)} L${size + 20},${(y + tilt).toFixed(1)}" stroke="#ffffff" stroke-opacity="${(0.05 + random() * 0.07).toFixed(3)}" stroke-width="${(10 + random() * 26).toFixed(1)}" fill="none"/>`);
  }
  const matte = `<rect width="100%" height="100%" fill="#d9dcda" opacity=".16"/><g>${passes.join('')}</g>`;
  return flakeSvg({ size, palette: BLEND, seed, count: 3800, min: 3, max: 14, raised: false, extra: matte });
}

/** The top coat going on: the sealed half deep and glossy with a window in it, the dry half matte, a wet edge between. */
export function coatedSvg({ size = 900, seed = 14 }) {
  const edge = `M${size * 0.38},-10 C${size * 0.46},${size * 0.3} ${size * 0.3},${size * 0.62} ${size * 0.44},${size + 10}`;
  const coat = `<defs>
      <clipPath id="sealed"><path d="${edge} L${size + 10},${size + 10} L${size + 10},-10 Z"/></clipPath>
      <linearGradient id="window" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <filter id="blurWin"><feGaussianBlur stdDeviation="10"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="#e1e3e0" opacity=".3"/>
    <g clip-path="url(#sealed)">
      <rect width="100%" height="100%" fill="#0d1418" opacity=".44"/>
      <rect x="${size * 0.56}" y="${size * 0.12}" width="${size * 0.3}" height="${size * 0.5}" fill="url(#window)" filter="url(#blurWin)" opacity=".85" transform="skewX(-14)"/>
      <rect x="${size * 0.62}" y="${size * 0.14}" width="${size * 0.012}" height="${size * 0.48}" fill="#fff" opacity=".35" filter="url(#blurWin)" transform="skewX(-14)"/>
    </g>
    <path d="${edge}" stroke="#ffffff" stroke-opacity=".55" stroke-width="3" fill="none"/>
    <path d="${edge}" stroke="#ffffff" stroke-opacity=".18" stroke-width="16" fill="none" filter="url(#blurWin)"/>`;
  return flakeSvg({ size, palette: BLEND, seed, count: 3800, min: 3, max: 14, extra: coat });
}
/**
 * Procedural marble, computed per pixel (SVG turbulence makes contour blobs, not veins):
 * a sine across the slab warped by fractal value noise, so its zero-crossings run as
 * long flowing veins; a finer second vein set; soft clouding; a pearl tint.
 */
async function writeMarble(name, size = 1024, seed = 31) {
  const random = rng(seed);
  const N = 256;
  const lattice = new Float32Array(N * N).map(() => random());
  const smooth = (t) => t * t * (3 - 2 * t);
  const value = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const at = (i, j) => lattice[((j & (N - 1)) * N) + (i & (N - 1))];
    const top = at(xi, yi) * (1 - xf) + at(xi + 1, yi) * xf;
    const bottom = at(xi, yi + 1) * (1 - xf) + at(xi + 1, yi + 1) * xf;
    return top * (1 - yf) + bottom * yf;
  };
  const fbm = (x, y) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let o = 0; o < 6; o += 1) { sum += amp * value(x * freq, y * freq); freq *= 2.03; amp *= 0.5; }
    return sum;
  };
  const px = Buffer.alloc(size * size * 3);
  const base = [242, 239, 232];
  const vein = [146, 156, 162];
  const deep = [112, 122, 128];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const warp = fbm(u * 3.2, v * 3.2);
      const main = Math.abs(Math.sin((u * 2.4 + v * 1.1) * Math.PI * 2 + warp * 9.5));
      const fine = Math.abs(Math.sin((u * 5.5 - v * 2.2) * Math.PI * 2 + fbm(u * 6 + 11, v * 6 + 7) * 12));
      const veinA = (1 - main) ** 9;
      const veinB = (1 - fine) ** 18 * 0.55;
      const cloud = fbm(u * 1.6 + 40, v * 1.6 + 40);
      const k = Math.min(1, veinA * 0.85 + veinB);
      const d = Math.min(1, veinA ** 3 * 0.8);
      const i = (y * size + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        let col = base[c] * (0.965 + cloud * 0.07);
        col = col * (1 - k) + vein[c] * k;
        col = col * (1 - d) + deep[c] * d;
        // A faint pearl tint that drifts across the slab.
        const pearl = [3, -1, 4][c] * Math.sin(u * 5 + v * 3 + warp * 2);
        px[i + c] = Math.max(0, Math.min(255, Math.round(col + pearl)));
      }
    }
  }
  const file = resolve(outDir, `${name}.webp`);
  await sharp(px, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: 86 }).toFile(file);
  console.log(`${name}: ${size}x${size} (procedural marble)`);
}

async function write(name, svg, size) {
  const file = resolve(outDir, `${name}.webp`);
  await sharp(Buffer.from(svg)).resize(size, size).webp({ quality: 84 }).toFile(file);
  const meta = await sharp(file).metadata();
  console.log(`${name}: ${meta.width}x${meta.height}`);
}

const only = process.argv.slice(2);
const jobs = {
  'midnight-aggregate': () => write('midnight-aggregate', flakeSvg({ size: 900, palette: ['#121c24', '#5c686e', '#e2e3de'], seed: 21 }), 720),
  'prep-slab': () => write('prep-slab', concreteSvg({ size: 900, tone: '#a39e95', seed: 5 }), 900),
  'prep-ground': () => write('prep-ground', concreteSvg({ size: 900, tone: '#b3aea5', seed: 6, ground: true, pits: 1400 }), 900),
  'prep-flake': () => write('prep-flake', broadcastSvg({ size: 900, seed: 9 }), 900),
  'prep-crack': () => write('prep-crack', crackSvg({ size: 900, seed: 12 }), 900),
  'prep-scraped': () => write('prep-scraped', scrapedSvg({ size: 900, seed: 14 }), 900),
  'prep-glossy': () => write('prep-glossy', coatedSvg({ size: 900, seed: 14 }), 900),
  'prep-crack-decal': () => write('prep-crack-decal', crackDecalSvg({ size: 1024, seed: 12 }), 1024),
  'pearl-calacatta': () => writeMarble('pearl-calacatta', 1024, 31),
};
for (const [name, job] of Object.entries(jobs)) {
  if (only.length && !only.includes(name)) continue;
  await job();
}
