import gsap from 'gsap';
import { ensureGsapKit, Flip } from '../../lib/motion/gsap-kit';
import { journeyControls } from '../../lib/motion/journey-controls';
import {
  NAV_MENU_FINISH_EVENT,
  NAV_MENU_STATE_EVENT,
  isFloorFinishKey,
  type FloorFinishKey,
  type NavMenuFinishDetail,
  type NavMenuStateDetail,
} from './nav-destinations';

/**
 * The full-screen navigation.
 *
 * The header's own `<nav id="primary-navigation">` is the menu — on open it is
 * physically moved into the overlay panel and Flip animates the six links from
 * their header geometry into a numbered vertical list; on close the same move
 * runs in reverse. One element, one owner, one set of links, so there is never a
 * second copy of the navigation to keep in sync.
 *
 * Two details keep layout shift at zero:
 *  - a `.nav-slot` placeholder frozen to the nav's measured box holds the
 *    header's grid column open while the nav is away;
 *  - the flight is transform-only (see FLIP_VARS), and every box in the menu row
 *    is sized by CSS, so no element changes size when the state changes.
 */

/**
 * Flip runs on each link's label span, not on the <a>, and with `scale: true`.
 * Both states hold the same text at the same line-height, so the measured boxes
 * are proportional and the scale stays uniform — and because the whole flight is
 * a transform, the browser reports no layout shift for it. Animating width,
 * height or fontSize instead would register a shift on every frame.
 *
 * `absolute` is deliberately off, against the brief's default. Every box around
 * a label — the <li> row, the <a>, the grid track — is sized by CSS, so lifting
 * the label out of flow displaces nothing; and `absolute: true` costs a second
 * forced reflow inside Flip.from, measured at 65-185 ms of the open transition
 * under CPU x4. In flow, the flight is transforms only.
 */
const FLIP_VARS = { absolute: false, scale: true, ease: 'power3.inOut' } as const;
const FOCUSABLE ='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface InertRecord {
  readonly element: HTMLElement;
  readonly hadInert: boolean;
  readonly ariaHidden: string | null;
}

type FlipState = ReturnType<typeof Flip.getState>;

function dispatchState(open: boolean, settled: boolean) {
  window.dispatchEvent(new CustomEvent<NavMenuStateDetail>(NAV_MENU_STATE_EVENT, { detail: { open, settled } }));
}

function dispatchFinish(finish: FloorFinishKey | null) {
  window.dispatchEvent(new CustomEvent<NavMenuFinishDetail>(NAV_MENU_FINISH_EVENT, { detail: { finish } }));
}

export function initializeNavMenu(header: HTMLElement, toggle: HTMLButtonElement, navigation: HTMLElement) {
  const overlay = document.querySelector<HTMLElement>('[data-nav-menu]');
  const listHost = overlay?.querySelector<HTMLElement>('[data-nav-menu-list]') ?? null;
  if (!overlay || !listHost) return () => {};

  ensureGsapKit();
  journeyControls.hydrate();

  const veil = overlay.querySelector<HTMLElement>('[data-nav-menu-veil]');
  const floor = overlay.querySelector<HTMLElement>('[data-nav-menu-floor]');
  const meta = overlay.querySelector<HTMLElement>('[data-nav-menu-meta]');
  const spine = overlay.querySelector<SVGLineElement>('[data-nav-menu-spine]');
  const panel = overlay.querySelector<HTMLElement>('[data-nav-menu-panel]');
  const list = navigation.querySelector<HTMLElement>('ul');
  const links = [...navigation.querySelectorAll<HTMLAnchorElement>('a')];
  const labels = [...navigation.querySelectorAll<HTMLElement>('[data-nav-flip]')];
  const indices = [...navigation.querySelectorAll<HTMLElement>('[data-nav-index]')];
  const stations = [...navigation.querySelectorAll<HTMLElement>('[data-nav-station]')];
  const dots = [...navigation.querySelectorAll<HTMLElement>('[data-nav-dot]')];
  if (!list || links.length === 0) return () => {};

  const abort = new AbortController();
  const { signal } = abort;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Below 1100px readable-experience.css collapses the inline nav, so the links
  // start stacked behind the toggle instead of laid out across the header.
  const compact = matchMedia('(max-width: 1100px)');
  const root = document.documentElement;

  const slot = document.createElement('span');
  slot.className = 'nav-slot';
  slot.setAttribute('aria-hidden', 'true');

  let open = false;
  let transition: gsap.core.Timeline | null = null;
  let inertRecords: InertRecord[] = [];
  let parallaxFrame = 0;

  /** The animated branch only exists while the OS allows motion. */
  const media = gsap.matchMedia();
  let motionAllowed = false;
  media.add('(prefers-reduced-motion: no-preference)', () => {
    motionAllowed = true;
    return () => {
      motionAllowed = false;
    };
  });

  const stillTier = () =>
    root.dataset.journeyTier === 'still'
    || root.dataset.journeyMotion === 'still'
    || journeyControls.getSnapshot().motionPreference === 'still';
  const choreographed = () => motionAllowed && !reduced.matches && !stillTier();

  /* ---------------------------------------------------------------- layout */

  /**
   * The header's nav column has to keep its width while the nav itself is away,
   * or the brand and the CTA slide — a layout shift on every open. Measured in
   * the read phase, written in the write phase, never interleaved.
   */
  const measureNavBox = () => (compact.matches ? null : navigation.getBoundingClientRect());
  const reserveHeaderSlot = (box: DOMRect | null) => {
    // Below 1100px the closed nav is absolutely positioned, so it reserves
    // nothing and the slot must reserve nothing either.
    slot.style.width = box ? `${box.width}px` : '0px';
    slot.style.height = box ? `${box.height}px` : '0px';
    navigation.before(slot);
  };

  /**
   * Killing a Flip mid-flight leaves its targets absolutely positioned with
   * inline geometry, so a rapid open/close/open has to wipe that first —
   * otherwise the next `Flip.getState` measures a half-finished layout.
   */
  const settleFlip = () => {
    transition?.kill();
    transition = null;
    gsap.set(labels, { clearProps: 'position,left,top,width,height,transform,opacity' });
    header.removeAttribute('data-menu-closing');
  };

  /**
   * One idle pass so the first open is not also the first time the browser
   * shapes Manrope at display size or the first time Flip runs. Measured: the
   * first opens on a cold page were the slow ones, not the later ones.
   */
  const warmMenuLayout = () => {
    if (open) return;
    // The whole open/close move, invisibly, inside one task: the browser never
    // paints an intermediate state, so there is no flash and no layout shift —
    // but Manrope gets shaped at display size, the menu's style rules resolve,
    // and Flip initialises. Without it the first open measured 330-410 ms and
    // every later one 105-200 ms.
    overlay.setAttribute('data-nav-warm', '');
    overlay.hidden = false;
    reserveHeaderSlot(measureNavBox());
    listHost.appendChild(navigation);
    void listHost.offsetHeight;
    Flip.getState(labels);
    slot.replaceWith(navigation);
    overlay.hidden = true;
    overlay.removeAttribute('data-nav-warm');
  };
  const scheduleWarmUp = () => {
    const run = () => { try { warmMenuLayout(); } catch { /* warm-up is best effort */ } };
    // `timeout` matters: on a page that is still hydrating, a plain idle callback
    // can wait seconds, which is exactly the window in which someone opens the
    // menu for the first time.
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 800 });
    else window.setTimeout(run, 400);
  };
  // Shaping display type against a fallback face would warm the wrong metrics.
  void (document.fonts?.ready ?? Promise.resolve()).then(scheduleWarmUp).catch(scheduleWarmUp);

  /* ------------------------------------------------------------------ a11y */

  /** Fixed controls that sit above the overlay's z-index. */
  const VEILED = '.journey-motion-control, .journey-rail, .shop-sound, .threshold-study-note';
  const veilFloatingControls = (veiled: boolean) => {
    document.querySelectorAll<HTMLElement>(VEILED).forEach((element) => {
      element.toggleAttribute('data-menu-veiled', veiled);
    });
  };

  const applyInert = () => {
    inertRecords = [...document.body.children]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== header && element !== overlay)
      .map((element) => {
        const record: InertRecord = { element, hadInert: element.inert, ariaHidden: element.getAttribute('aria-hidden') };
        element.inert = true;
        element.setAttribute('aria-hidden', 'true');
        return record;
      });
  };

  const releaseInert = () => {
    inertRecords.forEach(({ element, hadInert, ariaHidden }) => {
      element.inert = hadInert;
      if (ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', ariaHidden);
    });
    inertRecords = [];
  };

  const trapOrder = () => [
    ...header.querySelectorAll<HTMLElement>(FOCUSABLE),
    ...overlay.querySelectorAll<HTMLElement>(FOCUSABLE),
  ].filter((element) => element.offsetParent !== null || element === toggle);

  const onKeydown = (event: KeyboardEvent) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ restoreFocus: true });
      return;
    }
    if (event.key === 'Tab') {
      const order = trapOrder();
      if (order.length === 0) return;
      const current = order.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const next = current === -1 ? (event.shiftKey ? order.length - 1 : 0) : (current + step + order.length) % order.length;
      event.preventDefault();
      order[next]?.focus();
      return;
    }
    if (!links.includes(document.activeElement as HTMLAnchorElement)) return;
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    let next = -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % links.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (current - 1 + links.length) % links.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = links.length - 1;
    if (next === -1) return;
    event.preventDefault();
    links[next]?.focus();
  };

  /* ------------------------------------------------------------- the floor */

  let activeFinish: FloorFinishKey | null = null;
  const setFinish = (finish: FloorFinishKey | null) => {
    if (!open || finish === activeFinish) return;
    activeFinish = finish;
    overlay.dataset.navFinish = finish ?? 'idle';
    dispatchFinish(finish);
  };

  const finishOf = (link: HTMLAnchorElement): FloorFinishKey | null => {
    const value = link.dataset.navFinish;
    return isFloorFinishKey(value) ? value : null;
  };

  links.forEach((link) => {
    link.addEventListener('pointerenter', () => setFinish(finishOf(link)), { signal });
    link.addEventListener('focus', () => setFinish(finishOf(link)), { signal });
  });
  listHost.addEventListener('pointerleave', () => setFinish(null), { signal });

  /* ---------------------------------------------------------- list parallax */

  const parallax = { x: 0, y: 0 };
  const writeParallax = () => {
    panel?.style.setProperty('--nav-parallax-x', `${parallax.x.toFixed(2)}px`);
    panel?.style.setProperty('--nav-parallax-y', `${parallax.y.toFixed(2)}px`);
  };
  const parallaxX = gsap.quickTo(parallax, 'x', { duration: 0.7, ease: 'power3.out', onUpdate: writeParallax });
  const parallaxY = gsap.quickTo(parallax, 'y', { duration: 0.7, ease: 'power3.out', onUpdate: writeParallax });
  const onPointerMove = (event: PointerEvent) => {
    if (!open || !choreographed() || parallaxFrame) return;
    parallaxFrame = requestAnimationFrame(() => {
      parallaxFrame = 0;
      // Hard cap: 8px at depth 1.
      parallaxX((event.clientX / innerWidth - 0.5) * 16);
      parallaxY((event.clientY / innerHeight - 0.5) * 12);
    });
  };
  const resetParallax = () => {
    if (parallaxFrame) cancelAnimationFrame(parallaxFrame);
    parallaxFrame = 0;
    gsap.killTweensOf(parallax);
    parallax.x = 0;
    parallax.y = 0;
    writeParallax();
  };

  /* --------------------------------------------------------- open sequence */

  const setToggleState = (isOpen: boolean) => {
    toggle.setAttribute('aria-expanded', String(isOpen));
    const label = toggle.querySelector('.sr-only');
    if (label) label.textContent = isOpen ? 'Close primary menu' : 'Open primary menu';
  };

  const buildOpenTimeline = (state: FlipState) => {
    const timeline = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        transition = null;
        dispatchState(true, true);
      },
    });
    if (veil) {
      timeline.fromTo(veil, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.62, ease: 'power3.inOut' }, 0);
    }
    if (floor) timeline.fromTo(floor, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power2.out' }, 0.08);
    timeline.add(Flip.from(state, { ...FLIP_VARS, duration: 0.7, stagger: 0.04 }), 0.06);
    if (compact.matches) {
      // On phones the six links start stacked behind the toggle, so they need to
      // arrive rather than simply travel.
      timeline.fromTo(labels, { opacity: 0 }, { opacity: 1, duration: 0.45, stagger: 0.04, overwrite: false }, 0.06);
    }
    if (spine) timeline.fromTo(spine, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: 0.9, ease: 'power2.inOut' }, 0.12);
    if (indices.length) timeline.fromTo(indices, { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.55, stagger: 0.04 }, 0.4);
    if (stations.length) timeline.fromTo(stations, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.04 }, 0.45);
    if (dots.length) timeline.fromTo(dots, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, stagger: 0.04, ease: 'back.out(2.4)' }, 0.48);
    if (meta) timeline.fromTo(meta, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.6 }, 0.5);
    return timeline;
  };

  const buildCloseTimeline = (state: FlipState) => {
    const timeline = gsap.timeline({
      defaults: { ease: 'power2.in' },
      onComplete: () => {
        gsap.set(labels, { clearProps: 'opacity' });
        header.removeAttribute('data-menu-closing');
        overlay.hidden = true;
        transition = null;
        dispatchState(false, true);
      },
    });
    timeline.add(Flip.from(state, { ...FLIP_VARS, duration: 0.52, stagger: { each: 0.03, from: 'end' } }), 0);
    if (compact.matches) timeline.to(labels, { opacity: 0, duration: 0.34 }, 0.16);
    const chrome = [veil, floor, meta].filter((element): element is HTMLElement => element instanceof HTMLElement);
    if (chrome.length) timeline.to(chrome, { opacity: 0, duration: 0.42, ease: 'power2.inOut' }, 0.1);
    return timeline;
  };

  // Arrow consts, not hoisted declarations: TypeScript does not carry the
  // `if (!overlay || !listHost) return` narrowing into a hoisted function body.
  const openMenu = () => {
    if (open) return;
    open = true;
    settleFlip();

    // Read phase: the document is still clean, so these measurements are free.
    const animate = choreographed();
    const state = animate ? Flip.getState(labels) : null;
    const navBox = measureNavBox();

    // Write phase: nothing below reads layout, so the browser reflows once, when
    // Flip.from measures the final state.
    overlay.hidden = false;
    setToggleState(true);
    header.setAttribute('data-menu-open', '');
    root.setAttribute('data-menu-open', '');
    reserveHeaderSlot(navBox);
    listHost.appendChild(navigation);
    applyInert();
    veilFloatingControls(true);
    resetParallax();

    if (!state) {
      gsap.set([veil, floor, meta].filter(Boolean), { clearProps: 'opacity,clipPath' });
      dispatchState(true, true);
      links[0]?.focus({ preventScroll: true });
      return;
    }
    transition = buildOpenTimeline(state);
    dispatchState(true, false);
    // One frame later: focusing forces another style/layout pass, and the first
    // painted frame of the transition matters more than 16 ms of focus latency.
    requestAnimationFrame(() => {
      if (open) links[0]?.focus({ preventScroll: true });
    });
  };

  const close = ({ restoreFocus }: { restoreFocus: boolean }) => {
    if (!open) return;
    open = false;
    settleFlip();
    resetParallax();
    setFinish(null);
    activeFinish = null;
    overlay.dataset.navFinish = 'idle';

    const animate = choreographed();
    const state = animate ? Flip.getState(labels) : null;

    setToggleState(false);
    header.removeAttribute('data-menu-open');
    root.removeAttribute('data-menu-open');
    if (animate) header.setAttribute('data-menu-closing', '');
    slot.replaceWith(navigation);
    releaseInert();
    veilFloatingControls(false);

    if (!state) {
      overlay.hidden = true;
      dispatchState(false, true);
      if (restoreFocus) toggle.focus({ preventScroll: true });
      return;
    }
    transition = buildCloseTimeline(state);
    dispatchState(false, false);
    if (restoreFocus) toggle.focus({ preventScroll: true });
  };

  /* ---------------------------------------------------------------- wiring */

  toggle.addEventListener('click', () => (open ? close({ restoreFocus: true }) : openMenu()), { signal });
  document.addEventListener('keydown', onKeydown, { signal });
  overlay.addEventListener('pointermove', onPointerMove, { signal });
  navigation.addEventListener('click', (event) => {
    if (open && (event.target as HTMLElement).closest('a')) close({ restoreFocus: false });
  }, { signal });
  // Replaces the old "click anywhere outside the header closes it" behaviour:
  // the paper field is now that outside.
  overlay.addEventListener('click', (event) => {
    if (open && !(event.target as HTMLElement).closest('a')) close({ restoreFocus: true });
  }, { signal });
  // The panel is always sized to fit, so nothing inside it scrolls; swallow the
  // gesture instead of locking <html>, which would remove the scrollbar and
  // register a layout shift.
  overlay.addEventListener('wheel', (event) => { if (open) event.preventDefault(); }, { passive: false, signal });
  overlay.addEventListener('touchmove', (event) => { if (open) event.preventDefault(); }, { passive: false, signal });
  const onViewportChange = () => { if (open) close({ restoreFocus: false }); };
  compact.addEventListener('change', onViewportChange, { signal });
  window.addEventListener('orientationchange', onViewportChange, { signal });

  return () => {
    if (open) close({ restoreFocus: false });
    abort.abort();
    media.revert();
    transition?.kill();
    resetParallax();
    releaseInert();
    veilFloatingControls(false);
  };
}
