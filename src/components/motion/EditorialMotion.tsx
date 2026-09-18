import { useEffect } from 'react';
import gsap from 'gsap';
import { SplitText, ensureGsapKit } from '../../lib/motion/gsap-kit';
import { journeyControls } from '../../lib/motion/journey-controls';
import { reviewPosition, reviewTarget } from '../../lib/content/review-navigation';

ensureGsapKit();

/** A hydration after this reading position must never leave copy in a start state. */
const alreadyRead = (element: Element, ratio: number) => element.getBoundingClientRect().top < window.innerHeight * ratio;

/**
 * The customer-word stage: eyebrow char float, masked heading fold, the rating
 * sliding up through its clip, five stars, and the cards arriving laterally.
 * Called inside a gsap.matchMedia context, so returning a cleanup is enough.
 */
function buildReviewStage(stage: HTMLElement, finePointer: boolean) {
  const cleanups: Array<() => void> = [];

  // Young Multi char float, scrubbed. No already-read guard is needed: a scrub
  // that starts above the viewport resolves to progress 1, which is the settled state.
  const eyebrow = stage.querySelector<HTMLElement>('[data-review-eyebrow]');
  if (eyebrow) {
    // aria:'auto' would write aria-label onto a <p>, where a generic role prohibits it
    // (axe aria-prohibited-attr, WCAG 4.1.2). The gsap.com pattern instead: hide the
    // animated copy and stand one real string beside it, removed again on revert.
    const spoken = document.createElement('span');
    spoken.className = 'sr-only';
    spoken.textContent = eyebrow.textContent?.trim() ?? '';
    eyebrow.insertAdjacentElement('afterend', spoken);
    cleanups.push(() => spoken.remove());
    SplitText.create(eyebrow, {
      type: 'words,chars', aria: 'hidden', autoSplit: true,
      onSplit: self => gsap.fromTo(self.chars,
        { opacity: 0, yPercent: 120, scaleY: 2.3, scaleX: .7 },
        {
          opacity: 1, yPercent: 0, scaleY: 1, scaleX: 1, duration: 1, ease: 'back.inOut(2)', stagger: .03,
          scrollTrigger: { trigger: eyebrow, start: 'top 85%', end: 'top 45%', scrub: true },
        }),
    });
  }

  // gsap.com clip-wrapper fold. SplitText keeps one accessible string via aria:'auto'.
  const heading = stage.querySelector<HTMLElement>('#social-title');
  if (heading && !alreadyRead(heading, .8)) {
    SplitText.create(heading, {
      type: 'lines,chars', mask: 'lines', aria: 'auto', autoSplit: true,
      onSplit: self => gsap.from(self.chars, {
        yPercent: 110, rotateX: -40, transformOrigin: '50% 100%', stagger: .02, duration: .8, ease: 'expo.out',
        scrollTrigger: { trigger: heading, start: 'top 80%', once: true },
      }),
    });
    // Replaces what the generic [data-editorial-reveal] pass used to do for this
    // block: lead paragraph, review link, and its help line still rise on arrival.
    const trail = [...stage.querySelectorAll<HTMLElement>('.social-intro > :not(.eyebrow):not(#social-title):not(.sr-only)')];
    if (trail.length) {
      gsap.from(trail, {
        y: 24, opacity: 0, duration: .7, stagger: .08, ease: 'power3.out',
        scrollTrigger: { trigger: heading, start: 'top 80%', once: true },
      });
    }
  }

  // The real 5.0 slides up through its own clip; never a counted-up number.
  const ratingClip = stage.querySelector<HTMLElement>('[data-rating-clip]');
  const ratingNumber = ratingClip?.querySelector<HTMLElement>('.rating-number');
  if (ratingClip && ratingNumber && !alreadyRead(ratingClip, .88)) {
    const arrival = gsap.timeline({ scrollTrigger: { trigger: ratingClip, start: 'top 88%', once: true } });
    arrival.from(ratingNumber, { yPercent: 118, duration: 1.05, ease: 'expo.out' }, 0);
    const stars = [...stage.querySelectorAll<HTMLElement>('[data-rating-stars] i')];
    if (stars.length) {
      arrival.from(stars, {
        scale: 1.08, opacity: 0, transformOrigin: '50% 60%', duration: .5, stagger: .07, ease: 'power2.out',
      }, .34);
    }
  }

  // Lateral arrival by parity, then the cards are perfectly still while read.
  // Replaces the single xPercent:7 reveal that used to run on [data-review-window].
  const reviewWindow = stage.querySelector<HTMLElement>('[data-review-window]');
  const cards = [...stage.querySelectorAll<HTMLElement>('.review-card')];
  if (reviewWindow && cards.length && !alreadyRead(reviewWindow, .94)) {
    gsap.from(cards, {
      x: (index: number) => (index % 2 ? 64 : -64), y: 32, opacity: 0,
      duration: .7, stagger: .08, ease: 'power3.out',
      scrollTrigger: { trigger: reviewWindow, start: 'top 94%', once: true },
    });
  }

  // Hover is a fine-pointer affordance only, and it moves no hit target.
  if (finePointer) {
    cards.forEach(card => {
      const ring = gsap.to(card, {
        boxShadow: '0 0 0 1px rgba(22,79,131,.55)', duration: .18, ease: 'power2.out', easeReverse: true, paused: true,
      });
      const rule = card.querySelector<HTMLElement>('[data-review-link] .link-rule');
      const travel = rule
        ? gsap.to(rule, { scaleX: 1, duration: .18, ease: 'power2.out', easeReverse: true, paused: true })
        : undefined;
      const link = card.querySelector<HTMLElement>('[data-review-link]');
      const ringIn = () => ring.play();
      const ringOut = () => ring.reverse();
      const ruleIn = () => travel?.play();
      const ruleOut = () => travel?.reverse();
      card.addEventListener('pointerenter', ringIn);
      card.addEventListener('pointerleave', ringOut);
      link?.addEventListener('pointerenter', ruleIn);
      link?.addEventListener('pointerleave', ruleOut);
      cleanups.push(() => {
        card.removeEventListener('pointerenter', ringIn);
        card.removeEventListener('pointerleave', ringOut);
        link?.removeEventListener('pointerenter', ruleIn);
        link?.removeEventListener('pointerleave', ruleOut);
      });
    });
  }

  return () => cleanups.forEach(cleanup => cleanup());
}

/** Owns editorial transforms only. The journey director owns all film layers. */
export default function EditorialMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.journey');
    if (!root) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let media: gsap.MatchMedia | undefined;
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

    // The still tier and the motion preference are not media queries, so they stay
    // an explicit gate; prefers-reduced-motion is expressed as a matchMedia condition
    // so the OS setting can flip live and revert every tween on its own.
    const stillRequested = () => journeyControls.getSnapshot().motionPreference === 'still'
      || document.documentElement.dataset.journeyTier === 'still';

    const applyMotion = () => {
      media?.revert();
      media = undefined;
      if (stillRequested()) return;
      media = gsap.matchMedia(root);
      media.add({
        enhanced: '(prefers-reduced-motion: no-preference)',
        finePointer: '(hover: hover) and (pointer: fine)',
      }, context => {
        const { enhanced, finePointer } = context.conditions as { enhanced: boolean; finePointer: boolean };
        if (!enhanced) return;
        root.querySelectorAll<HTMLElement>('[data-editorial-reveal]').forEach(element => {
          // The review stage has its own choreography below; everything else keeps the G2 reveal.
          if (element.closest('[data-review-stage]')) return;
          if (alreadyRead(element, .91)) return;
          gsap.from(element.children, { y: 36, opacity: 0, duration: .85, stagger: .09, ease: 'power3.out', scrollTrigger: { trigger: element, start: 'top 91%', once: true } });
        });
        root.querySelectorAll<HTMLElement>('[data-story-photo]').forEach((photo,index) => {
          // A deep link or return visit can hydrate after this reading position.
          // Already-passed photographs must never be initialized invisible.
          if (alreadyRead(photo, .88)) return;
          const image = photo.querySelector('picture');
          const caption = photo.querySelector('figcaption');
          const arrival = gsap.timeline({ defaults: { ease: 'power3.out' }, scrollTrigger: { trigger: photo, start: 'top 88%', once: true } });
          if (image) arrival.from(image, { xPercent: index % 2 ? 5 : -5, y: 42, scale: .965, opacity: 0, duration: 1.35 }, 0);
          if (caption) arrival.from(caption, { y: 12, opacity: 0, duration: .7 }, .35);
        });
        const lens = root.querySelector<HTMLElement>('[data-material-lens]');
        if (lens) gsap.fromTo(lens, { y: 38, x: 12 }, { y: -22, x: -12, ease: 'none', scrollTrigger: { trigger: '#foundation', start: 'top bottom', end: 'bottom top', scrub: .6 } });
        const stage = root.querySelector<HTMLElement>('[data-review-stage]');
        return stage ? buildReviewStage(stage, finePointer) : undefined;
      });
    };
    const unsubscribe = journeyControls.subscribe(applyMotion);
    applyMotion();
    return () => {
      media?.revert(); unsubscribe(); resize.disconnect();
      gallery?.removeEventListener('scroll', scheduleGallery);
      buttons.forEach(button => button.removeEventListener('click', moveGallery));
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
    };
  }, []);
  return null;
}
