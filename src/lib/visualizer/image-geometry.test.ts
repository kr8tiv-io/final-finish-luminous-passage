import { describe, expect, it } from 'vitest';
import {
  containRect,
  fitWithin,
  imagePointToStagePercent,
  stagePointToImage,
  validateDecodedImage,
  validateLocalPhoto,
  validateMaskGeometry,
  LOCAL_PREVIEW_MAX_EDGE,
  prepareLocalPreviewPhoto,
} from './image-geometry';

describe('visualizer image geometry', () => {
  it('maps pointer coordinates through a letterboxed photo rectangle', () => {
    const rect = containRect({ width: 1_000, height: 1_000 }, { width: 2_000, height: 1_000 });
    expect(rect).toEqual({ x: 0, y: 250, width: 1_000, height: 500 });
    expect(stagePointToImage({ x: 500, y: 500 }, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(imagePointToStagePercent({ x: 0.25, y: 0.75 }, rect, { width: 1_000, height: 1_000 })).toEqual({ x: 25, y: 62.5 });
  });

  it('accepts only safe browser-decodable local photo formats and limits', () => {
    expect(validateLocalPhoto({ type: 'image/jpeg', size: 20 * 1024 * 1024 })).toEqual({ ok: true });
    expect(validateLocalPhoto({ type: 'image/heic', size: 10 })).toEqual({ ok: false, code: 'HEIC_UNSUPPORTED' });
    expect(validateLocalPhoto({ type: 'image/svg+xml', size: 10 })).toEqual({ ok: false, code: 'UNSUPPORTED_IMAGE' });
    expect(validateLocalPhoto({ type: 'image/webp', size: 20 * 1024 * 1024 + 1 })).toEqual({ ok: false, code: 'IMAGE_TOO_LARGE' });
    expect(validateDecodedImage({ width: 8_000, height: 6_000 })).toEqual({ ok: true });
    expect(validateDecodedImage({ width: 8_001, height: 6_000 })).toEqual({ ok: false, code: 'IMAGE_TOO_MANY_PIXELS' });
    expect(fitWithin({ width: 4_032, height: 3_024 }, 2_048)).toEqual({ width: 2_048, height: 1_536 });
    expect(fitWithin({ width: 1_200, height: 800 }, 2_048)).toEqual({ width: 1_200, height: 800 });
    expect(LOCAL_PREVIEW_MAX_EDGE).toBe(2_048);
    expect(prepareLocalPreviewPhoto).toBeTypeOf('function');
  });

  it('accepts scaled masks but rejects orientation and aspect mismatches', () => {
    expect(validateMaskGeometry({ width: 1_200, height: 800 }, { width: 600, height: 400 })).toEqual({ ok: true });
    expect(validateMaskGeometry({ width: 1_200, height: 800 }, { width: 800, height: 1_200 })).toEqual({ ok: false, code: 'MASK_ORIENTATION_MISMATCH' });
    expect(validateMaskGeometry({ width: 1_200, height: 800 }, { width: 700, height: 400 })).toEqual({ ok: false, code: 'MASK_ASPECT_MISMATCH' });
    expect(validateMaskGeometry({ width: 1_200, height: 800 }, { width: 0, height: 0 })).toEqual({ ok: false, code: 'MASK_DIMENSIONS_INVALID' });
  });
});
