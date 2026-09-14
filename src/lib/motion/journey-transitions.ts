import type { JourneyChapterId, JourneySnapshot, JourneyWhiteTargetId } from './journey-director';

export type JourneyTransitionKind = 'white-dissolve' | 'aperture' | 'fold' | 'resin-wipe' | 'preparation-curl';

export interface JourneyTransitionStyle {
  readonly kind: JourneyTransitionKind;
  readonly mode: 0 | 1 | 2 | 3 | 4;
  readonly direction: -1 | 1;
}

export interface JourneyTransitionFrame {
  readonly key: string;
  readonly boundaryKey: string;
  readonly from: JourneyChapterId;
  readonly to: JourneyChapterId | null;
  readonly progress: number;
  readonly fromWhite: boolean;
  readonly style: JourneyTransitionStyle;
}

const DEFAULT_STYLE: JourneyTransitionStyle = Object.freeze({ kind: 'fold', mode: 2, direction: 1 });

const TRANSITIONS: Readonly<Record<string, JourneyTransitionStyle>> = Object.freeze({
  'portico:foundation': Object.freeze({ kind: 'white-dissolve', mode: 0, direction: 1 }),
  'foundation:garage': Object.freeze({ kind: 'preparation-curl', mode: 4, direction: 1 }),
  'garage:vault': Object.freeze({ kind: 'aperture', mode: 1, direction: 1 }),
  'vault:finish-hall': Object.freeze({ kind: 'fold', mode: 2, direction: -1 }),
  'finish-hall:commercial': Object.freeze({ kind: 'fold', mode: 2, direction: 1 }),
  'commercial:proof': Object.freeze({ kind: 'fold', mode: 2, direction: -1 }),
  'proof:consultation': Object.freeze({ kind: 'fold', mode: 2, direction: 1 }),
});

const WHITE_TARGET_TRANSITIONS: Readonly<Record<JourneyWhiteTargetId, JourneyTransitionStyle>> = Object.freeze({
  'customer-reviews': Object.freeze({ kind: 'resin-wipe', mode: 3, direction: 1 }),
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

export function resolveJourneyWhiteTargetTransition(target: JourneyWhiteTargetId): JourneyTransitionStyle {
  return WHITE_TARGET_TRANSITIONS[target];
}

export function resolveJourneyTransitionFrame(snapshot: Pick<
  JourneySnapshot,
  'fromChapter' | 'toChapter' | 'transitionProgress' | 'transitionFromWhite' | 'whiteTarget'
>): JourneyTransitionFrame {
  if (snapshot.whiteTarget) {
    return Object.freeze({
      key: `${snapshot.whiteTarget.from}:${snapshot.whiteTarget.id}:white-target`,
      boundaryKey: `${snapshot.whiteTarget.id}:white-target`,
      from: snapshot.whiteTarget.from,
      to: null,
      progress: snapshot.whiteTarget.progress,
      fromWhite: false,
      style: resolveJourneyWhiteTargetTransition(snapshot.whiteTarget.id),
    });
  }
  return Object.freeze({
    key: transitionRenderKey(snapshot.fromChapter, snapshot.toChapter, snapshot.transitionFromWhite),
    boundaryKey: transitionBoundaryKey(snapshot.fromChapter, snapshot.toChapter),
    from: snapshot.fromChapter,
    to: snapshot.toChapter,
    progress: snapshot.transitionProgress,
    fromWhite: snapshot.transitionFromWhite,
    style: resolveJourneyTransition(snapshot.fromChapter, snapshot.toChapter),
  });
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
