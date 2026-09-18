import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { journeyControls } from '../../lib/motion/journey-controls';
import { currentJourneyTier } from '../../lib/motion/journey-tier';
import { resolveThresholdStudyOptIn } from '../../lib/motion/journey-threshold';
import { onRouteTeardown } from '../../lib/motion/route-lifecycle';
import MotionErrorBoundary from './MotionErrorBoundary';

const FilmVeil = lazy(() => import('./FilmVeil'));

/**
 * The compositor chunk is downloaded on the `full` tier only. Every other
 * device keeps the DOM plate crossfade the director publishes as `handoff`,
 * so a `balanced` visitor never pays for a shader it will not run.
 *
 * Step 18a: what is gated changed, the gate did not. On `full` this registers a
 * *view* of the one layout-level canvas; on `balanced` and `still` it registers
 * nothing and imports nothing. `.film-veil` itself is always in the document —
 * it is the view's rectangle, and it carries the compositor's own frame state
 * (`data-rendered-boundary` / `-progress` / `-revision`), so a page can be asked
 * what the veil painted without reaching for a canvas that another view shares.
 */
export default function FilmVeilLoader({ enableThresholdStudy = false }: {
  readonly enableThresholdStudy?: boolean;
}) {
  const controls = useSyncExternalStore(
    journeyControls.subscribe,
    journeyControls.getSnapshot,
    journeyControls.getServerSnapshot,
  );
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [admitted, setAdmitted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    journeyControls.hydrate();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    const clearDeferredImport = () => {
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
      idleHandle = null;
      timeoutHandle = null;
    };
    const deferImport = () => {
      clearDeferredImport();
      if (window.requestIdleCallback) {
        idleHandle = window.requestIdleCallback(() => setReady(true), { timeout: 1_500 });
      } else {
        timeoutHandle = window.setTimeout(() => setReady(true), 180);
      }
    };
    const updateTier = () => {
      const tier = currentJourneyTier(journeyControls.getSnapshot().motionPreference);
      if (tier !== 'full') {
        clearDeferredImport();
        setReady(false);
        setAdmitted(false);
        return;
      }
      setAdmitted(true);
      deferImport();
    };
    reduced.addEventListener('change', updateTier);
    updateTier();
    // A route swap must not leave an idle callback queued against a document that is
    // about to be replaced: it would resolve into a `setReady(true)` on an unmounted
    // island, downloading the compositor chunk for a page that has no `.film-veil`.
    // The `film-veil` view itself is dropped by `route-lifecycle`'s
    // `unregisterPageViews`, because `FilmVeil.tsx` belongs to another owner.
    return onRouteTeardown(() => {
      reduced.removeEventListener('change', updateTier);
      clearDeferredImport();
    });
  }, [controls.motionPreference]);

  const registerView = ready && admitted;

  return (
    <div
      className="film-veil"
      data-film-veil={registerView ? 'on' : 'still'}
      /* The local `?study=threshold` opt-in is recorded but no longer mounts
         `ThresholdTravel`: that component needs an R3F context and this file no
         longer owns one (see FilmVeil.tsx). Step 20 decides the study's future. */
      data-threshold-study-requested={resolveThresholdStudyOptIn(enableThresholdStudy) ? '' : undefined}
      aria-hidden="true"
      ref={setHost}
    >
      {registerView && host ? (
        <MotionErrorBoundary>
          <Suspense fallback={null}>
            <FilmVeil host={host} motionEnabled={admitted} />
          </Suspense>
        </MotionErrorBoundary>
      ) : null}
    </div>
  );
}
