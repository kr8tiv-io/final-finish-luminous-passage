/**
 * Surface material states 0–7 — the one floor the whole site stands on.
 *
 * `EXPERIENCE-STORYBOARD.md` §1 names a single persistent WebGL floor plane whose
 * material state morphs across every act. This module owns the *description* of
 * those eight states (colour, roughness, metalness, clearcoat, plane opacity,
 * CSS fallback gradient) and the GLSL that renders any two of them blended by a
 * single `uMix` uniform. It is deliberately free of Three.js, React and the DOM so
 * every rule here is unit-testable.
 *
 * The procedural flake field, the pearl interference sweep and the fbm/noise basis
 * are reused verbatim from the floor visualizer (`src/lib/visualizer/finish-shader.ts`,
 * `FINISH_SHADER_CHUNK`) rather than re-derived — the flake on the journey floor and
 * the flake in the visualizer must be the same material or the site stops being one
 * material world.
 */

import { FINISH_SHADER_CHUNK } from '../visualizer/finish-shader';

export const SURFACE_STATE_IDS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export type SurfaceStateId = (typeof SURFACE_STATE_IDS)[number];

export interface SurfaceMaterialSpec {
  readonly id: SurfaceStateId;
  /** Stable slug used by the dev page, the fallback band and probes. */
  readonly name: string;
  /** Three sRGB hex stops sampled by the procedural shader (base, mid, accent). */
  readonly colors: readonly [string, string, string];
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  /**
   * Peak alpha of the floor plane for this state. The plane is a backdrop under the
   * paper wash, never a wallpaper: these stay low on purpose so page text contrast is
   * unchanged. State 7 (paper) is fully transparent — the plane *is* the paper.
   */
  readonly opacity: number;
  /** CSS gradient the `[data-surface-fallback]` band shows on balanced/still tiers. */
  readonly fallback: string;
}

export const SURFACE_MATERIALS: readonly SurfaceMaterialSpec[] = Object.freeze([
  {
    id: 0,
    name: 'liquid-pearl',
    colors: ['#e7e3da', '#cfd7de', '#164f83'],
    roughness: 0.06,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    opacity: 0.46,
    fallback: 'linear-gradient(180deg, rgba(22,79,131,.20), rgba(231,227,218,.34) 46%, rgba(207,215,222,.16))',
  },
  {
    id: 1,
    name: 'ground-concrete',
    colors: ['#8d8a83', '#767268', '#5d686c'],
    roughness: 0.94,
    metalness: 0,
    clearcoat: 0,
    clearcoatRoughness: 1,
    opacity: 0.58,
    fallback: 'linear-gradient(180deg, rgba(93,104,108,.26), rgba(141,138,131,.20) 52%, rgba(118,114,104,.10))',
  },
  {
    id: 2,
    name: 'cured-pearl',
    colors: ['#e4e0d7', '#f1efea', '#6fa6ca'],
    roughness: 0.14,
    metalness: 0.03,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    opacity: 0.42,
    fallback: 'linear-gradient(180deg, rgba(111,166,202,.18), rgba(222,217,207,.26) 50%, rgba(236,234,228,.12))',
  },
  {
    id: 3,
    name: 'flake',
    // Deeper than the cured coat on purpose: a broadcast chip floor reads as speckled
    // graphite-and-limestone, not as a smooth pearl with texture painted on.
    colors: ['#c6bdaa', '#49555b', '#164f83'],
    roughness: 0.34,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    opacity: 0.6,
    fallback: 'linear-gradient(180deg, rgba(22,79,131,.20), rgba(216,209,195,.28) 48%, rgba(93,104,108,.14))',
  },
  {
    id: 4,
    name: 'photograph',
    colors: ['#9a9a97', '#8f8f8c', '#a5a5a1'],
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    opacity: 0.56,
    fallback: 'linear-gradient(180deg, rgba(154,154,151,.26), rgba(143,143,140,.20) 55%, rgba(165,165,161,.10))',
  },
  {
    id: 5,
    name: 'metallic',
    colors: ['#2b3640', '#164f83', '#a9bfd0'],
    roughness: 0.18,
    // Not a mirror: a full-metal floor would just reflect the environment back as
    // near-white and lose the cobalt/graphite identity the storyboard names.
    metalness: 0.55,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    opacity: 0.66,
    fallback: 'linear-gradient(180deg, rgba(43,54,64,.30), rgba(22,79,131,.26) 47%, rgba(169,191,208,.12))',
  },
  {
    id: 6,
    name: 'satin-commercial',
    colors: ['#9aa0a3', '#b3b7b8', '#7d8688'],
    roughness: 0.35,
    metalness: 0.02,
    clearcoat: 0.25,
    clearcoatRoughness: 0.4,
    opacity: 0.5,
    fallback: 'linear-gradient(180deg, rgba(125,134,136,.24), rgba(154,160,163,.18) 52%, rgba(179,183,184,.09))',
  },
  {
    id: 7,
    name: 'paper',
    colors: ['#faf9f6', '#faf9f6', '#faf9f6'],
    roughness: 1,
    metalness: 0,
    clearcoat: 0,
    clearcoatRoughness: 1,
    opacity: 0,
    fallback: 'linear-gradient(180deg, rgba(250,249,246,0), rgba(250,249,246,0))',
  },
]);

/** Cobalt ink — the horizon line, and the only canvas pixel visible on a white stage. */
export const SURFACE_HORIZON_COLOR = '#164f83';
/** Storyboard S1/S2/Act 9: the plane is edge-on as a line at 62 % of viewport height. */
export const SURFACE_HORIZON_VH = 0.62;
/** `material-morph`: 0.6 s `power2.inOut` on a nav hover or a discrete state change. */
export const SURFACE_MORPH_DURATION = 0.6;
export const SURFACE_MORPH_EASE = 'power2.inOut';
/** `settle`: every live uniform damps to rest and the horizon line comes up to 1. */
export const SURFACE_SETTLE_DURATION = 0.5;
export const SURFACE_SETTLE_EASE = 'power2.out';

export function isSurfaceStateId(value: unknown): value is SurfaceStateId {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 7;
}

export function surfaceMaterial(id: SurfaceStateId): SurfaceMaterialSpec {
  return SURFACE_MATERIALS[id];
}

/** Nearest discrete state for a blended pair — what the CSS fallback band shows. */
export function dominantSurfaceState(a: SurfaceStateId, b: SurfaceStateId, mix: number): SurfaceStateId {
  const clamped = Math.min(1, Math.max(0, mix));
  return clamped < 0.5 ? a : b;
}

/** CPU-side companion to the shader blend, used by the fallback band and probes. */
export function blendedSurfaceOpacity(a: SurfaceStateId, b: SurfaceStateId, mix: number): number {
  const clamped = Math.min(1, Math.max(0, mix));
  return SURFACE_MATERIALS[a].opacity * (1 - clamped) + SURFACE_MATERIALS[b].opacity * clamped;
}

export function surfaceFallbackGradient(id: SurfaceStateId): string {
  return SURFACE_MATERIALS[id].fallback;
}

/** sRGB hex → linear-light RGB, so GLSL constants land in the renderer's working space. */
export function srgbToLinear(hex: string): readonly [number, number, number] {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  return channels.map((channel) => (channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4)) as unknown as readonly [number, number, number];
}

function glslVec3(hex: string): string {
  return `vec3(${srgbToLinear(hex).map((channel) => channel.toFixed(5)).join(', ')})`;
}

function stateConstants(): string {
  return SURFACE_MATERIALS.map((spec) => [
    `const vec3 FFE_A${spec.id} = ${glslVec3(spec.colors[0])};`,
    `const vec3 FFE_B${spec.id} = ${glslVec3(spec.colors[1])};`,
    `const vec3 FFE_C${spec.id} = ${glslVec3(spec.colors[2])};`,
    `const vec4 FFE_S${spec.id} = vec4(${spec.roughness.toFixed(3)}, ${spec.metalness.toFixed(3)}, `
      + `${spec.clearcoat.toFixed(3)}, ${spec.clearcoatRoughness.toFixed(3)});`,
    `const float FFE_O${spec.id} = ${spec.opacity.toFixed(4)};`,
  ].join('\n')).join('\n');
}

/**
 * The eight states, plus the A/B blend the whole morph system runs on.
 *
 * `FINISH_SHADER_CHUNK` is included whole so `hash21`, `noise`, `fbm`, `flakeField`
 * and `pearl` are the same functions the visualizer ships. Its `uA`/`uB`/`uC`/`uDensity`
 * uniforms are bound to the flake palette (state 3), which is the state that calls
 * `flakeField` directly; every other state reads the `FFE_*` constants generated above
 * from `SURFACE_MATERIALS`, so the TypeScript table stays the single source of truth.
 */
export const SURFACE_MATERIAL_CHUNK = /* glsl */ `
${FINISH_SHADER_CHUNK}

${stateConstants()}

struct FfeSurface {
  vec3 albedo;
  float roughness;
  float metalness;
  float clearcoat;
  float coatRoughness;
  float opacity;
};

// Specular sweep: a highlight that travels from the viewer's feet out to the horizon,
// measured in normalised view depth so it reads the same at either camera height.
// uSweep only advances while a morph or an explicit sweep is running, so an idle page
// renders zero frames.
float ffeSweep(float depth01, float sweep) {
  float head = fract(sweep) * 1.4 - 0.2;
  return exp(-pow((depth01 - head) / 0.15, 2.0));
}

vec3 ffeMetallicSwirl(vec2 uv, vec3 graphite, vec3 cobalt, vec3 sheen) {
  float base = fbm(uv * 2.1);
  vec2 warped = uv * vec2(1.7, 3.4) + vec2(base * 1.4, 0.0);
  // Anisotropic-looking: stretched along x so the highlight smears the way a
  // trowelled metallic floor does, never a symmetrical blob.
  float grain = sin(warped.x * 5.5 + fbm(warped * 1.9) * 6.0);
  vec3 col = mix(graphite, cobalt, 0.35 + 0.45 * base);
  col = mix(col, sheen, smoothstep(0.25, 0.95, grain * 0.5 + 0.5) * 0.55);
  col += sheen * pow(max(grain, 0.0), 8.0) * 0.35;
  return col;
}

vec3 ffeConcrete(vec2 uv, vec3 base, vec3 mid, vec3 shadow) {
  float coarse = fbm(uv * 9.0);
  float pits = pow(noise(uv * 46.0), 3.0);
  vec3 col = mix(base, mid, coarse);
  col = mix(col, shadow, pits * 0.55);
  return col;
}

vec3 ffeSatin(vec2 uv, vec3 base, vec3 light, vec3 dark) {
  float n = fbm(uv * 5.5);
  vec3 col = mix(dark, base, 0.4 + 0.5 * n);
  col = mix(col, light, smoothstep(0.55, 1.0, n) * 0.4);
  return col;
}

vec3 ffeLiquidPearl(vec2 uv, vec3 base, vec3 mid, vec3 subsurface, float sweep) {
  float flow = fbm(uv * 2.2 + vec2(sweep * 0.12, 0.0));
  vec3 col = mix(base, mid, flow);
  // Cobalt reads from underneath, not on top: the tint grows with depth into the pour.
  col = mix(col, subsurface, pow(clamp(flow, 0.0, 1.0), 1.6) * 0.42);
  float interference = 0.5 + 0.5 * sin(flow * 13.0 + sweep * 4.2);
  col += mix(vec3(0.0), subsurface, interference * 0.12);
  return col;
}

FfeSurface ffeSurfaceSample(float state, vec2 uv, float sweep, vec3 photo) {
  FfeSurface surface;
  vec4 params;
  vec3 albedo;
  float opacity;

  if (state < 0.5) {
    albedo = ffeLiquidPearl(uv, FFE_A0, FFE_B0, FFE_C0, sweep);
    params = FFE_S0;
    opacity = FFE_O0;
  } else if (state < 1.5) {
    albedo = ffeConcrete(uv, FFE_A1, FFE_B1, FFE_C1);
    params = FFE_S1;
    opacity = FFE_O1;
  } else if (state < 2.5) {
    albedo = ffeLiquidPearl(uv, FFE_A2, FFE_B2, FFE_C2, sweep * 0.35);
    params = FFE_S2;
    opacity = FFE_O2;
  } else if (state < 3.5) {
    // The visualizer's own flake field, uA/uB/uC bound to the state-3 palette.
    // Sampled finer than the other states so the chips land at real broadcast size.
    albedo = flakeField(uv * 4.0, uDensity, 1.0);
    params = FFE_S3;
    opacity = FFE_O3;
  } else if (state < 4.5) {
    albedo = photo;
    params = FFE_S4;
    opacity = FFE_O4;
  } else if (state < 5.5) {
    albedo = ffeMetallicSwirl(uv, FFE_A5, FFE_B5, FFE_C5);
    params = FFE_S5;
    opacity = FFE_O5;
  } else if (state < 6.5) {
    albedo = ffeSatin(uv, FFE_A6, FFE_B6, FFE_C6);
    params = FFE_S6;
    opacity = FFE_O6;
  } else {
    albedo = FFE_A7;
    params = FFE_S7;
    opacity = FFE_O7;
  }

  surface.albedo = albedo;
  surface.roughness = params.x;
  surface.metalness = params.y;
  surface.clearcoat = params.z;
  surface.coatRoughness = params.w;
  surface.opacity = opacity;
  return surface;
}

FfeSurface ffeSurfaceBlend(float a, float b, float mixAmount, vec2 uv, float sweep, vec3 photo) {
  FfeSurface sa = ffeSurfaceSample(a, uv, sweep, photo);
  FfeSurface sb = ffeSurfaceSample(b, uv, sweep, photo);
  float m = clamp(mixAmount, 0.0, 1.0);
  FfeSurface blended;
  blended.albedo = mix(sa.albedo, sb.albedo, m);
  blended.roughness = mix(sa.roughness, sb.roughness, m);
  blended.metalness = mix(sa.metalness, sb.metalness, m);
  blended.clearcoat = mix(sa.clearcoat, sb.clearcoat, m);
  blended.coatRoughness = mix(sa.coatRoughness, sb.coatRoughness, m);
  blended.opacity = mix(sa.opacity, sb.opacity, m);
  return blended;
}
`;

/** Every uniform name `SURFACE_MATERIAL_CHUNK` and the floor patch expect to be bound. */
export const SURFACE_UNIFORM_NAMES = Object.freeze([
  'uMaterialA',
  'uMaterialB',
  'uMix',
  'uSweep',
  'uPlaneOpacity',
  'uTiling',
  'uNearFade',
  'uFarFade',
  'uPhoto',
  'uPhotoReady',
  'uViewport',
  // Inherited from FINISH_SHADER_CHUNK; uA/uB/uC/uDensity carry the flake palette.
  'uA',
  'uB',
  'uC',
  'uDensity',
  'uPattern',
  'uReveal',
  'uLight',
] as const);

/** Vertex additions: plane uv (tiled) plus view depth for the recession fade. */
export const SURFACE_VERTEX_COMMON = /* glsl */ `
uniform float uTiling;
varying vec2 vSurfaceUv;
varying float vSurfaceDepth;
`;

export const SURFACE_VERTEX_BODY = /* glsl */ `
vSurfaceUv = uv * uTiling;
vSurfaceDepth = -(modelViewMatrix * vec4(position, 1.0)).z;
`;

export const SURFACE_FRAGMENT_COMMON = /* glsl */ `
uniform float uMaterialA;
uniform float uMaterialB;
uniform float uMix;
uniform float uSweep;
uniform float uPlaneOpacity;
uniform float uNearFade;
uniform float uFarFade;
uniform sampler2D uPhoto;
uniform float uPhotoReady;
/** (viewport origin y, viewport height) in device pixels — the band's own rectangle. */
uniform vec2 uViewport;
varying vec2 vSurfaceUv;
varying float vSurfaceDepth;
${SURFACE_MATERIAL_CHUNK}
`;

/**
 * Alpha profile of the plane, in view depth.
 *
 * A floor seen from standing height is brightest where it recedes toward the horizon
 * and almost nothing at the viewer's feet. That is also where the page has no text, so
 * the visible energy of the plane and the reading zone never occupy the same pixels.
 * Exported (and tested) separately because it is the rule that keeps text contrast intact.
 */
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Feet-side fade: the plane is effectively absent below this fraction of the depth range. */
export const SURFACE_FEET_FADE = 0.6;
/**
 * Horizon-side fade, measured up the band in SCREEN space rather than depth.
 *
 * Perspective compresses the last metres of floor into two or three pixels, so a
 * depth-space fade at the horizon lands entirely inside those pixels and the band's
 * top edge reads as a hard seam cut across the page. Fading over the top 38 % of the
 * band in screen space is what makes the plane dissolve into the cobalt line.
 */
export const SURFACE_HORIZON_FADE = 0.62;

export function surfaceDepthAlpha(depth: number, near: number, far: number): number {
  if (far <= near) return 0;
  const t = Math.min(1, Math.max(0, (depth - near) / (far - near)));
  return smoothstep(0.02, SURFACE_FEET_FADE, t);
}

/** `screen01`: 0 at the bottom of the band (the viewer's feet), 1 at the horizon line. */
export function surfaceScreenAlpha(screen01: number): number {
  return 1 - smoothstep(SURFACE_HORIZON_FADE, 0.99, Math.min(1, Math.max(0, screen01)));
}

export const SURFACE_FRAGMENT_COLOR = /* glsl */ `
float ffeT = clamp((vSurfaceDepth - uNearFade) / max(0.0001, uFarFade - uNearFade), 0.0, 1.0);
float ffeScreen = clamp((gl_FragCoord.y - uViewport.x) / max(1.0, uViewport.y), 0.0, 1.0);
float ffeDepthAlpha = smoothstep(0.02, ${SURFACE_FEET_FADE.toFixed(2)}, ffeT)
  * (1.0 - smoothstep(${SURFACE_HORIZON_FADE.toFixed(2)}, 0.99, ffeScreen));
vec3 ffePhoto = mix(vec3(0.34, 0.34, 0.335), texture2D(uPhoto, fract(vSurfaceUv)).rgb, uPhotoReady);
FfeSurface ffeSurface = ffeSurfaceBlend(uMaterialA, uMaterialB, uMix, vSurfaceUv, uSweep, ffePhoto);
float ffeSweepGain = ffeSweep(ffeT, uSweep);
diffuseColor.rgb = ffeSurface.albedo + ffeSurface.albedo * ffeSweepGain * 0.45;
diffuseColor.a = ffeSurface.opacity * uPlaneOpacity * ffeDepthAlpha;
`;

export const SURFACE_FRAGMENT_ROUGHNESS = /* glsl */ `
roughnessFactor = clamp(ffeSurface.roughness, 0.02, 1.0);
`;

export const SURFACE_FRAGMENT_METALNESS = /* glsl */ `
metalnessFactor = clamp(ffeSurface.metalness, 0.0, 1.0);
`;

export const SURFACE_FRAGMENT_CLEARCOAT = /* glsl */ `
#ifdef USE_CLEARCOAT
material.clearcoat = clamp(ffeSurface.clearcoat, 0.0, 1.0);
material.clearcoatRoughness = clamp(ffeSurface.coatRoughness, 0.0, 1.0);
#endif
`;

/** The cobalt horizon line, drawn in the band's own NDC so it is exactly N device px. */
export const SURFACE_HORIZON_VERTEX = /* glsl */ `
varying vec2 vHorizonUv;
void main() {
  vHorizonUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SURFACE_HORIZON_FRAGMENT = /* glsl */ `
uniform vec3 uHorizonColor;
uniform float uHorizonOpacity;
uniform float uHorizonWidth;
varying vec2 vHorizonUv;
void main() {
  float edge = 1.0 - vHorizonUv.y;
  float line = 1.0 - step(uHorizonWidth, edge);
  gl_FragColor = vec4(uHorizonColor, line * uHorizonOpacity);
  #include <colorspace_fragment>
}
`;
