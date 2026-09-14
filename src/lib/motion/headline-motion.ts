import type { JourneyChapterId } from './journey-director';

interface ClosestNode {
  closest(selector: string): unknown;
}

export type HeadlineStyle = 'line-rise' | 'lateral-curtain' | 'depth-settle' | 'epoxy-mask';
export type HeadlineTarget = 'heading' | 'label';
export type HeadlinePhase = 'ready' | 'entering' | 'settled';
export type HeadlineMotionMode = 'prepare' | 'resume' | 'settled' | 'static';

export interface HeadlineMotionSpec {
  duration: number;
  stagger: number;
  ease: 'power3.out';
  from: Readonly<Record<string, number | string>>;
  to?: Readonly<Record<string, number | string>>;
}

const EPOXY_MASK_FROM = 'polygon(0% 0%, 0% 0%, 1% 9%, 0% 18%, 2% 28%, 0% 39%, 1.5% 50%, 0% 61%, 2% 73%, 0% 84%, 1% 92%, 0% 100%, 0% 100%)';
const EPOXY_MASK_TO = 'polygon(0% 0%, 112% 0%, 108% 9%, 114% 18%, 109% 28%, 113% 39%, 108% 50%, 114% 61%, 109% 73%, 112% 84%, 108% 92%, 112% 100%, 0% 100%)';

const CHAPTER_STYLES: Readonly<Record<JourneyChapterId, HeadlineStyle>> = Object.freeze({
  portico: 'line-rise',
  foundation: 'line-rise',
  garage: 'lateral-curtain',
  vault: 'depth-settle',
  'finish-hall': 'epoxy-mask',
  commercial: 'lateral-curtain',
  proof: 'line-rise',
  consultation: 'depth-settle',
});

const DESKTOP_SPECS: Readonly<Record<HeadlineStyle, HeadlineMotionSpec>> = Object.freeze({
  'line-rise': Object.freeze({
    duration: 0.6,
    stagger: 0.055,
    ease: 'power3.out',
    from: Object.freeze({ yPercent: 30, opacity: 0 }),
  }),
  'lateral-curtain': Object.freeze({
    duration: 0.6,
    stagger: 0.06,
    ease: 'power3.out',
    from: Object.freeze({ xPercent: -13, opacity: 0 }),
  }),
  'depth-settle': Object.freeze({
    duration: 0.6,
    stagger: 0.05,
    ease: 'power3.out',
    from: Object.freeze({ y: 14, z: -42, rotationX: 4, transformPerspective: 900, opacity: 0 }),
  }),
  'epoxy-mask': Object.freeze({
    duration: 0.6,
    stagger: 0.04,
    ease: 'power3.out',
    from: Object.freeze({ clipPath: EPOXY_MASK_FROM }),
    to: Object.freeze({ clipPath: EPOXY_MASK_TO }),
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
});

export const headlineStyleForChapter = (chapter: JourneyChapterId) => CHAPTER_STYLES[chapter];

export const headlineMotionSpec = (
  style: HeadlineStyle,
  compact: boolean,
  target: HeadlineTarget = 'heading',
): HeadlineMotionSpec => {
  const spec = compact ? COMPACT_SPECS[style] : DESKTOP_SPECS[style];
  if (target === 'heading') return spec;
  return Object.freeze({
    ...spec,
    duration: 0.35,
    stagger: 0,
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
