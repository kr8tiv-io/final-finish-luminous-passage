import { describe, expect, it } from 'vitest';
import { projectPoint } from '../visualizer/homography';
import {
  HERO_FINISH_PLANE,
  HERO_FINISH_DENSITY,
  HERO_FLOOR_POLYGON,
  HERO_IMAGE_TO_FINISH,
  heroFinishForId,
  heroFinishReferenceLuma,
  heroFramePlacement,
  heroMaterialOpacity,
  pointInFloorMask,
} from './journey-hero';
import { HERO_FINISH_VERTEX_SHADER } from '../../components/motion/HeroFinishMesh';

describe('calibrated journey hero floor', () => {
  it('maps the authored out-of-bounds perspective plane back to finish space', () => {
    const expected = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    HERO_FINISH_PLANE.forEach((point, index) => {
      const projected = projectPoint(HERO_IMAGE_TO_FINISH, point);
      expect(projected.x).toBeCloseTo(expected[index].x, 6);
      expect(projected.y).toBeCloseTo(expected[index].y, 6);
    });
  });

  it('keeps the replacement on the photographed floor and off walls or plant edges', () => {
    expect(HERO_FLOOR_POLYGON).toHaveLength(15);
    expect(pointInFloorMask({ x: 0.5, y: 0.86 })).toBe(true);
    expect(pointInFloorMask({ x: 0.5, y: 0.45 })).toBe(false);
    expect(pointInFloorMask({ x: 0.59, y: 0.53 })).toBe(false);
  });

  it('maps all approved hero selections to real finish shader presets', () => {
    expect(HERO_FINISH_DENSITY).toBeGreaterThanOrEqual(48);
    expect(heroFinishForId('alabaster-stone').pattern).toBe('large-flake');
    expect(heroFinishForId('salt-pepper').colors[2]).toBe('#161b1e');
    expect(heroFinishForId('blue-hour').colors[2]).toBe('#0f3d6a');
    expect(heroFinishReferenceLuma(heroFinishForId('salt-pepper'))).toBeLessThan(
      heroFinishReferenceLuma(heroFinishForId('alabaster-stone')),
    );
    expect(HERO_FINISH_VERTEX_SHADER).toContain('modelMatrix * vec4(position.xy, 0.0, 1.0)');
    expect(HERO_FINISH_VERTEX_SHADER).not.toContain('projectionMatrix');
  });

  it('holds a static selected finish but yields to the pour in automatic motion', () => {
    const snapshot = { activeChapter: 'portico', visible: true, documentVisible: true, chapterProgress: 0 } as const;
    expect(heroMaterialOpacity(snapshot, 'still')).toBe(1);
    expect(heroMaterialOpacity(snapshot, 'auto')).toBe(1);
    expect(heroMaterialOpacity({ ...snapshot, chapterProgress: 0.6 }, 'auto')).toBe(0);
    expect(heroMaterialOpacity({ ...snapshot, activeChapter: 'foundation' }, 'still')).toBe(0);
    expect(heroMaterialOpacity({ ...snapshot, documentVisible: false }, 'still')).toBe(0);
  });

  it('tracks a scrolling hero rect from cached document geometry and clips outside overlap', () => {
    const frame = { left: 0, top: 100, width: 1_000, height: 1_200, fixed: false } as const;
    expect(heroFramePlacement(frame, { scrollY: 100, viewportWidth: 1_000, viewportHeight: 800 })).toMatchObject({
      visible: true,
      position: [0, -0.5],
      scale: [1, 1.5],
    });
    expect(heroFramePlacement(frame, { scrollY: 1_400, viewportWidth: 1_000, viewportHeight: 800 }).visible).toBe(false);
    expect(heroFramePlacement({ ...frame, top: 0, height: 800, fixed: true }, { scrollY: 900, viewportWidth: 1_000, viewportHeight: 800 }).position).toEqual([0, 0]);
  });
});
