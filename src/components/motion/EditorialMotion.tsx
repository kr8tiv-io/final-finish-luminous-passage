import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger, SplitText, ensureGsapKit } from '../../lib/motion/gsap-kit';
import { journeyControls } from '../../lib/motion/journey-controls';
import type { JourneyTier } from '../../lib/motion/journey-tier';
import { onRouteTeardown } from '../../lib/motion/route-lifecycle';

ensureGsapKit();

/** A hydration after this reading position must never leave copy in a start state. */
const alreadyRead = (element: Element, ratio: number) => element.getBoundingClientRect().top < window.innerHeight * ratio;

/** How far a card travels in from the side its row arrives from. */
const CARD_TRAVEL = 64;
/** The caption drifts a fraction of that, along the same axis (T1). */
const CAPTION_DRIFT = 12;
/** The card entrance's own duration, so the caption's lag is stated once. */
const CARD_ARRIVAL = 0.7;
/** Storyboard §7: `caption-drift` runs 0.12 s behind the thing it belongs to. */
const CAPTION_LAG = 0.12;

const cardOf = (element: Element) => element.closest<HTMLElement>('[data-review-card]');

/**
 * Group the cells into visual rows by their top edge, and publish on each card the
 * direction its row arrives from: L, R, L … down the grid, alternating per row exactly as
 * storyboard §3 casts Act 2. Two layouts have no lateral axis to arrive along and are
 * tagged `below` instead: a one-column grid (§2's phone plan, "cards arrive from below")
 * and the `balanced` tier, which gets the same from-below arrival at every width.
 *
 * The applied values live on the card as data attributes rather than in a closure, so the
 * built page can be probed for what it will actually do, and so a re-group after a resize
 * is picked up by the function-based tween values at the moment a row finally arrives.
 *
 * Cells are measured, never cards: every cell below the first row carries
 * `content-visibility: auto`, and a card inside a skipped cell has no box to measure.
 */
function assignRowDirections(cells: HTMLElement[], lateral: boolean) {
  const rows = new Map<number, HTMLElement[]>();
  for (const cell of cells) {
    const top = Math.round(cell.offsetTop);
    const row = rows.get(top);
    if (row) row.push(cell);
    else rows.set(top, [cell]);
  }
  const tops = [...rows.keys()].sort((a, b) => a - b);
  const columns = tops.reduce((widest, top) => Math.max(widest, rows.get(top)?.length ?? 0), 1);
  tops.forEach((top, index) => {
    const fromBelow = !lateral || columns === 1;
    const fromRight = index % 2 === 1;
    for (const cell of rows.get(top) ?? []) {
      const card = cell.querySelector<HTMLElement>('[data-review-card]');
      if (!card) continue;
      card.dataset.reviewRow = String(index);
      card.dataset.arriveFrom = fromBelow ? 'below' : fromRight ? 'right' : 'left';
      card.dataset.arriveX = fromBelow ? '0' : String(fromRight ? CARD_TRAVEL : -CARD_TRAVEL);
    }
  });
}

/**
 * The customer-word stage: eyebrow char float, masked heading fold, the rating sliding up
 * through its clip, five stars, and the rows of cards arriving laterally and then holding
 * still. Called inside a gsap.matchMedia context, so returning a cleanup is enough; the
 * context is also passed in because the row entrances are built inside a ScrollTrigger
 * callback, long after this function has returned, and have to be recorded to be reverted.
 *
 * @motion char-float
 * @motion char-fold
 * @motion rating-clip
 * @motion lateral-card-arrival
 * @motion caption-drift
 * @motion card-ring
 * @motion underline-travel
 */
function buildReviewStage(stage: HTMLElement, finePointer: boolean, tier: JourneyTier, context: gsap.Context) {
  const cleanups: Array<() => void> = [];

  /**
   * Young Multi char float, scrubbed. No already-read guard is needed: a scrub that starts
   * above the viewport resolves to progress 1, which is the settled state.
   * @motion char-float
   */
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

  /**
   * gsap.com clip-wrapper fold. SplitText keeps one accessible string via aria:'auto'.
   * @motion char-fold
   */
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

  /**
   * The real 5.0 slides up through its own clip; never a counted-up number.
   * @motion rating-clip
   */
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

  /**
   * One row of cards is one batch: they share a top edge, so they enter together and are
   * tweened together, from that row's own side of the page. `toggleActions` by way of
   * `once`, never a scrub — after a row lands, nothing in this section moves again while
   * it is being read (the `data-hold-window` list in `SocialProof.astro`, storyboard §7).
   * The caption follows its own card by `CAPTION_LAG`, drifting along the same axis.
   *
   * Cards the visitor has already scrolled past are filtered out rather than animated, so
   * a deep link or a late hydration lands on settled copy (T7).
   *
   * @motion lateral-card-arrival
   * @motion caption-drift
   */
  const cells = [...stage.querySelectorAll<HTMLElement>('.review-cell')];
  if (cells.length) {
    // `balanced` keeps the arrival but drops the lateral axis: from below, opacity, nothing
    // travelling sideways across a device that is already working to composite the journey.
    const lateral = tier !== 'balanced';
    assignRowDirections(cells, lateral);
    const regroup = () => assignRowDirections(cells, lateral);
    ScrollTrigger.addEventListener('refresh', regroup);
    cleanups.push(() => ScrollTrigger.removeEventListener('refresh', regroup));

    const arriving = cells.filter(cell => !alreadyRead(cell, .92));
    if (arriving.length) {
      ScrollTrigger.batch(arriving, {
        start: 'top 92%',
        once: true,
        batchMax: 3,
        interval: .12,
        onEnter: batch => context.add(() => {
          const cards = batch
            .map(cell => cell.querySelector<HTMLElement>('[data-review-card]'))
            .filter((card): card is HTMLElement => card !== null);
          if (!cards.length) return;
          const arrival = gsap.timeline();
          arrival.from(cards, {
            x: (_index: number, target: HTMLElement) => Number(target.dataset.arriveX ?? 0),
            y: (_index: number, target: HTMLElement) => (target.dataset.arriveFrom === 'below' ? 40 : 32),
            opacity: 0, duration: CARD_ARRIVAL, stagger: .08, ease: 'power3.out',
          }, 0);
          const captions = cards
            .map(card => card.querySelector<HTMLElement>('[data-review-caption]'))
            .filter((caption): caption is HTMLElement => caption !== null);
          if (captions.length) {
            arrival.from(captions, {
              x: (_index: number, target: HTMLElement) => {
                const from = cardOf(target)?.dataset.arriveFrom;
                return from === 'left' ? -CAPTION_DRIFT : from === 'right' ? CAPTION_DRIFT : 0;
              },
              y: (_index: number, target: HTMLElement) => (cardOf(target)?.dataset.arriveFrom === 'below' ? CAPTION_DRIFT : 0),
              opacity: 0, duration: .5, stagger: .08, ease: 'power2.out',
            }, CAPTION_LAG);
          }
        }),
      });
    }
  }

  // Hover is a fine-pointer affordance only, and it moves no hit target (H1). Keyboard
  // focus inside a card plays the same two tweens on the same curves (H4).
  if (finePointer) {
    const cards = [...stage.querySelectorAll<HTMLElement>('[data-review-card]')];
    cards.forEach(card => {
      /** @motion card-ring */
      const ring = gsap.to(card, {
        boxShadow: '0 0 0 1px rgba(22,79,131,.55)', duration: .18, ease: 'power2.out', easeReverse: true, paused: true,
      });
      /** @motion underline-travel */
      const rule = card.querySelector<HTMLElement>('[data-review-link] .link-rule');
      const travel = rule
        ? gsap.to(rule, { scaleX: 1, duration: .18, ease: 'power2.out', easeReverse: true, paused: true })
        : undefined;
      const link = card.querySelector<HTMLElement>('[data-review-link]');
      const ringIn = () => ring.play();
      const ringOut = () => ring.reverse();
      const ruleIn = () => travel?.play();
      const ruleOut = () => travel?.reverse();
      const focusIn = () => { ring.play(); travel?.play(); };
      const focusOut = () => { ring.reverse(); travel?.reverse(); };
      card.addEventListener('pointerenter', ringIn);
      card.addEventListener('pointerleave', ringOut);
      card.addEventListener('focusin', focusIn);
      card.addEventListener('focusout', focusOut);
      link?.addEventListener('pointerenter', ruleIn);
      link?.addEventListener('pointerleave', ruleOut);
      cleanups.push(() => {
        card.removeEventListener('pointerenter', ringIn);
        card.removeEventListener('pointerleave', ringOut);
        card.removeEventListener('focusin', focusIn);
        card.removeEventListener('focusout', focusOut);
        link?.removeEventListener('pointerenter', ruleIn);
        link?.removeEventListener('pointerleave', ruleOut);
      });
    });
  }

  return () => cleanups.forEach(cleanup => cleanup());
}

const readTier = (): JourneyTier => {
  const value = document.documentElement.dataset.journeyTier;
  return value === 'still' || value === 'balanced' || value === 'full' ? value : 'full';
};

/**
 * Owns editorial transforms only. The journey director owns all film layers.
 * @motion editorial-reveal
 * @motion story-photo-arrival
 * @motion material-lens
 */
export default function EditorialMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.journey');
    if (!root) return;
    let media: gsap.MatchMedia | undefined;
    // `JourneyMotion` is the only writer of `data-journey-tier` and it is a separate
    // island, so the attribute can land before or after this effect runs. Read it, and
    // rebuild when it actually changes value — never on every re-write of the same tier.
    let tier = readTier();

    // The still tier and the motion preference are not media queries, so they stay
    // an explicit gate; prefers-reduced-motion is expressed as a matchMedia condition
    // so the OS setting can flip live and revert every tween on its own.
    const stillRequested = () => journeyControls.getSnapshot().motionPreference === 'still' || tier === 'still';

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
        return stage ? buildReviewStage(stage, finePointer, tier, context) : undefined;
      });
    };
    const unsubscribe = journeyControls.subscribe(applyMotion);
    const watchTier = new MutationObserver(() => {
      const next = readTier();
      if (next === tier) return;
      tier = next;
      applyMotion();
    });
    watchTier.observe(document.documentElement, { attributes: true, attributeFilter: ['data-journey-tier'] });
    applyMotion();
    // `media.revert()` is the only thing that undoes this island's gsap.matchMedia
    // context, and a route swap has to see it happen *before* the body is replaced —
    // Astro's own unmount lands a beat later, on `astro:after-swap`.
    return onRouteTeardown(() => {
      media?.revert(); unsubscribe(); watchTier.disconnect();
    });
  }, []);
  return null;
}
