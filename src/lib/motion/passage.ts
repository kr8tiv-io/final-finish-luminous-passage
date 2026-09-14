export type PassageQuality = 'still' | 'low' | 'high';

export type WalkChapter = 'oculus' | 'threshold' | 'grind' | 'workshop' | 'same-arch';

export interface PassageCapabilities {
  webgl2: boolean;
  reducedMotion: boolean;
  saveData: boolean;
  coarsePointer: boolean;
  deviceMemory: number | null;
}

export interface PassageKeyframe {
  time: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  chapter?: string;
}

export const WALK_CHAPTERS: readonly WalkChapter[] = ['oculus', 'threshold', 'grind', 'workshop', 'same-arch'];

/**
 * Blender LP_Poster_Camera that rendered luminous-passage.jpg /
 * luminous-passage-keyframe. Not luminous-finish-hall (workshop).
 */
export const OCULUS_POSTER_FRAME: PassageKeyframe = {
  time: 0,
  position: [0, 4.0, 1.65],
  target: [0, 23.5, 1.75],
  chapter: 'oculus-poster',
};

export const WALK_TO_MANIFEST: Record<WalkChapter, string> = {
  oculus: 'daylit-portico',
  threshold: 'foundation-chamber',
  grind: 'consultation-court',
  workshop: 'luminous-finish-hall',
  'same-arch': 'proof-arcade',
};

export const CHAPTER_ORDER = ['portico', 'foundation', 'garage', 'vault', 'finish-hall', 'commercial', 'proof', 'consultation'] as const;

export function choosePassageQuality(capabilities: PassageCapabilities): PassageQuality {
  if (!capabilities.webgl2 || capabilities.reducedMotion || capabilities.saveData || capabilities.coarsePointer) return 'still';
  if (capabilities.deviceMemory !== null && capabilities.deviceMemory <= 4) return 'low';
  return 'high';
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function lerpTriplet(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  progress: number,
): [number, number, number] {
  return [lerp(from[0], to[0], progress), lerp(from[1], to[1], progress), lerp(from[2], to[2], progress)];
}

export function sampleCameraRoute(route: readonly PassageKeyframe[], progress: number, duration: number) {
  if (route.length === 0) throw new Error('The passage camera route needs at least one keyframe.');
  const time = Math.min(1, Math.max(0, progress)) * duration;
  const nextIndex = route.findIndex((frame) => frame.time >= time);
  if (nextIndex <= 0) return { position: [...route[0].position] as [number, number, number], target: [...route[0].target] as [number, number, number] };
  if (nextIndex === -1) {
    const last = route.at(-1)!;
    return { position: [...last.position] as [number, number, number], target: [...last.target] as [number, number, number] };
  }
  const from = route[nextIndex - 1];
  const to = route[nextIndex];
  const localProgress = (time - from.time) / Math.max(0.0001, to.time - from.time);
  return { position: lerpTriplet(from.position, to.position, localProgress), target: lerpTriplet(from.target, to.target, localProgress) };
}

export function keyframesForWalkChapter(route: readonly PassageKeyframe[], chapter: WalkChapter): PassageKeyframe[] {
  const slug = WALK_TO_MANIFEST[chapter];
  const matches = route.filter((frame) => frame.chapter === slug);
  if (chapter === 'oculus') {
    const forward = matches.filter((frame) => frame.position[1] >= OCULUS_POSTER_FRAME.position[1] - 0.05);
    return [OCULUS_POSTER_FRAME, ...(forward.length ? forward : matches)];
  }
  return matches.length > 0 ? matches : [route[0]];
}

export function roomWalkProgress(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  const hold = 0.1;
  if (t <= hold) return 0;
  const u = (t - hold) / (1 - hold);
  return u * u * (3 - 2 * u);
}

export function chapterPresence(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  if (t < 0.06) return t / 0.06;
  if (t > 0.78) return Math.max(0, 1 - (t - 0.78) / 0.18);
  return 1;
}

export function mixHex(from: string, to: string, progress: number): string {
  const parse = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const t = Math.min(1, Math.max(0, progress));
  const a = parse(from);
  const b = parse(to);
  const channel = (index: number) => Math.round(a[index] + (b[index] - a[index]) * t).toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

export function oculusStartFrame(_route?: readonly PassageKeyframe[]): PassageKeyframe {
  return OCULUS_POSTER_FRAME;
}

export function cinematicProgress(progress: number, chapter: WalkChapter): number {
  const t = Math.min(1, Math.max(0, progress));
  if (chapter === 'oculus') return 1 - (1 - t) * (1 - t);
  if (chapter === 'threshold') return t * t;
  return t * t * (3 - 2 * t);
}

export function pourTimeFromProgress(progress: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const t = Math.min(1, Math.max(0, progress));
  return t * duration;
}

const PAPER_GRADE = { paper: '#f4f1e9', ink: '#17222a', cobalt: '#164f83' };

export const ROOM_GRADE: Record<string, { paper: string; ink: string; cobalt: string }> = {
  portico: PAPER_GRADE,
  foundation: PAPER_GRADE,
  garage: PAPER_GRADE,
  vault: PAPER_GRADE,
  'finish-hall': PAPER_GRADE,
  commercial: PAPER_GRADE,
  proof: PAPER_GRADE,
  consultation: PAPER_GRADE,
};

export const DOM_TO_WALK: Record<string, WalkChapter> = {
  portico: 'oculus',
  foundation: 'threshold',
  garage: 'threshold',
  vault: 'workshop',
  'finish-hall': 'workshop',
  commercial: 'grind',
  proof: 'same-arch',
  consultation: 'grind',
};

const HALL_ORDER: readonly WalkChapter[] = ['oculus', 'threshold', 'workshop', 'same-arch', 'grind'];

function framesThroughDoorway(route: readonly PassageKeyframe[], chapter: WalkChapter): PassageKeyframe[] {
  const frames = keyframesForWalkChapter(route, chapter);
  const next = HALL_ORDER[HALL_ORDER.indexOf(chapter) + 1];
  if (!next) return frames;
  const doorway = route.find((frame) => frame.chapter === WALK_TO_MANIFEST[next]);
  if (!doorway || doorway.time <= (frames.at(-1)?.time ?? 0)) return frames;
  return [...frames, doorway];
}

export function sampleWalkChapter(route: readonly PassageKeyframe[], chapter: WalkChapter, progress: number) {
  const frames = framesThroughDoorway(route, chapter);
  const duration = frames.length < 2 ? 1 : frames[frames.length - 1].time - frames[0].time || 1;
  const normalized = frames.map((frame) => ({
    ...frame,
    time: frame.time - frames[0].time,
  }));
  return sampleCameraRoute(normalized, cinematicProgress(roomWalkProgress(progress), chapter), duration);
}

export function sampleHallTransition(
  route: readonly PassageKeyframe[],
  fromChapter: WalkChapter,
  toChapter: WalkChapter,
  progress: number,
) {
  const t = cinematicProgress(Math.min(1, Math.max(0, progress)), 'workshop');
  const start = sampleWalkChapter(route, fromChapter, 1);
  const end = sampleWalkChapter(route, toChapter, 0.32);
  return {
    position: lerpTriplet(start.position, end.position, t),
    target: lerpTriplet(start.target, end.target, t),
  };
}

export function toThreeCoordinates([x, y, z]: readonly [number, number, number]): [number, number, number] {
  return [x, z, -y];
}
