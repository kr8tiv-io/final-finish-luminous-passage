import { lazy, Suspense, useEffect, useState } from 'react';
import { choosePassageQuality, type PassageQuality } from '../../lib/motion/passage';

const FilmVeil = lazy(() => import('./FilmVeil'));

function detectWebGL2(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function detectQuality(): PassageQuality {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  return choosePassageQuality({
    webgl2: detectWebGL2(),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: Boolean(connection?.saveData),
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    deviceMemory,
  });
}

export default function FilmVeilLoader() {
  const [quality, setQuality] = useState<PassageQuality>('still');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setQuality(detectQuality());
    if (window.requestIdleCallback) {
      const handle = window.requestIdleCallback(() => setReady(true), { timeout: 1_500 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(() => setReady(true), 180);
    return () => window.clearTimeout(handle);
  }, []);

  const enhanced = ready && quality !== 'still';

  return (
    <div className="film-veil" data-film-veil={enhanced ? 'on' : 'still'} aria-hidden="true">
      {enhanced ? (
        <Suspense fallback={null}>
          <FilmVeil />
        </Suspense>
      ) : null}
    </div>
  );
}
