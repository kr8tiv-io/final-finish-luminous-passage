/**
 * The surface store — one owner for the floor's material state and the view registry.
 *
 * Ownership (CLAUDE.md: exactly one owner per piece of state):
 *  - `journeyDirector` owns every scroll coordinate. This store never reads scroll.
 *  - This store owns the *material* state (`a`, `b`, `mix`, horizon mode, camera mode)
 *    and the registry of canvas regions.
 *  - `SurfaceFloor` owns the GPU uniforms; it binds a driver here and is the only
 *    writer of `uMix`/`uSweep`/`uPlaneOpacity`. The store asks, the driver tweens.
 *  - `SurfaceCanvas` owns the renderer mode (`webgl` / `fallback` / `none`) and the
 *    `[data-surface-fallback]` band's state attribute is written from here, once.
 *
 * Everything in this module is DOM-free at import time so it is safe for SSR and
 * directly unit-testable; the only browser access happens inside functions the
 * client calls.
 *
 * ---------------------------------------------------------------------------
 * VIEW REGISTRY — and how `FilmVeil`'s `MixMesh` migrates onto it
 * ---------------------------------------------------------------------------
 * A "view" is a DOM element that claims a rectangle of the one layout-level canvas.
 * `registerView(id, element, { render })` records it; every rendered frame the canvas
 * walks the registry, skips views whose element does not intersect the viewport, sets
 * `gl.setViewport` + `gl.setScissor` to that element's rect (CSS pixels — Three.js
 * multiplies by the pixel ratio itself) and calls the view's own `render`. This is
 * drei's `<View>` contract, reimplemented here so the scissor rule, the visibility
 * rule and the demand-render rule all live in one testable place.
 *
 * `FilmVeil.tsx` today owns a *second* `<canvas>` with its own WebGL context. It is
 * not touched by this step (file ownership: Motion engineer A). The migration, when
 * Motion A takes it, is mechanical and needs no change to this file:
 *
 *   1. `MixMesh` keeps its `ShaderMaterial` and its `onAfterRender` paint-confirmation
 *      exactly as-is; only the `<Canvas>` wrapper in `FilmVeil`'s default export goes.
 *   2. `FilmVeil` renders `MixMesh` into a `scene` of its own (or a dedicated layer of
 *      the shared scene) and calls
 *        `surfaceStore.registerView('film-veil', document.querySelector('.film-veil'),
 *           { render: ({ gl }) => gl.render(veilScene, veilCamera), priority: 10 })`
 *      from the effect that currently sets `contextReady`.
 *   3. `.film-veil` already is `position: fixed; inset: 0`, so its rect is the whole
 *      viewport and the scissor is a no-op for it — the veil keeps full-bleed behaviour.
 *   4. `invalidate()` becomes `surfaceStore.invalidate()`; the veil's demand-render
 *      semantics are preserved because this canvas is also `frameloop="demand"`.
 *   5. `priority` orders the views within a frame; the veil (10) paints after the floor
 *      (0), which is the current z-order (`.film-veil` z-index 1 over the plates).
 *
 * At that point `/` drops from two WebGL contexts to one and the CLAUDE.md
 * "one <canvas> element per page" lock is satisfied without any change here.
 */

import {
  dominantSurfaceState,
  isSurfaceStateId,
  SURFACE_MATERIALS,
  SURFACE_MORPH_DURATION,
  SURFACE_MORPH_EASE,
  SURFACE_SETTLE_DURATION,
  type SurfaceStateId,
} from './surface-materials';
import { JOURNEY_CHAPTER_IDS, type JourneyChapterId, type JourneySnapshot } from './journey-director';
import type { MotionPreference } from './journey-controls';

export type SurfaceRenderer = 'webgl' | 'fallback' | 'none';
export type SurfaceCameraMode = 'standing' | 'kneeling';

export interface SurfaceRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface SurfaceScissorBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SurfaceViewRenderContext {
  readonly rect: SurfaceRect;
  readonly box: SurfaceScissorBox;
  readonly frame: number;
}

export interface SurfaceViewOptions {
  readonly render: (context: SurfaceViewRenderContext) => void;
  /** Lower paints first. The floor is 0; a migrated `FilmVeil` would be 10. */
  readonly priority?: number;
}

export interface SurfaceView extends SurfaceViewOptions {
  readonly id: string;
  readonly element: HTMLElement;
  readonly priority: number;
}

export interface SurfaceSnapshot {
  readonly revision: number;
  readonly a: SurfaceStateId;
  readonly b: SurfaceStateId;
  readonly mix: number;
  /** Storyboard S1/S2/Act 9: plane hidden, the 1 px cobalt line is the whole scene. */
  readonly horizon: boolean;
  readonly camera: SurfaceCameraMode;
  readonly renderer: SurfaceRenderer;
  readonly settled: boolean;
}

/**
 * What `SurfaceFloor` installs so the store can drive GPU uniforms without importing
 * Three.js or GSAP. Keeping the tween behind this seam is what makes the store testable.
 */
export interface SurfaceDriver {
  /** `gsap.quickTo(uMix)` — 0.6 s `power2.inOut`, same ease when the morph reverses. */
  readonly mixTo: (value: number, duration: number, ease: string) => void;
  /** Immediate blend position. Kills any running morph: the director outranks it. */
  readonly setMix: (value: number) => void;
  readonly setStates: (a: SurfaceStateId, b: SurfaceStateId) => void;
  readonly setHorizon: (horizon: boolean, duration: number) => void;
  readonly setCamera: (mode: SurfaceCameraMode) => void;
  readonly sweep: (duration: number) => void;
  readonly settle: (duration: number) => void;
  readonly invalidate: () => void;
}

export interface SurfaceTarget {
  readonly a: SurfaceStateId;
  readonly b: SurfaceStateId;
  readonly mix: number;
  readonly horizon: boolean;
}

export interface SurfaceCapabilities {
  readonly tier: string | null;
  readonly webgl2: boolean;
  readonly colorBufferFloat: boolean;
  readonly reducedMotion: boolean;
  readonly saveData: boolean;
  readonly coarsePointer: boolean;
  readonly motionPreference: MotionPreference;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/* -------------------------------------------------------------------------- */
/* Pure rules                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Admission.
 *
 * Mirrors `FilmVeilLoader.detectWebGLCapabilities` + `shouldUseFilmVeil` +
 * `thresholdHdrSupported` (WebGL2 and `EXT_color_buffer_float`, no reduced motion,
 * no save-data, motion preference `auto`) and adds the coarse-pointer exclusion this
 * plane needs — a phone gets the CSS fallback band, never the floor. Deliberately a
 * copy rather than an import: `FilmVeilLoader` belongs to another owner and this rule
 * must not change under this component when that file changes.
 *
 * `html[data-journey-tier]` is authoritative when present (Step 28 writes it). While
 * it is absent the capability probe stands in. WebGL2 guards both branches because a
 * canvas without it cannot render at all.
 */
export function surfaceAdmitted(capabilities: SurfaceCapabilities): boolean {
  if (!capabilities.webgl2) return false;
  if (capabilities.tier !== null) return capabilities.tier === 'full';
  return capabilities.colorBufferFloat
    && !capabilities.reducedMotion
    && !capabilities.saveData
    && !capabilities.coarsePointer
    && capabilities.motionPreference === 'auto';
}

export function rectIntersectsViewport(
  rect: SurfaceRect,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  return rect.left < viewportWidth
    && rect.left + rect.width > 0
    && rect.top < viewportHeight
    && rect.top + rect.height > 0;
}

/**
 * Viewport-relative CSS rect → WebGL scissor/viewport box (origin bottom-left),
 * clipped to the canvas. Three.js multiplies by the pixel ratio, so this stays in
 * CSS pixels and never needs to know the dpr.
 */
export function scissorBox(
  rect: SurfaceRect,
  canvasWidth: number,
  canvasHeight: number,
): SurfaceScissorBox {
  const left = Math.max(0, Math.round(rect.left));
  const right = Math.min(canvasWidth, Math.round(rect.left + rect.width));
  const bottom = Math.max(0, Math.round(canvasHeight - (rect.top + rect.height)));
  const top = Math.min(canvasHeight, Math.round(canvasHeight - rect.top));
  return {
    x: left,
    y: bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, top - bottom),
  };
}

/**
 * Chapter → material state, exactly as the storyboard's acts run.
 *
 * portico 0 → 2 in the last fifth of the pour · foundation 1 → 2 · garage 2 ·
 * vault 3 · finish-hall 5 · commercial 6 · proof 3 · consultation 7.
 * Boundaries blend the outgoing chapter's end state into the incoming chapter's start
 * state on `transitionProgress`, which is `material-morph` in its scrubbed form.
 * White stages do not change the material — they switch the plane off and leave the
 * horizon line, so the blend keeps running underneath exactly as §4 Continuity asks.
 */
const CHAPTER_STATES: Readonly<Record<JourneyChapterId, readonly [SurfaceStateId, SurfaceStateId]>> = Object.freeze({
  portico: [0, 2],
  foundation: [1, 2],
  garage: [2, 2],
  vault: [3, 3],
  'finish-hall': [5, 5],
  commercial: [6, 6],
  proof: [3, 3],
  consultation: [7, 7],
});

/** Fraction of `portico` spent liquid before the pour cures into state 2. */
const PORTICO_CURE_START = 0.8;

export function surfaceChapterStates(id: JourneyChapterId): readonly [SurfaceStateId, SurfaceStateId] {
  return CHAPTER_STATES[id] ?? CHAPTER_STATES.portico;
}

export function surfaceChapterEdge(id: JourneyChapterId, edge: 'start' | 'end'): SurfaceStateId {
  const [start, end] = surfaceChapterStates(id);
  return edge === 'start' ? start : end;
}

function interiorMix(id: JourneyChapterId, chapterProgress: number): number {
  if (id === 'portico') {
    return clamp01((chapterProgress - PORTICO_CURE_START) / (1 - PORTICO_CURE_START));
  }
  if (id === 'foundation') return clamp01(chapterProgress);
  return 0;
}

export function chapterSurfaceTarget(snapshot: Pick<
  JourneySnapshot,
  'activeChapter' | 'fromChapter' | 'toChapter' | 'chapterProgress' | 'transitionProgress' | 'whiteStageActive'
>): SurfaceTarget {
  const horizon = snapshot.whiteStageActive;
  const transitioning = snapshot.transitionProgress > 0 && snapshot.transitionProgress < 1;
  if (transitioning && snapshot.fromChapter !== snapshot.toChapter) {
    return {
      a: surfaceChapterEdge(snapshot.fromChapter, 'end'),
      b: surfaceChapterEdge(snapshot.toChapter, 'start'),
      mix: clamp01(snapshot.transitionProgress),
      horizon,
    };
  }
  const [a, b] = surfaceChapterStates(snapshot.activeChapter);
  return { a, b, mix: interiorMix(snapshot.activeChapter, snapshot.chapterProgress), horizon };
}

/** Effective single state for the fallback band and for `morphTo` continuity. */
export function effectiveSurfaceState(target: Pick<SurfaceTarget, 'a' | 'b' | 'mix'>): SurfaceStateId {
  return dominantSurfaceState(target.a, target.b, target.mix);
}

export function surfaceTargetsEqual(a: SurfaceTarget, b: SurfaceTarget): boolean {
  return a.a === b.a && a.b === b.b && a.mix === b.mix && a.horizon === b.horizon;
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

const EMPTY_SNAPSHOT: SurfaceSnapshot = Object.freeze({
  revision: 0,
  a: 0,
  b: 0,
  mix: 0,
  horizon: false,
  camera: 'standing',
  renderer: 'none',
  settled: true,
});

export function createSurfaceStore() {
  const listeners = new Set<() => void>();
  const views = new Map<string, SurfaceView>();
  let snapshot: SurfaceSnapshot = EMPTY_SNAPSHOT;
  let driver: SurfaceDriver | null = null;
  let frames = 0;
  let fallbackBand: HTMLElement | null = null;

  const publish = (next: Partial<Omit<SurfaceSnapshot, 'revision'>>) => {
    const merged: SurfaceSnapshot = Object.freeze({
      ...snapshot,
      ...next,
      revision: snapshot.revision + 1,
    });
    const changed = merged.a !== snapshot.a
      || merged.b !== snapshot.b
      || merged.mix !== snapshot.mix
      || merged.horizon !== snapshot.horizon
      || merged.camera !== snapshot.camera
      || merged.renderer !== snapshot.renderer
      || merged.settled !== snapshot.settled;
    if (!changed) return;
    snapshot = merged;
    writeFallbackAttributes();
    listeners.forEach((listener) => listener());
  };

  const writeFallbackAttributes = () => {
    if (typeof document === 'undefined') return;
    const band = fallbackBand ?? document.querySelector<HTMLElement>('[data-surface-fallback]');
    if (!band) return;
    fallbackBand = band;
    const state = dominantSurfaceState(snapshot.a, snapshot.b, snapshot.mix);
    band.dataset.surfaceState = String(state);
    band.dataset.surfaceName = SURFACE_MATERIALS[state].name;
    band.dataset.surfaceHorizon = snapshot.horizon ? 'on' : 'off';
    document.documentElement.dataset.surface = snapshot.renderer;
  };

  const store = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_SNAPSHOT,

    /* ---- view registry ---- */
    registerView: (id: string, element: HTMLElement, options: SurfaceViewOptions) => {
      views.set(id, { id, element, render: options.render, priority: options.priority ?? 0 });
      store.invalidate();
      return () => store.unregisterView(id);
    },
    unregisterView: (id: string) => {
      views.delete(id);
    },
    listViews: (): readonly SurfaceView[] =>
      [...views.values()].sort((left, right) => left.priority - right.priority),
    /** Registered views whose element currently intersects the viewport. */
    visibleViews: (viewportWidth: number, viewportHeight: number) =>
      store.listViews().flatMap((view) => {
        const domRect = view.element.getBoundingClientRect();
        const rect: SurfaceRect = {
          left: domRect.left,
          top: domRect.top,
          width: domRect.width,
          height: domRect.height,
        };
        if (!rectIntersectsViewport(rect, viewportWidth, viewportHeight)) return [];
        return [{ view, rect }];
      }),

    /* ---- driver ---- */
    bindDriver: (next: SurfaceDriver | null) => {
      driver = next;
      if (next) {
        next.setStates(snapshot.a, snapshot.b);
        next.setMix(snapshot.mix);
        next.setHorizon(snapshot.horizon, 0);
        next.setCamera(snapshot.camera);
        next.invalidate();
      }
    },
    invalidate: () => driver?.invalidate(),
    noteFrame: () => {
      frames += 1;
    },
    getFrames: () => frames,
    resetFrames: () => {
      frames = 0;
    },

    /* ---- material state ---- */
    /**
     * Discrete state change (nav hover, dev page, `webglcontextrestored`).
     * Runs `uMix` with `gsap.quickTo` for 0.6 s `power2.inOut`. When the requested
     * state is the pair's other end the existing blend simply reverses on the same
     * ease instead of snapping and restarting — the `easeReverse` behaviour.
     */
    morphTo: (state: SurfaceStateId, options: { duration?: number; ease?: string } = {}) => {
      if (!isSurfaceStateId(state)) return;
      const duration = options.duration ?? SURFACE_MORPH_DURATION;
      const ease = options.ease ?? SURFACE_MORPH_EASE;
      if (state === snapshot.b || state === snapshot.a) {
        const value = state === snapshot.b ? 1 : 0;
        publish({ mix: value, settled: false });
        driver?.mixTo(value, duration, ease);
        driver?.sweep(duration * 1.8);
        return;
      }
      const from = dominantSurfaceState(snapshot.a, snapshot.b, snapshot.mix);
      publish({ a: from, b: state, mix: 1, settled: false });
      driver?.setStates(from, state);
      driver?.setMix(0);
      driver?.mixTo(1, duration, ease);
      driver?.sweep(duration * 1.8);
    },

    /**
     * Scrubbed `material-morph` — the director's own progress drives the blend, so no
     * tween is started and nothing here competes with `journey-director.ts` for a
     * coordinate it already owns.
     */
    applyTarget: (target: SurfaceTarget) => {
      const current: SurfaceTarget = {
        a: snapshot.a, b: snapshot.b, mix: snapshot.mix, horizon: snapshot.horizon,
      };
      if (surfaceTargetsEqual(current, target)) return;
      const horizonChanged = current.horizon !== target.horizon;
      publish({ a: target.a, b: target.b, mix: target.mix, horizon: target.horizon, settled: false });
      driver?.setStates(target.a, target.b);
      driver?.setMix(target.mix);
      if (horizonChanged) driver?.setHorizon(target.horizon, SURFACE_MORPH_DURATION);
      driver?.invalidate();
    },

    /** Director adapter entry point. `journey-director.ts` is never modified. */
    applyJourneySnapshot: (journeySnapshot: JourneySnapshot) => {
      store.applyTarget(chapterSurfaceTarget(journeySnapshot));
    },

    setCamera: (mode: SurfaceCameraMode) => {
      if (mode !== 'standing' && mode !== 'kneeling') return;
      publish({ camera: mode });
      driver?.setCamera(mode);
      driver?.invalidate();
    },

    setHorizon: (horizon: boolean) => {
      if (snapshot.horizon === horizon) return;
      publish({ horizon });
      driver?.setHorizon(horizon, SURFACE_MORPH_DURATION);
    },

    /** `settle` — every live uniform damps to rest and the horizon line comes up. */
    settle: (duration: number = SURFACE_SETTLE_DURATION) => {
      publish({ settled: true });
      driver?.settle(duration);
    },

    sweep: (duration = 1.6) => {
      publish({ settled: false });
      driver?.sweep(duration);
    },

    setRenderer: (renderer: SurfaceRenderer) => {
      publish({ renderer });
    },

    /** Test seam only — the singleton below is module state. */
    reset: () => {
      views.clear();
      driver = null;
      frames = 0;
      fallbackBand = null;
      snapshot = EMPTY_SNAPSHOT;
      listeners.clear();
    },
  } as const;

  return store;
}

export type SurfaceStore = ReturnType<typeof createSurfaceStore>;

export const surfaceStore: SurfaceStore = createSurfaceStore();

/* -------------------------------------------------------------------------- */
/* Browser capability probe                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Same shape of probe `FilmVeilLoader` runs: create a throwaway WebGL2 context, read
 * `EXT_color_buffer_float`, then release it immediately with `WEBGL_lose_context` so
 * the check never holds a second context open.
 */
export function detectSurfaceCapabilities(motionPreference: MotionPreference): SurfaceCapabilities {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      tier: null,
      webgl2: false,
      colorBufferFloat: false,
      reducedMotion: true,
      saveData: true,
      coarsePointer: true,
      motionPreference,
    };
  }
  const tier = document.documentElement.getAttribute('data-journey-tier');
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  let webgl2 = false;
  let colorBufferFloat = false;
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    if (context) {
      webgl2 = true;
      colorBufferFloat = Boolean(context.getExtension('EXT_color_buffer_float'));
      context.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webgl2 = false;
    colorBufferFloat = false;
  }
  return {
    tier,
    webgl2,
    colorBufferFloat,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: Boolean(connection?.saveData),
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    motionPreference,
  };
}

export const SURFACE_CHAPTER_IDS = JOURNEY_CHAPTER_IDS;
