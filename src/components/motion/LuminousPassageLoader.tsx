import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { choosePassageQuality, type PassageQuality } from '../../lib/motion/passage';
import { BrandMark } from './SiteChrome';

const LuminousPassageScene = lazy(() => import('./LuminousPassageScene'));

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

export default function LuminousPassageLoader() {
  const [quality, setQuality] = useState<PassageQuality>('still');
  const [mountScene, setMountScene] = useState(false);
  const [ready, setReady] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const nextQuality = detectQuality();
    setQuality(nextQuality);
    const boot = window.setTimeout(() => setBooting(false), nextQuality === 'still' ? 380 : 560);
    if (nextQuality === 'still') {
      setReady(true);
      return () => window.clearTimeout(boot);
    }

    let idleHandle: number | undefined;
    const delay = window.setTimeout(() => {
      const start = () => setMountScene(true);
      if (window.requestIdleCallback) {
        idleHandle = window.requestIdleCallback(start, { timeout: 400 });
      } else {
        start();
      }
    }, 900);

    return () => {
      window.clearTimeout(delay);
      window.clearTimeout(boot);
      if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
    };
  }, []);

  const handleReady = useCallback(() => {
    setReady(true);
    document.querySelector('.journey')?.setAttribute('data-passage-live', 'true');
  }, []);

  return (
    <>
      <div
        className="passage-host"
        data-passage-quality={quality}
        data-passage-ready={ready && quality !== 'still' ? 'true' : 'false'}
        data-passage-live={ready && quality !== 'still' ? 'true' : 'false'}
        data-passage-chapter="oculus"
        data-passage-progress="0"
        aria-hidden="true"
      >
        {mountScene && quality !== 'still' ? (
          <Suspense fallback={null}>
            <LuminousPassageScene quality={quality} onReady={handleReady} />
          </Suspense>
        ) : null}
      </div>
      <AnimatePresence>
        {booting && (
          <motion.div
            className="passage-boot"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.7, ease: [0.22, 0.7, 0.2, 1] }}
            aria-hidden="true"
          >
            <BrandMark className="passage-boot-mark" />
            <p>The floor comes up to the light.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
