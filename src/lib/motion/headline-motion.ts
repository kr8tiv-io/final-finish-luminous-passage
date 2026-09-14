import type { JourneyChapterId } from './journey-director';

export type HeadlineStyle = 'line-rise' | 'lateral-curtain' | 'depth-settle';
export type HeadlinePhase = 'ready' | 'entering' | 'settled';
export type HeadlineMotionMode = 'prepare' | 'resume' | 'settled' | 'static';

export interface HeadlineMotionSpec {
  duration: number;
  stagger: number;
  ease: 'power3.out';
  from: Record<string, number>;
}

const CHAPTER_STYLES: Readonly<Record<JourneyChapterId, HeadlineStyle>> = Object.freeze({
  portico: 'line-rise',
  foundation: 'line-rise',
  garage: 'lateral-curtain',
  vault: 'depth-settle',
  'finish-hall': 'depth-settle',
  commercial: 'lateral-curtain',
  proof: 'line-rise',
  consultation: 'depth-settle',
});

const DESKTOP_SPECS: Readonly<Record<HeadlineStyle, HeadlineMotionSpec>> = Object.freeze({
  'line-rise': Object.freeze({
    duration: 0.86,
    stagger: 0.055,
    ease: 'power3.out',
    from: Object.freeze({ yPercent: 30, opacity: 0 }),
  }),
  'lateral-curtain': Object.freeze({
    duration: 0.96,
    stagger: 0.06,
    ease: 'power3.out',
    from: Object.freeze({ xPercent: -13, opacity: 0 }),
  }),
  'depth-settle': Object.freeze({
    duration: 0.98,
    stagger: 0.05,
    ease: 'power3.out',
    from: Object.freeze({ y: 14, z: -42, rotationX: 4, transformPerspective: 900, opacity: 0 }),
  }),
});

const COMPACT_SPECS: Readonly<Record<HeadlineStyle, HeadlineMotionSpec>> = Object.freeze({
  'line-rise': Object.freeze({
    duration: 0.68,
    stagger: 0.04,
    ease: 'power3.out',
    from: Object.freeze({ yPercent: 20, opacity: 0 }),
  }),
  'lateral-curtain': Object.freeze({
    duration: 0.76,
    stagger: 0.04,
    ease: 'power3.out',
    from: Object.freeze({ xPercent: -8, opacity: 0 }),
  }),
  'depth-settle': Object.freeze({
    duration: 0.78,
    stagger: 0.035,
    ease: 'power3.out',
    from: Object.freeze({ y: 8, z: -22, rotationX: 2.5, transformPerspective: 760, opacity: 0 }),
  }),
});

export const headlineStyleForChapter = (chapter: JourneyChapterId) => CHAPTER_STYLES[chapter];

export const headlineMotionSpec = (style: HeadlineStyle, compact: boolean) => (
  compact ? COMPACT_SPECS[style] : DESKTOP_SPECS[style]
);

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
