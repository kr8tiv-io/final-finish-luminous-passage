import type { MotionPreference } from './journey-controls';

/**
 * One capability decision for the whole journey.
 *
 * `full`     — the WebGL compositor is admitted; the veil owns the boundary picture.
 * `balanced` — no compositor download at all; the DOM plate crossfade is the transition
 *              and the chapter films still scrub.
 * `still`    — posters only, films hidden, the narrative stays intact in text.
 *
 * Only this module decides the tier. `JourneyMotion` publishes it on
 * `html[data-journey-tier]`; `FilmVeilLoader` reads it to gate the dynamic import.
 */
export type JourneyTier = 'full' | 'balanced' | 'still';

export interface JourneyTierInputs {
  readonly webgl2: boolean;
  readonly floatBuffers: boolean;
  readonly reducedMotion: boolean;
  readonly saveData: boolean;
  readonly effectiveType: string | null;
  readonly coarsePointer: boolean;
  readonly deviceMemory: number | null;
  readonly preference: MotionPreference;
}

const SLOW_CONNECTIONS: readonly string[] = ['slow-2g', '2g'];

const DEFAULT_INPUTS: JourneyTierInputs = Object.freeze({
  webgl2: false,
  floatBuffers: false,
  reducedMotion: false,
  saveData: false,
  effectiveType: null,
  coarsePointer: false,
  deviceMemory: null,
  preference: 'auto',
});

/**
 * Pure: identical inputs always resolve to the same tier. Touch alone never
 * drops below `balanced`, and `still` is only ever reached deliberately
 * (explicit preference, reduced motion, Save-Data, or a 2G-class connection).
 */
export function resolveJourneyTier(inputs: Partial<JourneyTierInputs> = {}): JourneyTier {
  const {
    webgl2,
    floatBuffers,
    reducedMotion,
    saveData,
    effectiveType,
    coarsePointer,
    deviceMemory,
    preference,
  } = { ...DEFAULT_INPUTS, ...inputs };

  if (preference === 'still') return 'still';
  if (reducedMotion) return 'still';
  if (saveData) return 'still';
  if (effectiveType !== null && SLOW_CONNECTIONS.includes(effectiveType)) return 'still';
  if (preference === 'balanced') return 'balanced';
  if (!webgl2 || !floatBuffers) return 'balanced';
  if (deviceMemory !== null && deviceMemory > 0 && deviceMemory <= 2) return 'balanced';
  if (coarsePointer) return 'balanced';
  return 'full';
}

interface GpuProbe {
  readonly webgl2: boolean;
  readonly floatBuffers: boolean;
}

let gpuProbe: GpuProbe | null = null;

/**
 * One probe per document: a second `webgl2` context request costs a real GPU
 * context, and two callers disagreeing about the answer is exactly the
 * two-owners bug this step removes.
 */
export function detectJourneyGpu(): GpuProbe {
  if (gpuProbe) return gpuProbe;
  if (typeof document === 'undefined') return { webgl2: false, floatBuffers: false };
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    if (!context) {
      gpuProbe = Object.freeze({ webgl2: false, floatBuffers: false });
      return gpuProbe;
    }
    const floatBuffers = Boolean(context.getExtension('EXT_color_buffer_float'));
    context.getExtension('WEBGL_lose_context')?.loseContext();
    gpuProbe = Object.freeze({ webgl2: true, floatBuffers });
  } catch {
    gpuProbe = Object.freeze({ webgl2: false, floatBuffers: false });
  }
  return gpuProbe;
}

/** Test seam only: forget the memoised probe so a fresh document can be measured. */
export function resetJourneyGpuProbe(): void {
  gpuProbe = null;
}

export function readJourneyTierInputs(preference: MotionPreference): JourneyTierInputs {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { ...DEFAULT_INPUTS, preference };
  }
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return Object.freeze({
    ...detectJourneyGpu(),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: Boolean(connection?.saveData),
    effectiveType: connection?.effectiveType ?? null,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    deviceMemory: typeof deviceMemory === 'number' ? deviceMemory : null,
    preference,
  });
}

export function currentJourneyTier(preference: MotionPreference): JourneyTier {
  return resolveJourneyTier(readJourneyTierInputs(preference));
}
