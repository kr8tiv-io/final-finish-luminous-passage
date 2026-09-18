import { describe, expect, it } from 'vitest';
import {
  clampReveal,
  CYLINDER_HOLD,
  CYLINDER_MEDIA,
  CYLINDER_MIN_FACES,
  cylinderCardTransform,
  cylinderFaceCount,
  cylinderInnerAngle,
  cylinderRadius,
  cylinderRingRotation,
  getCylinderState,
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

  it('never hands a gesture over the cylinder to anything that could rotate it', () => {
    // On the front card the answer is unchanged — the divider, or the page —
    // so dragging the divider can never become a ring rotation.
    expect(resolveDragOwner({ startsInComparison: true, deltaX: 36, deltaY: 8, onRibbon: true })).toBe('comparison');
    expect(resolveDragOwner({ startsInComparison: true, deltaX: 8, deltaY: 36, onRibbon: true })).toBe('page');
    // Off a card but over the ring: named, and the ribbon's answer is that it
    // owns no rotation, so the gesture falls through to native scroll.
    expect(resolveDragOwner({ startsInComparison: false, deltaX: 36, deltaY: 8, onRibbon: true })).toBe('ribbon');
    expect(resolveDragOwner({ startsInComparison: false, deltaX: 8, deltaY: 36, onRibbon: true })).toBe('ribbon');
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
    // Step 23: a touch screen wide enough to pass every other clause still never
    // gets the pin and the Draggable divider.
    expect(isFeaturedPassageAdmissible({ viewportWidth: 1280, viewportHeight: 900, contentHeight: 760, still: false, reducedMotion: false, finePointer: false })).toBe(false);
  });

  it('states the media half of that same rule exactly once, for gsap.matchMedia to own', () => {
    expect(CYLINDER_MEDIA).toBe('(min-width: 960px) and (min-height: 680px) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    // Falsifiability: the query's numbers are the predicate's numbers. If either
    // side is edited alone, one of these two reads stops matching the other.
    expect(CYLINDER_MEDIA).toContain('(min-width: 960px)');
    expect(isFeaturedPassageAdmissible({ viewportWidth: 959, viewportHeight: 900, contentHeight: 400, still: false, reducedMotion: false })).toBe(false);
    expect(isFeaturedPassageAdmissible({ viewportWidth: 960, viewportHeight: 680, contentHeight: 400, still: false, reducedMotion: false })).toBe(true);
    expect(isFeaturedPassageAdmissible({ viewportWidth: 960, viewportHeight: 679, contentHeight: 400, still: false, reducedMotion: false })).toBe(false);
  });
});

describe('the Act 5 perspective cylinder', () => {
  it('builds the ring on at least seven faces so three pairs are not a triangle', () => {
    expect(cylinderFaceCount(3)).toBe(CYLINDER_MIN_FACES);
    expect(cylinderFaceCount(1)).toBe(CYLINDER_MIN_FACES);
    expect(cylinderFaceCount(7)).toBe(7);
    expect(cylinderFaceCount(12)).toBe(12);
    expect(cylinderInnerAngle(12)).toBeCloseTo(30, 10);
    expect(cylinderInnerAngle(3)).toBeCloseTo(360 / 7, 10);
  });

  it('places each card on the apothem of a regular polygon of that many faces', () => {
    // A regular polygon with side s and f sides has apothem s / (2 tan(pi/f)).
    // Octagon, side 100 (80 card + 20 gap): apothem 50 / tan(22.5 deg).
    expect(cylinderRadius({ cardWidth: 80, gap: 20, cards: 8 })).toBeCloseTo(50 / Math.tan(Math.PI / 8), 10);
    // Dodecagon, side 100: apothem 50 / tan(15 deg) = 186.6025…
    expect(cylinderRadius({ cardWidth: 80, gap: 20, cards: 12 })).toBeCloseTo(50 / Math.tan(Math.PI / 12), 10);
    // Below the floor the polygon is still a heptagon, not a square: a face
    // count of 4 and a face count of 3 give the same, seven-faced radius.
    expect(cylinderRadius({ cardWidth: 80, gap: 20, cards: 4 }))
      .toBeCloseTo(cylinderRadius({ cardWidth: 80, gap: 20, cards: 3 }), 10);
    // And the live case: three cards, seven faces, 700 px pitch.
    expect(cylinderRadius({ cardWidth: 600, gap: 100, cards: 3 }))
      .toBeCloseTo(700 / (2 * Math.tan(Math.PI / 7)), 10);
    // The polygon is closed: n faces of pitch p have circumference n * p, so the
    // apothem has to satisfy 2 * R * tan(pi/n) === p for every n.
    for (const faces of [7, 8, 12, 24]) {
      const radius = cylinderRadius({ cardWidth: 540, gap: 86, cards: faces });
      expect(2 * radius * Math.tan(Math.PI / faces)).toBeCloseTo(626, 8);
    }
    expect(cylinderRadius({ cardWidth: 0, gap: 0, cards: 8 })).toBe(0);
  });

  it('turns each card by one inner angle and lifts it toward the camera by the radius', () => {
    const geometry = { cards: 3, cardWidth: 600, gap: 100 };
    const radius = cylinderRadius({ cardWidth: 600, gap: 100, cards: 3 });
    expect(cylinderCardTransform(0, geometry)).toEqual({ rotateY: 0, translateZ: radius });
    expect(cylinderCardTransform(1, geometry).rotateY).toBeCloseTo(360 / 7, 10);
    expect(cylinderCardTransform(2, geometry).rotateY).toBeCloseTo(720 / 7, 10);
    expect(cylinderCardTransform(2, geometry).translateZ).toBeCloseTo(radius, 10);
    // The sign is the whole reason the front card is the largest one. With the
    // ring pulled back by the same radius, face 0 lands at z = 0 and every
    // other face at z = radius * (cos(angle) - 1), which is never positive —
    // so no face can reach the camera plane and blow up.
    for (const index of [0, 1, 2]) {
      const { rotateY, translateZ } = cylinderCardTransform(index, geometry);
      const z = translateZ * Math.cos((rotateY * Math.PI) / 180) - radius;
      expect(z).toBeLessThanOrEqual(1e-9);
      if (index === 0) expect(z).toBeCloseTo(0, 10);
    }
  });

  it('rotates the ring linearly from card one to the last card and no further', () => {
    expect(cylinderRingRotation(0, 3)).toBe(-0);
    expect(cylinderRingRotation(.5, 3)).toBeCloseTo(-(360 / 7), 10);
    expect(cylinderRingRotation(1, 3)).toBeCloseTo(-(720 / 7), 10);
    // Clamped, and strictly monotonic in between — `ease: 'none'`, in numbers.
    expect(cylinderRingRotation(1.4, 3)).toBeCloseTo(-(720 / 7), 10);
    expect(cylinderRingRotation(-2, 3)).toBe(-0);
    let previous = Infinity;
    for (let step = 0; step <= 30; step += 1) {
      const rotation = cylinderRingRotation(step / 30, 9);
      expect(rotation).toBeLessThan(previous);
      previous = rotation;
    }
    // Eight or more pairs is the reference's own full cylinder.
    expect(cylinderRingRotation(1, 9)).toBeCloseTo(-360 * 8 / 9, 10);
  });

  it('freezes the reading layer inside the front card hold window only', () => {
    expect(getCylinderState(0, 3)).toEqual({ position: 0, activeIndex: 0, inHoldWindow: true, emphasis: 1 });
    expect(getCylinderState(1, 3)).toEqual({ position: 2, activeIndex: 2, inHoldWindow: true, emphasis: 1 });
    expect(getCylinderState(.5, 3)).toEqual({ position: 1, activeIndex: 1, inHoldWindow: true, emphasis: 1 });
    const leaving = getCylinderState(.5 + CYLINDER_HOLD / 4, 3);
    expect(leaving.activeIndex).toBe(1);
    expect(leaving.inHoldWindow).toBe(true);
    expect(leaving.emphasis).toBeCloseTo(.5, 10);
    // Half way between two cards nothing is emphasised and nothing is frozen.
    const between = getCylinderState(.25, 3);
    expect(between.position).toBe(.5);
    expect(between.inHoldWindow).toBe(false);
    expect(between.emphasis).toBe(0);
    // One approved pair is always its own front card.
    expect(getCylinderState(.7, 1)).toEqual({ position: 0, activeIndex: 0, inHoldWindow: true, emphasis: 1 });
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
