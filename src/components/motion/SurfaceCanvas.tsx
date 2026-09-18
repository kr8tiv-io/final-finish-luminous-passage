import { Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { journeyControls } from '../../lib/motion/journey-controls';
import { journeyDirector } from '../../lib/motion/journey-director';
import type { SurfaceStateId } from '../../lib/motion/surface-materials';
import {
  detectSurfaceCapabilities,
  surfaceAdmitted,
  surfaceStore,
  type SurfaceCameraMode,
  type SurfaceTarget,
} from '../../lib/motion/surface-store';
import MotionErrorBoundary from './MotionErrorBoundary';

/**
 * The admission gate for the one layout-level WebGL plane.
 *
 * This module must stay free of three.js and react-three-fiber imports. It is mounted
 * from `BaseLayout.astro` on EVERY route, so anything it imports statically is shipped
 * to every visitor — including the phones and reduced-motion visitors this gate exists
 * to refuse. The renderer lives behind `lazy()` in `SurfaceFloor.tsx`, so the 224 KB gz
 * three/R3F chunk is fetched only once a client has actually been admitted.
 *
 * Step 12: this island carries `transition:persist`, so it is mounted once per
 * *session* rather than once per page. Everything below that reads the document — the
 * band it hands the renderer, and whether this route has a `.journey` for the director
 * to drive — is therefore keyed on `astro:page-load` instead of on mount. Nothing
 * about rendering changed; what changed is that the two DOM questions are asked again
 * every time the document under the canvas is replaced.
 */
const SurfaceStage = lazy(() => import('./SurfaceFloor'));

/**
 * Stamped once on the `<canvas>` so continuity across a swap is falsifiable: a
 * navigation that silently tore the context down and built a new one reads as a
 * changed stamp instead of passing as "there is still exactly one canvas".
 */
let surfaceInstances = 0;

declare global {
  interface Window {
    __ffeSurface?: {
      readonly frames: number;
      readonly states: Record<string, unknown>;
      readonly morphTo: (state: SurfaceStateId, options?: { duration?: number; ease?: string }) => void;
      readonly applyTarget: (target: SurfaceTarget) => void;
      readonly settle: (duration?: number) => void;
      readonly sweep: (duration?: number) => void;
      readonly setCamera: (mode: SurfaceCameraMode) => void;
      readonly setHorizon: (horizon: boolean) => void;
      readonly resetFrames: () => void;
      readonly views: () => readonly string[];
      /**
       * Ask for one more frame. The gates need this because a view can now be
       * suppressed from outside (hiding `.film-veil` drops its rectangle to zero,
       * so the registry skips it) and a demand-rendered canvas would otherwise
       * keep showing the frame it drew before the change.
       */
      readonly invalidate: () => void;
    };
  }
}

/** Pages without a `.journey` get the material at rest: the horizon line, nothing else. */
const RESTING_TARGET: SurfaceTarget = Object.freeze({ a: 2, b: 2, mix: 0, horizon: true });

export default function SurfaceCanvas({ probe = false }: { readonly probe?: boolean }) {
  const controls = useSyncExternalStore(
    journeyControls.subscribe,
    journeyControls.getSnapshot,
    journeyControls.getServerSnapshot,
  );
  const [band, setBand] = useState<HTMLElement | null>(null);
  const [admitted, setAdmitted] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [restoreKey, setRestoreKey] = useState(0);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const instanceId = useRef<string>('');
  if (instanceId.current === '') {
    surfaceInstances += 1;
    instanceId.current = `surface-${surfaceInstances}`;
  }
  /**
   * How many documents this island has outlived. Bumping it on `astro:page-load` is
   * what re-asks the two questions below for the page that has just arrived; the
   * persisted island itself never re-mounts, so a mount-time answer would be the
   * first route's answer forever.
   */
  const [routeRevision, setRouteRevision] = useState(0);
  const [coupled, setCoupled] = useState(
    () => typeof document !== 'undefined' && document.querySelector('.journey') !== null,
  );

  useEffect(() => {
    const onPageLoad = () => setRouteRevision((revision) => revision + 1);
    document.addEventListener('astro:page-load', onPageLoad);
    return () => document.removeEventListener('astro:page-load', onPageLoad);
  }, []);

  useEffect(() => {
    journeyControls.hydrate();
    setBand(document.querySelector<HTMLElement>('[data-surface-fallback]'));
    setCoupled(document.querySelector('.journey') !== null);
  }, [routeRevision]);

  /* ---- admission: tier attribute first, capability probe while it is absent ---- */
  useEffect(() => {
    const evaluate = () => {
      setAdmitted(surfaceAdmitted(detectSurfaceCapabilities(journeyControls.getSnapshot().motionPreference)));
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const tierObserver = new MutationObserver(evaluate);
    tierObserver.observe(document.documentElement, { attributeFilter: ['data-journey-tier'] });
    reduced.addEventListener('change', evaluate);
    evaluate();
    return () => {
      tierObserver.disconnect();
      reduced.removeEventListener('change', evaluate);
    };
  }, [controls.motionPreference]);

  // `mounted` keeps the <canvas> element in the DOM through a context loss so the
  // browser still has something to fire `webglcontextrestored` at; `live` is only
  // about whether that canvas is currently the thing the visitor sees.
  const mounted = admitted && band !== null;
  const live = mounted && !contextLost;

  useEffect(() => {
    surfaceStore.setRenderer(live ? 'webgl' : 'fallback');
  }, [live]);

  /* ---- director coupling (read-only); the mapping itself is in surface-store.ts ---- */
  useEffect(() => {
    if (!coupled) {
      surfaceStore.applyTarget(RESTING_TARGET);
      return undefined;
    }
    const apply = () => surfaceStore.applyJourneySnapshot(journeyDirector.getSnapshot());
    const unsubscribe = journeyDirector.subscribe(apply);
    apply();
    return unsubscribe;
  }, [coupled]);

  /* ---- context loss: hide the canvas, show the band, re-mount the views on restore ---- */
  useEffect(() => {
    if (!canvasElement) return undefined;
    canvasElement.dataset.surfaceInstance = instanceId.current;
    const onLost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
    };
    const onRestored = () => {
      setContextLost(false);
      setRestoreKey((key) => key + 1);
    };
    canvasElement.addEventListener('webglcontextlost', onLost);
    canvasElement.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvasElement.removeEventListener('webglcontextlost', onLost);
      canvasElement.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [canvasElement]);

  useEffect(() => {
    if (!probe || typeof window === 'undefined') return undefined;
    window.__ffeSurface = {
      get frames() { return surfaceStore.getFrames(); },
      get states() { return { ...surfaceStore.getSnapshot(), views: surfaceStore.listViews().length }; },
      morphTo: (state, options) => surfaceStore.morphTo(state, options ?? {}),
      applyTarget: (target) => surfaceStore.applyTarget(target),
      settle: (duration) => surfaceStore.settle(duration),
      sweep: (duration) => surfaceStore.sweep(duration),
      setCamera: (mode) => surfaceStore.setCamera(mode),
      setHorizon: (horizon) => surfaceStore.setHorizon(horizon),
      resetFrames: () => surfaceStore.resetFrames(),
      views: () => surfaceStore.listViews().map((view) => view.id),
      invalidate: () => surfaceStore.invalidate(),
    };
    return () => {
      delete window.__ffeSurface;
    };
  }, [probe]);

  if (!mounted) return null;

  return (
    <div
      className="surface-canvas-host"
      aria-hidden="true"
      data-surface-host=""
      data-surface-instance={instanceId.current}
      data-surface-route={routeRevision}
      data-surface-lost={contextLost ? '' : undefined}
    >
      <MotionErrorBoundary>
        <Suspense fallback={null}>
          <SurfaceStage viewElement={band} restoreKey={restoreKey} onCanvas={setCanvasElement} />
        </Suspense>
      </MotionErrorBoundary>
    </div>
  );
}
