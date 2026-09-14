import type { JourneyChapterId } from './journey-director';

export type JourneyTransitionKind = 'white-dissolve' | 'aperture' | 'fold';

export interface JourneyTransitionStyle {
  readonly kind: JourneyTransitionKind;
  readonly mode: 0 | 1 | 2;
  readonly direction: -1 | 1;
}

const DEFAULT_STYLE: JourneyTransitionStyle = Object.freeze({ kind: 'fold', mode: 2, direction: 1 });

const TRANSITIONS: Readonly<Record<string, JourneyTransitionStyle>> = Object.freeze({
  'portico:foundation': Object.freeze({ kind: 'white-dissolve', mode: 0, direction: 1 }),
  'foundation:garage': Object.freeze({ kind: 'fold', mode: 2, direction: 1 }),
  'garage:vault': Object.freeze({ kind: 'aperture', mode: 1, direction: 1 }),
  'vault:finish-hall': Object.freeze({ kind: 'fold', mode: 2, direction: -1 }),
  'finish-hall:commercial': Object.freeze({ kind: 'fold', mode: 2, direction: 1 }),
  'commercial:proof': Object.freeze({ kind: 'fold', mode: 2, direction: -1 }),
  'proof:consultation': Object.freeze({ kind: 'fold', mode: 2, direction: 1 }),
});

export function transitionBoundaryKey(from: JourneyChapterId, to: JourneyChapterId): string {
  return `${from}:${to}`;
}

export function transitionRenderKey(
  from: JourneyChapterId,
  to: JourneyChapterId,
  fromWhiteStage: boolean,
): string {
  return `${transitionBoundaryKey(from, to)}:${fromWhiteStage ? 'white' : 'media'}`;
}

export function resolveJourneyTransition(from: JourneyChapterId, to: JourneyChapterId): JourneyTransitionStyle {
  return TRANSITIONS[transitionBoundaryKey(from, to)] ?? DEFAULT_STYLE;
}

export function transitionLockAction(
  lockedKey: string | null,
  boundaryKey: string,
  interior: boolean,
  whiteStageActive: boolean,
): 'clear' | 'retain' | 'acquire' {
  if (!interior || whiteStageActive) return 'clear';
  return lockedKey === boundaryKey ? 'retain' : 'acquire';
}
