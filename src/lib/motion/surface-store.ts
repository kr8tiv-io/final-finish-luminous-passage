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
 * VIEW REGISTRY — the whole page draws through one context (Step 18a)
 * ---------------------------------------------------------------------------
 * A "view" is a DOM element that claims a rectangle of the one layout-level canvas.
 * `registerView(id, element, { render })` records it; every rendered frame the canvas
 * walks the registry, skips views whose element does not intersect the viewport, sets
 * `gl.setViewport` + `gl.setScissor` to that element's rect (CSS pixels — Three.js
 * multiplies by the pixel ratio itself) and calls the view's own `render` with the
 * shared renderer. This is drei's `<View>` contract, reimplemented here so the scissor
 * rule, the visibility rule and the demand-render rule all live in one testable place.
 *
 * Three views exist, and `priority` is their paint order inside a frame. It is not a
 * free choice: it has to reproduce the z-order these elements had as separate canvases.
 *
 *   0  `film-veil`      `.film-veil`               — the boundary compositor, full
 *                                                    viewport, so its scissor is a
 *                                                    no-op and it keeps full bleed.
 *                                                    It paints FIRST because `.journey`
 *                                                    is `isolation: isolate` at z-index
 *                                                    auto and `.surface-canvas-host` is
 *                                                    z-index 1, so the floor band has
 *                                                    always been above the veil. Giving
 *                                                    the veil the higher priority was
 *                                                    measured as a 16.9% luminance step
 *                                                    in the bottom third of the frame
 *                                                    each time a boundary handed back.
 *   10 `surface-floor`  `[data-surface-fallback]`  — the journey's floor band, over it.
 *   20 `nav-floor`      `[data-nav-menu-floor]`    — the menu's floor, registered on
 *                                                    open and dropped on close. It
 *                                                    paints last because an open menu
 *                                                    covers everything under it.
 *
 * The renderer is handed to the view rather than captured by it, which is what lets a
 * view be registered from a *different React root*: `FilmVeil` is an island inside
 * `.journey` and `SurfaceCanvas` is an island in `BaseLayout`, so they share no R3F
 * context and could not otherwise reach the same `WebGLRenderer`.
 *
 * WHAT IS NOT HERE. No view writes `canvas.style.opacity`. The shared element belongs
 * to the page, and a view that hid it would hide every other view with it; a view that
 * wants to disappear writes transparent pixels (the veil sets `uVisible` to 0) or
 * unregisters (the menu floor). See DEV-CONTRACT.md, "One canvas, three views".
 */

import type { WebGLRenderer } from 'three';

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
  /**
   * The one renderer, passed in rather than captured, so a view registered from
   * another React root can draw into this canvas. Type-only import: nothing of
   * three.js reaches this module at runtime.
   */
  readonly gl: WebGLRenderer;
}

export interface SurfaceViewOptions {
  readonly render: (context: SurfaceViewRenderContext) => void;
  /** Lower paints first: veil 0, floor band 10, menu floor 20. */
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
  /**
   * The full-screen menu is open and has claimed a rectangle for its floor. The
   * element itself is not in the snapshot — a DOM node has no value equality and
   * would defeat `useSyncExternalStore` — so it is read with `getMenuFloor()`.
   */
  readonly menuOpen: boolean;
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

/**
 * Views the *layout* owns, and therefore the only ones allowed to cross a
 * client-side navigation.
 *
 * `surface-floor` is registered by `SurfaceFloor` inside the `transition:persist`ed
 * `SurfaceCanvas` island against the `transition:persist`ed band, so both ends of
 * that registration survive the swap. `film-veil` and `nav-floor` are registered
 * from islands inside the page body, which the swap replaces — see
 * `unregisterPageViews`.
 */
export const PERSISTENT_SURFACE_VIEW_IDS: readonly string[] = Object.freeze(['surface-floor']);

const EMPTY_SNAPSHOT: SurfaceSnapshot = Object.freeze({
  revision: 0,
  a: 0,
  b: 0,
  mix: 0,
  horizon: false,
  camera: 'standing',
  renderer: 'none',
  settled: true,
  menuOpen: false,
});

export function createSurfaceStore() {
  const listeners = new Set<() => void>();
  const views = new Map<string, SurfaceView>();
  let snapshot: SurfaceSnapshot = EMPTY_SNAPSHOT;
  let driver: SurfaceDriver | null = null;
  let frames = 0;
  let fallbackBand: HTMLElement | null = null;
  let menuFloor: HTMLElement | null = null;
  /** What the plane goes back to when the menu gives it up. */
  let parkedTarget: SurfaceTarget | null = null;

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
      || merged.settled !== snapshot.settled
      || merged.menuOpen !== snapshot.menuOpen;
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
    /**
     * Drop every view a *document* registered and keep the layout's own. Returns how
     * many went, so a caller can assert on the number.
     *
     * Astro does unmount the outgoing islands, but only on `astro:after-swap` — a
     * window in which this registry would still be walking `.film-veil`'s rectangle
     * on a node that is no longer in the document, and in which a
     * `nav-floor` left over from an open menu would claim a rectangle in the page the
     * visitor is arriving at. `route-lifecycle.ts` calls this on `astro:before-swap`
     * instead, so the one persisted canvas crosses a navigation drawing exactly the
     * views that still have an element.
     */
    unregisterPageViews: (keep: readonly string[] = PERSISTENT_SURFACE_VIEW_IDS) => {
      let removed = 0;
      for (const id of [...views.keys()]) {
        if (keep.includes(id)) continue;
        views.delete(id);
        removed += 1;
      }
      if (removed > 0) store.invalidate();
      return removed;
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
        next.setHorizon(snapshot.menuOpen ? false : snapshot.horizon, 0);
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
      // One owner at a time. While the menu holds the plane, the journey's scroll
      // target is recorded and nothing else: two writers of `a`/`b`/`mix` is exactly
      // the failure this codebase keeps having, and a director publish mid-hover
      // would wipe the finish the visitor is pointing at.
      if (snapshot.menuOpen) {
        parkedTarget = target;
        return;
      }
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

    /* ---- the full-screen menu's floor ---- */
    /**
     * The menu claims a second rectangle of the same canvas, rendering the same
     * plane and the same material through a closer camera. `SurfaceFloor` watches
     * `menuOpen` and registers/unregisters the `nav-floor` view; hover blends go
     * through `morphTo`, so there is no second material system to keep in step.
     *
     * Opening parks whatever the plane was showing; closing puts it back, so a menu
     * left on cobalt-metallic never leaks that floor onto the page behind it — on a
     * route with no director to re-publish one, nothing else would.
     */
    setMenuFloor: (element: HTMLElement | null) => {
      menuFloor = element;
      const open = element !== null;
      if (snapshot.menuOpen === open) return;
      if (open) {
        parkedTarget = { a: snapshot.a, b: snapshot.b, mix: snapshot.mix, horizon: snapshot.horizon };
        publish({ menuOpen: true });
        // The plane has to be on screen whatever the journey left behind it — a menu
        // opened over a white stage would otherwise show the horizon line and no floor.
        driver?.setHorizon(false, SURFACE_MORPH_DURATION);
        driver?.invalidate();
        return;
      }
      publish({ menuOpen: false });
      const restore = parkedTarget;
      parkedTarget = null;
      if (restore) store.applyTarget(restore);
      driver?.setHorizon(restore?.horizon ?? snapshot.horizon, SURFACE_MORPH_DURATION);
      driver?.invalidate();
    },
    getMenuFloor: () => menuFloor,

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

    /**
     * Re-assert on the document the state this store already holds.
     *
     * A swap wipes it twice over: `swapRootAttributes` removes every attribute from
     * `<html>`, `html[data-surface]` included, and the band the incoming document
     * brought with it carries the SSR defaults. Neither is a *state* change, so
     * `publish` short-circuits and would never write them again. The band is
     * re-queried rather than reused, because the incoming document may have brought
     * its own.
     */
    syncDocumentState: () => {
      fallbackBand = null;
      writeFallbackAttributes();
    },

    /** Test seam only — the singleton below is module state. */
    reset: () => {
      views.clear();
      driver = null;
      frames = 0;
      fallbackBand = null;
      menuFloor = null;
      parkedTarget = null;
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
