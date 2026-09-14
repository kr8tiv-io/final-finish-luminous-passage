import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { journeyControls, FEATURED_FINISH_IDS } from '../../lib/motion/journey-controls';
import { finishPresets as finishes, finishCssBackground } from '../../lib/visualizer/finishes';

export default function JourneyControls() {
  const state = useSyncExternalStore(journeyControls.subscribe, journeyControls.getSnapshot, journeyControls.getServerSnapshot);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { journeyControls.hydrate(); setHydrated(true); }, []);
  const selected = finishes.find((finish) => finish.id === state.selectedFinish);
  return <div className="journey-controls">
    <fieldset>
      <legend>Explore the surface</legend>
      <div className="journey-swatches">
        {FEATURED_FINISH_IDS.map((id) => {
          const finish = finishes.find((item) => item.id === id)!;
          return <button key={id} disabled={!hydrated} type="button" aria-label={finish.name} aria-pressed={state.selectedFinish === id} onClick={() => journeyControls.setSelectedFinish(id)}>
            <span style={{ '--swatch': finishCssBackground(finish) } as CSSProperties} aria-hidden="true" />
          </button>;
        })}
      </div>
    </fieldset>
    <p className="finish-label" aria-live="polite">{selected?.name}</p>
    <small>Inspiration finishes. Confirm physical samples with Denis.</small>
    <button className="motion-choice" disabled={!hydrated} type="button" aria-pressed={state.motionPreference === 'still'} onClick={() => journeyControls.setMotionPreference(state.motionPreference === 'still' ? 'auto' : 'still')}>
      {state.motionPreference === 'still' ? 'Motion paused · resume' : 'Pause visual motion'}
    </button>
  </div>;
}
