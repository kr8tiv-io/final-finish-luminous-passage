import gsap from 'gsap';
import { journeyControls } from '../lib/motion/journey-controls';

/** A moving reflection inside a stationary link. Never changes the hit target. */
export function initializeIntentMotion(root: ParentNode = document) {
  journeyControls.hydrate();
  const abort = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const still = () => reduced.matches || document.hidden || journeyControls.getSnapshot().motionPreference === 'still';
  // Only Astro-owned links: do not append children inside hydrated React controls.
  const links = [...root.querySelectorAll<HTMLElement>('.site-header .header-cta, .journey .chapter-content a.button, .journey a.chapter-link, .hero-ribbon a')];
  const effects = links.map(link => {
    const glint = document.createElement('span');
    glint.className = 'intent-glint';
    glint.setAttribute('aria-hidden', 'true');
    link.append(glint);
    link.dataset.intentMotion = '';
    const xTo = gsap.quickTo(glint, 'x', { duration: .36, ease: 'power3.out' });
    const yTo = gsap.quickTo(glint, 'y', { duration: .36, ease: 'power3.out' });
    const opacityTo = gsap.quickTo(glint, 'opacity', { duration: .2, ease: 'power2.out' });
    let bounds: DOMRect | null = null;
    const reset = (immediate = false) => {
      link.dataset.intentActive = 'false';
      xTo.tween.pause(); yTo.tween.pause();
      if (immediate) { opacityTo.tween.pause(); gsap.set(glint, { opacity: 0 }); }
      else opacityTo(0);
    };
    const activate = (event?: PointerEvent) => {
      if (still()) return;
      bounds = link.getBoundingClientRect();
      const x = event ? event.clientX - bounds.left : bounds.width * .5;
      const y = event ? event.clientY - bounds.top : bounds.height * .5;
      gsap.set(glint, { x, y });
      link.dataset.intentActive = 'true'; opacityTo(1);
    };
    link.addEventListener('pointerenter', event => { if (fine.matches && event.pointerType !== 'touch') activate(event); }, { signal: abort.signal });
    link.addEventListener('pointermove', event => {
      if (!fine.matches || still() || !bounds || link.dataset.intentActive !== 'true') return;
      xTo(Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)));
      yTo(Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)));
    }, { passive: true, signal: abort.signal });
    link.addEventListener('pointerleave', () => { if (document.activeElement !== link) reset(); }, { signal: abort.signal });
    link.addEventListener('focus', () => activate(), { signal: abort.signal });
    link.addEventListener('blur', () => reset(), { signal: abort.signal });
    reset(true);
    return { reset, dispose: () => {
      xTo.tween.kill(); yTo.tween.kill(); opacityTo.tween.kill(); gsap.killTweensOf(glint);
      glint.remove(); delete link.dataset.intentMotion; delete link.dataset.intentActive;
    } };
  });
  const resetAll = () => effects.forEach(effect => effect.reset(true));
  const unsubscribe = journeyControls.subscribe(resetAll);
  reduced.addEventListener('change', resetAll, { signal: abort.signal });
  fine.addEventListener('change', resetAll, { signal: abort.signal });
  document.addEventListener('visibilitychange', resetAll, { signal: abort.signal });
  window.addEventListener('scroll', resetAll, { passive: true, signal: abort.signal });
  window.addEventListener('resize', resetAll, { passive: true, signal: abort.signal });
  return () => { abort.abort(); unsubscribe(); effects.forEach(effect => effect.dispose()); };
}
