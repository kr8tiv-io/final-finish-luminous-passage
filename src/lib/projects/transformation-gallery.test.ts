import { describe, expect, it } from 'vitest';
import {
  clampReveal,
  getFeaturedPassageState,
  getFeaturedScrollTarget,
  getGalleryScrollTarget,
  isFeaturedPassageAdmissible,
  normalizeImageTransform,
  resolveDragOwner,
  resolveFeaturedPresentation,
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

  it('settles a direct jump immediately and hands back to scroll on the next published coordinate', () => {
    const scrollState = { activeIndex: 0, position: 0 };
    // The director has not published yet (scrollY still 0): the jump must hold,
    // or "Last" leaves the last card parked a full panel width off screen.
    expect(resolveFeaturedPresentation({
      passageEnabled: true, scrollState, scrollY: 0, navigation: { index: 2, scrollY: 0 }, interactionIndex: null, count: 3,
    })).toEqual({ activeIndex: 2, position: 2, settled: true });
    // Once the director reports a different coordinate, scroll owns it again.
    expect(resolveFeaturedPresentation({
      passageEnabled: true,
      scrollState: { activeIndex: 2, position: 2 },
      scrollY: 14075,
      navigation: { index: 2, scrollY: 0 },
      interactionIndex: null,
      count: 3,
    })).toEqual({ activeIndex: 2, position: 2, settled: true });
    // Native flow has no scroll coordinate of its own, so the jump keeps holding.
    expect(resolveFeaturedPresentation({
      passageEnabled: false, scrollState, scrollY: 900, navigation: { index: 1, scrollY: 0 }, interactionIndex: null, count: 3,
    })).toEqual({ activeIndex: 1, position: 1, settled: true });
  });

  it('snaps a touched card to a whole position so no interaction happens on a half-exited card', () => {
    const drifting = { activeIndex: 1, position: 1.48 };
    expect(resolveFeaturedPresentation({
      passageEnabled: true, scrollState: drifting, scrollY: 900, navigation: null, interactionIndex: null, count: 3,
    })).toEqual({ activeIndex: 1, position: 1.48, settled: false });
    expect(resolveFeaturedPresentation({
      passageEnabled: true, scrollState: drifting, scrollY: 900, navigation: null, interactionIndex: 1, count: 3,
    })).toEqual({ activeIndex: 1, position: 1, settled: true });
    // Interaction outranks a still-valid jump, and both are clamped to the set.
    expect(resolveFeaturedPresentation({
      passageEnabled: true, scrollState: drifting, scrollY: 0, navigation: { index: 0, scrollY: 0 }, interactionIndex: 9, count: 3,
    })).toEqual({ activeIndex: 2, position: 2, settled: true });
  });

  it('falls back to the first card when nothing has been navigated or touched', () => {
    expect(resolveFeaturedPresentation({
      passageEnabled: false, scrollState: { activeIndex: 2, position: 2 }, scrollY: 0, navigation: null, interactionIndex: null, count: 3,
    })).toEqual({ activeIndex: 0, position: 0, settled: true });
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
