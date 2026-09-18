/**
 * Who a pointer gesture belongs to.
 *
 * `ribbon` is Step 23's addition. The Act 5 cylinder has no drag surface of its
 * own: the ring's angle is owned by one scrubbed ScrollTrigger and by nothing
 * else, so a gesture that lands on the ring but not on a live divider is
 * *named* rather than silently swallowed — it belongs to the ribbon, and the
 * ribbon's answer is always "the page scrolls". That is what makes "a drag on
 * the front card never rotates the ring" and "a wheel over the ring is never
 * intercepted" assertions instead of absences: there is no `rotate` owner to
 * return, and no wheel listener to return it from.
 */
export type DragOwner = 'comparison' | 'gallery' | 'ribbon' | 'page' | 'undecided';
export type ImageTransform = {
  scale?: number;
  translateX?: number;
  translateY?: number;
  rotate?: number;
};

const DRAG_INTENT_THRESHOLD = 8;

export function clampReveal(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function normalizeImageTransform(transform: ImageTransform = {}): Required<ImageTransform> {
  const rotate = Math.min(1.5, Math.max(-1.5, transform.rotate ?? 0));
  const rotationScale = 1 + Math.abs(rotate) * .025;
  const scale = Math.min(1.12, Math.max(rotationScale, transform.scale ?? 1));
  const translationLimit = Math.min(6, Math.max(0, ((scale - rotationScale) * 50) / scale));
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    scale: Math.round(scale * 1000) / 1000,
    translateX: round(Math.min(translationLimit, Math.max(-translationLimit, transform.translateX ?? 0))),
    translateY: round(Math.min(translationLimit, Math.max(-translationLimit, transform.translateY ?? 0))),
    rotate: round(rotate),
  };
}

export function resolveDragOwner({
  startsInComparison,
  deltaX,
  deltaY,
  onRibbon = false,
}: {
  startsInComparison: boolean;
  deltaX: number;
  deltaY: number;
  /** The gesture started over the Act 5 cylinder rather than the flat gallery. */
  onRibbon?: boolean;
}): DragOwner {
  if (!startsInComparison) return onRibbon ? 'ribbon' : 'gallery';
  if (Math.hypot(deltaX, deltaY) < DRAG_INTENT_THRESHOLD) return 'undecided';
  return Math.abs(deltaX) > Math.abs(deltaY) ? 'comparison' : 'page';
}

export function getGalleryScrollTarget({
  cardLeft,
  viewportLeft,
  scrollLeft,
  scrollPaddingStart,
  maximumScrollLeft,
}: {
  cardLeft: number;
  viewportLeft: number;
  scrollLeft: number;
  scrollPaddingStart: number;
  maximumScrollLeft: number;
}): number {
  const target = scrollLeft + cardLeft - viewportLeft - scrollPaddingStart;
  return Math.min(maximumScrollLeft, Math.max(0, target));
}

export function getFeaturedScrollTarget({
  passageTop,
  passageTravel,
  index,
  count,
}: {
  passageTop: number;
  passageTravel: number;
  index: number;
  count: number;
}): number {
  if (count <= 1) return passageTop;
  return passageTop + passageTravel * Math.min(1, Math.max(0, index / (count - 1)));
}

/**
 * The one admission rule for the pinned featured passage. There is no second
 * rule anywhere in the gallery: phones, coarse pointers, short viewports, still
 * motion, reduced motion, and any measured card that cannot actually fit stay on
 * the native snap ribbon.
 *
 * `CYLINDER_MEDIA` below is the *same* rule written as a media query, so
 * `gsap.matchMedia` can own the build/revert lifecycle. The two halves are kept
 * deliberately non-overlapping: the query carries everything a media feature can
 * express (width, height, pointer, reduced motion) and this predicate carries
 * what it cannot (the stored `still` preference, and the measured fit of a real
 * card). `finePointer` defaults to `true` so a caller that has already been
 * gated by the query does not have to restate it.
 */
export const CYLINDER_MEDIA =
  '(min-width: 960px) and (min-height: 680px) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

export function isFeaturedPassageAdmissible({
  viewportWidth,
  viewportHeight,
  contentHeight,
  still,
  reducedMotion,
  finePointer = true,
}: {
  viewportWidth: number;
  viewportHeight: number;
  contentHeight: number;
  still: boolean;
  reducedMotion: boolean;
  finePointer?: boolean;
}): boolean {
  return !still
    && !reducedMotion
    && finePointer
    && viewportWidth >= 960
    && viewportHeight >= 680
    && contentHeight <= viewportHeight - 128;
}

/* -------------------------------------------------------------------------- */
/*  Act 5 — the perspective cylinder (jh3y `PovoorJ`, re-derived)              */
/* -------------------------------------------------------------------------- */

/**
 * Fewest faces the ring is ever built with.
 *
 * The cards are the *faces* of a regular polygon, so with three approved pairs
 * the honest polygon is a triangle: its two non-front faces sit at ±120°, which
 * is past back-facing, and its apothem is only 0.29 × the card pitch, which puts
 * the front card so close to the camera that a 1500 px perspective shears it.
 * Building the ring on at least seven faces and populating only the first `n` of
 * them keeps the real geometry (every card still sits on the same cylinder at
 * the same pitch) while leaving the occupied arc shallow enough that the
 * neighbours read as foreshortened cards rather than as edges. Above seven
 * pairs the floor stops applying and the ring is the full `360/n` cylinder the
 * reference describes.
 */
export const CYLINDER_MIN_FACES = 7;

/** Gap between adjacent cards, as a fraction of the card's own width. */
export const CYLINDER_GAP_RATIO = .16;

/**
 * Half-width of the front card's hold window, in card steps. Inside it the
 * headline, eyebrow, caption and counter are frozen at the front card's values:
 * `EXPERIENCE-STORYBOARD.md` §3 — "Front card in hold-window; during any drag".
 */
export const CYLINDER_HOLD = .22;

export function cylinderFaceCount(cards: number): number {
  return Math.max(CYLINDER_MIN_FACES, Math.max(1, Math.round(cards)));
}

/** Degrees between two adjacent faces of the ring. */
export function cylinderInnerAngle(cards: number): number {
  return 360 / cylinderFaceCount(cards);
}

/**
 * Distance from the ring's axis to a card's face.
 *
 * Derivation. Each card is one side of a regular polygon with `f` sides. The
 * side length is the card's pitch, `w + gap` — card width plus the gap to its
 * neighbour. A regular polygon with side `s` and `f` sides has apothem
 * `s / (2 · tan(π / f))`, and the apothem *is* the distance from the axis to the
 * middle of a side, which is exactly what `translateZ(radius)` measures once
 * the card has been turned by `rotateY(innerAngle × i)`. Hence
 *
 *     radius = (cardWidth + gap) / (2 · tan(π / f))
 *
 * The `(w + gap) / sin(innerAngle)` shorthand in `CONTEXT-SHEET.md` is the
 * large-`f` approximation of the same quantity (both tend to `f·(w+gap)/2π`);
 * they differ by 4× at `f = 3`, which is precisely the range this project is
 * in, so the exact form is the one that ships and the one that is tested.
 */
export function cylinderRadius({
  cardWidth,
  gap,
  cards,
}: {
  cardWidth: number;
  gap: number;
  cards: number;
}): number {
  const pitch = Math.max(0, cardWidth) + Math.max(0, gap);
  return pitch / (2 * Math.tan(Math.PI / cylinderFaceCount(cards)));
}

/**
 * Where card `index` sits on the ring, before the ring itself is rotated.
 *
 * `translateZ` is **positive**: the card is pushed one radius *toward* the
 * camera along its own axis, so the face at angle 0 is the nearest point of the
 * cylinder and every other face recedes behind it. Pushing the other way (the
 * shorthand's `-radius`) builds the same cylinder seen from its far side, where
 * the front card is the smallest thing on screen and the near half of the ring
 * runs through the perspective origin. The ring compensates with `z: -radius`,
 * which lands face 0 on the screen plane at exactly 1:1.
 */
export function cylinderCardTransform(
  index: number,
  { cards, cardWidth, gap }: { cards: number; cardWidth: number; gap: number },
): { rotateY: number; translateZ: number } {
  return {
    rotateY: cylinderInnerAngle(cards) * index,
    translateZ: cylinderRadius({ cardWidth, gap, cards }),
  };
}

/**
 * The ring's own angle at a scroll progress. Linear in progress and strictly
 * decreasing, because the tween that writes it carries `ease: 'none'` and
 * `scrub: true`: `p = 0` leaves card 0 flat in the front slot and `p = 1` brings
 * the last card there.
 *
 * @motion perspective-cylinder
 */
export function cylinderRingRotation(progress: number, cards: number): number {
  const span = Math.max(0, Math.round(cards) - 1);
  return -cylinderInnerAngle(cards) * span * Math.min(1, Math.max(0, progress));
}

export type CylinderState = {
  /** Continuous card index, 0 … n-1. */
  readonly position: number;
  /** The card currently nearest the front slot. */
  readonly activeIndex: number;
  /** `true` while that card is flat enough to be read and interacted with. */
  readonly inHoldWindow: boolean;
  /** 1 at dead centre of the hold window, 0 at its edge and beyond. */
  readonly emphasis: number;
};

/**
 * What the DOM layer reads off the ring's progress.
 *
 * REPLACES Step 9's `getFeaturedPassageState`, which is deleted here. Name what
 * that did, so nothing is lost by accident: it took the same 0–1 progress and
 * returned a *dwelling* position — each card held still for the first and last
 * 20 % of its step, with a smoothstep across the middle — and the panel's own
 * transform was driven from that dwelling number.
 *
 * The cylinder cannot keep the dwell in the geometry. `ease: 'none'` and
 * `scrub: true` mean the ring's angle is linear in scroll, and a ring that
 * stalls three times on the way round reads as a stuck page, not as a pause.
 * So the dwell moved from the geometry to the reading layer: the ring turns
 * linearly and never stops, while the *text* changes only when a different card
 * takes the front slot, and inside `CYLINDER_HOLD` of that card's exact front
 * position the whole reading layer — eyebrow, caption, counter — is frozen and
 * the card is emphasised. Same contract, different layer.
 *
 * @motion hold-window
 */
export function getCylinderState(progress: number, cards: number): CylinderState {
  const lastIndex = Math.max(0, Math.round(cards) - 1);
  if (lastIndex === 0) return { position: 0, activeIndex: 0, inHoldWindow: true, emphasis: 1 };
  const position = Math.min(1, Math.max(0, progress)) * lastIndex;
  const activeIndex = Math.min(lastIndex, Math.max(0, Math.round(position)));
  const offset = Math.abs(position - activeIndex);
  return {
    position,
    activeIndex,
    inHoldWindow: offset <= CYLINDER_HOLD,
    emphasis: Math.min(1, Math.max(0, 1 - offset / CYLINDER_HOLD)),
  };
}

/** A direct jump (First/Previous/Next/Last) that has not yet been overtaken by scroll. */
export type FeaturedNavigation = { index: number; scrollY: number } | null;

export type FeaturedPresentation = {
  activeIndex: number;
  position: number;
  /**
   * `true` when the card is pinned to a whole-number position, so its panel
   * transform is exactly 0% and the card sits fully inside the frame. Only a
   * free scroll through the passage leaves it `false`.
   */
  settled: boolean;
};

/**
 * One rule decides which card the featured window shows, in both layouts.
 *
 * Precedence, highest first:
 *  1. a pointer/keyboard interaction — snapped, so a card being touched can
 *     never be halfway out of the viewport;
 *  2. a direct navigation, held until the director reports a different scroll
 *     coordinate (in native flow there is no scroll coordinate, so it holds);
 *  3. the scroll-derived passage state;
 *  4. the first card.
 *
 * Holding (2) against the director's own coordinate is what makes First/Last
 * deterministic: the jump lands the card immediately, and the scroll state
 * takes over on the very next published frame with the same answer, because
 * `getFeaturedScrollTarget` targets exactly that card's whole-number position.
 */
export function resolveFeaturedPresentation({
  passageEnabled,
  scrollState,
  scrollY,
  navigation,
  interactionIndex,
  count,
}: {
  passageEnabled: boolean;
  scrollState: { activeIndex: number; position: number };
  scrollY: number;
  navigation: FeaturedNavigation;
  interactionIndex: number | null;
  count: number;
}): FeaturedPresentation {
  const lastIndex = Math.max(0, count - 1);
  const clamp = (index: number) => Math.min(lastIndex, Math.max(0, Math.round(index)));
  if (interactionIndex !== null) {
    const index = clamp(interactionIndex);
    return { activeIndex: index, position: index, settled: true };
  }
  if (navigation && (!passageEnabled || navigation.scrollY === scrollY)) {
    const index = clamp(navigation.index);
    return { activeIndex: index, position: index, settled: true };
  }
  if (!passageEnabled) return { activeIndex: 0, position: 0, settled: true };
  return {
    activeIndex: clamp(scrollState.activeIndex),
    position: scrollState.position,
    settled: scrollState.position === Math.round(scrollState.position),
  };
}
