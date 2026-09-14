import { describe, expect, it } from 'vitest';
import { computeHomography, invertHomography, projectPoint, validateQuad } from './homography';

describe('floor-plane homography', () => {
  it('maps every source corner onto its target floor corner', () => {
    const source = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ] as const;
    const target = [
      { x: 0.18, y: 0.37 },
      { x: 0.82, y: 0.34 },
      { x: 0.97, y: 0.94 },
      { x: 0.04, y: 0.9 },
    ] as const;

    const matrix = computeHomography(source, target);

    source.forEach((point, index) => {
      const projected = projectPoint(matrix, point);
      expect(projected.x).toBeCloseTo(target[index].x, 6);
      expect(projected.y).toBeCloseTo(target[index].y, 6);
    });
  });

  it('throws for degenerate point sets instead of producing invalid CSS', () => {
    const collapsed = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ] as const;

    expect(() => computeHomography(collapsed, collapsed)).toThrow(/degenerate/i);
  });

  it('uses the inverse projective transform for skewed interior points', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ] as const;
    const perspective = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2 / 3, y: 2 / 3 },
      { x: 0, y: 2 / 3 },
    ] as const;

    const finishToImage = computeHomography(square, perspective);
    const imageToFinish = invertHomography(finishToImage);

    expect(projectPoint(finishToImage, { x: 0.5, y: 0.5 })).toEqual({ x: 0.4, y: 0.4 });
    const restored = projectPoint(imageToFinish, { x: 0.4, y: 0.4 });
    expect(restored.x).toBeCloseTo(0.5, 8);
    expect(restored.y).toBeCloseTo(0.5, 8);
  });

  it('rejects crossed, concave, out-of-bounds, and tiny floor quads', () => {
    expect(validateQuad([
      { x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.9, y: 0.2 }, { x: 0.1, y: 0.8 },
    ])).toEqual({ ok: false, reason: 'crossed' });
    expect(validateQuad([
      { x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.4, y: 0.4 }, { x: 0.1, y: 0.8 },
    ])).toEqual({ ok: false, reason: 'concave' });
    expect(validateQuad([
      { x: -0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.1, y: 0.8 },
    ])).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(validateQuad([
      { x: 0.5, y: 0.5 }, { x: 0.51, y: 0.5 }, { x: 0.51, y: 0.51 }, { x: 0.5, y: 0.51 },
    ])).toEqual({ ok: false, reason: 'too-small' });
    expect(validateQuad([
      { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.9 },
    ])).toEqual({ ok: false, reason: 'degenerate-edge' });
  });
});
