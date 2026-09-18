import gsap from 'gsap';
import { ScrollTrigger, SplitText, ensureGsapKit } from '../lib/motion/gsap-kit';
import { journeyControls } from '../lib/motion/journey-controls';

/**
 * `layered-scrub` — decoded from isladjan `abdyPBw` (CONTEXT-SHEET A4b).
 *
 * Every layer group owns its OWN ScrollTrigger over the same start/end window,
 * but with a different scrub lag (1 -> 3.6s) and a small time offset inside its
 * own timeline. Scroll slowly and the stack behaves like one solid body; scroll
 * fast and the plates separate by lag, then close again when the scroll stops.
 * Nothing here writes a layout property — only transforms, opacity, stroke-dash
 * and gradient attributes — so the diagram cannot shift the page while it runs.
 */

interface LayerSpec {
  readonly id: string;
  readonly scrub: number;
  readonly dy: number;
  readonly dx: number;
}

const LAYERS: readonly LayerSpec[] = [
  { id: 'slab', scrub: 1, dy: 40, dx: -32 },
  { id: 'grind', scrub: 1.6, dy: 40, dx: -32 },
  { id: 'repair', scrub: 2, dy: 40, dx: -32 },
  { id: 'primer', scrub: 2.4, dy: 73, dx: -58 },
  { id: 'base', scrub: 2.8, dy: 96, dx: -77 },
  { id: 'flakes', scrub: 3.2, dy: 118, dx: -94 },
  { id: 'topcoat', scrub: 3.6, dy: 140, dx: -112 },
];

const START = 'top 80%';
const END = 'bottom 20%';
const STEP = 0.07;
/** Every layer timeline is padded to the same length so the per-layer time
 *  offsets stay proportional once ScrollTrigger normalizes them to the range.
 *  The pad also lands the assembled stack around 60% of the scroll window, so
 *  the finished diagram is legible in frame before the aside scrolls away. */
const SPAN = 2.8;

export function initializePreparationLayers(root: ParentNode = document) {
  const section = root.querySelector<HTMLElement>('[data-prep-layers]');
  if (!section) return () => {};

  ensureGsapKit();
  journeyControls.hydrate();

  const statement = section.querySelector<HTMLElement>('[data-prep-statement]');
  const gloss = section.querySelector<SVGElement>('#prep-gloss');
  let media: ReturnType<typeof gsap.matchMedia> | null = null;

  const isStill = () =>
    document.documentElement.dataset.journeyTier === 'still' ||
    journeyControls.getSnapshot().motionPreference === 'still';

  const build = () => {
    media?.revert();
    media = null;
    section.dataset.prepMotion = 'still';
    if (isStill()) return;

    media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      section.dataset.prepMotion = 'running';

      // One shared trigger for every layer. It is the stage, not the moving
      // figure and not the whole block: the stage never transforms, and its
      // window tracks the diagram rather than the column of captions beside it.
      const stage = section.querySelector<HTMLElement>('[data-prep-stage]') ?? section;
      const figure = section.querySelector<HTMLElement>('[data-prep-figure]');

      // The whole diagram drifts against the page, so the stack reads as a body
      // held in space rather than a picture pinned to the column.
      if (figure) {
        gsap.fromTo(
          figure,
          { y: 44 },
          {
            y: -44,
            ease: 'none',
            scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
          },
        );
      }

      LAYERS.forEach((layer, index) => {
        const group = section.querySelector<SVGGElement>(`[data-prep-layer="${layer.id}"]`);
        if (!group) return;
        const at = index * STEP;
        const timeline = gsap.timeline({
          scrollTrigger: { trigger: stage, start: START, end: END, scrub: layer.scrub },
        });

        timeline.fromTo(
          group,
          { y: layer.dy, x: layer.dx, opacity: 0 },
          { y: 0, x: 0, opacity: 1, duration: 1.25, ease: 'power2.out' },
          at,
        );

        if (layer.id === 'grind') {
          timeline.fromTo(
            group.querySelectorAll('[data-prep-swirls] ellipse'),
            { drawSVG: '50% 50%' },
            { drawSVG: '0% 100%', duration: 0.95, ease: 'none', stagger: 0.055 },
            at + 0.18,
          );
          timeline.fromTo(
            group.querySelector('[data-prep-dust]'),
            { opacity: 0, y: 26 },
            { opacity: 1, y: 0, duration: 0.8, ease: 'power1.out' },
            at + 0.3,
          );
        }

        if (layer.id === 'repair') {
          timeline.fromTo(
            group.querySelectorAll('[data-prep-crack]'),
            { opacity: 0 },
            { opacity: 0.85, duration: 0.35, ease: 'none' },
            at,
          );
          timeline.fromTo(
            group.querySelectorAll('[data-prep-fill]'),
            { drawSVG: '0% 0%' },
            { drawSVG: '0% 100%', duration: 0.95, ease: 'power1.inOut', stagger: 0.12 },
            at + 0.35,
          );
        }

        if (layer.id === 'flakes') {
          timeline.fromTo(
            group.querySelectorAll('[data-prep-flake]'),
            { y: -120, opacity: 0, scale: 0.3, rotation: -80 },
            {
              y: 0,
              opacity: 0.95,
              scale: 1,
              rotation: 0,
              duration: 0.55,
              ease: 'power2.out',
              stagger: { each: 0.004, from: 'random' },
            },
            at + 0.1,
          );
        }

        if (layer.id === 'topcoat') {
          timeline.fromTo(
            group.querySelector('[data-prep-edge]'),
            { drawSVG: '50% 50%', opacity: 0 },
            { drawSVG: '0% 100%', opacity: 0.9, duration: 0.8, ease: 'power2.out' },
            at + 0.45,
          );
        }

        // Shared end pad: identical timeline length for every layer.
        timeline.to({}, { duration: 0.01 }, SPAN);
      });

      // The gloss ramp is a gradient-attribute sweep, exactly as the reference
      // animates its sky: it only runs once the clear coat has landed.
      let sweep: gsap.core.Timeline | null = null;
      if (gloss) {
        sweep = gsap
          .timeline({ repeat: -1, repeatDelay: 2.6, paused: true })
          .fromTo(
            gloss,
            { attr: { x1: -220, x2: 20 } },
            { attr: { x1: 960, x2: 1200 }, duration: 1.8, ease: 'power1.inOut' },
          );
        ScrollTrigger.create({
          trigger: stage,
          start: 'bottom 72%',
          end: 'bottom -30%',
          onToggle: (self) => (self.isActive ? sweep?.play() : sweep?.pause()),
        });
      }

      const split = statement
        ? SplitText.create(statement, {
            type: 'words,chars',
            mask: 'words',
            aria: 'auto',
            autoSplit: true,
            onSplit(self) {
              return gsap.from(self.words, {
                yPercent: 118,
                rotate: 5,
                duration: 0.95,
                ease: 'power3.out',
                stagger: 0.1,
                scrollTrigger: { trigger: statement, start: 'top 88%', toggleActions: 'play none none reset' },
              });
            },
          })
        : null;

      // Captions arrive with their layer. A clip-mask wipe, never a fade, so the
      // text is at full contrast in every frame it is on screen.
      LAYERS.forEach((layer, index) => {
        const caption = section.querySelector<HTMLElement>(`[data-prep-caption="${layer.id}"]`);
        if (!caption) return;
        gsap.fromTo(
          caption.querySelectorAll('[data-prep-caption-part]'),
          { yPercent: 108 },
          {
            yPercent: 0,
            duration: 0.75,
            ease: 'power3.out',
            stagger: 0.05,
            scrollTrigger: { trigger: stage, start: `top ${72 - index * 3}%`, toggleActions: 'play none none reverse' },
          },
        );
        gsap.fromTo(
          caption.querySelector('[data-prep-rule]'),
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: { trigger: stage, start: `top ${72 - index * 3}%`, toggleActions: 'play none none reverse' },
          },
        );
      });

      return () => {
        sweep?.kill();
        split?.revert();
        section.dataset.prepMotion = 'still';
      };
    });
  };

  build();

  const unsubscribe = journeyControls.subscribe(build);
  const observer = new MutationObserver(build);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-journey-tier'] });

  return () => {
    observer.disconnect();
    unsubscribe();
    media?.revert();
    media = null;
  };
}
