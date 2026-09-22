/**
 * The site's one entrance vocabulary (2026-09-22, Matt: "more dramatic headlines",
 * "better GSAP examples of them coming in", "wording coming in from different places").
 *
 * Every page uses these and nothing else, so the homepage and the interior pages move
 * the same way:
 *
 *   converge   headlines: split into words; the roman words fly in from alternating
 *              sides and above/below, blurred and slightly turned, and settle; the
 *              italic accent (<em>) rises last from below. Lines are split too, so a
 *              held headline can drift line against line afterwards (`driftLines`).
 *   cascade    kickers: the letters tip up out of their own baseline, one after another.
 *   rise       body copy and links: a short fade up.
 *   fill       statements: lines fill from pale grey to ink as they cross the reading line.
 *   media      photographs: open from one edge and settle out of a slight zoom.
 *
 * All of it is transform/opacity/filter/clip-path only; nothing changes layout. The
 * split keeps the words whole (`.t-word` is inline-block) and `aria: 'auto'` keeps the
 * heading read as one sentence.
 *
 * @motion word-converge
 * @motion char-cascade
 * @motion fade-rise
 * @motion statement-fill
 * @motion media-open
 * @motion line-drift
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

type Teardown = () => void;

/** Where each roman word comes from, in turns: left, right, above, below. */
const FROM = [
  { x: -135, y: 12, r: -5 },
  { x: 135, y: -8, r: 5 },
  { x: 14, y: -115, r: -2 },
  { x: -10, y: 120, r: 3 },
] as const;

export interface Converged {
  split: SplitText;
  /** The headline's lines, for `driftLines`. */
  lines: HTMLElement[];
}

/**
 * Split a headline into lines and words and fly the words in.
 * `delay` shifts the whole entrance; `scrub` ties it to a ScrollTrigger instead of time.
 */
export function converge(title: HTMLElement, options: { delay?: number; duration?: number } = {}): Converged {
  const state: Converged = { split: null as unknown as SplitText, lines: [] };
  state.split = SplitText.create(title, {
    type: 'lines,words',
    linesClass: 't-conv-line',
    wordsClass: 't-word',
    aria: 'auto',
    autoSplit: true,
    onSplit: (self) => {
      state.lines = self.lines as HTMLElement[];
      const words = self.words as HTMLElement[];
      let roman = 0;
      const timeline = gsap.timeline({ delay: options.delay ?? 0 });
      words.forEach((word, index) => {
        const accent = Boolean(word.closest('em'));
        const from = accent ? { x: 0, y: 105, r: 4 } : FROM[roman++ % FROM.length];
        timeline.fromTo(word, {
          xPercent: from.x,
          yPercent: from.y,
          rotation: from.r,
          opacity: 0,
          filter: 'blur(14px)',
        }, {
          xPercent: 0,
          yPercent: 0,
          rotation: 0,
          opacity: 1,
          filter: 'blur(0px)',
          duration: options.duration ?? 1.45,
          ease: 'expo.out',
          clearProps: 'filter',
        }, (accent ? 0.28 : 0) + index * 0.065);
      });
      return timeline;
    },
  });
  return state;
}

/** Headline lines drift apart while held (0 = aligned, 1 = fully drifted). */
export function driftLines(lines: HTMLElement[], progress: number, amount = 2.4) {
  lines.forEach((line, index) => {
    const direction = index % 2 === 0 ? -1 : 1;
    line.style.transform = `translate3d(${(direction * amount * progress).toFixed(3)}%, 0, 0)`;
  });
}

/**
 * Kicker words tip up out of their baseline, one after another. Words, not letters:
 * the italic display face is kerned, and a box per letter throws its spacing away.
 */
export function cascade(kicker: HTMLElement, delay = 0): SplitText {
  return SplitText.create(kicker, {
    type: 'words',
    wordsClass: 't-kick-word',
    aria: 'auto',
    onSplit: (self) => gsap.fromTo(self.words, {
      yPercent: 110,
      rotationX: -80,
      opacity: 0,
      transformOrigin: '50% 100%',
    }, {
      yPercent: 0,
      rotationX: 0,
      opacity: 1,
      duration: 0.9,
      ease: 'power4.out',
      stagger: 0.05,
      delay,
      clearProps: 'transform,opacity',
    }),
  });
}

/** Body copy and links: a short fade up. */
export function rise(elements: Element[], delay = 0) {
  if (!elements.length) return;
  gsap.fromTo(elements, { opacity: 0, y: 18 }, {
    opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.08, delay, clearProps: 'transform,opacity',
  });
}

/**
 * Bind the whole vocabulary to a subtree, triggered as each piece enters the viewport.
 * Headlines: `[data-reveal="title"]` plus the shared title classes. Returns a teardown.
 */
export function bindReveals(root: ParentNode, options: { titles?: string } = {}): Teardown {
  const triggers: ScrollTrigger[] = [];
  const splits: SplitText[] = [];
  const titleSelector = options.titles ?? '[data-reveal="title"]';

  root.querySelectorAll<HTMLElement>(titleSelector).forEach((title) => {
    gsap.set(title, { opacity: 0 });
    triggers.push(ScrollTrigger.create({
      trigger: title,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.set(title, { opacity: 1 });
        splits.push(converge(title).split);
      },
    }));
  });

  root.querySelectorAll<HTMLElement>('[data-reveal="kicker"]').forEach((kicker) => {
    gsap.set(kicker, { opacity: 0 });
    triggers.push(ScrollTrigger.create({
      trigger: kicker,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        gsap.set(kicker, { opacity: 1 });
        splits.push(cascade(kicker));
      },
    }));
  });

  root.querySelectorAll<HTMLElement>('[data-reveal="fade"]').forEach((el) => {
    gsap.set(el, { opacity: 0, y: 18 });
    triggers.push(ScrollTrigger.create({
      trigger: el,
      start: 'top 92%',
      once: true,
      onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', clearProps: 'transform,opacity' }),
    }));
  });

  // Statements fill from a pale grey to ink as they cross the reading line.
  root.querySelectorAll<HTMLElement>('[data-reveal="fill"]').forEach((el) => {
    splits.push(SplitText.create(el, {
      type: 'lines',
      linesClass: 't-fill-line',
      aria: 'auto',
      autoSplit: true,
      onSplit: (self) => gsap.fromTo(self.lines, { color: 'rgb(23 34 42 / 0.18)' }, {
        color: 'rgb(23 34 42 / 1)',
        ease: 'none',
        stagger: 0.6,
        scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: 0.6 },
      }),
    }));
  });

  // Photographs open from their lower edge and settle out of a slight zoom.
  root.querySelectorAll<HTMLElement>('[data-reveal="media"]').forEach((el) => {
    const img = el.querySelector('img');
    gsap.set(el, { clipPath: 'inset(18% 0% 0% 0%)' });
    if (img) gsap.set(img, { scale: 1.14 });
    triggers.push(ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.out', clearProps: 'clipPath' });
        if (img) gsap.to(img, { scale: 1, duration: 1.9, ease: 'expo.out', clearProps: 'transform' });
      },
    }));
  });

  // Anything that arrives from a side: `data-reveal="from-left" | "from-right"`.
  (['from-left', 'from-right'] as const).forEach((side) => {
    root.querySelectorAll<HTMLElement>(`[data-reveal="${side}"]`).forEach((el) => {
      const x = side === 'from-left' ? -90 : 90;
      gsap.set(el, { opacity: 0, x });
      triggers.push(ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: () => gsap.to(el, { opacity: 1, x: 0, duration: 1.4, ease: 'expo.out', clearProps: 'transform,opacity' }),
      }));
    });
  });

  return () => {
    triggers.forEach((trigger) => trigger.kill());
    splits.forEach((split) => split.revert());
  };
}
