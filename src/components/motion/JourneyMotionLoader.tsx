import { lazy, Suspense, useEffect, useState } from 'react';

const JourneyMotion = lazy(() => import('./JourneyMotion'));

export default function JourneyMotionLoader() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.requestIdleCallback) {
      const handle = window.requestIdleCallback(() => setReady(true), { timeout: 1_500 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(() => setReady(true), 180);
    return () => window.clearTimeout(handle);
  }, []);
  return ready ? <Suspense fallback={null}><JourneyMotion /></Suspense> : null;
}
