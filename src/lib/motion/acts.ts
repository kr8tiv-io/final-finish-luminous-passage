/**
 * The homepage's one motion owner (2026-09-22 direction). See `src/styles/acts.css`.
 *
 * What it owns, and nothing else:
 *   - Lenis smooth scrolling on fine pointers (touch keeps native momentum).
 *   - Every act's timeline, read off ONE ScrollTrigger per act that spans the whole
 *     pass (`top bottom` -> `bottom top`): the approach, the hold (while the sticky
 *     stage fills the screen), and the departure.
 *   - The two mists per act (`transform` only), the plate push and drift, the room
 *     crossfade, the light across the commercial floor.
 *   - Film scrubbing and film loading (nothing loads before the first scroll intent).
 *   - The review ring.
 *   - One reveal vocabulary for the whole page: titles rise out of a line mask,
 *     everything else fades up a few pixels, statements fill from grey to ink.
 *
 * THE SEAM RULE. An act never shows a hard edge to the paper around it, and it never
 * shows a screen of blank paper either:
 *   - arriving, only the stage's top edge is mist (the entry mist parked with its soft
 *     edge inside the stage), so the film rises out of the paper above it, and the
 *     edge lifts off in the first moments of the hold;
 *   - held, a band of mist rises under the words and stays;
 *   - leaving, that band is the stage's bottom edge, so the paper after the act is the
 *     paper the words were printed on. (The hero has no band; its stage carries a
 *     fixed paper floor instead, `.act--hero .act-stage::after`.)
 * Nothing covers a whole screen, so there is no frame of dead air to scroll past.
 *
 * It replaces, on the homepage only, the fixed-plate director + WebGL compositor +
 * reading-zone washes + six transition shaders. Those produced the flicker and the
 * white lines Matt saw (a DOM wash and a WebGL plate disagreeing for a frame; a paper
 * band ending on a film). Here every mist is part of its act's own stage.
 *
 * @motion mist-lift
 * @motion mist-rise
 * @motion line-rise
 * @motion statement-fill
 * @motion room-crossfade
 * @motion film-scrub
 * @motion plate-drift
 * @motion review-ring
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { journeyControls } from './journey-controls';
import { currentJourneyTier, type JourneyTier } from './journey-tier';
import type { JourneyChapterId } from './journey-director';
import {
  SCROLL_INTENT_POINTER_PX,
  filmDecodesOnTier,
  isScrollIntentKey,
  journeyFilmTopRung,
  videoSeekTarget,
} from './journey-media';
import { onRouteTeardown } from './route-lifecycle';

gsap.registerPlugin(ScrollTrigger, SplitText);

type Teardown = () => void;
type ActKind = 'hero' | 'film' | 'bay';

/** Phases, in HELD progress: 0 the frame the stage sticks, 1 the frame it lets go. */
interface ActPhases {
  /** The misty top edge has lifted off the stage. 0 = no entry mist (the hero). */
  readonly liftEnd: number;
  /** The band of mist rises under the words. `bandStart === bandEnd` = no band. */
  readonly bandStart: number;
  readonly bandEnd: number;
  /** Room crossfade (two-room acts only). */
  readonly switchStart: number;
  readonly switchEnd: number;
}

const PHASES: Readonly<Record<ActKind, ActPhases>> = Object.freeze({
  hero: { liftEnd: 0, bandStart: 0, bandEnd: 0, switchStart: 1, switchEnd: 1 },
  film: { liftEnd: 0.08, bandStart: 0.08, bandEnd: 0.26, switchStart: 1, switchEnd: 1 },
  bay: { liftEnd: 0.06, bandStart: 0.05, bandEnd: 0.18, switchStart: 0.44, switchEnd: 0.6 },
});

/** How many cards the review ring turns through across its held scroll. */
const RING_SCROLL_CARDS = 9;

interface Film {
  readonly video: HTMLVideoElement;
  readonly chapter: JourneyChapterId;
  readonly from: number;
  readonly to: number;
  readonly walk: boolean;
  /** `held`: the film runs on the hold only. `pass` (default): approach + hold. */
  readonly clock: 'held' | 'pass';
  requested: boolean;
  pending: boolean;
}

interface Act {
  readonly el: HTMLElement;
  readonly stage: HTMLElement;
  readonly kind: ActKind;
  readonly phases: ActPhases;
  readonly fogIn: HTMLElement | null;
  readonly fogRise: HTMLElement | null;
  readonly frames: HTMLElement[];
  readonly copy: HTMLElement | null;
  readonly captions: HTMLElement[];
  readonly films: Film[];
  /** Scale the plate reaches by the end of the hold. */
  readonly push: number;
  /** Horizontal drift of the plate across the act, in percent of its width. */
  readonly pan: number;
  readonly sheen: HTMLElement | null;
  /** Stage height, mist edge height, act height, viewport height (px). */
  H: number;
  E: number;
  S: number;
  V: number;
  /** Where the band's solid paper begins, and the words it carries (stage px). */
  bandTop: number;
  copyTop: number;
  copyH: number;
  /** The last scroll offset into the pass that was rendered. */
  s: number;
  near: boolean;
  entered: boolean;
  trigger?: ScrollTrigger;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (p: number, a: number, b: number) => (b <= a ? (p >= b ? 1 : 0) : clamp01((p - a) / (b - a)));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const setY = (el: HTMLElement | null, y: number) => { if (el) el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`; };

const saveData = () => Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

export function initActs(): Teardown | undefined {
  const root = document.querySelector<HTMLElement>('[data-acts]');
  if (!root) return undefined;

  journeyControls.hydrate();
  const html = document.documentElement;
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');
  let tier: JourneyTier = 'full';
  let lenis: Lenis | null = null;
  let tickerFn: ((time: number) => void) | null = null;
  let scrollIntent = false;
  const cleanups: Teardown[] = [];
  let motionCleanups: Teardown[] = [];

  /* ── Acts ────────────────────────────────────────────────────────────────── */
  const acts: Act[] = [...root.querySelectorAll<HTMLElement>('[data-act]')].map((el) => {
    const kind = (el.dataset.act as ActKind) ?? 'film';
    const stage = el.querySelector<HTMLElement>('.act-stage')!;
    const films: Film[] = [...el.querySelectorAll<HTMLVideoElement>('video[data-film]')].map((video) => {
      const [from, to] = (video.dataset.filmWindow ?? '0,1').split(',').map(Number);
      return {
        video,
        chapter: video.dataset.film as JourneyChapterId,
        from,
        to,
        walk: video.dataset.filmWalk === 'true',
        clock: video.dataset.filmClock === 'held' || kind === 'hero' ? 'held' : 'pass',
        requested: false,
        pending: false,
      };
    });
    return {
      el,
      stage,
      kind,
      phases: PHASES[kind],
      fogIn: el.querySelector<HTMLElement>('.act-fog--in'),
      fogRise: el.querySelector<HTMLElement>('.act-fog--rise'),
      frames: [...el.querySelectorAll<HTMLElement>('.act-frame')],
      copy: el.querySelector<HTMLElement>('.act-copy'),
      captions: [...el.querySelectorAll<HTMLElement>('.act-caption')],
      films,
      push: Number(el.dataset.push ?? '1.06'),
      pan: Number(el.dataset.pan ?? '0'),
      sheen: el.querySelector<HTMLElement>('.act-sheen'),
      H: window.innerHeight,
      E: 0,
      S: window.innerHeight,
      V: window.innerHeight,
      bandTop: 0,
      copyTop: 0,
      copyH: 1,
      s: 0,
      near: false,
      entered: false,
    };
  });

  const measure = (act: Act) => {
    act.V = window.innerHeight;
    act.H = act.stage.offsetHeight || act.V;
    act.S = act.el.offsetHeight || act.H;
    const fog = act.fogRise ?? act.fogIn;
    act.E = fog ? Math.max(0, fog.offsetHeight - act.H) : 0;
    if (act.copy && act.kind !== 'hero') {
      act.copyTop = act.copy.offsetTop;
      act.copyH = Math.max(1, act.copy.offsetHeight);
      // The band's solid paper begins a little above the first line of the words.
      act.bandTop = Math.max(act.H * 0.12, act.copyTop - act.H * 0.07);
    } else {
      act.copyTop = act.H;
      act.copyH = 1;
      act.bandTop = act.H;
    }
  };

  /* ── Films ───────────────────────────────────────────────────────────────── */
  const promote = (film: Film) => {
    if (film.requested || !scrollIntent || tier === 'still' || saveData()) return;
    if (!filmDecodesOnTier(film.chapter, tier)) return;
    film.requested = true;
    const rung = journeyFilmTopRung(film.chapter, { viewportWidth: window.innerWidth, tier });
    const { video } = film;
    if (rung) {
      // Name the file BEFORE lifting `preload`: lifting it first starts the <source>
      // ladder's pick, and the `src` assignment would then abort that fetch halfway.
      video.src = rung;
      video.preload = 'auto';
      return;
    }
    // Chromium resumes a `preload="none"` element as soon as `preload` is lifted;
    // WebKit waits for `load()`, which is only asked for if nothing has started.
    video.preload = 'auto';
    window.setTimeout(() => {
      if (video.readyState === 0 && video.networkState !== HTMLMediaElement.NETWORK_LOADING) video.load();
    }, 160);
  };

  const seek = (film: Film, t: number) => {
    const { video } = film;
    if (video.readyState < 2 || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const fp = film.walk ? smoothstep(clamp01(t)) : clamp01(t);
    const desired = fp * Math.max(0, video.duration - 0.05);
    const target = videoSeekTarget({ currentTime: video.currentTime, desiredTime: desired, seeking: video.seeking || film.pending });
    if (target === null) return;
    film.pending = true;
    video.currentTime = target;
  };

  const wireFilm = (act: Act, film: Film) => {
    const { video } = film;
    const ready = () => {
      video.setAttribute('data-ready', '');
      // Land on the frame the scroll position asks for, not on frame 0.
      if (act.trigger) render(act, act.s);
    };
    const seeked = () => { film.pending = false; };
    video.addEventListener('loadeddata', ready);
    video.addEventListener('seeked', seeked);
    cleanups.push(() => {
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('seeked', seeked);
    });
  };
  acts.forEach((act) => act.films.forEach((film) => wireFilm(act, film)));

  /* ── Rendering one act at `s` px into its pass ───────────────────────────── */
  function render(act: Act, s: number) {
    act.s = s;
    const { phases, H, E, V } = act;
    const R = Math.max(1, act.S - H);
    /** Held progress: 0 when the stage sticks, 1 when it lets go. */
    const p = clamp01((s - V) / R);
    /** Pass progress: the approach and the hold (the departure keeps the last frame). */
    const f = act.kind === 'hero' ? p : clamp01(s / (V + R));

    // Arriving: only the top edge is mist. Held: that edge lifts off.
    if (act.fogIn) {
      const lift = phases.liftEnd > 0 ? easeInOut(span(p, 0, phases.liftEnd)) : 1;
      setY(act.fogIn, -H - E * lift);
    }

    // The band rises under the words, and the words appear as its paper reaches them.
    if (act.fogRise && phases.bandEnd > phases.bandStart) {
      const y = lerp(H, act.bandTop - E, easeInOut(span(p, phases.bandStart, phases.bandEnd)));
      setY(act.fogRise, y);
      if (act.copy) {
        // Only ever on solid paper: the words start to show once the band's solid edge
        // has passed their first line, and are fully there as the band settles.
        const reach = Math.max(1, act.copyTop - act.bandTop);
        const shown = clamp01((act.copyTop - (y + E)) / reach);
        act.copy.style.opacity = shown.toFixed(3);
        if (!act.entered && shown > 0.05) enterCopy(act);
      }
    }

    // The plate breathes forward and drifts. Rooms slide apart as they cross.
    const push = 1 + (act.push - 1) * f;
    if (act.kind === 'bay' && act.frames.length > 1) {
      const k = easeInOut(span(p, phases.switchStart, phases.switchEnd));
      act.frames[0].style.transform = `translate3d(${(-4 * k).toFixed(2)}%, 0, 0) scale(${push.toFixed(4)})`;
      act.frames[1].style.transform = `translate3d(${(4 * (1 - k)).toFixed(2)}%, 0, 0) scale(${push.toFixed(4)})`;
      act.frames[1].style.opacity = k.toFixed(3);
      if (act.captions.length > 1) {
        // One caption at a time: the first leaves before the second arrives.
        const out = easeInOut(span(k, 0, 0.45));
        const inn = easeInOut(span(k, 0.55, 1));
        act.captions[0].style.opacity = (1 - out).toFixed(3);
        act.captions[0].style.transform = `translate3d(0, ${(-12 * out).toFixed(1)}px, 0)`;
        act.captions[1].style.opacity = inn.toFixed(3);
        act.captions[1].style.transform = `translate3d(0, ${(12 * (1 - inn)).toFixed(1)}px, 0)`;
      }
    } else {
      const x = act.pan * (0.5 - f);
      act.frames.forEach((frame) => {
        frame.style.transform = `translate3d(${x.toFixed(3)}%, 0, 0) scale(${push.toFixed(4)})`;
      });
    }
    // A band of light crossing the floor, as a lamp would across a gloss coat.
    if (act.sheen) {
      const x = lerp(-70, 70, easeInOut(span(f, 0.1, 0.95)));
      act.sheen.style.transform = `translate3d(${x.toFixed(2)}%, 0, 0)`;
    }

    if (tier !== 'still') {
      act.films.forEach((film) => seek(film, span(film.clock === 'held' ? p : f, film.from, film.to)));
    }
  }

  /* ── Reveals: one vocabulary ─────────────────────────────────────────────── */
  const splits: SplitText[] = [];
  const titleRise = (title: HTMLElement, delay = 0) => {
    const split = SplitText.create(title, {
      type: 'lines',
      mask: 'lines',
      linesClass: 't-line',
      aria: 'auto',
      autoSplit: true,
      onSplit: (self) => gsap.fromTo(self.lines, { yPercent: 105 }, {
        yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.085, delay, clearProps: 'transform',
      }),
    });
    splits.push(split);
  };
  const fadeRise = (els: Element[], delay = 0) => {
    if (!els.length) return;
    gsap.fromTo(els, { opacity: 0, y: 14 }, {
      opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.07, delay, clearProps: 'transform,opacity',
    });
  };

  function enterCopy(act: Act) {
    act.entered = true;
    if (!act.copy || tier === 'still') return;
    const titles = [...act.copy.querySelectorAll<HTMLElement>('.t-title, .t-display')];
    titles.forEach((title) => titleRise(title));
    fadeRise([...act.copy.querySelectorAll('.t-kicker, .t-sub, .t-body, .button-row, .act-captions, .hero-proof')], 0.18);
  }

  const buildPaperReveals = () => {
    const triggers: ScrollTrigger[] = [];
    root.querySelectorAll<HTMLElement>('[data-reveal="title"]').forEach((title) => {
      triggers.push(ScrollTrigger.create({ trigger: title, start: 'top 86%', once: true, onEnter: () => titleRise(title) }));
    });
    root.querySelectorAll<HTMLElement>('[data-reveal="fade"]').forEach((el) => {
      gsap.set(el, { opacity: 0, y: 14 });
      triggers.push(ScrollTrigger.create({
        trigger: el,
        start: 'top 90%',
        once: true,
        onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', clearProps: 'transform,opacity' }),
      }));
    });
    // Statements fill from a pale grey to ink as they cross the reading line.
    root.querySelectorAll<HTMLElement>('[data-reveal="fill"]').forEach((el) => {
      const split = SplitText.create(el, { type: 'lines', linesClass: 't-fill-line', aria: 'auto', autoSplit: true,
        onSplit: (self) => gsap.fromTo(self.lines, { color: 'rgb(23 34 42 / 0.2)' }, {
          color: 'rgb(23 34 42 / 1)', ease: 'none', stagger: 0.6,
          scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 48%', scrub: 0.6 },
        }),
      });
      splits.push(split);
    });
    // Photographs on paper open from the bottom edge and settle out of a slight zoom.
    root.querySelectorAll<HTMLElement>('[data-reveal="media"]').forEach((el) => {
      const img = el.querySelector('img');
      gsap.set(el, { clipPath: 'inset(14% 0% 0% 0%)' });
      if (img) gsap.set(img, { scale: 1.1 });
      triggers.push(ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: () => {
          gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.out', clearProps: 'clipPath' });
          if (img) gsap.to(img, { scale: 1, duration: 1.6, ease: 'expo.out', clearProps: 'transform' });
        },
      }));
    });
    return () => triggers.forEach((t) => t.kill());
  };

  /* ── The review ring ─────────────────────────────────────────────────────── */
  /**
   * Seventeen cards on a CSS cylinder (jh3y's construction: each cell is turned by
   * `i * step` and pushed out by the apothem; the ring is pulled back by the same
   * distance so the front card sits on the screen plane at 1:1).
   *
   * One angle, three inputs: scroll turns the ring while the section holds (`base`),
   * a drag, the arrow buttons, the arrow keys, or focus arriving on a card add to it
   * (`manual`), and the entrance spins it into place (`intro`). What is painted is a
   * damped follower of their sum, so every input lands softly and none of them can
   * fight another. Per frame: one transform on the ring, an opacity per card.
   */
  const buildRing = (): Teardown | undefined => {
    const section = root.querySelector<HTMLElement>('[data-review-ring]');
    const viewport = section?.querySelector<HTMLElement>('[data-ring-viewport]');
    const ring = section?.querySelector<HTMLElement>('[data-ring]');
    if (!section || !viewport || !ring) return undefined;
    const cells = [...ring.querySelectorAll<HTMLElement>('[data-ring-cell]')];
    const n = cells.length;
    if (n < 3) return undefined;
    const counter = section.querySelector<HTMLElement>('[data-ring-index]');
    const prev = section.querySelector<HTMLButtonElement>('[data-ring-prev]');
    const next = section.querySelector<HTMLButtonElement>('[data-ring-next]');
    const step = 360 / n;
    const abort = new AbortController();
    const { signal } = abort;
    let radius = 0;
    let base = 0;
    let manual = 0;
    let intro = 38;
    let current = intro;
    let front = -1;
    let painted = Number.NaN;

    const measureRing = () => {
      const width = cells[0].offsetWidth || 300;
      const gap = Math.max(14, width * 0.07);
      radius = (width + gap) / (2 * Math.tan(Math.PI / n));
      section.style.setProperty('--ring-radius', `${radius.toFixed(1)}px`);
      section.style.setProperty('--ring-step', `${step.toFixed(4)}deg`);
      painted = Number.NaN;
    };

    const paint = () => {
      if (current === painted) return;
      painted = current;
      ring.style.transform = `translateZ(${(-radius).toFixed(1)}px) rotateY(${current.toFixed(3)}deg)`;
      for (let i = 0; i < n; i += 1) {
        const angle = Math.abs((((i * step + current) % 360) + 540) % 360 - 180);
        const opacity = angle < 10 ? 1 : angle > 100 ? 0 : 1 - ((angle - 10) / 90) * 0.8;
        cells[i].style.opacity = opacity.toFixed(3);
      }
      const facing = (((Math.round(-current / step)) % n) + n) % n;
      if (facing !== front) {
        front = facing;
        cells.forEach((cell, i) => cell.toggleAttribute('data-front', i === facing));
        if (counter) counter.textContent = String(facing + 1).padStart(2, '0');
      }
    };

    const tick = (_time: number, deltaMs: number) => {
      const goal = base + manual + intro;
      const gap = goal - current;
      if (Math.abs(gap) < 0.002) {
        if (current !== goal) { current = goal; paint(); }
        return;
      }
      current += gap * (1 - Math.exp(-(deltaMs / 1000) * 7.5));
      paint();
    };
    gsap.ticker.add(tick);

    // The nearest resting angle that puts a card square to the front.
    const snapped = (total: number) => Math.round(total / step) * step;
    const turnBy = (cards: number) => { manual = snapped(base + manual) - base - cards * step; };
    const bringToFront = (index: number) => {
      const total = base + manual;
      const want = -index * step;
      const turns = Math.round((total - want) / 360);
      manual = want + turns * 360 - base;
    };

    const scrollTrigger = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => { base = -self.progress * RING_SCROLL_CARDS * step; },
      onRefresh: (self) => { measureRing(); base = -self.progress * RING_SCROLL_CARDS * step; },
    });
    const entrance = ScrollTrigger.create({
      trigger: section,
      start: 'top 72%',
      once: true,
      onEnter: () => {
        const state = { v: intro };
        gsap.to(state, { v: 0, duration: 1.8, ease: 'expo.out', onUpdate: () => { intro = state.v; } });
        gsap.fromTo(viewport, { opacity: 0 }, { opacity: 1, duration: 1.1, ease: 'power2.out', clearProps: 'opacity' });
      },
    });
    if (entrance.progress > 0 || scrollTrigger.progress > 0) { intro = 0; }

    /* Drag: a horizontal pull turns the ring; a flick carries on, then settles on a card. */
    let pointerId = -1;
    let startX = 0;
    let startManual = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let dragging = false;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || pointerId !== -1) return;
      pointerId = event.pointerId;
      startX = lastX = event.clientX;
      lastT = event.timeStamp;
      startManual = manual;
      velocity = 0;
      dragging = false;
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) < 6) return;
        dragging = true;
        viewport.setPointerCapture(pointerId);
        viewport.dataset.dragging = '';
      }
      const dt = Math.max(1, event.timeStamp - lastT);
      velocity = velocity * 0.6 + ((event.clientX - lastX) / dt) * 0.4;
      lastX = event.clientX;
      lastT = event.timeStamp;
      manual = startManual + (dx / radius) * (180 / Math.PI);
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = -1;
      if (!dragging) return;
      dragging = false;
      delete viewport.dataset.dragging;
      const fling = ((velocity * 260) / radius) * (180 / Math.PI);
      manual = snapped(base + manual + fling) - base;
      // The release is not a click on whatever card was under the pointer.
      viewport.addEventListener('click', (click) => { click.preventDefault(); click.stopPropagation(); }, { capture: true, once: true, signal });
    };
    viewport.addEventListener('pointerdown', onDown, { signal });
    viewport.addEventListener('pointermove', onMove, { signal });
    viewport.addEventListener('pointerup', onUp, { signal });
    viewport.addEventListener('pointercancel', onUp, { signal });
    viewport.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); turnBy(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); turnBy(1); }
    }, { signal });
    prev?.addEventListener('click', () => turnBy(-1), { signal });
    next?.addEventListener('click', () => turnBy(1), { signal });
    // Tabbing into a card's link turns that card to the front.
    ring.addEventListener('focusin', (event) => {
      const cell = (event.target as Element).closest<HTMLElement>('[data-ring-cell]');
      const index = cell ? cells.indexOf(cell) : -1;
      if (index >= 0) bringToFront(index);
    }, { signal });

    measureRing();
    paint();

    return () => {
      abort.abort();
      gsap.ticker.remove(tick);
      scrollTrigger.kill();
      entrance.kill();
      ring.style.removeProperty('transform');
      cells.forEach((cell) => { cell.style.removeProperty('opacity'); cell.removeAttribute('data-front'); });
      section.style.removeProperty('--ring-radius');
      section.style.removeProperty('--ring-step');
      viewport.style.removeProperty('opacity');
      delete viewport.dataset.dragging;
    };
  };

  /* ── Scroll intent: nothing video loads before it ────────────────────────── */
  let pointerTravel = 0;
  let pointerAt: { x: number; y: number } | null = null;
  const releaseIntent = () => {
    window.removeEventListener('wheel', noteIntent);
    window.removeEventListener('touchstart', noteIntent);
    window.removeEventListener('scroll', noteIntent);
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('keydown', onKey);
  };
  function noteIntent() {
    if (scrollIntent) return;
    scrollIntent = true;
    releaseIntent();
    acts.forEach((act) => { if (act.near) act.films.forEach(promote); });
  }
  function onPointer(event: PointerEvent) {
    if (pointerAt) pointerTravel += Math.hypot(event.clientX - pointerAt.x, event.clientY - pointerAt.y);
    pointerAt = { x: event.clientX, y: event.clientY };
    if (pointerTravel >= SCROLL_INTENT_POINTER_PX) noteIntent();
  }
  function onKey(event: KeyboardEvent) { if (isScrollIntentKey(event.key)) noteIntent(); }
  window.addEventListener('wheel', noteIntent, { passive: true });
  window.addEventListener('touchstart', noteIntent, { passive: true });
  window.addEventListener('scroll', noteIntent, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('keydown', onKey, { passive: true });
  cleanups.push(releaseIntent);

  /* ── Build / tear down for the current tier ──────────────────────────────── */
  const teardownMotion = () => {
    motionCleanups.splice(0).forEach((fn) => fn());
    splits.splice(0).forEach((split) => split.revert());
    acts.forEach((act) => {
      act.trigger?.kill();
      act.trigger = undefined;
      act.entered = false;
      [act.fogIn, act.fogRise, act.copy, act.sheen, ...act.frames, ...act.captions].forEach((el) => {
        if (!el) return;
        el.style.removeProperty('transform');
        el.style.removeProperty('opacity');
      });
    });
    if (tickerFn) gsap.ticker.remove(tickerFn);
    tickerFn = null;
    lenis?.destroy();
    lenis = null;
  };

  const buildMotion = () => {
    tier = currentJourneyTier(journeyControls.getSnapshot().motionPreference);
    html.dataset.journeyTier = tier;
    html.dataset.journeyMotion = tier === 'still' ? 'still' : 'enhanced';
    if (tier === 'still') {
      acts.forEach((act) => act.films.forEach((film) => film.video.pause()));
      return;
    }

    if (finePointer.matches && !reducedQuery.matches) {
      lenis = new Lenis({ duration: 1.15, smoothWheel: true, syncTouch: false, anchors: true, autoRaf: false });
      lenis.on('scroll', ScrollTrigger.update);
      tickerFn = (time) => lenis?.raf(time * 1000);
      gsap.ticker.add(tickerFn);
      gsap.ticker.lagSmoothing(0);
    }

    acts.forEach((act) => {
      measure(act);
      // The whole pass: from the stage's top edge entering at the bottom of the screen
      // to the act's last pixel leaving at the top. `render` splits it into approach,
      // hold, and departure itself, so one trigger is the act's only clock.
      act.trigger = ScrollTrigger.create({
        trigger: act.el,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: (self) => render(act, self.scroll() - self.start),
        onRefresh: (self) => { measure(act); render(act, self.scroll() - self.start); },
      });
      // "Near": within a viewport and a half. Only near acts get their mist images
      // and are allowed to load their film.
      const nearTrigger = ScrollTrigger.create({
        trigger: act.el,
        start: 'top 250%',
        end: 'bottom -150%',
        onToggle: (self) => {
          act.near = self.isActive;
          act.el.toggleAttribute('data-act-near', self.isActive || act.el.hasAttribute('data-act-near'));
          if (self.isActive) act.films.forEach(promote);
        },
      });
      motionCleanups.push(() => nearTrigger.kill());
      render(act, act.trigger.scroll() - act.trigger.start);
    });

    // The hero is on screen at load: its words enter once, now.
    const hero = acts.find((act) => act.kind === 'hero');
    if (hero) {
      hero.el.setAttribute('data-act-near', '');
      enterCopy(hero);
    }

    motionCleanups.push(buildPaperReveals());
    const ringTeardown = buildRing();
    if (ringTeardown) motionCleanups.push(ringTeardown);
    void document.fonts?.ready.then(() => ScrollTrigger.refresh());
  };

  const rebuild = () => {
    teardownMotion();
    buildMotion();
    ScrollTrigger.refresh();
  };

  buildMotion();
  const unsubscribe = journeyControls.subscribe(rebuild);
  reducedQuery.addEventListener('change', rebuild);
  cleanups.push(() => {
    unsubscribe();
    reducedQuery.removeEventListener('change', rebuild);
  });

  // Staging-only read probe for the e2e suite.
  if (html.dataset.environment !== 'production') {
    (window as Window & { __ffeActs?: unknown }).__ffeActs = {
      tier: () => tier,
      lenis: () => Boolean(lenis),
      acts: () => acts.map((act) => ({
        id: act.el.id,
        kind: act.kind,
        progress: act.trigger?.progress ?? null,
        near: act.near,
        films: act.films.map((f) => ({ chapter: f.chapter, requested: f.requested, readyState: f.video.readyState, t: f.video.currentTime })),
      })),
    };
  }

  return onRouteTeardown(() => {
    teardownMotion();
    cleanups.splice(0).forEach((fn) => fn());
    acts.forEach((act) => act.films.forEach((film) => film.video.pause()));
    delete (window as Window & { __ffeActs?: unknown }).__ffeActs;
  });
}
