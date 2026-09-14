import type { Point } from './homography';

export type ExclusionMode = 'erase' | 'restore';

export interface ExclusionStroke {
  mode: ExclusionMode;
  radius: number;
  points: readonly Point[];
}

export interface ExclusionMaskDraft {
  photoRevision: string;
  strokes: readonly ExclusionStroke[];
}

function normalizePoint(point: Point): Point {
  return {
    x: Math.min(1, Math.max(0, point.x)),
    y: Math.min(1, Math.max(0, point.y)),
  };
}

export function createExclusionMask(photoRevision: string): ExclusionMaskDraft {
  return { photoRevision, strokes: [] };
}

export function beginExclusionStroke(
  draft: ExclusionMaskDraft,
  photoRevision: string,
  mode: ExclusionMode,
  point: Point,
  radius: number,
): ExclusionMaskDraft {
  const current = draft.photoRevision === photoRevision ? draft : createExclusionMask(photoRevision);
  const stroke: ExclusionStroke = {
    mode,
    radius: Math.min(0.12, Math.max(0.004, radius)),
    points: [normalizePoint(point)],
  };
  return { ...current, strokes: [...current.strokes, stroke] };
}

export function appendExclusionPoint(
  draft: ExclusionMaskDraft,
  photoRevision: string,
  point: Point,
): ExclusionMaskDraft {
  if (draft.photoRevision !== photoRevision || draft.strokes.length === 0) return draft;
  const next = normalizePoint(point);
  const last = draft.strokes.at(-1)!;
  const previous = last.points.at(-1)!;
  if (Math.hypot(next.x - previous.x, next.y - previous.y) < 0.0015) return draft;
  return {
    ...draft,
    strokes: [...draft.strokes.slice(0, -1), { ...last, points: [...last.points, next] }],
  };
}

export function undoExclusionStroke(draft: ExclusionMaskDraft): ExclusionMaskDraft {
  return { ...draft, strokes: draft.strokes.slice(0, -1) };
}

export function clearExclusionMask(draft: ExclusionMaskDraft): ExclusionMaskDraft {
  return { ...draft, strokes: [] };
}
