/**
 * Motion for every page that is not the homepage (2026-09-22, Matt: "do the other pages
 * in the same style"). The homepage has its own owner (`acts.ts`); this returns at once
 * when it finds `[data-acts]`.
 *
 *   - Lenis smooth scrolling on fine pointers, as on the homepage.
 *   - The interior hero: the picture opens down from its top edge and settles out of a
 *     slight zoom, the headline flies in (converge), the kicker tips up, the lead rises;
 *     as the page scrolls the picture drifts and dims into the paper.
 *   - Every section: titles converge, kickers cascade, leads and cards rise — the shared
 *     vocabulary in `reveal.ts`, tagged here by class so no page has to opt in.
 *
 * Nothing runs for reduced motion, Save-Data, or the `still` tier: the pages are already
 * complete without it.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { journeyControls } from './journey-controls';
import { currentJourneyTier } from './journey-tier';
import { bindReveals, cascade, converge, rise } from './reveal';

gsap.registerPlugin(ScrollTrigger);

type Teardown = () => void;

const tag = (root: ParentNode, selector: string, kind: string) => {
  root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    if (!el.dataset.reveal) el.dataset.reveal = kind;
  });
};

export function initPageMotion(): Teardown | undefined {
  if (document.querySelector('[data-acts]')) return undefined;
  const main = document.querySelector<HTMLElement>('main');
  if (!main) return undefined;

  journeyControls.hydrate();
  const html = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tier = currentJourneyTier(journeyControls.getSnapshot().motionPreference);
  if (!html.dataset.journeyTier) html.dataset.journeyTier = tier;
  if (reduced || tier === 'still') return undefined;

  const cleanups: Teardown[] = [];

  // Smooth scrolling, the homepage's settings.
  if (window.matchMedia('(pointer: fine)').matches) {
    const lenis = new Lenis({ duration: 1.15, smoothWheel: true, syncTouch: false, anchors: true, autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    cleanups.push(() => { gsap.ticker.remove(tick); lenis.destroy(); });
  }

  // The interior hero.
  const hero = main.querySelector<HTMLElement>('[data-interior-hero]');
  const splits: { revert: () => void }[] = [];
  if (hero) {
    const plate = hero.querySelector<HTMLElement>('[data-interior-plate]');
    const img = hero.querySelector<HTMLElement>('[data-interior-img]');
    const title = hero.querySelector<HTMLElement>('[data-interior-title]');
    const kicker = hero.querySelector<HTMLElement>('[data-interior-kicker]');
    const lead = hero.querySelector<HTMLElement>('[data-interior-lead]');
    if (plate) {
      gsap.fromTo(plate, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.7, ease: 'expo.inOut', clearProps: 'clipPath' });
    }
    if (img) {
      gsap.fromTo(img, { scale: 1.16 }, { scale: 1, duration: 2.2, ease: 'expo.out' });
      const drift = gsap.fromTo(img, { yPercent: 0 }, {
        yPercent: 14,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.4 },
      });
      cleanups.push(() => { drift.scrollTrigger?.kill(); drift.kill(); });
    }
    if (title) splits.push(converge(title, { delay: 0.55 }).split);
    if (kicker) splits.push(cascade(kicker, 0.4));
    if (lead) rise([lead], 1.1);
  }

  // Every section: tag by class, then bind the shared vocabulary once.
  tag(main, '.section-title, .section-inner > h2, .editorial-card > h2', 'title');
  tag(main, '.section-kicker', 'kicker');
  tag(main, '.section-lead, .editorial-card, .section-inner > .button-row', 'fade');
  cleanups.push(bindReveals(main));

  // Fonts can re-flow the headlines; let every trigger re-measure once they land.
  void document.fonts?.ready.then(() => ScrollTrigger.refresh());

  return () => {
    splits.forEach((split) => split.revert());
    cleanups.splice(0).forEach((fn) => fn());
  };
}
