import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { FinishPreset } from '../../lib/visualizer/finishes';

/**
 * The alcove's material layer. Everything here is generated in code — no texture,
 * HDR, or environment file is fetched, so the route still makes no network call
 * beyond its own origin.
 */

/** The homepage `SurfaceFloor` metallic state (id 5) the finish hall hands off from. */
export const ENTRY_METALLIC = ['#2b3640', '#164f83', '#a9bfd0'] as const;
export const ENTRY_SETTLE_DURATION = 0.9;
export const ENTRY_SETTLE_EASE = 'power2.out';

export interface FinishSurfaceTraits {
  /** Screen-space flake flash, flake family only. */
  sparkle: number;
  /** Anisotropic swirl highlight, metallic family only. */
  swirl: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
}

/** Per-family surface behaviour. The 30 finishes stay data-driven; only the physics differ. */
export function finishSurfaceTraits(finish: FinishPreset): FinishSurfaceTraits {
  if (finish.family === 'metallic') {
    // Not a mirror — the same call the homepage floor makes at its metallic state.
    return { sparkle: 0, swirl: 0.85, metalness: 0.58, clearcoat: 1, clearcoatRoughness: 0.055, envMapIntensity: 1.45 };
  }
  if (finish.family === 'flake') {
    return { sparkle: 0.5, swirl: 0, metalness: 0.06, clearcoat: 0.72, clearcoatRoughness: 0.14, envMapIntensity: 1.15 };
  }
  return { sparkle: 0, swirl: 0, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.075, envMapIntensity: 1.3 };
}

/**
 * A procedural room environment through `PMREMGenerator`, so metallic and satin
 * finishes reflect something with structure instead of a flat colour.
 */
export function createRoomEnvironment(renderer: THREE.WebGLRenderer): { texture: THREE.Texture; dispose: () => void } {
  // No `compileEquirectangularShader()` here: `fromScene` never uses that program, and
  // compiling it costs a shader build on the same tick the photo path may need.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  // 128 instead of the 256 default: the room is a soft gradient box, and halving the
  // cube size halves the build cost for a reflection nobody can tell apart.
  const target = pmrem.fromScene(room, 0.035, 0.1, 100, { size: 128 });
  room.dispose();
  pmrem.dispose();
  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  };
}

/** Deterministic value noise, so a capture taken twice looks the same. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/**
 * Screen-space sparkle source. Sampled against `gl_FragCoord`, offset only by camera
 * movement — a still camera gives a still floor, never a constant shimmer.
 */
export function createSparkleTexture(size = 256): THREE.DataTexture {
  const random = seeded(0x5eed_1a3f);
  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    const grain = random();
    const flash = random();
    data[index * 4] = Math.round(grain * 255);
    data[index * 4 + 1] = Math.round(flash * 255);
    data[index * 4 + 2] = Math.round(random() * 255);
    data[index * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Soft contact gradient dropped under each pillar base — occlusion without a depth pass. */
export function createContactTexture(size = 128): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(12,16,19,0.62)');
  gradient.addColorStop(0.45, 'rgba(12,16,19,0.28)');
  gradient.addColorStop(1, 'rgba(12,16,19,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Writes a per-vertex ambient-occlusion tint into the `color` attribute. */
export function bakeVertexAo(
  geometry: THREE.BufferGeometry,
  shade: (x: number, y: number, z: number) => number,
): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const value = Math.min(1, Math.max(0, shade(position.getX(index), position.getY(index), position.getZ(index))));
    colors[index * 3] = value;
    colors[index * 3 + 1] = value;
    colors[index * 3 + 2] = value;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const PILLAR_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0.46, 0], [0.46, 0.16], [0.40, 0.22],
  [0.36, 0.26], [0.40, 0.33], [0.345, 0.40],
  [0.315, 0.52], [0.305, 1.30], [0.288, 2.05], [0.268, 2.52],
  [0.29, 2.60], [0.325, 2.68], [0.283, 2.76],
  [0.32, 2.86], [0.41, 3.00], [0.45, 3.08],
  [0.48, 3.12], [0.48, 3.26], [0.42, 3.31], [0, 3.31],
];

export const PILLAR_HEIGHT = 3.31;

/**
 * An ornate lathed column — plinth, torus, fluted shaft, astragal, echinus, abacus —
 * with baked vertex AO so the bases sit into the ground instead of floating on it.
 */
export function createPillarGeometry(radialSegments = 44): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(
    PILLAR_PROFILE.map(([x, y]) => new THREE.Vector2(x, y)),
    radialSegments,
  );
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const radius = Math.hypot(x, z);
    if (radius < 0.02 || y < 0.5 || y > 2.5) continue;
    const theta = Math.atan2(z, x);
    const groove = 0.5 + 0.5 * Math.cos(theta * 20);
    const shaped = radius * (1 - 0.042 * groove);
    position.setX(index, (x / radius) * shaped);
    position.setZ(index, (z / radius) * shaped);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return bakeVertexAo(geometry, (_x, y) => {
    const fromGround = Math.min(1, Math.max(0, y / 1.25));
    const ground = 0.34 + 0.66 * (fromGround * fromGround * (3 - 2 * fromGround));
    // The capital overhangs the shaft; the neck under it never sees the room.
    const neck = y > 2.5 && y < 2.92 ? 0.82 : 1;
    return ground * neck;
  });
}

/**
 * Shallow arch over the alcove mouth. The ring is flattened into an ellipse while the
 * tube stays round — scaling the whole mesh instead would squash it into a ribbon.
 */
export function createArchGeometry(radius: number, tube = 0.3, flatten = 0.42): THREE.BufferGeometry {
  const geometry = new THREE.TorusGeometry(radius, tube, 14, 52, Math.PI);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const length = Math.hypot(x, y) || 1;
    const ringY = (y / length) * radius;
    position.setY(index, ringY * flatten + (y - ringY));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return bakeVertexAo(geometry, (_x, y) => 0.62 + 0.38 * Math.min(1, Math.max(0, (y + tube) / (radius * flatten + tube * 2))));
}

/** A wall panel that darkens toward the floor and toward its own outer edges. */
export function createWallGeometry(width: number, height: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, 12, 12);
  return bakeVertexAo(geometry, (x, y) => {
    const up = Math.min(1, Math.max(0, (y + height / 2) / (height * 0.55)));
    const edge = 1 - 0.22 * Math.min(1, Math.max(0, (Math.abs(x) / (width / 2) - 0.55) / 0.45));
    return (0.38 + 0.62 * up) * edge;
  });
}

/**
 * GLSL appended after `FINISH_SHADER_CHUNK` (which supplies `noise`, `fbm`, `uLight`).
 * Adds the entry crossfade, the flake sparkle, and the metallic swirl.
 */
export const ALCOVE_FINISH_CHUNK = /* glsl */ `
uniform sampler2D uSparkleTex;
uniform vec2 uSparkleShift;
uniform float uSparkleAmount;
uniform float uSwirlAmount;
uniform float uEntry;
uniform vec3 uEntryA;
uniform vec3 uEntryB;
uniform vec3 uEntryC;

/** Three octaves is enough for a swirl direction, and the floor shader is fill-bound. */
float ffeFbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.07;
    a *= 0.5;
  }
  return v;
}

vec3 ffeEntrySample(vec2 uv) {
  float n = ffeFbm3(uv * 2.2);
  vec3 col = mix(uEntryA, uEntryB, n);
  float shift = 0.5 + 0.5 * sin(n * 11.0 + uLight.x * 7.0);
  col = mix(col, uEntryC, shift * 0.45);
  col += uEntryC * pow(max(0.0, 1.0 - distance(uv, uLight)), 7.0) * 0.30;
  return col;
}

float ffeSparkle(vec2 fragCoord) {
  if (uSparkleAmount <= 0.0) return 0.0;
  vec2 p = fragCoord * 0.0042 + uSparkleShift;
  float grain = texture2D(uSparkleTex, p).r;
  float flash = texture2D(uSparkleTex, p * 2.13 + vec2(0.37, 0.11)).g;
  return smoothstep(0.58, 0.94, grain * flash * 1.7) * uSparkleAmount;
}

vec3 ffeSwirl(vec2 uv, vec3 tint) {
  if (uSwirlAmount <= 0.0) return vec3(0.0);
  float field = ffeFbm3(uv * 3.4);
  float angle = field * 6.2831853;
  vec2 dir = vec2(cos(angle), sin(angle));
  vec2 toLight = uv - uLight;
  float len = max(length(toLight), 0.0001);
  float along = abs(dot(toLight / len, dir));
  float streak = pow(along, 7.0) * exp(-len * 1.7);
  return mix(vec3(1.0), tint, 0.45) * streak * uSwirlAmount;
}
`;
