import { finishPresets, type FinishPreset } from '../visualizer/finishes';
import {
  computeHomography,
  invertHomography,
  type Homography,
  type Point,
  type Quad,
} from '../visualizer/homography';
import type { FeaturedFinishId, MotionPreference } from './journey-controls';

export const HERO_IMAGE_URL = '/images/brand/luminous-passage-keyframe.jpg';
export const HERO_IMAGE_SIZE = Object.freeze({ width: 1_680, height: 945 });
export const HERO_FINISH_DENSITY = 64;

export const HERO_FLOOR_POLYGON: readonly Point[] = Object.freeze([
  { x: 0, y: 0.795 },
  { x: 0.43, y: 0.585 },
  { x: 0.535, y: 0.56 },
  { x: 0.56, y: 0.553 },
  { x: 0.593, y: 0.552 },
  { x: 0.61, y: 0.557 },
  { x: 0.625, y: 0.555 },
  { x: 0.657, y: 0.555 },
  { x: 0.69, y: 0.563 },
  { x: 0.73, y: 0.584 },
  { x: 0.785, y: 0.617 },
  { x: 0.86, y: 0.636 },
  { x: 1, y: 0.69 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]);

export const HERO_FINISH_PLANE: Quad = Object.freeze([
  { x: 0.527, y: 0.556 },
  { x: 0.697, y: 0.556 },
  { x: 1.7, y: 1.1 },
  { x: -0.45, y: 1.1 },
]) as Quad;

const FINISH_SQUARE: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export const HERO_IMAGE_TO_FINISH: Homography = Object.freeze(
  invertHomography(computeHomography(FINISH_SQUARE, HERO_FINISH_PLANE)),
) as Homography;

export function pointInFloorMask(point: Point): boolean {
  let inside = false;
  for (let index = 0, previous = HERO_FLOOR_POLYGON.length - 1; index < HERO_FLOOR_POLYGON.length; previous = index, index += 1) {
    const currentPoint = HERO_FLOOR_POLYGON[index];
    const previousPoint = HERO_FLOOR_POLYGON[previous];
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y))
        / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function heroFinishForId(id: FeaturedFinishId): FinishPreset {
  const finish = finishPresets.find((preset) => preset.id === id);
  if (!finish) throw new Error(`Missing featured finish preset: ${id}`);
  return finish;
}

export function heroFinishReferenceLuma(finish: FinishPreset): number {
  const srgbToLinear = (channel: number) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
  const luminances = finish.colors.map((hex) => {
    const channels = [1, 3, 5].map((offset) => srgbToLinear(Number.parseInt(hex.slice(offset, offset + 2), 16) / 255));
    return channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114;
  });
  return luminances.reduce((sum, value) => sum + value, 0) / luminances.length;
}

interface HeroSnapshotLike {
  readonly activeChapter: string;
  readonly visible: boolean;
  readonly documentVisible: boolean;
  readonly chapterProgress: number;
}

export function heroMaterialOpacity(snapshot: HeroSnapshotLike, preference: MotionPreference): number {
  if (!snapshot.visible || !snapshot.documentVisible || snapshot.activeChapter !== 'portico') return 0;
  if (preference === 'still') return 1;
  return 1 - Math.min(1, Math.max(0, (snapshot.chapterProgress - 0.18) / 0.42));
}

export interface HeroFrameMetric {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly fixed: boolean;
}

export interface HeroViewport {
  readonly scrollY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface HeroFramePlacement {
  readonly visible: boolean;
  readonly position: readonly [number, number];
  readonly scale: readonly [number, number];
}

export function heroFramePlacement(frame: HeroFrameMetric, viewport: HeroViewport): HeroFramePlacement {
  const top = frame.fixed ? frame.top : frame.top - viewport.scrollY;
  const left = frame.left;
  const bottom = top + frame.height;
  const right = left + frame.width;
  return {
    visible: right > 0 && left < viewport.viewportWidth && bottom > 0 && top < viewport.viewportHeight,
    position: [
      ((left + frame.width / 2) / viewport.viewportWidth) * 2 - 1,
      1 - ((top + frame.height / 2) / viewport.viewportHeight) * 2,
    ],
    scale: [frame.width / viewport.viewportWidth, frame.height / viewport.viewportHeight],
  };
}
