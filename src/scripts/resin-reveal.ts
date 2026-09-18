import gsap from 'gsap';
import { ScrollTrigger, ensureGsapKit } from '../lib/motion/gsap-kit';
import { journeyControls } from '../lib/motion/journey-controls';

/**
 * Spike C — "Find your finish" resin mask (vocabulary id `resin-mask`).
 *
 * Creative Ocean `qBbBLyB` decoded: one poured-resin silhouette is drawn twice —
 * once as the visible liquid plate, once as the content of an SVG `<mask>` with a
 * white field attached below it. A single tween raises both, so the statement is
 * revealed *inside* the resin's own edge and the frame resolves to paper.
 *
 * Single-owner rules kept: this module is the only writer of every attribute it
 * sets, it duplicates no state the journey director or JourneyMotion already
 * tracks, and it registers no GSAP plugin itself (`ensureGsapKit()` does that).
 */

interface Point { x: number; y: number }

interface Metrics { w: number; h: number; gutter: number; band: number; track: number }

const OVERHANG = 0.08;
const EDGE_SAMPLES = 15;
const SPEC_WINDOW = 0.17;

const round = (value: number) => Math.round(value * 100) / 100;

/** Poured-epoxy edge: three detuned sines so no wave repeats inside the frame. */
function sampleEdge(width: number, amplitude: number, phase: number): Point[] {
  const left = -width * OVERHANG;
  const span = width * (1 + OVERHANG * 2);
  const points: Point[] = [];
  for (let index = 0; index <= EDGE_SAMPLES; index += 1) {
    const t = index / EDGE_SAMPLES;
    const u = t * Math.PI * 2 + phase;
    points.push({
      x: left + span * t,
      y: Math.sin(u + 0.62) * amplitude
        + Math.sin(u * 2.31 + 2.14) * amplitude * 0.44
        + Math.sin(u * 3.77 + 4.41) * amplitude * 0.19,
    });
  }
  return points;
}

/** Catmull-Rom through the samples, emitted as cubics so the rim reads as liquid. */
function curveThrough(points: Point[]): string {
  let d = `M${round(points[0].x)},${round(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    d += `C${round(p1.x + (p2.x - p0.x) / 6)},${round(p1.y + (p2.y - p0.y) / 6)}`
      + ` ${round(p2.x - (p3.x - p1.x) / 6)},${round(p2.y - (p3.y - p1.y) / 6)}`
      + ` ${round(p2.x)},${round(p2.y)}`;
  }
  return d;
}

function stillPreferred(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.dataset.journeyTier === 'still'
    || root.dataset.journeyMotion === 'still'
    || journeyControls.getSnapshot().motionPreference === 'still';
}

export function initializeResinReveal(root: ParentNode = document): () => void {
  const stage = root.querySelector<HTMLElement>('[data-resin-stage]');
  if (!stage) return () => {};

  const q = <T extends Element>(selector: string) => stage.querySelector<T>(selector);
  const svg = q<SVGSVGElement>('[data-resin-svg]');
  const photo = q<HTMLImageElement>('[data-resin-photo]');
  const veil = q<HTMLElement>('[data-resin-veil]');
  const vignette = q<HTMLElement>('[data-resin-vignette]');
  const numeral = q<HTMLElement>('[data-resin-numeral]');
  const register = q<HTMLElement>('[data-resin-register]');
  const underPlate = q<SVGGElement>('[data-resin-under-plate]');
  const under = q<SVGPathElement>('[data-resin-under]');
  const maskPlate = q<SVGGElement>('[data-resin-mask-plate]');
  const maskBody = q<SVGPathElement>('[data-resin-mask-body]');
  const maskBelow = q<SVGRectElement>('[data-resin-mask-below]');
  const glossPlate = q<SVGGElement>('[data-resin-gloss-plate]');
  const body = q<SVGPathElement>('[data-resin-body]');
  const menisc = q<SVGPathElement>('[data-resin-menisc]');
  const spec = q<SVGPathElement>('[data-resin-spec]');
  const specSoft = q<SVGPathElement>('[data-resin-spec-soft]');
  const liquid = q<SVGFilterElement>('[data-resin-liquid]');
  const paper = q<SVGRectElement>('[data-resin-paper]');
  const statement = q<SVGGElement>('[data-resin-statement]');
  const lineOne = q<SVGTextElement>('[data-resin-line="1"]');
  const lineTwo = q<SVGTextElement>('[data-resin-line="2"]');
  const note = q<SVGTextElement>('[data-resin-note]');
  const rule = q<SVGLineElement>('[data-resin-rule]');
  const underGrad = q<SVGLinearGradientElement>('[data-resin-under-grad]');
  const bodyGrad = q<SVGLinearGradientElement>('[data-resin-body-grad]');
  const rimGrad = q<SVGLinearGradientElement>('[data-resin-rim-grad]');

  if ([svg, photo, veil, vignette, numeral, register, underPlate, under, maskPlate, maskBody,
    maskBelow, glossPlate, body, menisc, spec, specSoft, liquid, paper, statement, lineOne,
    lineTwo, note, rule, underGrad, bodyGrad, rimGrad].some((part) => part === null)) return () => {};

  ensureGsapKit();

  const metrics: Metrics = { w: 1440, h: 900, gutter: 96, band: 92, track: 1440 };
  const coarse = matchMedia('(pointer: coarse)');

  const setAttrs = (node: Element, attrs: Record<string, string | number>) => {
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  };

  /** Every geometry read happens here, never inside a scrub frame. */
  const layout = () => {
    const w = Math.max(320, stage.clientWidth || window.innerWidth);
    const h = Math.max(420, stage.clientHeight || window.innerHeight);
    metrics.w = w;
    metrics.h = h;
    metrics.gutter = Math.min(Math.max(w * 0.055, 22), 132);
    metrics.band = Math.min(Math.max(h * 0.1, 58), 132);
    metrics.track = register!.scrollWidth || w;
    const { gutter, band } = metrics;

    svg!.setAttribute('viewBox', `0 0 ${round(w)} ${round(h)}`);

    // The mask region and the paper it reveals are clamped to the frame: a mask
    // rasterises over its declared region every frame, so an oversized one is the
    // single most expensive thing this mechanic can do.
    const pad = Math.round(Math.max(w, h) * 0.02);
    const region = { x: -pad, y: -pad, width: w + pad * 2, height: h + pad * 2 };
    setAttrs(paper!, region);
    setAttrs(q<SVGMaskElement>('#resin-mask')!, region);

    const left = round(-w * OVERHANG);
    const right = round(w * (1 + OVERHANG));
    const close = (edge: string, bottom: number) =>
      `${edge}L${right},${round(bottom)}L${left},${round(bottom)}Z`;

    // One poured edge, shared by the visible plate, the meniscus and the mask.
    // Only the mask copy runs the full height; the painted copies stop where their
    // gradients reach zero, so nothing rasterises a transparent full frame.
    // Amplitude follows the smaller axis: a wave sized off height alone reads as a
    // cartoon hill on a phone.
    const amplitude = Math.min(Math.max(Math.min(h * 0.052, w * 0.055), 24), 74);
    const edgeD = curveThrough(sampleEdge(w, amplitude, 0));
    body!.setAttribute('d', close(edgeD, band * 2.2));
    menisc!.setAttribute('d', close(edgeD, band * 1.35));
    maskBody!.setAttribute('d', close(edgeD, h * 1.2));
    spec!.setAttribute('d', edgeD);
    specSoft!.setAttribute('d', edgeD);
    // Stroke weights are viewport-relative so the specular reads as a hairline on
    // a phone instead of a drawn arc.
    const hair = Math.max(1.2, w * 0.0017);
    spec!.setAttribute('stroke-width', String(round(hair)));
    specSoft!.setAttribute('stroke-width', String(round(hair * 2.8)));
    setAttrs(maskBelow!, { x: left, y: h * 1.15, width: w * (1 + OVERHANG * 2), height: h * 2.2 });

    // The under-pour runs a different phase so the two crests never agree.
    under!.setAttribute('d', close(curveThrough(sampleEdge(w, amplitude * 0.78, 1.9)), band * 3.6));

    // Filter region is the meniscus band only: the turbulence never pays for a
    // full-frame rasterisation on any scrub frame.
    setAttrs(liquid!, {
      x: left, y: -amplitude * 1.4, width: w * (1 + OVERHANG * 2), height: amplitude * 2.4 + band * 0.9,
    });
    setAttrs(underGrad!, { x1: 0, y1: -amplitude * 0.5, x2: 0, y2: band * 3.6 });
    setAttrs(bodyGrad!, { x1: 0, y1: -amplitude * 0.3, x2: 0, y2: band * 1.2 });
    setAttrs(rimGrad!, { x1: 0, y1: -amplitude * 0.95, x2: 0, y2: band * 1.15 });

    // Statement block. CSS owns the type scale; we only read it back for baselines.
    const big = parseFloat(getComputedStyle(lineOne!).fontSize) || 72;
    const small = parseFloat(getComputedStyle(note!).fontSize) || 18;
    const lead = big * 0.92;
    const top = h * 0.53 - lead * 0.3;
    setAttrs(lineOne!, { x: gutter, y: top });
    setAttrs(lineTwo!, { x: gutter, y: top + lead });
    const ruleY = top + lead + small * 2.1;
    setAttrs(rule!, { x1: gutter, y1: ruleY, x2: gutter + Math.max(w * 0.19, 190), y2: ruleY });
    setAttrs(note!, { x: gutter, y: ruleY + small * 2.1 });
  };

  let mm: ReturnType<typeof gsap.matchMedia> | null = null;
  let resizeFrame = 0;

  const teardown = () => {
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
    mm?.revert();
    mm = null;
    delete stage.dataset.resinReady;
  };

  const buildStill = () => {
    stage.dataset.resinMode = 'still';
    stage.dataset.resinReady = 'true';
  };

  const buildMotion = () => {
    stage.dataset.resinMode = 'motion';
    layout();
    stage.dataset.resinReady = 'true';

    const plates = [glossPlate!, maskPlate!];
    const specWindow = { p: -SPEC_WINDOW };
    const clamp01 = gsap.utils.clamp(0, 1);
    const paintSpec = () => {
      const from = clamp01(specWindow.p) * 100;
      const to = clamp01(specWindow.p + SPEC_WINDOW) * 100;
      gsap.set([spec!, specSoft!], { drawSVG: `${round(from)}% ${round(to)}%` });
    };

    // The still is the first thing the pin shows, so it must not be mid-fetch when
    // the stage arrives: promote it out of lazy loading a viewport and a half early.
    const preload = ScrollTrigger.create({
      trigger: stage,
      start: 'top bottom+=150%',
      once: true,
      onEnter: () => { if (!photo!.complete) photo!.loading = 'eager'; },
    });

    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        id: 'resin-mask',
        trigger: stage,
        start: 'top top',
        end: '+=180%',
        pin: true,
        pinSpacing: true,
        anticipatePin: 1,
        scrub: coarse.matches ? true : 1,
        invalidateOnRefresh: true,
        onRefresh: layout,
      },
    });

    // The still never sits still: it settles out of a push-in and drifts laterally.
    timeline.fromTo(photo!,
      { scale: 1.17, xPercent: 2.4, yPercent: 1.4 },
      { scale: 1, xPercent: -3.2, yPercent: -1.2, duration: 1 }, 0);
    timeline.fromTo(veil!, { opacity: 0.1 }, { opacity: 0.36, duration: 0.6 }, 0);
    timeline.fromTo(vignette!, { opacity: 0.22 }, { opacity: 0.56, duration: 0.6 }, 0);

    // Horizontal: the finish register travels left and the pour eats it.
    timeline.fromTo(register!,
      { x: () => metrics.w * 0.5 },
      { x: () => -metrics.track - metrics.w * 0.08, duration: 1 }, 0);
    timeline.fromTo(numeral!,
      { yPercent: 16, opacity: 0.18 },
      { yPercent: -14, opacity: 0, duration: 0.72 }, 0);

    // The under-pour floods first, so the frame is already moving when the
    // statement plate arrives.
    timeline.fromTo(underPlate!,
      { y: () => metrics.h * 1.04 },
      { y: () => -metrics.h * 0.34, duration: 0.74 }, 0.02);

    // The mechanic: one tween, both copies of the resin shape.
    timeline.fromTo(plates,
      { y: () => metrics.h * 1.02 },
      { y: () => -metrics.h * 0.22, duration: 0.84 }, 0.08);

    // Specular travelling along the rim while it rises.
    timeline.fromTo(specWindow, { p: -SPEC_WINDOW }, { p: 1, duration: 0.84, onUpdate: paintSpec }, 0.08);
    timeline.fromTo([spec!, specSoft!], { opacity: 0 }, { opacity: 1, duration: 0.07 }, 0.08);
    timeline.to([spec!, specSoft!], { opacity: 0, duration: 0.07 }, 0.87);

    // Counter-drift inside the mask: the statement moves slower than the resin.
    timeline.fromTo(statement!,
      { y: () => metrics.h * 0.13 },
      { y: () => -metrics.h * 0.03, duration: 0.84 }, 0.08);
    // Lines converge laterally as well as vertically, so the arrival is authored
    // rather than a single slide.
    timeline.fromTo(lineOne!, { y: 34, x: () => -metrics.w * 0.045 }, { y: 0, x: 0, duration: 0.32 }, 0.3);
    timeline.fromTo(lineTwo!, { y: 46, x: () => metrics.w * 0.038 }, { y: 0, x: 0, duration: 0.34 }, 0.36);
    timeline.fromTo(rule!, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: 0.16 }, 0.66);
    timeline.fromTo(note!, { y: 24, x: 34, opacity: 0 }, { y: 0, x: 0, opacity: 1, duration: 0.2 }, 0.7);

    // Departure: the rule strikes out across the frame and the block lifts away.
    timeline.to(rule!, { scaleX: () => (metrics.w - metrics.gutter * 2) / Math.max(metrics.w * 0.19, 190), duration: 0.12 }, 0.88);
    timeline.to(statement!, { y: () => -metrics.h * 0.08, duration: 0.12 }, 0.88);

    paintSpec();

    const onResize = () => {
      if (resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        layout();
        ScrollTrigger.refresh();
      });
    };
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    void document.fonts?.ready.then(() => { layout(); ScrollTrigger.refresh(); });

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      preload.kill();
    };
  };

  const setup = () => {
    mm = gsap.matchMedia();
    mm.add(
      {
        motion: '(prefers-reduced-motion: no-preference)',
        calm: '(prefers-reduced-motion: reduce)',
      },
      (context) => (context.conditions?.motion && !stillPreferred() ? buildMotion() : buildStill()),
      stage,
    );
  };

  const rebuild = () => { teardown(); setup(); };

  journeyControls.hydrate();
  setup();

  const unsubscribe = journeyControls.subscribe(rebuild);
  const tierObserver = new MutationObserver(rebuild);
  tierObserver.observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-journey-tier', 'data-journey-motion'],
  });

  return () => {
    unsubscribe();
    tierObserver.disconnect();
    teardown();
    delete stage.dataset.resinMode;
  };
}
