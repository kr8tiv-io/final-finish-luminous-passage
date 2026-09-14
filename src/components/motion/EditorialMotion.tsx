import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { journeyControls } from '../../lib/motion/journey-controls';
import { reviewPosition, reviewTarget } from '../../lib/content/review-navigation';

gsap.registerPlugin(ScrollTrigger);

/** Owns editorial transforms only. The journey director owns all film layers. */
export default function EditorialMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.journey');
    if (!root) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let context: gsap.Context | undefined;
    const gallery = root.querySelector<HTMLElement>('.review-gallery');
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-review-direction]')];
    let scrollFrame = 0;
    const readGallery = () => {
      scrollFrame = 0;
      if (!gallery) return;
      const cards = gallery.querySelectorAll<HTMLElement>('.review-card');
      const stride = (cards[0]?.getBoundingClientRect().width ?? 0) + Number.parseFloat(getComputedStyle(gallery).gap || '0');
      const maximum = gallery.scrollWidth - gallery.clientWidth;
      const state = reviewPosition(gallery.scrollLeft, stride, cards.length, maximum);
      const position = root.querySelector('.review-position');
      const label = `${String(state.index).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
      if (position && position.textContent !== label) position.textContent = label;
      root.querySelector<HTMLElement>('.review-progress span')?.style.setProperty('transform', `scaleX(${state.progress})`);
      buttons.forEach(button => { button.disabled = Number(button.dataset.reviewDirection) < 0 ? state.atStart : state.atEnd; });
    };
    const scheduleGallery = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(readGallery); };
    const moveGallery = (event: Event) => {
      if (!gallery) return;
      const button = event.currentTarget as HTMLButtonElement;
      const stride = (gallery.querySelector<HTMLElement>('.review-card')?.getBoundingClientRect().width ?? 0) + Number.parseFloat(getComputedStyle(gallery).gap || '0');
      gallery.scrollTo({ left: reviewTarget(gallery.scrollLeft, Number(button.dataset.reviewDirection), stride, gallery.scrollWidth - gallery.clientWidth), behavior: reduced.matches || journeyControls.getSnapshot().motionPreference === 'still' ? 'instant' : 'smooth' });
    };
    gallery?.addEventListener('scroll', scheduleGallery, { passive: true });
    buttons.forEach(button => button.addEventListener('click', moveGallery));
    const resize = new ResizeObserver(scheduleGallery);
    if (gallery) resize.observe(gallery);
    readGallery();

    const applyMotion = () => {
      context?.revert();
      if (reduced.matches || journeyControls.getSnapshot().motionPreference === 'still') return;
      context = gsap.context(() => {
        root.querySelectorAll<HTMLElement>('[data-editorial-reveal]').forEach(element => {
          if (element.getBoundingClientRect().top < innerHeight * .91) return;
          gsap.from(element.children, { y: 36, opacity: 0, duration: .85, stagger: .09, ease: 'power3.out', scrollTrigger: { trigger: element, start: 'top 91%', once: true } });
        });
        root.querySelectorAll<HTMLElement>('[data-story-photo]').forEach((photo,index) => {
          // A deep link or return visit can hydrate after this reading position.
          // Already-passed photographs must never be initialized invisible.
          if (photo.getBoundingClientRect().top < innerHeight * .88) return;
          const image = photo.querySelector('picture');
          const caption = photo.querySelector('figcaption');
          const arrival = gsap.timeline({ defaults: { ease: 'power3.out' }, scrollTrigger: { trigger: photo, start: 'top 88%', once: true } });
          if (image) arrival.from(image, { xPercent: index % 2 ? 5 : -5, y: 42, scale: .965, opacity: 0, duration: 1.35 }, 0);
          if (caption) arrival.from(caption, { y: 12, opacity: 0, duration: .7 }, .35);
        });
        const window = root.querySelector<HTMLElement>('[data-review-window]');
        if (window) gsap.from(window, { xPercent: 7, opacity: 0, duration: 1.05, ease: 'power3.out', scrollTrigger: { trigger: window, start: 'top 94%', once: true } });
        const lens = root.querySelector<HTMLElement>('[data-material-lens]');
        if (lens) gsap.fromTo(lens, { y: 38, x: 12 }, { y: -22, x: -12, ease: 'none', scrollTrigger: { trigger: '#foundation', start: 'top bottom', end: 'bottom top', scrub: .6 } });
      }, root);
    };
    const unsubscribe = journeyControls.subscribe(applyMotion);
    reduced.addEventListener('change', applyMotion);
    applyMotion();
    return () => {
      context?.revert(); unsubscribe(); resize.disconnect();
      reduced.removeEventListener('change', applyMotion);
      gallery?.removeEventListener('scroll', scheduleGallery);
      buttons.forEach(button => button.removeEventListener('click', moveGallery));
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
    };
  }, []);
  return null;
}
