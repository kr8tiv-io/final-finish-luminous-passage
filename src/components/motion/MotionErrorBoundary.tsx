import { Component, Fragment, useSyncExternalStore, type ErrorInfo, type ReactNode } from 'react';
import { removeJourneyEnhancement } from '../../lib/motion/journey-director';

/**
 * The one recovery seam for every motion island (Step 33).
 *
 * WHAT THIS FILE DID BEFORE, BY NAME, SO NOTHING IS LOST IN THE REWRITE:
 *
 *  1. `getDerivedStateFromError` flipped a `failed` flag.
 *  2. `componentDidCatch` called `removeJourneyEnhancement(document)`, which strips
 *     `data-journey-enhanced` off `.journey`. That attribute is what `JourneyMotion`
 *     reads as `compositorReady`, so removing it is what takes the DOM film plates off
 *     stage and hands the page back to its posters. It is still called, unchanged, on
 *     every catch — it is the whole "quiet fallback" mechanism and not a detail.
 *  3. `render` returned `null` once failed, permanently.
 *
 * Item 3 is the one this step replaces. A boundary that latches dead for the life of
 * the session turns one bad render — a lost GPU, a chunk that arrived half-parsed, a
 * `useSyncExternalStore` snapshot that raced a swap — into a permanently downgraded
 * page. What replaces it:
 *
 *  - a marker element instead of `null`, so "this island is in fallback" is a thing a
 *    test (and a person with devtools open) can see, rather than an absence;
 *  - one report per failure, to the console only. No network: this site ships no
 *    analytics and no error-reporting endpoint, and Step 33's own decision record
 *    (docs/context/DECISIONS.md) is why;
 *  - a retry that re-mounts the island's children on the next `astro:page-load` or the
 *    visitor's next pointer/key interaction, whichever comes first. Both are moments
 *    the page is already doing work, so a re-mount costs nothing a visitor can feel,
 *    and neither is a timer that would retry a genuinely broken island forever.
 *
 * The marker is `display: none` and `pointer-events: none` inline. It must not be able
 * to move a single pixel of the page it is standing in for: a fallback that reflows the
 * document is a worse failure than the one it is reporting.
 */

/* -------------------------------------------------------------------------- */
/* The staging-only fault registry                                             */
/* -------------------------------------------------------------------------- */

/**
 * Recovery that has never been exercised is a claim, not a behaviour. This registry is
 * the seam that lets a gate throw inside a real island's render on demand — the same
 * staging-only gate `window.__ffeSurface` and `window.__ffeRoute` ride on
 * (`html[data-environment]`, written by BaseLayout), so a production visitor never gets
 * an API that can break their page.
 */
const armedFaults = new Set<string>();
const mountedIslands = new Map<string, number>();
const islandFailures = new Map<string, number>();
const faultListeners = new Set<() => void>();
let faultVersion = 0;

function notifyFaults() {
  faultVersion += 1;
  faultListeners.forEach((listener) => listener());
}

function subscribeFaults(listener: () => void): () => void {
  faultListeners.add(listener);
  return () => {
    faultListeners.delete(listener);
  };
}

const readFaultVersion = () => faultVersion;
const readServerFaultVersion = () => 0;

declare global {
  interface Window {
    __ffeFault?: {
      /** Arm a fault: the named island's next render throws. */
      readonly throwIn: (island: string) => void;
      /** Disarm one island, or every island when called with no argument. */
      readonly clear: (island?: string) => void;
      /** Islands currently armed. */
      readonly armed: () => readonly string[];
      /** Islands with a live boundary mounted right now. */
      readonly islands: () => readonly string[];
      /** How many times each island's boundary has caught, this session. */
      readonly failures: () => Readonly<Record<string, number>>;
    };
  }
}

let probeInstalled = false;

function installFaultProbe() {
  if (probeInstalled || typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.documentElement.dataset.environment === 'production') return;
  probeInstalled = true;
  Object.defineProperty(window, '__ffeFault', {
    configurable: true,
    value: {
      throwIn: (island: string) => {
        armedFaults.add(island);
        notifyFaults();
      },
      clear: (island?: string) => {
        if (island === undefined) armedFaults.clear();
        else armedFaults.delete(island);
        notifyFaults();
      },
      armed: () => [...armedFaults],
      islands: () => [...mountedIslands.keys()],
      failures: () => Object.fromEntries(islandFailures),
    },
  });
}

/**
 * Sits inside the boundary and renders nothing. It subscribes to the registry, so
 * arming a fault re-renders *this* component — inside the boundary's subtree, during
 * render — which is exactly the shape of failure the boundary exists to catch. A
 * `setTimeout(() => { throw })` would not be: that escapes React entirely and no
 * boundary anywhere would see it.
 *
 * It is mounted on production too, where `window.__ffeFault` is never installed and
 * `armedFaults` is therefore permanently empty. The cost is one store subscription per
 * boundary — three on the homepage — and no DOM. Gating the mount itself on the
 * environment would buy nothing and would make the shipped tree differ from the tested
 * one, which is a worse trade than three subscriptions.
 */
function MotionFaultTripwire({ island }: { readonly island: string }) {
  useSyncExternalStore(subscribeFaults, readFaultVersion, readServerFaultVersion);
  if (armedFaults.has(island)) {
    throw new Error(`[motion] injected fault in the "${island}" island`);
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The boundary                                                                */
/* -------------------------------------------------------------------------- */

interface MotionErrorBoundaryProps {
  readonly children: ReactNode;
  /**
   * Which island this boundary guards. Defaults to `motion` because two of the three
   * call sites (`FilmVeilLoader`, `JourneyMotionLoader`) belong to another owner and
   * are not edited by this step; both therefore share the default id, and arming
   * `motion` trips both at once. `SurfaceCanvas` passes `surface` for its own.
   */
  readonly island?: string;
  /**
   * What to show instead of the island. Defaults to the marker below. A caller with a
   * real static stand-in (a poster, a still) passes it here; it must be a layer that
   * already occupies the island's box, never new flow content.
   */
  readonly fallback?: ReactNode;
  /** Told once per failure, so the owner can hand its own state back to the CSS tier. */
  readonly onFail?: (error: Error) => void;
  /** Told once per successful re-mount attempt. */
  readonly onRetry?: () => void;
}

interface MotionErrorBoundaryState {
  readonly failed: boolean;
  /** Bumped per retry; keys the children so a re-mount is a real re-mount. */
  readonly attempt: number;
}

export default class MotionErrorBoundary extends Component<MotionErrorBoundaryProps, MotionErrorBoundaryState> {
  state: MotionErrorBoundaryState = { failed: false, attempt: 0 };

  private detachRetry: (() => void) | null = null;

  private get island(): string {
    return this.props.island ?? 'motion';
  }

  static getDerivedStateFromError(): Partial<MotionErrorBoundaryState> {
    return { failed: true };
  }

  componentDidMount() {
    installFaultProbe();
    mountedIslands.set(this.island, (mountedIslands.get(this.island) ?? 0) + 1);
  }

  componentWillUnmount() {
    const live = (mountedIslands.get(this.island) ?? 1) - 1;
    if (live <= 0) mountedIslands.delete(this.island);
    else mountedIslands.set(this.island, live);
    this.detachRetry?.();
    this.detachRetry = null;
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    // Unchanged from before this step: hand the journey back to its posters.
    removeJourneyEnhancement(document);
    const island = this.island;
    islandFailures.set(island, (islandFailures.get(island) ?? 0) + 1);
    // One report, console only. See docs/context/DECISIONS.md — this site sends
    // nothing anywhere, so there is no endpoint to report to and no consent to ask for.
    console.error(`[motion] the "${island}" island failed and fell back`, error);
    this.props.onFail?.(error);
    this.armRetry();
  }

  /**
   * Re-mount on the next moment the page is already busy: a route arrival, or the
   * visitor's next pointer or key. Whichever fires first wins and the rest are dropped,
   * so a failed island costs at most one extra mount per interaction, never a loop.
   */
  private armRetry() {
    if (typeof window === 'undefined' || this.detachRetry) return;
    const retry = () => {
      this.detachRetry?.();
      this.detachRetry = null;
      this.setState((state) => ({ failed: false, attempt: state.attempt + 1 }));
      this.props.onRetry?.();
    };
    document.addEventListener('astro:page-load', retry);
    window.addEventListener('pointerdown', retry, { passive: true });
    window.addEventListener('keydown', retry);
    this.detachRetry = () => {
      document.removeEventListener('astro:page-load', retry);
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
    };
  }

  render() {
    const island = this.island;
    if (this.state.failed) {
      return this.props.fallback ?? (
        <span
          data-motion-fallback={island}
          data-motion-attempt={this.state.attempt}
          aria-hidden="true"
          style={{ display: 'none', pointerEvents: 'none' }}
        />
      );
    }
    // The retry key is on a Fragment, not a wrapper element: this boundary sits inside
    // `.film-veil` and `.surface-canvas-host`, both of which are measured by other
    // steps' gates, and a healthy island must add exactly zero nodes to either.
    return (
      <>
        <MotionFaultTripwire island={island} />
        <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
      </>
    );
  }
}
