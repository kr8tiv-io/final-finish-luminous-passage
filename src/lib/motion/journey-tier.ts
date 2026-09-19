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

/**
 * 2G-class. Nothing on this page is worth a film on a connection that cannot deliver
 * one inside a scroll: `still` keeps every act, every headline and every poster and
 * simply never asks for a video byte. See docs/context/DECISIONS.md, "Capability tiers".
 */
const SLOW_CONNECTIONS: readonly string[] = ['slow-2g', '2g'];

/**
 * 3G-class: enough for the page, not enough for the compositor.
 *
 * This is a `balanced` rule and not a `still` one — the films still scrub on the DOM
 * plates, which is what a 3G phone can actually carry — and it is written out rather
 * than left to the coarse-pointer rule below it, because the two say different things.
 * "Touch" is a statement about the input device and is why an iPad on fibre is
 * `balanced`; "3g" is a statement about the pipe. A device that is both gets `balanced`
 * for two independent reasons, which is the point: neither rule is load-bearing alone.
 *
 * Desktop on 3G stays `full` deliberately. A wired machine reporting `3g` is usually a
 * momentary estimate from the network quality estimator rather than a property of the
 * machine, and the compositor chunk is already deferred to idle.
 */
const MODEST_CONNECTIONS: readonly string[] = ['3g'];

/** Below this many gigabytes a device is not asked to hold the compositor. */
const LOW_DEVICE_MEMORY_GB = 2;

/**
 * `effectiveType` arrives from `navigator.connection`, which is a browser-populated
 * string in practice but an untyped one in this codebase's inputs — it is also the
 * value an emulation shim or a test harness writes. Normalising it here is what keeps
 * `2G` and ` 2g ` from resolving to `full` by falling past every named rule.
 */
function normalizeEffectiveType(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

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
 *
 * The rules, in the order they are asked (Step 33 wrote this list into
 * docs/context/DECISIONS.md; the two must not drift):
 *
 *   still     preference `still` · `prefers-reduced-motion: reduce` · `saveData`
 *             · `effectiveType` in {slow-2g, 2g}
 *   balanced  preference `balanced` · no WebGL2 or no `EXT_color_buffer_float`
 *             · `deviceMemory` <= 2 · `effectiveType` 3g on a coarse pointer
 *             · a coarse pointer on its own
 *   full      everything else
 */
export function resolveJourneyTier(inputs: Partial<JourneyTierInputs> = {}): JourneyTier {
  const {
    webgl2,
    floatBuffers,
    reducedMotion,
    saveData,
    coarsePointer,
    deviceMemory,
    preference,
  } = { ...DEFAULT_INPUTS, ...inputs };
  const effectiveType = normalizeEffectiveType({ ...DEFAULT_INPUTS, ...inputs }.effectiveType);

  if (preference === 'still') return 'still';
  if (reducedMotion) return 'still';
  if (saveData) return 'still';
  if (effectiveType !== null && SLOW_CONNECTIONS.includes(effectiveType)) return 'still';
  if (preference === 'balanced') return 'balanced';
  if (!webgl2 || !floatBuffers) return 'balanced';
  if (deviceMemory !== null && deviceMemory > 0 && deviceMemory <= LOW_DEVICE_MEMORY_GB) return 'balanced';
  if (coarsePointer && effectiveType !== null && MODEST_CONNECTIONS.includes(effectiveType)) return 'balanced';
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
