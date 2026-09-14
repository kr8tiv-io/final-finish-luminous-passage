import { describe, expect, it } from 'vitest';
import {
  clampReveal,
  getGalleryProgressForIndex,
  getGalleryProgressForTarget,
  getGalleryScrollTarget,
  getNearestGalleryIndex,
  getVerticalScrollPosition,
  isScrollDrivenGalleryAdmissible,
  resolveDragOwner,
} from './transformation-gallery';

describe('transformation gallery helpers', () => {
  it('preserves the full native range endpoints for an honest before/after view', () => {
    expect(clampReveal(0)).toBe(0);
    expect(clampReveal(100)).toBe(100);
  });

  it('bounds out-of-range reveal values without inventing an in-between state', () => {
    expect(clampReveal(-24)).toBe(0);
    expect(clampReveal(124)).toBe(100);
  });

  it('gives horizontal comparison drags ownership to the divider', () => {
    expect(resolveDragOwner({ startsInComparison: true, deltaX: 36, deltaY: 8 })).toBe('comparison');
  });

  it('waits for clear intent, then leaves vertical gestures for page scrolling and outside gestures for the gallery', () => {
    expect(resolveDragOwner({ startsInComparison: true, deltaX: 4, deltaY: 3 })).toBe('undecided');
    expect(resolveDragOwner({ startsInComparison: true, deltaX: 8, deltaY: 36 })).toBe('page');
    expect(resolveDragOwner({ startsInComparison: false, deltaX: 36, deltaY: 8 })).toBe('gallery');
  });

  it('aligns a card with the viewport scroll padding using rect differences and clamps the destination', () => {
    expect(getGalleryScrollTarget({
      cardLeft: 980,
      viewportLeft: 100,
      scrollLeft: 720,
      scrollPaddingStart: 48,
      maximumScrollLeft: 1700,
    })).toBe(1552);

    expect(getGalleryScrollTarget({
      cardLeft: 80,
      viewportLeft: 100,
      scrollLeft: 10,
      scrollPaddingStart: 48,
      maximumScrollLeft: 1700,
    })).toBe(0);
  });

  it('only admits scroll-driven pinning when there is room, travel, and motion is allowed', () => {
    expect(isScrollDrivenGalleryAdmissible({ viewportWidth: 1280, viewportHeight: 760, horizontalTravel: 940, shellHeight: 660, still: false, reducedMotion: false })).toBe(true);
    expect(isScrollDrivenGalleryAdmissible({ viewportWidth: 1280, viewportHeight: 540, horizontalTravel: 940, still: false, reducedMotion: false })).toBe(false);
    expect(isScrollDrivenGalleryAdmissible({ viewportWidth: 1280, viewportHeight: 760, horizontalTravel: 940, shellHeight: 730, still: false, reducedMotion: false })).toBe(false);
    expect(isScrollDrivenGalleryAdmissible({ viewportWidth: 1280, viewportHeight: 760, horizontalTravel: 940, still: true, reducedMotion: false })).toBe(false);
    expect(isScrollDrivenGalleryAdmissible({ viewportWidth: 1280, viewportHeight: 760, horizontalTravel: 0, still: false, reducedMotion: false })).toBe(false);
  });

  it('maps direct gallery navigation to a linear point in the pinned vertical range', () => {
    expect(getGalleryProgressForIndex(0, 3)).toBe(0);
    expect(getGalleryProgressForIndex(1, 3)).toBe(.5);
    expect(getGalleryProgressForIndex(2, 3)).toBe(1);
    expect(getVerticalScrollPosition({ start: 1200, end: 3000, progress: .5 })).toBe(2100);
  });

  it('uses measured card targets rather than evenly spaced indexes for pinned navigation', () => {
    const targets = [0, .39, .84];
    expect(getGalleryProgressForTarget(840, 1000)).toBe(.84);
    expect(getNearestGalleryIndex(.48, targets)).toBe(1);
    expect(getNearestGalleryIndex(.74, targets)).toBe(2);
  });
});
