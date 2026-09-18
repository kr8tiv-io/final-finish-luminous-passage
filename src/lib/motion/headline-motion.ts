import type { JourneyChapterId } from './journey-director';

interface ClosestNode {
  closest(selector: string): unknown;
}

export type HeadlineStyle = 'line-rise' | 'lateral-curtain' | 'depth-settle' | 'epoxy-mask' | 'word-converge';
export type HeadlineTarget = 'heading' | 'label';
export type HeadlinePhase = 'ready' | 'entering' | 'settled';
export type HeadlineMotionMode = 'prepare' | 'resume' | 'settled' | 'static';

export interface HeadlineMotionSpec {
  duration: number;
  stagger: number;
  ease: 'power3.out';
  from: Readonly<Record<string, number | string>>;
  to?: Readonly<Record<string, number | string>>;
  /**
   * Set only by `word-converge`. The split unit is a word rather than a line, the
   * mask is `'words'`, and each unit's start offset comes from
   * `wordConvergeFrom(index, converge)` instead of from `from` alone.
   */
  readonly split?: 'lines' | 'words';
  readonly converge?: number;
}

const EPOXY_MASK_FROM = 'polygon(0% 0%, 0% 0%, 1% 9%, 0% 18%, 2% 28%, 0% 39%, 1.5% 50%, 0% 61%, 2% 73%, 0% 84%, 1% 92%, 0% 100%, 0% 100%)';
const EPOXY_MASK_TO = 'polygon(0% 0%, 112% 0%, 108% 9%, 114% 18%, 109% 28%, 113% 39%, 108% 50%, 114% 61%, 109% 73%, 112% 84%, 108% 92%, 112% 100%, 0% 100%)';

const CHAPTER_STYLES: Readonly<Record<JourneyChapterId, HeadlineStyle>> = Object.freeze({
  portico: 'word-converge',
  foundation: 'line-rise',
  garage: 'lateral-curtain',
  vault: 'depth-settle',
  'finish-hall': 'epoxy-mask',
  commercial: 'lateral-curtain',
  proof: 'line-rise',
  consultation: 'depth-settle',
});

/** The headline entrance table. One `@motion` id per spec key. */
const DESKTOP_SPECS: Readonly<Record<HeadlineStyle, HeadlineMotionSpec>> = Object.freeze({
  /** @motion line-rise */
  'line-rise': Object.freeze({
    duration: 0.6,
    stagger: 0.055,
    ease: 'power3.out',
    from: Object.freeze({ yPercent: 30, opacity: 0 }),
  }),
  /** @motion lateral-curtain */
  'lateral-curtain': Object.freeze({
    duration: 0.6,
    stagger: 0.06,
    ease: 'power3.out',
    from: Object.freeze({ xPercent: -13, opacity: 0 }),
  }),
  /** @motion depth-settle */
  'depth-settle': Object.freeze({
    duration: 0.6,
    stagger: 0.05,
    ease: 'power3.out',
    from: Object.freeze({ y: 14, z: -42, rotationX: 4, transformPerspective: 900, opacity: 0 }),
  }),
  /** @motion epoxy-mask */
  'epoxy-mask': Object.freeze({
    duration: 0.6,
    stagger: 0.04,
    ease: 'power3.out',
    from: Object.freeze({ clipPath: EPOXY_MASK_FROM }),
    to: Object.freeze({ clipPath: EPOXY_MASK_TO }),
  }),
  /**
   * Act 1's opening. Every word arrives from a different direction and they meet
   * on the settled line — the storyboard's "words coming from different
   * directions", inside a `mask:'words'` clip wrapper so a glyph is never at
   * partial contrast, only partly out of its own box.
   *
   * Total arrival is 0.9 s + 6 x 0.05 s = 1.20 s for the seven-word H1, inside
   * T6's 1.25 s budget; `headlineStagger` clamps it for any longer headline.
   * @motion word-converge
   */
  'word-converge': Object.freeze({
    duration: 0.9,
    stagger: 0.05,
    ease: 'power3.out',
    from: Object.freeze({ opacity: 0 }),
    split: 'words',
    converge: 48,
  }),
});

const COMPACT_SPECS: Readonly<Record<HeadlineStyle, HeadlineMotionSpec>> = Object.freeze({
  'line-rise': Object.freeze({
    duration: 0.6,
    stagger: 0.04,
    ease: 'power3.out',
    from: Object.freeze({ yPercent: 20, opacity: 0 }),
  }),
  'lateral-curtain': Object.freeze({
    duration: 0.6,
    stagger: 0.04,
    ease: 'power3.out',
    from: Object.freeze({ xPercent: -8, opacity: 0 }),
  }),
  'depth-settle': Object.freeze({
    duration: 0.6,
    stagger: 0.035,
    ease: 'power3.out',
    from: Object.freeze({ y: 8, z: -22, rotationX: 2.5, transformPerspective: 760, opacity: 0 }),
  }),
  'epoxy-mask': Object.freeze({
    duration: 0.6,
    stagger: 0.03,
    ease: 'power3.out',
    from: Object.freeze({ clipPath: EPOXY_MASK_FROM }),
    to: Object.freeze({ clipPath: EPOXY_MASK_TO }),
  }),
  'word-converge': Object.freeze({
    duration: 0.9,
    stagger: 0.05,
    ease: 'power3.out',
    from: Object.freeze({ opacity: 0 }),
    split: 'words',
    // A phone headline stacks to three lines of two or three words; 48 px there
    // is most of a word box, so the converge distance comes down with the type.
    converge: 28,
  }),
});

/**
 * Where word `index` starts, in pixels, before it converges on the settled line.
 *
 * The cycle is the storyboard's, in its order: left, right, below, above. Exactly
 * one axis is non-zero per word, so no word arrives on a diagonal and the four
 * directions stay legible as four directions.
 */
export const wordConvergeFrom = (index: number, distance: number): { x: number; y: number } => {
  switch (((index % 4) + 4) % 4) {
    case 0: return { x: -distance, y: 0 };
    case 1: return { x: distance, y: 0 };
    case 2: return { x: 0, y: distance };
    default: return { x: 0, y: -distance };
  }
};

export const headlineStyleForChapter = (chapter: JourneyChapterId) => CHAPTER_STYLES[chapter];

/**
 * Act 1's supporting copy, per storyboard §3: the eyebrow and the lead both rise
 * as `line-rise`, the lead 0.12 s behind the eyebrow, and the CTAs with the phone
 * link fade up last so nothing is competing with the headline while it converges.
 *
 * Offsets are timeline positions in seconds, not durations.
 * @motion line-rise
 */
export const HERO_SUPPORT_TIMING = Object.freeze({
  eyebrowAt: 0,
  leadLag: 0.12,
  /** The CTA row waits for the lead's own arrival to finish before it fades up. */
  actionsLag: 0.12,
  actionsDuration: 0.45,
  actionsStagger: 0.06,
  actionsFrom: Object.freeze({ y: 14, opacity: 0 }),
});

export const headlineMotionSpec = (
  style: HeadlineStyle,
  compact: boolean,
  target: HeadlineTarget = 'heading',
): HeadlineMotionSpec => {
  const spec = compact ? COMPACT_SPECS[style] : DESKTOP_SPECS[style];
  if (target === 'heading') return spec;
  /** @motion label-curtain */
  return Object.freeze({
    ...spec,
    duration: 0.35,
    stagger: 0,
    // A label is one line arriving from one side; the per-word converge belongs to
    // the headline alone, so the label branch never inherits it.
    split: undefined,
    converge: undefined,
    from: Object.freeze({
      xPercent: style === 'lateral-curtain' ? Number(spec.from.xPercent ?? -8) : -8,
      opacity: 0,
    }),
  });
};

export const headlineStagger = (spec: HeadlineMotionSpec, lineCount: number) => {
  if (lineCount <= 1) return 0;
  return Math.min(spec.stagger, Math.max(0, (1.25 - spec.duration) / (lineCount - 1)));
};

export const headlineMotionMode = ({
  presentationEnabled,
  phase,
}: {
  presentationEnabled: boolean;
  phase: HeadlinePhase;
}): HeadlineMotionMode => {
  if (!presentationEnabled) return 'static';
  if (phase === 'settled') return 'settled';
  if (phase === 'entering') return 'resume';
  return 'prepare';
};

export const isJourneyMotionOwnedNode = (node: ClosestNode, chapter: unknown): boolean => (
  node.closest('astro-island') === null && node.closest('.journey-chapter') === chapter
);
