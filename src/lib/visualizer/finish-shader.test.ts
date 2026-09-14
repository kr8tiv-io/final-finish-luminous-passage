import { describe, expect, it } from 'vitest';
import { createImageToFinishHomography, FINISH_SHADER_CHUNK, tryCreateImageToFinishHomography } from './finish-shader';
import { projectPoint } from './homography';

describe('finish projection shader contract', () => {
  it('creates a true image-to-finish transform for perspective interiors', () => {
    const imageQuad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2 / 3, y: 2 / 3 },
      { x: 0, y: 2 / 3 },
    ] as const;
    const inverse = createImageToFinishHomography(imageQuad);
    const finishPoint = projectPoint(inverse, { x: 0.4, y: 0.4 });
    expect(finishPoint.x).toBeCloseTo(0.5, 8);
    expect(finishPoint.y).toBeCloseTo(0.5, 8);
  });

  it('uses small rotated angular chips rather than circular polka dots', () => {
    expect(FINISH_SHADER_CHUNK).toContain('mat2 chipRotation');
    expect(FINISH_SHADER_CHUNK).toContain('max(abs(chipPoint.x)');
    expect(FINISH_SHADER_CHUNK).toContain('fwidth(angularDistance)');
    expect(FINISH_SHADER_CHUNK).toContain('1.0 - smoothstep(size * 0.72 - edgeWidth, size + edgeWidth, angularDistance)');
    expect(FINISH_SHADER_CHUNK).not.toContain('length(f *');
    expect(FINISH_SHADER_CHUNK).not.toContain('smoothstep(size, size * 0.35');
  });

  it('returns a guarded result for transiently invalid dragged corners', () => {
    expect(tryCreateImageToFinishHomography([
      { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.9 },
    ])).toBeNull();
  });
});
