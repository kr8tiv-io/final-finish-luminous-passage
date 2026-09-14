export const THRESHOLD_TRANSITION = Object.freeze({ from: 'garage', to: 'vault' } as const);

interface ThresholdSnapshotLike {
  readonly activeChapter?: string;
  readonly fromChapter: string;
  readonly toChapter: string;
  readonly transitionProgress: number;
  readonly visible: boolean;
  readonly documentVisible: boolean;
}

export function thresholdApproaching(snapshot: ThresholdSnapshotLike, motionEnabled: boolean): boolean {
  return motionEnabled && (
    snapshot.activeChapter === THRESHOLD_TRANSITION.from
    || snapshot.activeChapter === THRESHOLD_TRANSITION.to
  );
}

export function resolveThresholdStudyOptIn(value?: boolean): boolean {
  return value === true;
}

export function thresholdStudyEnabled(
  snapshot: ThresholdSnapshotLike,
  gates: {
    readonly optIn: boolean;
    readonly hdrSupported: boolean;
    readonly motionEnabled: boolean;
  },
): boolean {
  return gates.optIn && gates.hdrSupported && thresholdApproaching(snapshot, gates.motionEnabled);
}

export interface ThresholdFrame {
  readonly visible: boolean;
  readonly progress: number;
  readonly opacity: number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return progress * progress * (3 - 2 * progress);
}

export function thresholdFrame(snapshot: ThresholdSnapshotLike, motionEnabled: boolean): ThresholdFrame {
  const progress = Math.min(1, Math.max(0, snapshot.transitionProgress));
  const visible = motionEnabled
      && snapshot.visible
      && snapshot.documentVisible
      && snapshot.fromChapter === THRESHOLD_TRANSITION.from
      && snapshot.toChapter === THRESHOLD_TRANSITION.to
      && progress > 0
      && progress < 1;
  return {
    visible,
    progress,
    opacity: visible ? smoothstep(0, 0.14, progress) * (1 - smoothstep(0.86, 1, progress)) : 0,
  };
}
