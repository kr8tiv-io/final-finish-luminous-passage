import { lazy, Suspense } from 'react';
import MotionErrorBoundary from './MotionErrorBoundary';

const JourneyMotion = lazy(() => import('./JourneyMotion'));

export default function JourneyMotionLoader() {
  return (
    <MotionErrorBoundary>
      <Suspense fallback={null}>
        <JourneyMotion />
      </Suspense>
    </MotionErrorBoundary>
  );
}
