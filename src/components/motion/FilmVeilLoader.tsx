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

function detectMotionCapability(
  webgl2: boolean,
  reducedMotion: boolean,
  motionPreference: 'auto' | 'still',
): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  return shouldUseFilmVeil({
    webgl2,
    reducedMotion,
    saveData: Boolean(connection?.saveData),
    deviceMemory,
    motionPreference,
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
    const updateMotion = () => {
      const motionPreference = journeyControls.getSnapshot().motionPreference;
      const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
      const admitted = shouldUseFilmVeil({
        webgl2: true,
        reducedMotion: reduced.matches,
        saveData,
        deviceMemory: null,
        motionPreference,
      });
      if (!admitted) {
        clearDeferredImport();
        setReady(false);
        setWebglCapable(false);
        setThresholdHdrCapable(false);
        setMotionCapable(false);
        return;
      }
      const capabilities = detectWebGLCapabilities();
      setWebglCapable(capabilities.webgl2);
      setThresholdHdrCapable(capabilities.thresholdHdr);
      const capable = detectMotionCapability(capabilities.webgl2, reduced.matches, motionPreference);
      setMotionCapable(capable);
      if (capable) deferImport();
    };
    reduced.addEventListener('change', updateMotion);
    updateMotion();
    return () => {
      reduced.removeEventListener('change', updateMotion);
      clearDeferredImport();
    };
  }, [controls.motionPreference]);

  const renderCanvas = ready && webglCapable && motionCapable && controls.motionPreference === 'auto';
  const enhanced = renderCanvas;

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
