import gsap from 'gsap';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ArchiveResolveImage, ArchiveTile } from '../../data/archive-lattice';
import { ensureGsapKit, Flip } from '../../lib/motion/gsap-kit';
import { journeyControls } from '../../lib/motion/journey-controls';
import { JOURNEY_CHAPTER_IDS } from '../../lib/motion/journey-director';
import { onRouteTeardown } from '../../lib/motion/route-lifecycle';
import './archive-lattice.css';

/**
 * Act 6 — the archive. A DOM-first, two-axis parallax lattice of all 96 real
 * photographs, with the cylinder's front slot unwrapping into it and one tile
 * resolving to full bleed at the end.
 *
 * WHY THE DOM IS THE BASE LAYER AND NOT A FALLBACK
 * (`EXPERIENCE-STORYBOARD.md` §8, directive 5.) Every tile is a real
 * `<img alt>` off `public/images/projects/generated/thumbnails/`, laid out as
 * one 12 × 8 block of uniques that wraps on both axes, so the drift never runs
 * out and the act is simultaneously the SEO surface. The `full`-tier WebGL
 * flyover over `archive-atlas-2048.webp` is an enhancement layered on top of
 * this — see "THE FLYOVER HOOK" at the foot of this file. It is not built in
 * this step, and nothing here depends on it.
 *
 * ONE OWNER PER COORDINATE (`CLAUDE.md`)
 * This component adds no scroll listener and no ScrollTrigger. It subscribes to
 * `journeyDirector` and reads the published snapshot; the act's own progress is
 * `chapterProgress` while `archive` is the active chapter, saturated to 0/1 on
 * either side of it, then remapped once onto the sticky host's own window (see
 * `actProgress`). The only geometry it reads is its own section height and its
 * own plane size, and only when the viewport changes size.
 *
 * NO PIN, NO TRANSFORMED ANCESTOR
 * The host is `position: sticky` in normal flow (directive 2) and its height is
 * reserved entirely in `archive-lattice.css`, so `document.scrollHeight` is the
 * same before and after this island hydrates — the Step 23 pin-spacer
 * regression cannot recur here because no pin spacer is ever created.
 * Transforms live on the tiles, which are descendants; never on `.journey` and
 * never on the chapter section.
 *
 * WHAT MOVES, PER FRAME
 * Four custom properties on the root (`--al-enter`, `--al-copy`, `--al-dim`,
 * `--al-resolve`), at most one of which is mid-flight at any progress because
 * the phases are disjoint, and one `transform` per tile — written only when the
 * rounded value actually changed, and skipped entirely while the drift is
 * frozen (the whole unwrap, the hold window, and the resolve).
 *
 * @motion unwrap-to-lattice
 * @motion tile-resolve
 */

interface Props {
  readonly tiles: readonly ArchiveTile[];
  readonly resolve: ArchiveResolveImage;
  readonly columns: number;
  readonly rows: number;
  readonly phoneColumns: number;
  readonly leadIndex: number;
  readonly resolveIndex: number;
  readonly photoCount: number;
  readonly jobCount: number;
  /** Retired with the dimmed state (2026-09-22); accepted so older callers still type-check. */
  readonly dateRange?: string;
  readonly pendingCount?: number;
  readonly staging?: boolean;
}

/* -------------------------------------------------------------------------- */
/* The act's phase map, in act progress                                        */
/* -------------------------------------------------------------------------- */

/**
 * `unwrap-to-lattice` — the front slot Flips in, the rest fade up outward. Since
 * 2026-09-22 the unwrap runs on the APPROACH (the wall assembles while it scrolls
 * into place, see `paint`), so the held act starts already drifting.
 */
const UNWRAP_END = 0.02;
/** Diagonal drift, first half. */
const DRIFT_A_END = 0.24;
/** `hold-window` — every scroll-linked transform frozen while the copy is read. */
const HOLD_END = 0.56;
/**
 * Diagonal drift, second half. The per-row and per-column lags that scatter the wall
 * into a collage relax back to zero over it, so the wall leaves the screen as the
 * neat grid it arrived as (Matt: the transition out was choppy — the scatter kept
 * growing and opened holes).
 */
const DRIFT_B_END = 0.9;
/** The resolve completes before the act does, so it is settled at the boundary. */
const RESOLVE_SPAN = 0.08;
/** How long the resolve tile spends easing from the drift to the host's centre. */
const HOMING_SPAN = 0.1;

/** The copy arrives inside the hold window and leaves as the wall regroups. */
const COPY_IN_START = 0.12;
const COPY_IN_SPAN = 0.1;
const COPY_OUT_START = 0.66;
const COPY_OUT_SPAN = 0.1;

/** Fraction of the plane the diagonal covers across the act. */
const TRAVEL_X = 1.15;
const TRAVEL_Y = 1;
/** Storyboard §6, phone: "shorter diagonal". */
const PHONE_TRAVEL_X = 0.62;
const PHONE_TRAVEL_Y = 0.58;

/** Per-row / per-column parallax lag (`caption-drift`, isladjan per-layer lags). */
const ROW_LAG = 0.055;
const COLUMN_LAG = 0.028;

/**
 * The resolve (one tile flying to full bleed at the end) is retired: Matt, 2026-09-22,
 * "it's not an impressive image and it doesn't really make a lot of sense there". The
 * wall now simply scrolls on and off with paper edges top and bottom (CSS, `.al::before`
 * / `.al::after`), so it meets the paper before it and the next act's misty top without
 * a seam. The phase functions stay exported so the unit tests keep describing the map;
 * nothing renders the resolve.
 */
const RESOLVE_ENABLED = false;
/** Final Finish's public Facebook page — the same URL the footer and the schema carry. */
const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61573826827114';

/** Below this the lattice trims to `phoneColumns` and shortens its diagonal. */
const PHONE_WIDTH = 760;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const wrap = (value: number, span: number) => ((value % span) + span) % span;
const smooth = (t: number) => t * t * (3 - 2 * t);

const ARCHIVE_INDEX = (JOURNEY_CHAPTER_IDS as readonly string[]).indexOf('archive');

/**
 * The act's own progress, from the one published coordinate.
 *
 * `chapterProgress` runs from "this chapter's top is at the viewport's middle"
 * to "this chapter's bottom is at the viewport's middle" — a window half a
 * viewport wider at each end than the sticky host actually holds the picture
 * for. `ratio` is the section's height in viewports, measured once per resize,
 * and remaps the published value onto the host's real window so that `t = 0` is
 * the frame the host sticks and `t = 1` is the frame it lets go. Nothing about
 * scroll is read here: the director's number is the clock, this is a change of
 * units.
 */
export function actProgress(
  activeIndex: number,
  chapterProgress: number,
  ratio: number,
): number {
  if (activeIndex < ARCHIVE_INDEX) return 0;
  if (activeIndex > ARCHIVE_INDEX) return 1;
  if (!(ratio > 1)) return clamp01(chapterProgress);
  return clamp01((chapterProgress * ratio - 0.5) / (ratio - 1));
}

/** Where the lattice has drifted to, 0 → 1, frozen through the hold window. */
export function driftProgress(t: number): number {
  if (t <= UNWRAP_END) return 0;
  if (t < DRIFT_A_END) return 0.5 * ((t - UNWRAP_END) / (DRIFT_A_END - UNWRAP_END));
  if (t < HOLD_END) return 0.5;
  if (t < DRIFT_B_END) return 0.5 + 0.5 * ((t - HOLD_END) / (DRIFT_B_END - HOLD_END));
  return 1;
}

/** `tile-resolve` — 0 until the drift finishes, 1 well before the act ends. */
export function resolveProgress(t: number): number {
  return clamp01((t - DRIFT_B_END) / RESOLVE_SPAN);
}

/** The copy's arrival and departure, both inside the hold window's shoulders. */
export function copyProgress(t: number): number {
  const rise = clamp01((t - COPY_IN_START) / COPY_IN_SPAN);
  const fall = 1 - clamp01((t - COPY_OUT_START) / COPY_OUT_SPAN);
  return Math.min(rise, fall);
}

/** Normalised outward distance from the lead tile: the `unwrap` stagger order. */
export function tileDelay(
  index: number,
  columns: number,
  rows: number,
  leadIndex: number,
): number {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const leadColumn = leadIndex % columns;
  const leadRow = Math.floor(leadIndex / columns);
  const dx = (column - leadColumn) / Math.max(1, columns - 1);
  const dy = (row - leadRow) / Math.max(1, rows - 1);
  const far = Math.hypot(
    Math.max(leadColumn, columns - 1 - leadColumn) / Math.max(1, columns - 1),
    Math.max(leadRow, rows - 1 - leadRow) / Math.max(1, rows - 1),
  );
  return Math.min(1, Math.hypot(dx, dy) / Math.max(0.001, far));
}

/** `COPY-DECK.md`, "Alt text and labels for real photographs". */
export function tileAlt(index: number, photoCount: number): string {
  return `Final Finish project archive photograph ${index + 1} of ${photoCount}`;
}

interface Geometry {
  readonly columns: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly planeWidth: number;
  readonly planeHeight: number;
  readonly planeLeft: number;
  readonly planeTop: number;
  readonly hostWidth: number;
  readonly hostHeight: number;
  readonly ratio: number;
  readonly travelX: number;
  readonly travelY: number;
}

export default function ArchiveLattice({
  tiles,
  resolve,
  columns,
  rows,
  phoneColumns,
  leadIndex,
  resolveIndex,
  photoCount,
  jobCount,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLUListElement>(null);
  const [hydrated, setHydrated] = useState(false);
  const [phone, setPhone] = useState(false);
  const [still, setStill] = useState(false);

  /**
   * The phone trim, applied after hydration and never during SSR.
   *
   * Columns 0–5 of the same block: 48 uniques, the same row/column arithmetic,
   * and the eager first row stays the first row. It runs post-hydration on
   * purpose — the served HTML carries all 96 for search and for a visitor with
   * no JavaScript, and because every tile is out of flow inside a host whose
   * height is fixed in CSS, dropping half of them moves nothing.
   */
  const rendered = phone
    ? tiles.filter((_, index) => index % columns < phoneColumns)
    : tiles;
  const renderColumns = phone ? phoneColumns : columns;
  const reindex = (index: number) =>
    Math.floor(index / columns) * phoneColumns + (index % columns);
  const renderLead = phone ? Math.min(rendered.length - 1, reindex(leadIndex)) : leadIndex;
  const renderResolve = phone ? Math.min(rendered.length - 1, reindex(resolveIndex)) : resolveIndex;

  useEffect(() => {
    setHydrated(true);
    journeyControls.hydrate();
    const narrow = window.matchMedia(`(max-width: ${PHONE_WIDTH - 1}px)`);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setPhone(narrow.matches);
      setStill(reduced.matches || journeyControls.getSnapshot().motionPreference === 'still');
    };
    sync();
    narrow.addEventListener('change', sync);
    reduced.addEventListener('change', sync);
    const unsubscribe = journeyControls.subscribe(sync);
    return () => {
      narrow.removeEventListener('change', sync);
      reduced.removeEventListener('change', sync);
      unsubscribe();
    };
  }, []);

  /**
   * The act's one effect: the director's snapshot in, four custom properties and
   * up to `rendered.length` transforms out.
   *
   * `still` never enters it — that tier is the SSR state plus the CSS grid in
   * `archive-lattice.css`, which is the whole act told in DOM with an opacity
   * stagger and a CSS `scale` resolve (storyboard §6).
   */
  useEffect(() => {
    if (!hydrated || still || typeof window === 'undefined') return undefined;
    const root = rootRef.current;
    const plane = planeRef.current;
    if (!root || !plane) return undefined;
    ensureGsapKit();

    const section = root.closest<HTMLElement>('[data-archive-section]');
    const tileNodes = [...plane.querySelectorAll<HTMLElement>('.al-tile')];
    const resolveNode = tileNodes[renderResolve] ?? null;
    const leadFit = tileNodes[renderLead]?.querySelector<HTMLElement>('.al-tile__fit') ?? null;
    /**
     * React's own inline style on the resolve tile — `--al-c`, `--al-r`,
     * `--al-d`, `--al-alpha` — captured before anything writes to it.
     *
     * Flip has to be cleaned up with `clearProps: 'all'` (it leaves position,
     * left, top, width, height and a transform behind), and `clearProps: 'all'`
     * empties the whole style attribute, custom properties included. Measured
     * consequence: after one pass through the resolve and back, that tile's
     * `--al-alpha` was gone, `opacity: calc(var(--al-alpha) * …)` became
     * invalid, and the tile sat at full opacity in the middle of a lattice
     * that is supposed to be uniformly dimmed. So the string goes back verbatim
     * afterwards, and `paint` rewrites the transform on the next frame.
     */
    const resolveBaseStyle = resolveNode?.getAttribute('style') ?? '';

    let geometry: Geometry | null = null;
    let unwrapTween: gsap.core.Tween | null = null;
    let resolveTimeline: gsap.core.Timeline | null = null;
    let resolving = false;
    const lastX = new Float64Array(tileNodes.length).fill(Number.NaN);
    const lastY = new Float64Array(tileNodes.length).fill(Number.NaN);
    const written: Record<'enter' | 'copy' | 'dim' | 'resolve', number> = {
      enter: -1, copy: -1, dim: -1, resolve: -1,
    };
    let copyOn = '';

    const measure = (): Geometry | null => {
      const host = root.getBoundingClientRect();
      const planeBox = plane.getBoundingClientRect();
      if (host.width === 0 || host.height === 0 || planeBox.width === 0) return null;
      return {
        columns: renderColumns,
        tileWidth: planeBox.width / renderColumns,
        tileHeight: planeBox.height / rows,
        planeWidth: planeBox.width,
        planeHeight: planeBox.height,
        planeLeft: planeBox.left - host.left,
        planeTop: planeBox.top - host.top,
        hostWidth: host.width,
        hostHeight: host.height,
        ratio: section && window.innerHeight > 0
          ? section.getBoundingClientRect().height / window.innerHeight
          : 0,
        travelX: planeBox.width * (phone ? PHONE_TRAVEL_X : TRAVEL_X),
        travelY: planeBox.height * (phone ? PHONE_TRAVEL_Y : TRAVEL_Y),
      };
    };

    /**
     * `unwrap-to-lattice` — the cylinder's front slot becomes a tile.
     *
     * `TransformationGallery` publishes the front card's viewport rect as
     * `data-front-slot="x,y,w,h"` on its passage (read-only here; Step 23c owns
     * that file). `Flip.fit(..., { getVars: true })` turns that rect into the
     * transform that would put this tile exactly there, and the tween from it
     * back to identity is scrubbed by the unwrap phase. With no cylinder —
     * phone, or a gallery that never admitted the passage — the fallback rect
     * is a centred card of the same proportion, which is the storyboard's
     * "crossfade to the grid" read as a movement rather than a cut.
     */
    const buildUnwrap = () => {
      unwrapTween?.kill();
      unwrapTween = null;
      if (!leadFit) return;
      gsap.set(leadFit, { clearProps: 'all' });
      const published = document.querySelector<HTMLElement>('[data-front-slot]')?.dataset.frontSlot;
      const parts = published?.split(',').map(Number) ?? [];
      const slot = parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0
        ? { left: parts[0], top: parts[1], width: parts[2], height: parts[3] }
        : (() => {
          const width = Math.min(window.innerWidth * 0.52, 420);
          const height = width * 0.625;
          return {
            left: (window.innerWidth - width) / 2,
            top: (window.innerHeight - height) / 2,
            width,
            height,
          };
        })();
      // `Flip.fit` fits one element to ANOTHER ELEMENT (or a `FlipState`) — it
      // calls `getBoundingClientRect()` on whatever it is handed, so a plain
      // rect throws. The published front slot is a rect, not a node, so it gets
      // a node: a fixed, empty, zero-cost stand-in at exactly those
      // coordinates, measured once and removed in the same frame. `position:
      // fixed` keeps it out of flow, so it cannot move a pixel of the page.
      const ghost = document.createElement('div');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.cssText = `position:fixed;pointer-events:none;opacity:0;`
        + `left:${slot.left}px;top:${slot.top}px;width:${slot.width}px;height:${slot.height}px;`;
      document.body.appendChild(ghost);
      let vars: gsap.TweenVars | null = null;
      try {
        vars = Flip.fit(leadFit, ghost, { scale: true, getVars: true }) as gsap.TweenVars | null;
      } finally {
        ghost.remove();
      }
      if (!vars) return;
      unwrapTween = gsap.fromTo(
        leadFit,
        { x: vars.x ?? 0, y: vars.y ?? 0, scaleX: vars.scaleX ?? 1, scaleY: vars.scaleY ?? 1 },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, ease: 'none', paused: true, duration: 1, immediateRender: false },
      );
      unwrapTween.progress(1);
    };

    /**
     * `tile-resolve` — the Flip the vocabulary asks for, scrubbed rather than
     * played.
     *
     * `Flip.getState` records the tile where the drift parked it (the inline
     * `translate3d` this loop wrote is part of that rect, which is why it is
     * captured before the transform is cleared). `is-resolving` then puts the
     * tile at `inset: 0` inside the host — whose rect is the viewport's for the
     * whole stuck window — and `Flip.from(..., { absolute: true })` is driven by
     * `resolveProgress`. At progress 1 the tile carries no transform at all, so
     * its rect IS the host's rect, which is what lets the gate ask for
     * sub-pixel agreement with the viewport.
     */
    const enterResolve = () => {
      if (resolving || !resolveNode) return;
      resolving = true;
      const state = Flip.getState(resolveNode);
      resolveNode.style.transform = '';
      resolveNode.classList.add('is-resolving');
      resolveTimeline = Flip.from(state, {
        absolute: true,
        // Flip's default animates `width`/`height`, and a visible element
        // resized frame by frame IS a layout shift; this one flight would spend
        // the act's whole 0.02 budget many times over. `scale: true` puts the
        // tile in its final box in one frame and carries it there on a
        // compensating transform, and transform-only movement is excluded from
        // layout-shift scoring. It also keeps the final cover crop for the
        // whole flight instead of re-cropping every frame.
        scale: true,
        ease: 'none',
        duration: 1,
        paused: true,
      }) as gsap.core.Timeline;
      resolveTimeline.progress(0);
    };

    const leaveResolve = () => {
      if (!resolving || !resolveNode) return;
      resolving = false;
      resolveTimeline?.progress(0);
      resolveTimeline?.kill();
      resolveTimeline = null;
      resolveNode.classList.remove('is-resolving');
      gsap.set(resolveNode, { clearProps: 'all' });
      // ...and then put React's own custom properties back. See the note on
      // `resolveBaseStyle`.
      if (resolveBaseStyle) resolveNode.setAttribute('style', resolveBaseStyle);
      else resolveNode.removeAttribute('style');
      lastX[renderResolve] = Number.NaN;
      lastY[renderResolve] = Number.NaN;
    };

    const setVar = (name: 'enter' | 'copy' | 'dim' | 'resolve', value: number) => {
      const rounded = Math.round(value * 1000) / 1000;
      if (written[name] === rounded) return;
      written[name] = rounded;
      root.style.setProperty(`--al-${name}`, String(rounded));
    };

    const paint = () => {
      if (!geometry) {
        geometry = measure();
        if (geometry) publishResolveFrame(geometry);
      }
      const box = geometry;
      if (!box) return;
      // The act's own progress, straight off its own section: 0 the frame the host
      // sticks, 1 the frame it lets go. (The homepage no longer runs the director.)
      const rect = section?.getBoundingClientRect();
      const t = rect ? clamp01(-rect.top / Math.max(1, rect.height - window.innerHeight)) : 0;
      // The approach: 0 as the section's top enters at the bottom of the screen, 1 the
      // frame it sticks. The wall assembles over it, so it never arrives as blank paper.
      const approach = rect ? clamp01(1 - rect.top / Math.max(1, window.innerHeight)) : 1;

      const entered = smooth(approach);
      setVar('enter', entered);
      unwrapTween?.progress(entered);

      const copy = copyProgress(t);
      setVar('copy', copy);
      const next = copy > 0.015 ? 'on' : 'off';
      if (copyOn !== next) {
        copyOn = next;
        root.dataset.alCopy = next;
      }

      const resolved = RESOLVE_ENABLED ? resolveProgress(t) : 0;
      setVar('resolve', resolved);
      setVar('dim', resolved);
      if (resolved > 0) enterResolve();
      else leaveResolve();
      if (resolving) resolveTimeline?.progress(resolved);

      /* The diagonal. Frozen for the whole unwrap, the hold window and the
         resolve, so on those three stretches this loop writes nothing at all. */
      const drift = driftProgress(t);
      const homing = RESOLVE_ENABLED ? smooth(clamp01((t - (DRIFT_B_END - HOMING_SPAN)) / HOMING_SPAN)) : 0;
      const baseX = -drift * box.travelX;
      const baseY = -drift * box.travelY;
      // The scatter relaxes over the second drift: a pure translation of a wrapped
      // plane is the whole grid again, so the wall regroups while still moving on.
      const lag = t <= HOLD_END ? 1 : 1 - smooth(clamp01((t - HOLD_END) / (DRIFT_B_END - HOLD_END)));

      for (let index = 0; index < tileNodes.length; index += 1) {
        if (resolving && index === renderResolve) continue;
        const column = index % box.columns;
        const row = Math.floor(index / box.columns);
        const originX = column * box.tileWidth;
        const originY = row * box.tileHeight;
        let x = wrap(originX + baseX * (1 + row * ROW_LAG * lag), box.planeWidth) - originX;
        let y = wrap(originY + baseY * (1 + column * COLUMN_LAG * lag), box.planeHeight) - originY;

        if (index === renderResolve && homing > 0) {
          const homeX = (box.hostWidth - box.tileWidth) / 2 - box.planeLeft - originX;
          const homeY = (box.hostHeight - box.tileHeight) / 2 - box.planeTop - originY;
          // Take the wrapped representative nearest the destination, so the
          // homing ease never crosses the plane's own seam on its way in.
          if (Math.abs(x + box.planeWidth - homeX) < Math.abs(x - homeX)) x += box.planeWidth;
          else if (Math.abs(x - box.planeWidth - homeX) < Math.abs(x - homeX)) x -= box.planeWidth;
          if (Math.abs(y + box.planeHeight - homeY) < Math.abs(y - homeY)) y += box.planeHeight;
          else if (Math.abs(y - box.planeHeight - homeY) < Math.abs(y - homeY)) y -= box.planeHeight;
          x += (homeX - x) * homing;
          y += (homeY - y) * homing;
        }

        const roundedX = Math.round(x * 10) / 10;
        const roundedY = Math.round(y * 10) / 10;
        if (lastX[index] === roundedX && lastY[index] === roundedY) continue;
        lastX[index] = roundedX;
        lastY[index] = roundedY;
        tileNodes[index].style.transform = `translate3d(${roundedX}px, ${roundedY}px, 0)`;
      }
    };

    /**
     * The host's rectangle, in the plane's coordinates.
     *
     * `.al-tile` is positioned inside `.al-plane`, which is deliberately larger
     * than the host and centred on it, so the resolve tile cannot reach the
     * host with `inset: 0`. Rather than give the CSS a second measurement of
     * its own, the one `measure()` already takes is published as four custom
     * properties and `archive-lattice.css` reads them.
     */
    const publishResolveFrame = (box: Geometry) => {
      root.style.setProperty('--al-res-x', `${-box.planeLeft}px`);
      root.style.setProperty('--al-res-y', `${-box.planeTop}px`);
      root.style.setProperty('--al-res-w', `${box.hostWidth}px`);
      root.style.setProperty('--al-res-h', `${box.hostHeight}px`);
    };

    const remeasure = () => {
      leaveResolve();
      geometry = measure();
      if (geometry) publishResolveFrame(geometry);
      lastX.fill(Number.NaN);
      lastY.fill(Number.NaN);
      buildUnwrap();
      paint();
    };

    remeasure();
    // One rAF-throttled scroll listener. Lenis drives the window's own scroll, so this
    // fires for wheel, touch, keyboard and anchor jumps alike.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; paint(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    const unsubscribe = () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
    window.addEventListener('resize', remeasure, { passive: true });
    window.addEventListener('orientationchange', remeasure, { passive: true });
    void document.fonts?.ready.then(remeasure);

    return onRouteTeardown(() => {
      unsubscribe();
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('orientationchange', remeasure);
      unwrapTween?.kill();
      leaveResolve();
      tileNodes.forEach((node) => { node.style.transform = ''; });
      if (leadFit) gsap.set(leadFit, { clearProps: 'all' });
      root.removeAttribute('data-al-copy');
      (['enter', 'copy', 'dim', 'resolve', 'res-x', 'res-y', 'res-w', 'res-h'] as const)
        .forEach((name) => root.style.removeProperty(`--al-${name}`));
    });
  }, [hydrated, phone, renderColumns, renderLead, renderResolve, rendered.length, rows, still]);

  return <div
    className="al"
    ref={rootRef}
    data-archive-lattice
    data-al-copy="on"
    style={{ '--al-cols': renderColumns, '--al-rows': rows } as CSSProperties}
  >
    <ul
      className="al-plane"
      ref={planeRef}
      role="list"
      aria-label={`A grid of ${photoCount} photographs from the Final Finish project archive.`}
    >
      {rendered.map((tile, index) => {
        const isResolve = RESOLVE_ENABLED && index === renderResolve;
        return <li
          key={tile.id}
          className={isResolve ? 'al-tile al-tile--resolve' : 'al-tile'}
          data-al-index={index}
          style={{
            '--al-c': index % renderColumns,
            '--al-r': Math.floor(index / renderColumns),
            '--al-d': tileDelay(index, renderColumns, rows, renderLead).toFixed(3),
            // Full strength. A single photograph carries no before/after pairing claim,
            // so it publishes without Denis's pairing approval (the Step 11 rule);
            // only pairings wait for him. `approvalRequired` still travels with the
            // tile for the day a caption is added.
            '--al-alpha': 1,
          } as CSSProperties}
        >
          <figure className="al-tile__fit">
            <span className="al-tile__in">
              <img
                className="al-tile__thumb"
                src={tile.thumbnail}
                alt={tileAlt(index, photoCount)}
                loading={index < renderColumns ? 'eager' : 'lazy'}
                fetchPriority={index < renderColumns ? 'low' : undefined}
                decoding="async"
                draggable={false}
              />
              {/* Every rung is the full-resolution photograph, phone included.
                  A phone-only thumbnail rung was tried and measured: at full
                  bleed on a 3x screen the 640 px thumbnail is visibly soft and
                  noisy, and the ~600 KB AVIF it saves is not arrival weight —
                  this plate is `loading="lazy"` twenty viewports down, so it is
                  route transfer against a 12 MB budget, not the 0.8 MB one. */}
              {isResolve && <picture className="al-tile__full">
                <source srcSet={resolve.avif} type="image/avif" />
                <source srcSet={resolve.webp} type="image/webp" />
                <img
                  src={resolve.jpeg}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  width={resolve.width}
                  height={resolve.height}
                  draggable={false}
                />
              </picture>}
            </span>
            {isResolve && <figcaption className="al-tile__caption">
              Finished floor. Final Finish project archive.
            </figcaption>}
          </figure>
        </li>;
      })}
    </ul>

    <div className="al-copy">
      <p className="al-copy__eyebrow">Real Edmonton floors</p>
      <h2 className="al-copy__title" id="archive-title">Explore our work.</h2>
      {/* `al-copy__link`, not `chapter-link`: `intent-motion.ts` appends a child
          to every `.journey a.chapter-link` at load, and React throws away a tree
          that meets a child it never rendered (React #418). Matt, 2026-09-22:
          the fuller body of work lives on the Facebook page, so that is the link. */}
      <a className="al-copy__link al-copy__link--primary" href={FACEBOOK_URL} rel="me noopener" target="_blank">
        {'Find us on Facebook '}<span aria-hidden="true">↗</span>
      </a>
      <a className="al-copy__link al-copy__link--quiet" href="/projects">
        {`Or browse ${jobCount} projects here`}
      </a>
    </div>
  </div>;
}

/* -------------------------------------------------------------------------- */
/* THE FLYOVER HOOK — `lattice-flyover`, not built in this step                 */
/* -------------------------------------------------------------------------- */
/**
 * `MOTION-VOCABULARY.md` lists `lattice-flyover` (camera pitch 0 → 55°, diagonal
 * drift over the 12 × 8 photograph plane, per-tile `y` ripple ≤ 0.004) against
 * this file as a `full`-tier enhancement. It is deliberately NOT implemented
 * here and the id is therefore NOT tagged above: that row still reads
 * `planned`, which is the truth.
 *
 * What a later step needs, and what is already in place for it:
 *
 *  - The texture. `public/images/projects/atlas/archive-atlas-2048.webp`
 *    (1920 × 960, 288 KB) plus `archive-atlas.json`, whose every tile record
 *    carries a GL-convention `uv {u,v,w,h}` (origin bottom-left, drops straight
 *    into `Texture.offset`/`repeat`) at the same `sourcePageOrder` index this
 *    component lays out. Tile `n` here is tile `n` there by construction —
 *    `src/data/archive-lattice.ts` sorts on the key the atlas was cut on.
 *  - The canvas. `surfaceStore.registerView('archive-lattice', element,
 *    { render, priority })` against `[data-archive-lattice]`, exactly as
 *    `FilmVeil` (priority 0) and `SurfaceFloor` (10) do. Pick a priority above
 *    10 so the plane paints over the floor band, and unregister on teardown —
 *    it is a page view, so `unregisterPageViews` already covers a navigation.
 *  - The clock. `actProgress`, `driftProgress` and `resolveProgress` above are
 *    exported for that reason: the flyover must read the same remapped act
 *    progress and the same phase map this DOM layer does, or the two layers
 *    would disagree about where the hold window is.
 *  - The material. `surface-store.ts` puts `archive` at state 4 *photograph*
 *    and at `SURFACE_PRESENCE.reflection`; a flyover that paints the picture
 *    itself is the one reason to lift that presence, and that is the single
 *    line in that file the enhancement is expected to change.
 *
 * The DOM tiles stay the accessible layer either way: the flyover draws over
 * them, it never replaces them.
 */
