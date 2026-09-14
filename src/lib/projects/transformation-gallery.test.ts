import { describe, expect, it } from 'vitest';
import {
  clampReveal,
  getFeaturedPassageState,
  getFeaturedScrollTarget,
  getGalleryScrollTarget,
  isFeaturedPassageAdmissible,
  isRibbonEnhancementAdmissible,
  normalizeImageTransform,
  resolveDragOwner,
} from './transformation-gallery';

describe('transformation gallery helpers', () => {
  it('preserves the full native range endpoints for an honest before/after view', () => {
    expect(clampReveal(0)).toBe(0);
    expect(clampReveal(100)).toBe(100);
    expect(clampReveal(-24)).toBe(0);
    expect(clampReveal(124)).toBe(100);
  });

  it('gives only a clear horizontal comparison drag ownership of the divider', () => {
    expect(resolveDragOwner({ startsInComparison: true, deltaX: 4, deltaY: 3 })).toBe('undecided');
    expect(resolveDragOwner({ startsInComparison: true, deltaX: 36, deltaY: 8 })).toBe('comparison');
    expect(resolveDragOwner({ startsInComparison: true, deltaX: 8, deltaY: 36 })).toBe('page');
    expect(resolveDragOwner({ startsInComparison: false, deltaX: 36, deltaY: 8 })).toBe('gallery');
  });

  it('aligns a selected card using native scroll padding and clamps the target', () => {
    expect(getGalleryScrollTarget({ cardLeft: 980, viewportLeft: 100, scrollLeft: 720, scrollPaddingStart: 48, maximumScrollLeft: 1700 })).toBe(1552);
    expect(getGalleryScrollTarget({ cardLeft: 80, viewportLeft: 100, scrollLeft: 10, scrollPaddingStart: 48, maximumScrollLeft: 1700 })).toBe(0);
  });

  it('admits enhancement from one width, height, and measured-fit check', () => {
    expect(isRibbonEnhancementAdmissible({ viewportWidth: 1280, viewportHeight: 760, cardWidth: 840, cardHeight: 560, still: false, reducedMotion: false })).toBe(true);
    expect(isRibbonEnhancementAdmissible({ viewportWidth: 700, viewportHeight: 760, cardWidth: 640, cardHeight: 420, still: false, reducedMotion: false })).toBe(false);
    expect(isRibbonEnhancementAdmissible({ viewportWidth: 1280, viewportHeight: 540, cardWidth: 840, cardHeight: 560, still: false, reducedMotion: false })).toBe(false);
    expect(isRibbonEnhancementAdmissible({ viewportWidth: 1280, viewportHeight: 760, cardWidth: 1240, cardHeight: 560, still: false, reducedMotion: false })).toBe(false);
    expect(isRibbonEnhancementAdmissible({ viewportWidth: 1280, viewportHeight: 760, cardWidth: 840, cardHeight: 560, still: true, reducedMotion: false })).toBe(false);
  });

  it('holds each featured comparison before moving across the shallow arc', () => {
    expect(getFeaturedPassageState(0, 3)).toEqual({ activeIndex: 0, position: 0 });
    expect(getFeaturedPassageState(.1, 3)).toEqual({ activeIndex: 0, position: 0 });
    expect(getFeaturedPassageState(.5, 3)).toEqual({ activeIndex: 1, position: 1 });
    expect(getFeaturedPassageState(.9, 3)).toEqual({ activeIndex: 2, position: 2 });
    expect(getFeaturedPassageState(1, 3)).toEqual({ activeIndex: 2, position: 2 });
  });

  it('maps direct featured navigation onto the native vertical passage', () => {
    expect(getFeaturedScrollTarget({ passageTop: 1400, passageTravel: 1200, index: 0, count: 3 })).toBe(1400);
    expect(getFeaturedScrollTarget({ passageTop: 1400, passageTravel: 1200, index: 1, count: 3 })).toBe(2000);
    expect(getFeaturedScrollTarget({ passageTop: 1400, passageTravel: 1200, index: 2, count: 3 })).toBe(2600);
  });

  it('only admits a sticky passage when the actual comparison content fits', () => {
    expect(isFeaturedPassageAdmissible({ viewportWidth: 1280, viewportHeight: 900, contentHeight: 760, still: false, reducedMotion: false })).toBe(true);
    expect(isFeaturedPassageAdmissible({ viewportWidth: 1280, viewportHeight: 700, contentHeight: 760, still: false, reducedMotion: false })).toBe(false);
    expect(isFeaturedPassageAdmissible({ viewportWidth: 820, viewportHeight: 900, contentHeight: 700, still: false, reducedMotion: false })).toBe(false);
    expect(isFeaturedPassageAdmissible({ viewportWidth: 1280, viewportHeight: 900, contentHeight: 760, still: true, reducedMotion: false })).toBe(false);
    expect(isFeaturedPassageAdmissible({ viewportWidth: 1280, viewportHeight: 900, contentHeight: 760, still: false, reducedMotion: true })).toBe(false);
  });

  it('bounds crop correction to a conservative uniform transform without exposing image edges', () => {
    expect(normalizeImageTransform()).toEqual({ scale: 1, translateX: 0, translateY: 0, rotate: 0 });
    expect(normalizeImageTransform({ scale: 2, translateX: 40, translateY: -40, rotate: 8 })).toEqual({
      scale: 1.12,
      translateX: 3.68,
      translateY: -3.68,
      rotate: 1.5,
    });
    expect(normalizeImageTransform({ scale: 1, translateX: 4, translateY: 4, rotate: 1 })).toEqual({
      scale: 1.025,
      translateX: 0,
      translateY: 0,
      rotate: 1,
    });
  });
});
