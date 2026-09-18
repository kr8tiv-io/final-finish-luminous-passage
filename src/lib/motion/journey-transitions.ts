import type { JourneyChapterId, JourneySnapshot, JourneyWhiteTargetId } from './journey-director';

export type JourneyTransitionKind =
  | 'white-dissolve'
  | 'aperture'
  | 'fold'
  | 'resin-wipe'
  | 'preparation-curl'
  | 'fold-and-shoot-left';

export interface JourneyTransitionStyle {
  readonly kind: JourneyTransitionKind;
  readonly mode: 0 | 1 | 2 | 3 | 4 | 5;
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

/**
 * One entry per `.journey-breath[data-hall-from][data-hall-to]`, in the order
 * `index.astro` renders them — `boundaries.spec` reads the keys straight out of
 * this literal and asserts them against the rendered breaths, so the order here
 * is part of the contract, not decoration.
 *
 * Step 11b put the page in storyboard order (`proof` = act 05, between Reclaim
 * and Your finish). Step 22 added the third Reclaim room (`mancave`), so Act 4's
 * two interior boundaries are the bay's own folds and the act now exits from
 * `mancave`.
 *
 * `fold-and-shoot-left` (veil mode 5) is the one mechanic authored here rather
 * than borrowed: the outgoing room hinges on a vertical crease, its two halves
 * foreshorten toward it, the whole sheet shoots left, and the incoming room
 * parallax-slides in from the right behind it. `@motion fold-and-shoot-left`
 * and `@motion swallow` (the act's entrance, still wearing `preparation-curl`
 * at `foundation:garage` until Step 20's stair lands the real opening rectangle).
 *
 * Two of these are placeholders wearing an existing veil mode until their own
 * step authors the real mechanic:
 * - `mancave:proof` reuses `aperture` until Step 23 lands `shrink-to-card`.
 * - `proof:finish-hall` reuses `white-dissolve` until Step 24 lands
 *   `resin-layer-mask`. It leaves a white stage, so paper-to-room is the honest
 *   stand-in rather than a fold that would deform the gallery's own paper.
 */
const TRANSITIONS: Readonly<Record<string, JourneyTransitionStyle>> = Object.freeze({
  'portico:foundation': Object.freeze({ kind: 'white-dissolve', mode: 0, direction: 1 }),
  'foundation:garage': Object.freeze({ kind: 'preparation-curl', mode: 4, direction: 1 }),
  'garage:vault': Object.freeze({ kind: 'fold-and-shoot-left', mode: 5, direction: 1 }),
  'vault:mancave': Object.freeze({ kind: 'fold-and-shoot-left', mode: 5, direction: 1 }),
  'mancave:proof': Object.freeze({ kind: 'aperture', mode: 1, direction: -1 }),
  'proof:finish-hall': Object.freeze({ kind: 'white-dissolve', mode: 0, direction: 1 }),
  'finish-hall:commercial': Object.freeze({ kind: 'fold', mode: 2, direction: 1 }),
  'commercial:consultation': Object.freeze({ kind: 'fold', mode: 2, direction: 1 }),
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
