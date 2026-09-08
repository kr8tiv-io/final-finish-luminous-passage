import { describe, expect, it } from 'vitest';
import { computeHomography, projectPoint } from './homography';

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
});
