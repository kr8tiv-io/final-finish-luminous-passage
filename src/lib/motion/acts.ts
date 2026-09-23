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
import { bindReveals, cascade, converge, driftLines, rise, type Converged } from './reveal';

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
  bay: { liftEnd: 0.05, bandStart: 0, bandEnd: 0.1, switchStart: 0.5, switchEnd: 0.68 },
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
  /** The time the scroll last asked for, in seconds (kept while the hand-off runs). */
  target: number | null;
  /** True from the reveal until the film has glided to the scroll's frame (`handOff`). */
  catching: boolean;
}

/** The reveal fade in acts.css (`.act-plate video`, .4s) plus a frame. */
const HANDOFF_HOLD_MS = 420;
/** Seconds of film per second while a revealed film glides to the scroll's frame. */
const HANDOFF_RATE = 1.8;

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
  /** The material lens's picture, which pans like a magnifier moving over the floor. */
  readonly lens: HTMLElement | null;
  /** Headlines converged on entry; their lines drift while the act is held. */
  titles: Converged[];
  /** The garage headline's letters, scrubbed with the car (two-room act only). */
  car: gsap.core.Timeline | null;
  /** Stage height, mist edge height, act height, viewport height (px). */
  H: number;
  E: number;
  S: number;
  V: number;
  /** Where the band's solid paper begins, and the words it carries (stage px). */
  bandTop: number;
  /** Two-room acts: where the band settles for the second room (just above the captions). */
  bandTop2: number;
  captionLift: number;
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
        target: null,
        catching: false,
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
      lens: el.querySelector<HTMLElement>('[data-lens-pan]'),
      H: window.innerHeight,
      E: 0,
      S: window.innerHeight,
      V: window.innerHeight,
      bandTop: 0,
      bandTop2: 0,
      captionLift: 0,
      titles: [],
      car: null,
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
      // The band's solid paper begins a little above the first line of the words: by
      // `--act-band-gap` of the stage (acts.css; phones tighten it for the two rooms).
      const gap = parseFloat(getComputedStyle(act.el).getPropertyValue('--act-band-gap')) || 0.07;
      act.bandTop = Math.max(act.H * 0.12, act.copyTop - act.H * gap);
      // Two-room acts: for the second room it settles just above the captions.
      const captions = act.copy.querySelector<HTMLElement>('.act-captions');
      act.bandTop2 = captions ? Math.max(act.bandTop, act.copyTop + captions.offsetTop - act.H * 0.06) : act.bandTop;
    } else {
      act.copyTop = act.H;
      act.copyH = 1;
      act.bandTop = act.H;
      act.bandTop2 = act.H;
    }
    if (act.kind === 'bay') {
      // Where each room is seen clear of its band's mist. Phones fit the rooms'
      // pictures to these windows (acts.css), so the floor is in them, not the sky.
      act.el.style.setProperty('--act-clear-1', `${Math.round(act.bandTop - act.E)}px`);
      act.el.style.setProperty('--act-clear-2', `${Math.round(act.bandTop2 - act.E)}px`);
    }
  };

  /** The garage headline: letters stream in from the left behind the car, last letter first. */
  const buildCar = (act: Act) => {
    const title = act.el.querySelector<HTMLElement>('[data-car-title]');
    if (!title) return;
    const split = SplitText.create(title, { type: 'words,chars', wordsClass: 't-word', charsClass: 't-char', aria: 'auto' });
    splits.push(split);
    act.car = gsap.timeline({ paused: true }).fromTo(split.chars, {
      xPercent: -560,
      skewX: -26,
      scaleX: 1.4,
      opacity: 0,
    }, {
      xPercent: 0,
      skewX: 0,
      scaleX: 1,
      opacity: 1,
      duration: 0.6,
      ease: 'power3.out',
      stagger: { each: 0.028, from: 'end' },
    });
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
    film.target = desired;
    // While the hand-off glides the film forward, it owns currentTime.
    if (film.catching) return;
    const target = videoSeekTarget({ currentTime: video.currentTime, desiredTime: desired, seeking: video.seeking || film.pending });
    if (target === null) return;
    film.pending = true;
    video.currentTime = target;
  };

  /**
   * A revealed film glides from frame 0 to the frame the scroll asks for.
   *
   * Every poster is its film's frame 0. The video fades in over it while still on
   * frame 0, so the fade blends two identical pictures; only after the fade does the
   * film move, at a little under twice real time, to where the scroll already is.
   * Revealing it already seeked to the scroll's frame crossfaded two different
   * moments of the pour for 400 ms: a double image, the "ghost of the old animation"
   * Matt saw on his first scroll (2026-09-22).
   */
  const handOff = (act: Act, film: Film) => {
    const { video } = film;
    const start = performance.now();
    let last = start;
    let at = video.currentTime;
    const step = (now: number) => {
      if (!film.catching) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (now - start >= HANDOFF_HOLD_MS) {
        const target = film.target ?? 0;
        const gap = target - at;
        at += Math.sign(gap) * Math.min(Math.abs(gap), dt * HANDOFF_RATE);
        if (!video.seeking && !film.pending && Math.abs(video.currentTime - at) > 0.02) {
          film.pending = true;
          video.currentTime = at;
        }
        if (Math.abs(target - at) <= 1 / 48 && !video.seeking && !film.pending) {
          film.catching = false;
          if (act.trigger) render(act, act.s);
          return;
        }
      }
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  };

  const wireFilm = (act: Act, film: Film) => {
    const { video } = film;
    const ready = () => {
      film.catching = true;
      if (video.currentTime > 0.001 && !video.seeking) video.currentTime = 0;
      video.setAttribute('data-ready', '');
      // Record the frame the scroll asks for (the hand-off glides there after the fade).
      if (act.trigger) render(act, act.s);
      handOff(act, film);
    };
    const seeked = () => { film.pending = false; };
    video.addEventListener('loadeddata', ready);
    video.addEventListener('seeked', seeked);
    cleanups.push(() => {
      film.catching = false;
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
    const bay = act.kind === 'bay' && act.frames.length > 1;
    /** Two-room acts: the second room's arrival, 0 -> 1. */
    const k = bay ? easeInOut(span(p, phases.switchStart, phases.switchEnd)) : 0;

    // Arriving: only the top edge is mist. Held: that edge lifts off.
    if (act.fogIn) {
      const lift = phases.liftEnd > 0 ? easeInOut(span(p, 0, phases.liftEnd)) : 1;
      setY(act.fogIn, -H - E * lift);
    }

    // The band rises under the words, and the words appear as its paper reaches them.
    // In a two-room act it then settles lower for the second room, which is the
    // picture Matt wanted to see whole (the glass stair and the glass room).
    if (act.fogRise && phases.bandEnd > phases.bandStart) {
      const rise = lerp(H, act.bandTop - E, easeInOut(span(p, phases.bandStart, phases.bandEnd)));
      const y = bay ? lerp(rise, act.bandTop2 - E, k) : rise;
      setY(act.fogRise, y);
      if (act.copy) {
        // Only ever on solid paper: the words start to show once the band's solid edge
        // has passed their first line, and are fully there as the band settles.
        const reach = Math.max(1, act.copyTop - act.bandTop);
        const shown = clamp01((act.copyTop - (rise + E)) / reach);
        act.copy.style.opacity = shown.toFixed(3);
        if (!act.entered && shown > 0.05) enterCopy(act);
      }
    }

    // Held headlines keep moving: their lines drift against each other.
    if (act.titles.length && tier !== 'still') {
      const drift = easeInOut(p);
      act.titles.forEach((title) => driftLines(title.lines, drift, act.kind === 'hero' ? 1.6 : 2.4));
    }

    const push = 1 + (act.push - 1) * f;
    if (bay) {
      // The second room arrives from the side and pushes the first out; each picture
      // lags its panel a little (parallax), so the move reads as depth, not a wipe.
      const [first, second] = act.frames;
      first.style.transform = `translate3d(${(-100 * k).toFixed(3)}%, 0, 0)`;
      second.style.transform = `translate3d(${(100 * (1 - k)).toFixed(3)}%, 0, 0)`;
      first.style.setProperty('--act-media', `translate3d(${(22 * k).toFixed(2)}%, 0, 0) scale(${push.toFixed(4)})`);
      second.style.setProperty('--act-media', `translate3d(${(-22 * (1 - k)).toFixed(2)}%, 0, 0) scale(${(1 + (act.push - 1) * p).toFixed(4)})`);
      second.style.visibility = k > 0 ? 'visible' : 'hidden';
      // The headline has done its work by the time the second room arrives.
      act.copy?.querySelectorAll<HTMLElement>('.t-title, .t-kicker').forEach((el) => {
        el.style.opacity = (1 - easeInOut(span(k, 0, 0.35))).toFixed(3);
      });
      if (act.captions.length > 1) {
        // One caption at a time, each travelling with its room.
        const out = easeInOut(span(k, 0, 0.5));
        const inn = easeInOut(span(k, 0.45, 1));
        act.captions[0].style.opacity = (1 - out).toFixed(3);
        act.captions[0].style.transform = `translate3d(${(-28 * out).toFixed(2)}vw, 0, 0)`;
        act.captions[1].style.opacity = inn.toFixed(3);
        act.captions[1].style.transform = `translate3d(${(28 * (1 - inn)).toFixed(2)}vw, ${(-act.captionLift * k).toFixed(1)}px, 0)`;
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

    if (act.lens) {
      act.lens.style.transform = `scale(1.5) translate3d(${(12 - 24 * f).toFixed(2)}%, ${(8 - 16 * f).toFixed(2)}%, 0)`;
    }

    // The car's headline: its letters come in behind the car, scrubbed with the film.
    if (act.car) {
      const film = act.films[0];
      const fp = film ? span(film.clock === 'held' ? p : f, film.from, film.to) : p;
      act.car.progress(span(fp, 0.06, 0.78));
    }

    if (tier !== 'still') {
      act.films.forEach((film) => seek(film, span(film.clock === 'held' ? p : f, film.from, film.to)));
    }
  }
  /* ── Reveals: the site's one vocabulary (reveal.ts) ─────────────────────── */
  const splits: SplitText[] = [];

  function enterCopy(act: Act) {
    act.entered = true;
    if (!act.copy || tier === 'still') return;
    const hero = act.kind === 'hero';
    act.copy.querySelectorAll<HTMLElement>('.t-title, .t-display').forEach((title) => {
      // The garage's headline has its own entrance, scrubbed with the car (renderCar).
      if (title.hasAttribute('data-car-title')) return;
      const converged = converge(title, { delay: hero ? 0.25 : 0 });
      splits.push(converged.split);
      act.titles.push(converged);
    });
    act.copy.querySelectorAll<HTMLElement>('.t-kicker').forEach((kicker) => splits.push(cascade(kicker, hero ? 0.1 : 0)));
    rise([...act.copy.querySelectorAll('.t-sub, .t-body, .button-row, .act-captions, .hero-proof')], hero ? 0.75 : 0.35);
  }

  const buildPaperReveals = () => bindReveals(root);
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

  /* ── The process track: sections that come in from the side ─────────────── */
  /**
   * The section holds (sticky stage) while its scroll carries the rail sideways. The
   * travel is reserved in CSS; this reads it back from the rail and writes transforms:
   * the rail, each outline numeral drifting against its panel, each picture's parallax,
   * a lamp sweeping each surface as it crosses the centre, and the progress rule. Each
   * step's title flies in (converge) the first time its panel reaches the middle.
   */
  const buildTrack = (): Teardown | undefined => {
    const section = root.querySelector<HTMLElement>('[data-track]');
    const rail = section?.querySelector<HTMLElement>('[data-track-rail]');
    if (!section || !rail) return undefined;
    const panels = [...rail.querySelectorAll<HTMLElement>('[data-track-panel]')];
    const parts = panels.map((panel) => ({
      num: panel.querySelector<HTMLElement>('[data-track-num]'),
      img: panel.querySelector<HTMLElement>('[data-track-img]'),
      media: panel.querySelector<HTMLElement>('.track-media'),
      title: panel.querySelector<HTMLElement>('.track-title'),
      entered: false,
    }));
    const bar = section.querySelector<HTMLElement>('[data-track-bar]');
    const counter = section.querySelector<HTMLElement>('[data-track-index]');
    let travel = 0;
    // The travel takes this share of the held scroll; the rest is a dwell on the last
    // panels (CSS reserves it: `--track-share` in process-track.css).
    let share = 1;
    let shown = -1;
    const measureTrack = () => {
      travel = Math.max(0, rail.scrollWidth - window.innerWidth);
      share = Number.parseFloat(getComputedStyle(section).getPropertyValue('--track-share')) || 1;
    };
    const paint = (held: number) => {
      const progress = Math.min(1, held / share);
      const x = -travel * progress;
      rail.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      const width = window.innerWidth;
      // The counter reads the panel nearest a point that slides from a third of the way
      // across to five sixths, so the last panel counts once the rail has stopped.
      const reference = width * (1 / 3 + progress / 2);
      let nearest = 0;
      let best = Infinity;
      panels.forEach((panel, i) => {
        const centre = panel.offsetLeft + x + panel.offsetWidth / 2;
        const d = (centre - width / 2) / width;
        const r = Math.abs(centre - reference);
        if (r < best) { best = r; nearest = i; }
        const part = parts[i];
        part.num?.style.setProperty('transform', `translate3d(${(d * -140).toFixed(1)}px, 0, 0)`);
        part.img?.style.setProperty('transform', `translate3d(${(d * -7).toFixed(2)}%, 0, 0)`);
        part.media?.style.setProperty('--track-sheen', `${(d * -240).toFixed(1)}%`);
        if (!part.entered && d < 0.3 && part.title) {
          part.entered = true;
          splits.push(converge(part.title, { duration: 1.2 }).split);
        }
      });
      bar?.style.setProperty('transform', `scaleX(${progress.toFixed(4)})`);
      if (nearest !== shown && counter) {
        shown = nearest;
        counter.textContent = String(nearest + 1).padStart(2, '0');
      }
    };
    const trigger = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => paint(self.progress),
      onRefresh: (self) => { measureTrack(); paint(self.progress); },
    });
    measureTrack();
    paint(trigger.progress);
    return () => {
      trigger.kill();
      rail.style.removeProperty('transform');
      parts.forEach((part) => {
        part.num?.style.removeProperty('transform');
        part.img?.style.removeProperty('transform');
        part.media?.style.removeProperty('--track-sheen');
      });
      bar?.style.removeProperty('transform');
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
      act.titles = [];
      act.car?.kill();
      act.car = null;
      const copyParts = act.copy ? [...act.copy.querySelectorAll<HTMLElement>('.t-title, .t-kicker')] : [];
      [act.fogIn, act.fogRise, act.copy, act.sheen, act.lens, ...act.frames, ...act.captions, ...copyParts].forEach((el) => {
        if (!el) return;
        el.style.removeProperty('transform');
        el.style.removeProperty('opacity');
        el.style.removeProperty('visibility');
        el.style.removeProperty('--act-media');
      });
      act.el.style.removeProperty('--act-clear-1');
      act.el.style.removeProperty('--act-clear-2');
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
      buildCar(act);
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
    const trackTeardown = buildTrack();
    if (trackTeardown) motionCleanups.push(trackTeardown);
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
