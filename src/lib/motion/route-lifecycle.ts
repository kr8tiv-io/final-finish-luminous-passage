import {
  ensureGsapKit,
  killDetachedMotion,
  killDetachedScrollTriggers,
  killRouteScrollTriggers,
  ScrollTrigger,
} from './gsap-kit';
import { journeyDirector } from './journey-director';
import { surfaceStore } from './surface-store';

/**
 * Route lifecycle — the one owner of what a client-side navigation stops and starts.
 *
 * `<ClientRouter />` (BaseLayout) replaces the document body in place instead of
 * loading a new document. Two consequences shape everything below.
 *
 * 1. WHAT SURVIVES HAS TO BE RE-POINTED, NOT RE-CREATED. The header and the one
 *    WebGL canvas are `transition:persist`ed, so they cross the swap still running —
 *    still holding the *outgoing* document's elements, its active link, its hero. A
 *    persisted thing that is not re-pointed is worse than one that was rebuilt.
 *
 * 2. WHAT THE OUTGOING DOCUMENT OWNED HAS TO STOP BEFORE THE SWAP, NOT AFTER. Astro
 *    does unmount the outgoing islands — `astro-island`'s `disconnectedCallback`
 *    arms an `astro:after-swap` listener and `@astrojs/react` unmounts the root on
 *    it — but *after* the swap is too late: by then the incoming page's islands have
 *    begun hydrating, and an outgoing `JourneyMotion` cleanup landing after the
 *    incoming one has called `journeyDirector.start()` leaves a stopped director that
 *    nothing restarts. Islands therefore register the same cleanup here and return
 *    the handle this module hands back; it runs at `astro:before-swap`, and React's
 *    later call of the very same function is a no-op because the handle is guarded.
 *
 * Everything that has to happen at a route boundary is registered here rather than on
 * `document` directly, so the order is decided in one place. The two exceptions are
 * both deliberate and both belong to other owners: `SurfaceCanvas` watches
 * `astro:page-load` for its own re-pointing, and `PreparationLayers.astro` still
 * carries the one-shot `astro:before-swap` dispose it shipped with (see `PAGE_MODULES`).
 *
 * SEQUENCE
 *   astro:before-swap   registered teardowns (LIFO) -> route-scoped bindings ->
 *                       journeyDirector.stop() -> every ScrollTrigger killed ->
 *                       page views unregistered from the surface registry
 *   astro:after-swap    detached triggers and tweens swept -> the surface store
 *                       re-asserts `html[data-surface]` and the band's attributes
 *                       (`swapRootAttributes` wiped them) -> swap hooks (the header
 *                       re-derives its route state before the incoming page paints)
 *   astro:page-load     gsap kit re-checked -> route-scoped bindings rebuilt against
 *                       the new document -> ScrollTrigger.refresh() -> one canvas
 *                       frame requested -> focus moved to the new heading
 *   pageshow.persisted  geometry invalidated, triggers refreshed, one frame
 *
 * The islands themselves are not restarted from here: `client:load` / `client:only`
 * islands in the incoming body are fresh `astro-island` elements and hydrate on their
 * own. What this module guarantees is that the module-level singletons they all share
 * come out of a swap in a state a fresh island can adopt rather than duplicate:
 *
 *   `journeyDirector`          stopped, so the incoming `JourneyMotion` owns a
 *                              director with no listeners and no stale metrics.
 *   surface view registry      every page-registered view dropped; only the layout's
 *                              own `surface-floor` crosses.
 *   `gsap-kit`'s `ready` flag  deliberately NOT reset. Module scope is not re-evaluated
 *                              across a swap, so the plugins are still registered on
 *                              the same `gsap` instance; resetting it would re-register
 *                              them for nothing. "Reset, not duplicated" cuts both ways.
 */

type Teardown = () => void;
type RouteBinding = {
  readonly init: () => Teardown | void;
  dispose: Teardown | undefined;
  generation: number;
};

const teardowns = new Set<Teardown>();
const bindings = new Set<RouteBinding>();
const swapHooks = new Set<Teardown>();

/**
 * Which document the running bindings were built for. Bumped on every swap, so the
 * `astro:page-load` that fires for the *initial* document finds every binding already
 * current and rebuilds nothing — which is what keeps the first load single-init.
 */
let generation = 0;
let installed = false;

function safely(label: string, run: () => void) {
  try {
    run();
  } catch (error) {
    // A cleanup that throws must not take the rest of the navigation with it.
    console.error(`[route-lifecycle] ${label} failed`, error);
  }
}

/**
 * Register a cleanup for the document that is on screen now.
 *
 * Returns the guarded runner: call it to run the cleanup early (and deregister), or
 * return it straight out of a React effect — it runs exactly once whether this module
 * calls it at `astro:before-swap` or React calls it at unmount.
 */
export function onRouteTeardown(cleanup: Teardown): Teardown {
  initializeRouteLifecycle();
  let done = false;
  const run: Teardown = () => {
    if (done) return;
    done = true;
    teardowns.delete(run);
    cleanup();
  };
  teardowns.add(run);
  return run;
}

/**
 * Bind something that has to exist once per document: it is built now, torn down at
 * `astro:before-swap`, and built again against the new document at `astro:page-load`.
 * `init` returns its own teardown. The returned function unbinds it for good.
 *
 * `immediate: false` skips the first build, for the case where the markup's own
 * bundled script has already done it for the document that is on screen — see
 * `PAGE_MODULES`.
 */
export function bindRouteScoped(
  init: () => Teardown | void,
  options: { readonly immediate?: boolean } = {},
): Teardown {
  initializeRouteLifecycle();
  const binding: RouteBinding = { init, dispose: undefined, generation };
  bindings.add(binding);
  if (options.immediate !== false) buildBinding(binding);
  return () => {
    bindings.delete(binding);
    disposeBinding(binding);
  };
}

/**
 * Run on `astro:after-swap` — the last moment before the incoming document paints.
 * Route-derived state that must never be seen stale (the header's active link)
 * belongs here; anything that needs the new page's scripts belongs in a binding.
 */
export function onRouteSwap(hook: Teardown): Teardown {
  initializeRouteLifecycle();
  swapHooks.add(hook);
  return () => swapHooks.delete(hook);
}

/**
 * Page scripts Astro will never run twice — and the bridge that does.
 *
 * Both of these are bundled module scripts inside a homepage section
 * (`PreparationLayers.astro`, `ResinReveal.astro`). A bundled module script executes
 * once per session, so after the visitor has left `/` and come back, the markup is
 * there and the diagram and the resin pin are dead: measured, 37 ScrollTriggers on a
 * fresh `/` against 12 on a returned-to `/`.
 *
 * Re-initialising them from here is deliberately a *bridge*, not a new owner: each
 * entry is `selector -> the module's own exported initializer`, skipped on the first
 * document (the markup's script already ran it) and torn down with every other
 * route-scoped binding. Steps 21 and 24 own those files; when either adopts
 * `bindRouteScoped` in its own `<script>`, delete its row here.
 */
const PAGE_MODULES: ReadonlyArray<{
  readonly selector: string;
  readonly load: () => Promise<(root?: ParentNode) => Teardown>;
}> = [
  {
    selector: '[data-prep-layers]',
    load: () => import('../../scripts/preparation-layers').then((module) => module.initializePreparationLayers),
  },
];

function bindPageModules() {
  for (const { selector, load } of PAGE_MODULES) {
    bindRouteScoped(() => {
      if (!document.querySelector(selector)) return undefined;
      let dispose: Teardown | undefined;
      let cancelled = false;
      // The import is dynamic so the layout bundle does not grow by the weight of
      // two homepage scripts on every route; by the time it resolves the chunk is
      // already in the module cache, because the page that owns it loaded it.
      void load()
        .then((initialize) => {
          if (cancelled) return;
          dispose = initialize();
        })
        .catch((error) => console.error(`[route-lifecycle] ${selector} re-init failed`, error));
      return () => {
        cancelled = true;
        dispose?.();
      };
    }, { immediate: false });
  }
}

function buildBinding(binding: RouteBinding) {
  binding.generation = generation;
  safely('binding init', () => {
    binding.dispose = binding.init() ?? undefined;
  });
}

function disposeBinding(binding: RouteBinding) {
  const dispose = binding.dispose;
  binding.dispose = undefined;
  if (dispose) safely('binding teardown', dispose);
}

function teardownDocument() {
  // LIFO: the last thing to register is the innermost, exactly as a cleanup stack.
  [...teardowns].reverse().forEach((run) => safely('teardown', run));
  teardowns.clear();
  bindings.forEach(disposeBinding);
  generation += 1;

  safely('director stop', () => journeyDirector.stop());
  safely('scroll triggers', () => killRouteScrollTriggers());
  safely('surface views', () => surfaceStore.unregisterPageViews());
}

function documentSwapped() {
  sweepDetached();
  safely('surface document state', () => surfaceStore.syncDocumentState());
  swapHooks.forEach((hook) => safely('swap hook', hook));
}

let sweepPending = false;

/**
 * Kill whatever is now rooted in a node that left with the outgoing document.
 *
 * This runs on a schedule of its own, not only at the swap, because of one specific
 * thing a swap does: `swapRootAttributes` strips every attribute off `<html>`, and
 * more than one page script in this project watches `data-journey-tier` /
 * `data-journey-motion` with a `MutationObserver` and rebuilds its motion when they
 * change. Those observers belong to documents that are gone, and nothing can
 * disconnect them from outside — but everything they rebuild is anchored to a
 * detached element, which *is* identifiable. Observing the same attributes and
 * sweeping after them is what keeps a returned-to route's trigger count equal to a
 * fresh load's instead of drifting up by one stale rebuild per navigation.
 */
function sweepDetached() {
  if (sweepPending) return;
  sweepPending = true;
  queueMicrotask(() => {
    sweepPending = false;
    safely('detached triggers', () => killDetachedScrollTriggers());
    safely('detached motion', () => killDetachedMotion());
  });
}

/**
 * Move focus to the heading of the page that just arrived.
 *
 * MOTION-VOCABULARY.md's `page-wipe` row ends its reduced-motion contract with
 * "focus moved to the new `<h1>`"; a client-side navigation does not move focus on
 * its own, so without this a keyboard or screen-reader visitor stays parked on the
 * link they just followed while the document underneath them changes. `tabindex` is
 * added only for the duration of the focus and removed on blur, so nothing in the
 * markup gains a tab stop. Skipped while the full-screen menu owns focus.
 */
function focusRouteHeading() {
  if (document.documentElement.hasAttribute('data-menu-open')) return;
  const main = document.querySelector<HTMLElement>('#main-content');
  const heading = main?.querySelector<HTMLElement>('h1') ?? document.querySelector<HTMLElement>('h1') ?? main;
  if (!heading) return;
  const owned = !heading.hasAttribute('tabindex');
  if (owned) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
  if (owned) {
    heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
  }
}

function documentReady() {
  ensureGsapKit();
  bindings.forEach((binding) => {
    if (binding.generation === generation) return;
    disposeBinding(binding);
    buildBinding(binding);
  });
  // The incoming document's own scripts have run by now, so anything they created
  // gets measured against the geometry the visitor is actually looking at.
  sweepDetached();
  safely('scroll trigger refresh', () => ScrollTrigger.refresh());
  safely('surface invalidate', () => surfaceStore.invalidate());
  if (generation > 0) safely('focus heading', focusRouteHeading);
}

/**
 * Restored from the back/forward cache.
 *
 * Nothing was torn down and nothing re-hydrates, but every measurement the page holds
 * was taken before it was frozen and the demand-rendered canvas has not been asked for
 * a frame since. `invalidateGeometry` is the director's own re-measure; the other two
 * are its equivalents for GSAP and the surface.
 */
function documentRestored(event: PageTransitionEvent) {
  if (!event.persisted) return;
  safely('director geometry', () => journeyDirector.invalidateGeometry());
  safely('scroll trigger refresh', () => ScrollTrigger.refresh());
  safely('surface invalidate', () => surfaceStore.invalidate());
}

declare global {
  interface Window {
    __ffeRoute?: {
      /** How many documents this session has swapped through. 0 on a fresh load. */
      readonly generation: number;
      /** Live ScrollTrigger count — the number a route arrival has to match a fresh load on. */
      readonly scrollTriggers: () => number;
      /**
       * One descriptor per pinning trigger: the pinned element's tag, the id of
       * the nearest element that has one, and whether it sits inside Act 4's
       * Reclaim bay. The storyboard's directive 2 ("sticky before pin") allows a
       * pin only on the inner wrapper of Act 5 and Act 7, so the gate is about
       * WHERE the pins are and not only how many — and `.pin-spacer` in the DOM
       * cannot answer it, because `pinSpacing: false` leaves none behind.
       */
      readonly pins: () => string[];
      /** Registered per-document cleanups and route-scoped bindings, to catch duplication. */
      readonly teardowns: () => number;
      readonly bindings: () => number;
    };
  }
}

/**
 * Read-only diagnostics, on staging only — the same gate `window.__ffeSurface` uses,
 * read off `html[data-environment]` (see BaseLayout). The gates need these because
 * ScrollTrigger is bundled, not global: "the same number of triggers as a fresh load"
 * is otherwise unmeasurable from a test.
 */
function installProbe() {
  if (document.documentElement.dataset.environment === 'production') return;
  Object.defineProperty(window, '__ffeRoute', {
    configurable: true,
    value: {
      get generation() { return generation; },
      scrollTriggers: () => ScrollTrigger.getAll().length,
      pins: () => ScrollTrigger.getAll()
        .filter((trigger) => Boolean(trigger.pin))
        .map((trigger) => {
          const pinned = trigger.pin as Element | undefined;
          const tag = pinned?.nodeName?.toLowerCase() ?? 'unknown';
          const named = pinned?.closest?.('[id]')?.id ?? '';
          const inBay = pinned?.closest?.('[data-reclaim-bay]') ? ':in-bay' : '';
          return `${tag}#${named}${inBay}`;
        }),
      teardowns: () => teardowns.size,
      bindings: () => bindings.size,
    },
  });
}

/**
 * Install the document listeners. Idempotent, and safe to call from anywhere that
 * wants the lifecycle to exist — the layout calls it once, and every registration
 * helper above calls it again for free.
 */
export function initializeRouteLifecycle(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('astro:before-swap', teardownDocument);
  document.addEventListener('astro:after-swap', documentSwapped);
  document.addEventListener('astro:page-load', documentReady);
  window.addEventListener('pageshow', documentRestored);
  // The two attributes every tier-aware page script rebuilds on. See `sweepDetached`.
  new MutationObserver(sweepDetached).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-journey-tier', 'data-journey-motion'],
  });
  bindPageModules();
  installProbe();
}
