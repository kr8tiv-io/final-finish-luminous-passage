import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { journeyControls } from '../../lib/motion/journey-controls';
import { shouldUseFilmVeil, thresholdHdrSupported } from '../../lib/motion/journey-media';
import { resolveThresholdStudyOptIn } from '../../lib/motion/journey-threshold';
import MotionErrorBoundary from './MotionErrorBoundary';

const FilmVeil = lazy(() => import('./FilmVeil'));

function detectWebGLCapabilities(): { webgl2: boolean; thresholdHdr: boolean } {
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    if (!context) return { webgl2: false, thresholdHdr: false };
    const thresholdHdr = thresholdHdrSupported({
      webgl2: true,
      colorBufferFloat: Boolean(context.getExtension('EXT_color_buffer_float')),
    });
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl2: true, thresholdHdr };
  } catch {
    return { webgl2: false, thresholdHdr: false };
  }
}

function detectMotionCapability(webgl2: boolean, reducedMotion: boolean): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  return shouldUseFilmVeil({
    webgl2,
    reducedMotion,
    saveData: Boolean(connection?.saveData),
    deviceMemory,
  });
}

export default function FilmVeilLoader({ enableThresholdStudy = resolveThresholdStudyOptIn() }: {
  readonly enableThresholdStudy?: boolean;
}) {
  const controls = useSyncExternalStore(
    journeyControls.subscribe,
    journeyControls.getSnapshot,
    journeyControls.getServerSnapshot,
  );
  const [webglCapable, setWebglCapable] = useState(false);
  const [thresholdHdrCapable, setThresholdHdrCapable] = useState(false);
  const [motionCapable, setMotionCapable] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const capabilities = detectWebGLCapabilities();
    const updateMotion = () => {
      setWebglCapable(capabilities.webgl2);
      setThresholdHdrCapable(capabilities.thresholdHdr);
      setMotionCapable(detectMotionCapability(capabilities.webgl2, reduced.matches));
    };
    reduced.addEventListener('change', updateMotion);
    updateMotion();
    if (window.requestIdleCallback) {
      const handle = window.requestIdleCallback(() => setReady(true), { timeout: 1_500 });
      return () => {
        reduced.removeEventListener('change', updateMotion);
        window.cancelIdleCallback(handle);
      };
    }
    const handle = window.setTimeout(() => setReady(true), 180);
    return () => {
      reduced.removeEventListener('change', updateMotion);
      window.clearTimeout(handle);
    };
  }, []);

  const renderCanvas = ready && webglCapable;
  const enhanced = renderCanvas && motionCapable && controls.motionPreference === 'auto';

  return (
    <div className="film-veil" data-film-veil={enhanced ? 'on' : 'still'} aria-hidden="true">
      {renderCanvas ? (
        <MotionErrorBoundary>
          <Suspense fallback={null}>
            <FilmVeil
              motionEnabled={motionCapable}
              thresholdHdrEnabled={thresholdHdrCapable}
              enableThresholdStudy={resolveThresholdStudyOptIn(enableThresholdStudy)}
            />
          </Suspense>
        </MotionErrorBoundary>
      ) : null}
    </div>
  );
}
