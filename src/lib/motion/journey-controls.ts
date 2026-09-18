export const FEATURED_FINISH_IDS = ['alabaster-stone', 'salt-pepper', 'blue-hour'] as const;
export type FeaturedFinishId = (typeof FEATURED_FINISH_IDS)[number];
/**
 * `auto` lets `resolveJourneyTier` pick; `balanced` caps the journey below the
 * WebGL compositor; `still` stops presentation motion entirely. The persisted
 * v1 values were `auto` and `still`, which both carry forward unchanged.
 */
export type MotionPreference = 'auto' | 'balanced' | 'still';

export interface JourneyControlSnapshot {
  readonly selectedFinish: FeaturedFinishId;
  readonly motionPreference: MotionPreference;
  readonly revision: number;
}

const STORAGE_KEY = 'final-finish:journey-controls:v1';
const DEFAULT_SNAPSHOT: JourneyControlSnapshot = Object.freeze({
  selectedFinish: 'alabaster-stone',
  motionPreference: 'auto',
  revision: 0,
});

const isFinish = (value: unknown): value is FeaturedFinishId =>
  typeof value === 'string' && (FEATURED_FINISH_IDS as readonly string[]).includes(value);
const isMotionPreference = (value: unknown): value is MotionPreference =>
  value === 'auto' || value === 'balanced' || value === 'still';

/**
 * Forward-migrates a persisted preference. The v1 store only ever held
 * `auto` or `still`; both remain valid, `balanced` is newly accepted, and
 * anything else (including the older `enhanced` spelling) lands on `auto`.
 */
export function migrateMotionPreference(stored: unknown): MotionPreference {
  if (isMotionPreference(stored)) return stored;
  return 'auto';
}

function persist(snapshot: JourneyControlSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedFinish: snapshot.selectedFinish,
      motionPreference: snapshot.motionPreference,
    }));
  } catch {
    // Storage can be unavailable in private or embedded browsing contexts.
  }
}

function createJourneyControls() {
  const listeners = new Set<() => void>();
  let snapshot = DEFAULT_SNAPSHOT;

  const publish = (selectedFinish: FeaturedFinishId, motionPreference: MotionPreference) => {
    if (snapshot.selectedFinish === selectedFinish && snapshot.motionPreference === motionPreference) return;
    snapshot = Object.freeze({ selectedFinish, motionPreference, revision: snapshot.revision + 1 });
    persist(snapshot);
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => DEFAULT_SNAPSHOT,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSelectedFinish: (id: FeaturedFinishId) => {
      if (isFinish(id)) publish(id, snapshot.motionPreference);
    },
    setMotionPreference: (preference: MotionPreference) => {
      if (isMotionPreference(preference)) publish(snapshot.selectedFinish, preference);
    },
    hydrate: () => {
      if (typeof window === 'undefined') return;
      try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
        publish(
          isFinish(stored.selectedFinish) ? stored.selectedFinish : snapshot.selectedFinish,
          'motionPreference' in stored
            ? migrateMotionPreference(stored.motionPreference)
            : snapshot.motionPreference,
        );
      } catch {
        // Ignore malformed or unavailable persisted preferences.
      }
    },
  } as const;
}

export const journeyControls = createJourneyControls();
