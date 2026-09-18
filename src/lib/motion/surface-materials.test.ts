import { describe, expect, it } from 'vitest';
import { FINISH_SHADER_CHUNK } from '../visualizer/finish-shader';
import {
  blendedSurfaceOpacity,
  dominantSurfaceState,
  isSurfaceStateId,
  srgbToLinear,
  SURFACE_HORIZON_COLOR,
  SURFACE_HORIZON_FADE,
  SURFACE_HORIZON_VH,
  SURFACE_MATERIAL_CHUNK,
  SURFACE_MATERIALS,
  SURFACE_MORPH_DURATION,
  SURFACE_MORPH_EASE,
  surfaceDepthAlpha,
  surfaceFallbackGradient,
  surfaceMaterial,
  surfaceScreenAlpha,
} from './surface-materials';

describe('surface material table', () => {
  it('declares exactly the eight storyboard states in order', () => {
    expect(SURFACE_MATERIALS).toHaveLength(8);
    expect(SURFACE_MATERIALS.map((spec) => spec.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(SURFACE_MATERIALS.map((spec) => spec.name)).toEqual([
      'liquid-pearl',
      'ground-concrete',
      'cured-pearl',
      'flake',
      'photograph',
      'metallic',
      'satin-commercial',
      'paper',
    ]);
  });

  it('holds each state to the properties the storyboard names', () => {
    // 0 liquid pearl: clearcoat with a cobalt subsurface tint.
    expect(surfaceMaterial(0).clearcoat).toBe(1);
    expect(surfaceMaterial(0).colors[2]).toBe('#164f83');
    // 1 ground concrete: matte, no clearcoat.
    expect(surfaceMaterial(1).clearcoat).toBe(0);
    expect(surfaceMaterial(1).roughness).toBeGreaterThan(0.9);
    // 5 metallic: cobalt/graphite, actually metallic.
    expect(surfaceMaterial(5).metalness).toBeGreaterThan(0.5);
    // 6 satin commercial: mid grey at roughness 0.35.
    expect(surfaceMaterial(6).roughness).toBeCloseTo(0.35, 5);
    // 7 paper: no reflections and the plane disappears into the paper.
    expect(surfaceMaterial(7).clearcoat).toBe(0);
    expect(surfaceMaterial(7).opacity).toBe(0);
    expect(surfaceMaterial(7).colors[0].toLowerCase()).toBe('#faf9f6');
  });

  it('keeps every plane opacity under a full wash so it stays a backdrop', () => {
    for (const spec of SURFACE_MATERIALS) {
      expect(spec.opacity).toBeGreaterThanOrEqual(0);
      expect(spec.opacity).toBeLessThanOrEqual(0.7);
    }
    // Pearl reads lighter than concrete or metallic, as the storyboard describes them.
    expect(surfaceMaterial(2).opacity).toBeLessThan(surfaceMaterial(1).opacity);
    expect(surfaceMaterial(2).opacity).toBeLessThan(surfaceMaterial(5).opacity);
  });

  it('gives every state a distinct fallback gradient except paper', () => {
    const gradients = SURFACE_MATERIALS.filter((spec) => spec.id !== 7).map((spec) => spec.fallback);
    expect(new Set(gradients).size).toBe(gradients.length);
    expect(surfaceFallbackGradient(7)).toContain('rgba(250,249,246,0)');
  });

  it('pins the horizon contract', () => {
    expect(SURFACE_HORIZON_VH).toBe(0.62);
    expect(SURFACE_HORIZON_COLOR).toBe('#164f83');
    expect(SURFACE_MORPH_DURATION).toBe(0.6);
    expect(SURFACE_MORPH_EASE).toBe('power2.inOut');
  });
});

describe('state helpers', () => {
  it('accepts only integer ids 0-7', () => {
    expect(isSurfaceStateId(0)).toBe(true);
    expect(isSurfaceStateId(7)).toBe(true);
    expect(isSurfaceStateId(8)).toBe(false);
    expect(isSurfaceStateId(-1)).toBe(false);
    expect(isSurfaceStateId(2.5)).toBe(false);
    expect(isSurfaceStateId('3')).toBe(false);
  });

  it('resolves the dominant state at the blend midpoint', () => {
    expect(dominantSurfaceState(1, 5, 0)).toBe(1);
    expect(dominantSurfaceState(1, 5, 0.49)).toBe(1);
    expect(dominantSurfaceState(1, 5, 0.5)).toBe(5);
    expect(dominantSurfaceState(1, 5, 1)).toBe(5);
    expect(dominantSurfaceState(1, 5, 4)).toBe(5);
  });

  it('blends plane opacity linearly and clamps out-of-range mixes', () => {
    expect(blendedSurfaceOpacity(3, 7, 0)).toBeCloseTo(0.6, 5);
    expect(blendedSurfaceOpacity(3, 7, 1)).toBeCloseTo(0, 5);
    expect(blendedSurfaceOpacity(3, 7, 0.5)).toBeCloseTo(0.3, 5);
    expect(blendedSurfaceOpacity(3, 7, -2)).toBeCloseTo(0.6, 5);
  });
});

describe('srgbToLinear', () => {
  it('maps the endpoints and a known mid-grey', () => {
    expect(srgbToLinear('#000000')).toEqual([0, 0, 0]);
    expect(srgbToLinear('#ffffff')[0]).toBeCloseTo(1, 6);
    // 0x80 / 255 = 0.50196 sRGB -> 0.21586 linear.
    expect(srgbToLinear('#808080')[0]).toBeCloseTo(0.21586, 4);
  });

  it('uses the linear segment below the sRGB knee', () => {
    // 0x02 / 255 = 0.00784, under 0.04045, so the /12.92 branch applies.
    expect(srgbToLinear('#020202')[0]).toBeCloseTo(0.00784313 / 12.92, 8);
  });

  it('keeps channels independent', () => {
    const [r, g, b] = srgbToLinear('#164f83');
    expect(r).toBeLessThan(g);
    expect(g).toBeLessThan(b);
  });
});

describe('surfaceDepthAlpha', () => {
  it('is nothing at the viewer feet and strongest as the floor recedes', () => {
    expect(surfaceDepthAlpha(1, 1, 9)).toBe(0);
    const feet = surfaceDepthAlpha(2, 1, 9);
    const middle = surfaceDepthAlpha(5, 1, 9);
    const nearHorizon = surfaceDepthAlpha(7.5, 1, 9);
    expect(feet).toBeLessThan(middle);
    expect(middle).toBeLessThan(nearHorizon);
    // The near field is where the hero proof line and the chapter index sit.
    expect(feet).toBeLessThan(0.15);
  });

  it('clamps outside the range and refuses an inverted range', () => {
    expect(surfaceDepthAlpha(-5, 1, 9)).toBe(0);
    expect(surfaceDepthAlpha(50, 1, 9)).toBeCloseTo(1, 6);
    expect(surfaceDepthAlpha(5, 9, 1)).toBe(0);
  });
});

describe('surfaceScreenAlpha', () => {
  it('holds the plane solid below the fade and dissolves it into the horizon line', () => {
    expect(surfaceScreenAlpha(0)).toBe(1);
    expect(surfaceScreenAlpha(SURFACE_HORIZON_FADE)).toBe(1);
    expect(surfaceScreenAlpha(1)).toBe(0);
  });

  it('fades monotonically, which is what removes the hard seam at the band edge', () => {
    const samples = [0.62, 0.7, 0.8, 0.9, 0.99].map(surfaceScreenAlpha);
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeLessThan(samples[i - 1]);
    // The fade has to be wide enough to read as a dissolve, not a step.
    expect(surfaceScreenAlpha(0.8)).toBeGreaterThan(0.2);
    expect(surfaceScreenAlpha(0.8)).toBeLessThan(0.8);
  });

  it('clamps out-of-range screen positions', () => {
    expect(surfaceScreenAlpha(-1)).toBe(1);
    expect(surfaceScreenAlpha(4)).toBe(0);
  });
});

describe('SURFACE_MATERIAL_CHUNK', () => {
  it('reuses the visualizer GLSL rather than re-deriving the flake field', () => {
    expect(SURFACE_MATERIAL_CHUNK).toContain(FINISH_SHADER_CHUNK);
    expect(SURFACE_MATERIAL_CHUNK).toContain('flakeField(uv, uDensity, 1.0)');
  });

  it('generates one constant block per state from the TypeScript table', () => {
    for (const spec of SURFACE_MATERIALS) {
      expect(SURFACE_MATERIAL_CHUNK).toContain(`const vec3 FFE_A${spec.id} =`);
      expect(SURFACE_MATERIAL_CHUNK).toContain(`const vec4 FFE_S${spec.id} =`);
      expect(SURFACE_MATERIAL_CHUNK).toContain(`const float FFE_O${spec.id} = ${spec.opacity.toFixed(4)};`);
    }
  });

  it('emits linear-light colour constants, not raw sRGB', () => {
    const cobalt = srgbToLinear('#164f83');
    expect(SURFACE_MATERIAL_CHUNK).toContain(cobalt.map((channel) => channel.toFixed(5)).join(', '));
    // The same colour as raw sRGB channels must not appear anywhere in the chunk.
    const raw = [0x16, 0x4f, 0x83].map((byte) => (byte / 255).toFixed(5)).join(', ');
    expect(SURFACE_MATERIAL_CHUNK).not.toContain(raw);
  });

  it('branches on all eight states and exposes the A/B blend', () => {
    expect(SURFACE_MATERIAL_CHUNK).toContain('FfeSurface ffeSurfaceBlend(');
    for (const threshold of ['0.5', '1.5', '2.5', '3.5', '4.5', '5.5', '6.5']) {
      expect(SURFACE_MATERIAL_CHUNK).toContain(`state < ${threshold}`);
    }
  });
});
