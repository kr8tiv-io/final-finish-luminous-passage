import { Suspense, lazy, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { journeyControls } from '../../lib/motion/journey-controls';
import { journeyDirector } from '../../lib/motion/journey-director';
import type { SurfaceStateId } from '../../lib/motion/surface-materials';
import {
  detectSurfaceCapabilities,
  HORIZON_AVOID_ATTRIBUTE,
  HORIZON_CANDIDATE_SELECTOR,
  HORIZON_CLEAR_FADE,
  horizonHitBlocks,
  horizonProbePoints,
  horizonRowCrossing,
  surfaceAdmitted,
  surfaceStore,
  type SurfaceCameraMode,
  type SurfaceTarget,
  type SurfaceWarmup,
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
       * How many times the horizon line's occlusion hit test has run. The gate asserts
       * this does not move while frames are being drawn — a per-frame `elementsFromPoint`
       * is the one implementation of this feature that would not be worth having.
       */
      readonly horizonChecks: number;
      /**
       * What the renderer's staged bring-up cost and when it ran, so "the first
       * frame no longer carries the program build" is a number rather than a claim.
       * `null` until `SurfaceFloor` has finished warming.
       */
      readonly warmup: SurfaceWarmup | null;
      /**
       * Ask for one more frame. The gates need this because a view can now be
       * suppressed from outside (hiding `.film-veil` drops its rectangle to zero,
       * so the registry skips it) and a demand-rendered canvas would otherwise
       * keep showing the frame it drew before the change.
       */
      readonly invalidate: () => void;
      /**
       * Context-loss bookkeeping (Step 33). `lost` is the live state; `restores` counts
       * completed `webglcontextrestored` round trips this session. A gate needs both:
       * "the canvas came back" is otherwise indistinguishable from "it never went".
       */
      readonly lost: boolean;
      readonly restores: number;
      /** The renderer island threw and this canvas is standing down for the CSS band. */
      readonly failed: boolean;
    };
  }
}

/** Pages without a `.journey` get the material at rest: the horizon line, nothing else. */
const RESTING_TARGET: SurfaceTarget = Object.freeze({ a: 2, b: 2, mix: 0, horizon: true });

/**
 * THE HORIZON LINE'S OCCLUSION GATE — why it is asked here and not in `SurfaceFloor`.
 *
 * The 1 px cobalt line exists twice: as a uniform on the WebGL plane, and as
 * `.surface-band::before` for every visitor the plane refuses. Those two are never on
 * screen together (`html[data-surface='webgl'] .surface-band { opacity: 0 }`), and the CSS
 * one is on screen exactly when `SurfaceFloor` is *not mounted* — a `balanced` tier, a
 * coarse pointer, a lost context. A test that lived in `SurfaceFloor` would therefore be
 * absent from every case the CSS line covers, and the line would go on striking through
 * text there.
 *
 * So the question is asked once, here, in the island that is mounted on every route and
 * every tier, and the single answer reaches both consumers through the store: the plane
 * as `driver.setHorizonClear` (SurfaceFloor is still the only writer of its uniforms) and
 * the CSS line as `[data-horizon-line]` on the band (the store is still the only writer of
 * the band's dataset). One decision, one owner per write. This island already reads layout
 * for the band element, which is what DEV-CONTRACT allows it and forbids the store.
 *
 * The rule itself is pure and lives in `surface-store.ts`; only the hit testing is here.
 */

/** Leading-edge throttle while the page is moving — never once per frame. */
const HORIZON_TEST_INTERVAL = 80;
/**
 * ...and once more when it stops, so the resting answer is the accurate one.
 *
 * One follow-up, not a chain, and not a heartbeat. A chain of three was tried against the
 * suspicion that copy keeps settling after the wheel does; measured over 159 scroll steps
 * at 390 by reading the row twice per step, ~450 ms and ~1200 ms after the scroll, the set
 * of words across the row differed at zero of them. Nothing arrives in that window on this
 * page, so nothing is spent looking for it.
 */
const HORIZON_SETTLE_DELAY = 140;

/**
 * WHEN THE RENDERER IS ALLOWED TO BE BUILT.
 *
 * `client:idle` gets this island hydrated at an idle moment, which is not the same
 * promise as "the three.js chunk, the WebGL context and the first program build land
 * outside the arrival window". Measured on the built app, they did not: the lazy
 * chunk resolved into react-three-fiber's first render at 1038 ms and produced a
 * 599 ms arrival long task against a 200 ms budget.
 *
 * So the renderer waits for two signals rather than one: the document's `load` event
 * (the boundary the arrival budget is defined against, DELIVERY-BUDGETS.md) and then
 * an idle callback with a timeout, so a page that never goes idle still gets its floor.
 * `SurfaceFloor` then splits its own bring-up further — see the warm-up there.
 *
 * Nothing the visitor can reach needs the plane sooner. The pour's veil is the
 * `film-veil` view and is not needed until the first boundary; the floor plane is born
 * in the last fifth of Act 1 (`surfaceChapterPresence`), which is a screen and a half
 * of scrolling away.
 */
const SURFACE_MOUNT_IDLE_TIMEOUT = 1200;

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
  /**
   * The renderer island itself threw (not the context — the React subtree). The canvas
   * is gone for this session's remaining attempts, so the plane has to stand down the
   * same way a lost context makes it stand down, or `html[data-surface]` would still
   * say `webgl` while nothing is drawing and `surface.css` would keep the CSS band
   * hidden behind a canvas that is not there. That is the one genuinely blank state
   * this component can produce, and this is what forbids it.
   */
  const [rendererFailed, setRendererFailed] = useState(false);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const instanceId = useRef<string>('');
  const horizonChecks = useRef(0);
  /** Completed `webglcontextrestored` round trips. Read by the staging probe only. */
  const restoreCount = useRef(0);
  /**
   * The probe object is built once (its effect is keyed on `probe` alone, so that it is
   * installed and removed exactly once per island rather than rebuilt on every state
   * change). Its getters therefore read refs, not the closed-over state values, which
   * would otherwise be frozen at whatever they were the moment it was installed.
   */
  const lostRef = useRef(false);
  const failedRef = useRef(false);
  lostRef.current = contextLost;
  failedRef.current = rendererFailed;
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
  const live = mounted && !contextLost && !rendererFailed;

  useEffect(() => {
    surfaceStore.setRenderer(live ? 'webgl' : 'fallback');
  }, [live]);

  /* ---- the renderer's own gate: after `load`, then at idle. See the note above. ---- */
  const [rendererAdmitted, setRendererAdmitted] = useState(false);
  useEffect(() => {
    if (!mounted || rendererAdmitted) return undefined;
    let idleHandle = 0;
    let timer = 0;
    let cancelled = false;
    const admit = () => {
      if (!cancelled) setRendererAdmitted(true);
    };
    const afterLoad = () => {
      if (cancelled) return;
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(admit, { timeout: SURFACE_MOUNT_IDLE_TIMEOUT });
        return;
      }
      timer = window.setTimeout(admit, 0);
    };
    // A route swap never fires `load` again, and this island is `transition:persist`ed,
    // so the readyState branch is the one every navigation after the first takes.
    if (document.readyState === 'complete') afterLoad();
    else window.addEventListener('load', afterLoad, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', afterLoad);
      if (idleHandle !== 0 && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle);
      if (timer !== 0) window.clearTimeout(timer);
    };
  }, [mounted, rendererAdmitted]);

  /**
   * Adopting a canvas — the second half of the teardown rule above.
   *
   * A fresh `<Canvas>` brings a fresh context, so whatever was true of the last one is
   * not true of this one. Resetting here rather than only in the `webglcontextlost`
   * guard covers the ordering the guard cannot: React runs passive-effect cleanups for
   * a deleted subtree *after* it has removed the nodes, so the old canvas's farewell
   * can land after the new one has already been handed over.
   */
  const adoptCanvas = useCallback((canvas: HTMLCanvasElement) => {
    setCanvasElement(canvas);
    setContextLost(false);
  }, []);

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
  /**
   * WHAT A RESTORE HAS TO PUT BACK, AND WHO PUTS IT (Step 33).
   *
   * A lost context invalidates every GPU object at once: programs, buffers, and every
   * texture — `FilmVeil`'s poster and video plates, `DepthPlate`'s colour and depth
   * maps, this floor's PMREM environment map. Three different owners, and only one of
   * them is this file, so the recovery is three cooperating pieces rather than one:
   *
   *  - three.js re-runs `initGLContext()` on `webglcontextrestored` (its own listener on
   *    this same canvas, registered before ours, so it has already run by the time we
   *    are called). That drops `WebGLProperties`, which is what makes every texture
   *    with CPU-side image data — the plates, the depth maps, the 1x1 fallbacks —
   *    re-upload lazily on their next draw. Nothing has to ask them to.
   *  - the PMREM environment map is the exception: it is a render target, its pixels
   *    only ever existed on the GPU, and no re-upload can bring them back. That is what
   *    `restoreKey` is for — it re-mounts `SurfaceFloorScene`, whose warm-up bakes a new
   *    one, re-links the two programs and re-registers the `surface-floor` view.
   *  - the material state that scene comes back holding is replayed by
   *    `surfaceStore.bindDriver`, which pushes `a`/`b`/`mix`/presence/horizon/camera
   *    into the fresh driver at bind time. That is why the horizon line and the plane's
   *    presence return at the value the scroll position implies rather than at the
   *    scene's construction defaults.
   *
   * What this effect adds on top is the one thing none of the three can do for itself:
   * ask for a frame once the views are back. The canvas is `frameloop="demand"`, so a
   * restored context with nothing calling `invalidate()` is a correct, empty canvas.
   */
  useEffect(() => {
    if (!canvasElement) return undefined;
    canvasElement.dataset.surfaceInstance = instanceId.current;
    const onLost = (event: Event) => {
      // Without this the browser never fires `webglcontextrestored` at all.
      event.preventDefault();
      /*
       * A TEARDOWN IS NOT AN OUTAGE.
       *
       * react-three-fiber's unmount disposes the renderer, and three's `dispose()`
       * calls `forceContextLoss()` — which fires this exact event on a canvas that is
       * on its way out of the document. Measured: after `MotionErrorBoundary` replaced
       * a failed renderer island and the retry mounted a fresh `<Canvas>`, the probe
       * read `{ failed: false, canvases: 1, lost: true, renderer: 'fallback' }` — a
       * live canvas that the store still believed was dark, because a dead canvas's
       * farewell had latched this flag on and nothing could turn it off again.
       *
       * The canvas that matters is the one in the document. A disconnected one is
       * being taken apart on purpose and has nothing to restore.
       */
      if (!canvasElement.isConnected) return;
      setContextLost(true);
    };
    const onRestored = () => {
      setContextLost(false);
      restoreCount.current += 1;
      setRestoreKey((key) => key + 1);
    };
    canvasElement.addEventListener('webglcontextlost', onLost);
    canvasElement.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvasElement.removeEventListener('webglcontextlost', onLost);
      canvasElement.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [canvasElement]);

  /**
   * One frame after a restore, and one horizon test with it.
   *
   * The warm-up ends with its own `invalidate()`, but it is three idle callbacks away
   * and the views it gates are registered at the end of it, so the frame it asks for is
   * the first one that can contain the plane. This asks for another once the store has
   * the new driver, which covers the views this file does not own: `film-veil` and
   * `depth-plate` never unregistered, never held the context, and would otherwise sit
   * in the registry until the next scroll published something.
   *
   * The occlusion gate below re-runs for the same reason, through `restoreKey` in its
   * own dependency list rather than an event dispatched from here: a synthetic `resize`
   * would reach `journeyDirector.invalidateGeometry` and every ScrollTrigger on the
   * page, which are other owners' state and have no business moving because a GPU
   * context came back.
   */
  useEffect(() => {
    if (restoreKey === 0 || !live) return undefined;
    const frame = window.requestAnimationFrame(() => surfaceStore.invalidate());
    return () => window.cancelAnimationFrame(frame);
  }, [live, restoreKey]);

  /* ---- the occlusion gate: one hit test, one answer, both lines ---- */
  useEffect(() => {
    if (!band) return undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let leading = 0;
    let settle = 0;
    let lastRun = 0;
    /** Everything in the snapshot except the answer this effect itself publishes. */
    let seen = '';

    /** Cheap half of the rule: tags and own text nodes, no layout read. */
    const carriesWords = (element: Element) => {
      let own = '';
      for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) own += node.nodeValue ?? '';
      }
      return horizonHitBlocks({
        tag: element.tagName,
        text: own.trim().length > 0,
        avoid: element.hasAttribute(HORIZON_AVOID_ATTRIBUTE),
      });
    };

    /**
     * Is this candidate really on screen at the row?
     *
     * `pointer-events` and `visibility` both inherit, so one `getComputedStyle` answers
     * for the whole ancestor chain. An element the hit test cannot see — the whole subtree
     * is `pointer-events: none`, as the canvas host and the band themselves are — falls
     * back to what geometry already established, which errs toward hiding the line. That
     * is the safe direction: a line that is missing from a clear row is a smaller failure
     * than a line drawn through a sentence.
     */
    const onScreenAt = (element: Element, box: DOMRect, y: number) => {
      const style = getComputedStyle(element);
      if (style.visibility !== 'visible') return false;
      if (style.pointerEvents === 'none') return true;
      return horizonProbePoints(box, window.innerWidth).some((x) => {
        for (const node of document.elementsFromPoint(x, y)) {
          if (node === element || element.contains(node)) return true;
        }
        return false;
      });
    };

    const test = () => {
      horizonChecks.current += 1;
      const rect = band.getBoundingClientRect();
      const y = Math.round(rect.top);
      // Off screen entirely (a short `svh` viewport, a zero-height band mid-swap): there
      // is nothing to cross, and `elementsFromPoint` outside the viewport returns [].
      if (rect.width <= 0 || y < 0 || y >= window.innerHeight) {
        surfaceStore.setHorizonClear(true, 0);
        return;
      }
      let clear = true;
      for (const element of document.querySelectorAll(HORIZON_CANDIDATE_SELECTOR)) {
        if (!carriesWords(element)) continue;
        const box = element.getBoundingClientRect();
        if (!horizonRowCrossing(box, y, window.innerWidth)) continue;
        if (!onScreenAt(element, box, y)) continue;
        clear = false;
        break;
      }
      surfaceStore.setHorizonClear(clear, reducedMotion.matches ? 0 : HORIZON_CLEAR_FADE);
    };

    const run = () => {
      lastRun = performance.now();
      test();
    };

    const schedule = () => {
      if (leading === 0) {
        const wait = Math.max(0, HORIZON_TEST_INTERVAL - (performance.now() - lastRun));
        leading = window.setTimeout(() => {
          leading = 0;
          run();
        }, wait);
      }
      window.clearTimeout(settle);
      settle = window.setTimeout(run, HORIZON_SETTLE_DELAY);
    };

    // A store publish of the answer itself must not schedule another test, or the two
    // would chase each other forever; everything else in the snapshot may.
    const onStore = () => {
      const state = surfaceStore.getSnapshot();
      const key = `${state.a}|${state.b}|${state.mix}|${state.horizon}|${state.presence}`
        + `|${state.camera}|${state.renderer}|${state.menuOpen}`;
      if (key === seen) return;
      seen = key;
      schedule();
    };

    const unsubscribe = surfaceStore.subscribe(onStore);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('astro:page-load', schedule);
    run();

    return () => {
      unsubscribe();
      window.clearTimeout(leading);
      window.clearTimeout(settle);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('astro:page-load', schedule);
    };
    // `restoreKey` rebuilds this effect, and the rebuild's own `run()` is the re-test a
    // restored context needs. See the restore note above for why it is here and not a
    // dispatched event.
  }, [band, restoreKey]);

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
      get horizonChecks() { return horizonChecks.current; },
      get warmup() { return surfaceStore.getWarmup(); },
      invalidate: () => surfaceStore.invalidate(),
      get lost() { return lostRef.current; },
      get restores() { return restoreCount.current; },
      get failed() { return failedRef.current; },
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
      data-surface-restores={restoreKey > 0 ? String(restoreKey) : undefined}
      data-surface-failed={rendererFailed ? '' : undefined}
    >
      <MotionErrorBoundary
        island="surface"
        onFail={() => setRendererFailed(true)}
        onRetry={() => setRendererFailed(false)}
      >
        <Suspense fallback={null}>
          {rendererAdmitted && !rendererFailed && (
            <SurfaceStage viewElement={band} restoreKey={restoreKey} onCanvas={adoptCanvas} />
          )}
        </Suspense>
      </MotionErrorBoundary>
    </div>
  );
}
