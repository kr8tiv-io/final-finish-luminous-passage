import { useEffect, useState, useSyncExternalStore } from 'react';
import { journeyControls } from '../../lib/motion/journey-controls';

export default function MotionPreferenceControl() {
  const state = useSyncExternalStore(journeyControls.subscribe, journeyControls.getSnapshot, journeyControls.getServerSnapshot);
  const [ready, setReady] = useState(false);
  const [systemReduced, setSystemReduced] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setSystemReduced(preference.matches);
    sync(); preference.addEventListener('change', sync);
    journeyControls.hydrate(); setReady(true);
    return () => preference.removeEventListener('change', sync);
  }, []);
  const label = systemReduced ? 'Reduced motion is on' : state.motionPreference === 'still' ? 'Motion paused · resume' : 'Pause visual motion';
  return <button className="journey-motion-control" type="button" disabled={!ready || systemReduced}
    title={label}
    aria-pressed={systemReduced || state.motionPreference === 'still'}
    onClick={() => journeyControls.setMotionPreference(state.motionPreference === 'still' ? 'auto' : 'still')}>
    <span aria-hidden="true">{systemReduced ? '✓' : state.motionPreference === 'still' ? '▶' : 'Ⅱ'}</span>
    <span className="motion-control-label">{label}</span>
  </button>;
}
