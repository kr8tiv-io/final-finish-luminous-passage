import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { journeyControls } from '../../lib/motion/journey-controls';
import { thresholdHdrSupported } from '../../lib/motion/journey-media';
import { currentJourneyTier, detectJourneyGpu } from '../../lib/motion/journey-tier';
import { resolveThresholdStudyOptIn } from '../../lib/motion/journey-threshold';
import MotionErrorBoundary from './MotionErrorBoundary';

const FilmVeil = lazy(() => import('./FilmVeil'));

/**
 * The compositor chunk is downloaded on the `full` tier only. Every other
 * device keeps the DOM plate crossfade the director publishes as `handoff`,
 * so a `balanced` visitor never pays for a shader it will not run.
 */
export default function FilmVeilLoader({ enableThresholdStudy = resolveThresholdStudyOptIn() }: {
  readonly enableThresholdStudy?: boolean;
}) {
  const controls = useSyncExternalStore(
    journeyControls.subscribe,
    journeyControls.getSnapshot,
    journeyControls.getServerSnapshot,
  );
  const [thresholdHdrCapable, setThresholdHdrCapable] = useState(false);
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
        setThresholdHdrCapable(false);
        return;
      }
      const gpu = detectJourneyGpu();
      setThresholdHdrCapable(thresholdHdrSupported({
        webgl2: gpu.webgl2,
        colorBufferFloat: gpu.floatBuffers,
      }));
      setAdmitted(true);
      deferImport();
    };
    reduced.addEventListener('change', updateTier);
    updateTier();
    return () => {
      reduced.removeEventListener('change', updateTier);
      clearDeferredImport();
    };
  }, [controls.motionPreference]);

  const renderCanvas = ready && admitted;

  return (
    <div className="film-veil" data-film-veil={renderCanvas ? 'on' : 'still'} aria-hidden="true">
      {renderCanvas ? (
        <MotionErrorBoundary>
          <Suspense fallback={null}>
            <FilmVeil
              motionEnabled={admitted}
              thresholdHdrEnabled={thresholdHdrCapable}
              enableThresholdStudy={resolveThresholdStudyOptIn(enableThresholdStudy)}
            />
          </Suspense>
        </MotionErrorBoundary>
      ) : null}
    </div>
  );
}
