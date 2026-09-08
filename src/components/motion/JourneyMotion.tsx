import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import {
  CHAPTER_ORDER,
  ROOM_GRADE,
  chapterPresence,
  mixHex,
  pourTimeFromProgress,
} from '../../lib/motion/passage';
import { dissolveProgress } from '../../lib/motion/dissolve';
import { Draggable, Flip, ScrollTrigger, SplitText, ensureGsapKit } from '../../lib/motion/gsap-kit';

function applyGrade(fromKey: string, toKey: string, blend: number) {
  const from = ROOM_GRADE[fromKey];
  const to = ROOM_GRADE[toKey] ?? from;
  if (!from) return;
  const t = Math.min(1, Math.max(0, blend));
  const root = document.documentElement;
  root.style.setProperty('--paper', mixHex(from.paper, to.paper, t));
  root.style.setProperty('--ink', mixHex(from.ink, to.ink, t));
  root.style.setProperty('--cobalt', mixHex(from.cobalt, to.cobalt, t));
}

function fitRailPill(pill: HTMLElement | null, button: HTMLElement | undefined) {
  if (!pill || !button) return;
  Flip.fit(pill, button, { duration: 0.55, ease: 'filmIn', scale: false });
}

export default function JourneyMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      root.dataset.journeyMotion = 'still';
      return;
    }

    ensureGsapKit();
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const lenis = new Lenis({
      lerp: coarse ? 0.11 : 0.08,
      smoothWheel: true,
      syncTouch: coarse,
    });
    lenis.on('scroll', ScrollTrigger.update);
    const ticker = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(ticker);
    gsap.ticker.lagSmoothing(0);

    const scroller = document.documentElement;
    ScrollTrigger.scrollerProxy(scroller, {
      scrollTop(value) {
        if (arguments.length) lenis.scrollTo(value ?? 0, { immediate: true });
        return scroller.scrollTop;
      },
      getBoundingClientRect() {
        return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
      },
    });

    const journey = document.querySelector<HTMLElement>('.journey');
    const chapters = [...document.querySelectorAll<HTMLElement>('.journey-chapter')];
    const halls = [...document.querySelectorAll<HTMLElement>('.journey-breath[data-hall-from]')];
    const railButtons = [...document.querySelectorAll<HTMLButtonElement>('.journey-rail button')];
    const pill = document.querySelector<HTMLElement>('.rail-pill');
    const films = [...document.querySelectorAll<HTMLVideoElement>('.pour-film, .floor-film-video')];
    const pinDistance = coarse ? '+=160%' : '+=220%';
    const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

    const context = gsap.context(() => {
      const drawPath = document.querySelector<SVGPathElement>('.journey-draw-path');
      const bead = document.querySelector<SVGGraphicsElement>('.journey-draw-bead');
      const writeDissolve = (fromIndex: number, toIndex: number, pin: number, breath: number) => {
        journey?.style.setProperty('--dissolve', dissolveProgress(pin, breath).toFixed(4));
        journey?.style.setProperty('--dissolve-from', String(fromIndex));
        journey?.style.setProperty('--dissolve-to', String(toIndex));
      };
      if (drawPath) {
        gsap.set(drawPath, { drawSVG: '0%' });
        gsap.to(drawPath, {
          drawSVG: '100%',
          ease: 'none',
          scrollTrigger: {
            trigger: journey,
            scroller,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.55,
          },
        });
      }
      if (bead && drawPath) {
        gsap.to(bead, {
          motionPath: {
            path: drawPath,
            align: drawPath,
            alignOrigin: [0.5, 0.5],
            autoRotate: false,
          },
          ease: 'none',
          scrollTrigger: {
            trigger: journey,
            scroller,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.55,
          },
        });
      }

      chapters.forEach((chapter, index) => {
        const titles = chapter.querySelectorAll<HTMLElement>('.display-title, .chapter-title');
        titles.forEach((title) => {
          if (title.dataset.split === 'true') return;
          SplitText.create(title, { type: 'chars,words', wordsClass: 'word', charsClass: 'char' });
          title.dataset.split = 'true';
        });
        const chars = chapter.querySelectorAll<HTMLElement>('.char');
        const type = chapter.querySelectorAll<HTMLElement>('.eyebrow, .lead, .chapter-link, .button-row');
        if (index === 0) {
          gsap.set(chars, { yPercent: 0, rotateX: 0, clearProps: 'transform,transformOrigin' });
          gsap.set(type, { y: 0, autoAlpha: 1 });
        } else {
          gsap.set(chars, { yPercent: 110, rotateX: 0, transformOrigin: '50% 100%' });
          gsap.set(type, { y: 20, autoAlpha: 0 });
        }

        const leads = chapter.querySelectorAll<HTMLElement>('.lead');
        if (index !== 0) gsap.set(leads, { clipPath: 'inset(0 100% 0 0)' });

        const revealType = () => {
          gsap.to(chars, {
            yPercent: 0,
            rotateX: 0,
            duration: 0.9,
            ease: 'filmIn',
            stagger: { each: 0.014, from: 'start' },
            overwrite: 'auto',
          });
          gsap.to(type, { y: 0, autoAlpha: 1, duration: 0.7, ease: 'expo.out', stagger: 0.05, overwrite: 'auto' });
          gsap.to(leads, { clipPath: 'inset(0 0% 0 0)', duration: 0.95, ease: 'power4.out', overwrite: 'auto' });
          const indexEl = chapter.querySelector<HTMLElement>('.chapter-index');
          if (indexEl) {
            const original = indexEl.textContent ?? '';
            gsap.to(indexEl, { duration: 0.7, scrambleText: { text: original, chars: '0123456789— ', speed: 0.4 } });
          }
        };

        const nextKey = CHAPTER_ORDER[index + 1] ?? CHAPTER_ORDER[index];

        const note = chapter.querySelectorAll('.material-note span, .material-note p');
        if (note.length) {
          gsap.from(note, {
            y: 30,
            autoAlpha: 0,
            stagger: 0.07,
            duration: 0.75,
            ease: 'filmIn',
            scrollTrigger: { trigger: chapter, scroller, start: 'top 70%', once: true },
          });
        }

        const comparison = chapter.querySelector<HTMLElement>('[data-project-comparison]');
        if (comparison) {
          gsap.from(comparison, {
            rotateY: 18,
            x: 80,
            autoAlpha: 0,
            duration: 1.2,
            ease: 'filmIn',
            transformOrigin: 'left center',
            scrollTrigger: { trigger: chapter, scroller, start: 'top 60%' },
          });
        }

        if (index !== 0) {
          ScrollTrigger.create({
            trigger: chapter,
            scroller,
            start: 'top 78%',
            once: true,
            onEnter: revealType,
          });
        }

        ScrollTrigger.create({
          trigger: chapter,
          scroller,
          start: 'top top',
          end: pinDistance,
          pin: true,
          pinSpacing: true,
          onEnter: () => {
            revealType();
            const film = chapter.querySelector<HTMLVideoElement>('.pour-film, .floor-film-video');
            if (film && !saveData) {
              film.preload = 'auto';
              if (film.readyState < 2) film.load();
            }
          },
          onEnterBack: revealType,
          onUpdate: (self) => {
            const key = chapter.dataset.journeyChapter ?? 'portico';
            const presence = self.progress < 0.82 ? 1 : chapterPresence(self.progress);
            chapter.style.setProperty('--chapter-in', presence.toFixed(4));
            chapter.classList.toggle('is-pinned', self.isActive);
            journey?.setAttribute('data-room', key);
            applyGrade(key, nextKey, Math.max(0, (self.progress - 0.62) / 0.38));
            railButtons.forEach((button, buttonIndex) => {
              button.setAttribute('aria-current', buttonIndex === index ? 'true' : 'false');
            });
            if (self.isActive) fitRailPill(pill, railButtons[index]);
            if (key === 'proof') {
              const stage = chapter.querySelector<HTMLElement>('[data-project-comparison]');
              if (stage) stage.style.setProperty('--reveal', `${8 + self.progress * 84}%`);
            }
            const film = chapter.querySelector<HTMLVideoElement>('.pour-film, .floor-film-video');
            const still = chapter.querySelector<HTMLElement>('.floor-film-poster, .pour-poster');
            if (film && !saveData && Number.isFinite(film.duration) && film.duration > 0.4 && film.readyState >= 2) {
              const next = pourTimeFromProgress(self.progress, film.duration);
              if (Math.abs(film.currentTime - next) > 0.04) film.currentTime = next;
            } else if (still) {
              const t = self.progress;
              still.style.transform = `translate3d(${(-5 + t * 5).toFixed(2)}%, ${(2 - t * 4).toFixed(2)}%, 0) scale(${(1.08 - t * 0.06).toFixed(3)})`;
            }
            writeDissolve(index, Math.min(index + 1, chapters.length - 1), self.progress, 0);
            if (self.progress > 0.55 && !saveData) {
              const upcoming = chapters[index + 1]?.querySelector<HTMLVideoElement>('.floor-film-video, .pour-film');
              if (upcoming && upcoming.preload !== 'auto') {
                upcoming.preload = 'auto';
                if (upcoming.readyState < 2) upcoming.load();
              }
            }
          },
        });

        if (index === 0) {
          chapter.style.setProperty('--chapter-in', '1');
          revealType();
          fitRailPill(pill, railButtons[0]);
        }
      });

      if (!saveData) {
        films.forEach((film, filmIndex) => {
          film.muted = true;
          film.defaultMuted = true;
          film.playsInline = true;
          film.disablePictureInPicture = true;
          film.preload = filmIndex === 0 ? 'auto' : 'metadata';
          const unlock = () => {
            void film.play().then(() => film.pause()).catch(() => undefined);
          };
          if (film.readyState >= 1) unlock();
          else film.addEventListener('loadedmetadata', unlock, { once: true });
          if (filmIndex === 0) film.load();
        });
      }

      halls.forEach((hall) => {
        ScrollTrigger.create({
          trigger: hall,
          scroller,
          start: 'top 92%',
          end: 'bottom 8%',
          onUpdate: (self) => {
            const fromKey = hall.dataset.hallFrom ?? 'portico';
            const toKey = hall.dataset.hallTo ?? 'foundation';
            const fromIndex = Math.max(0, CHAPTER_ORDER.indexOf(fromKey as (typeof CHAPTER_ORDER)[number]));
            const toIndex = Math.max(0, CHAPTER_ORDER.indexOf(toKey as (typeof CHAPTER_ORDER)[number]));
            journey?.setAttribute('data-room', self.progress < 0.5 ? fromKey : toKey);
            applyGrade(fromKey, toKey, self.progress);
            writeDissolve(fromIndex, toIndex, 1, self.progress);
          },
        });
      });

      const orbit = document.querySelector<HTMLElement>('.finish-orbit-track');
      if (orbit) {
        const marquee = gsap.to(orbit, { xPercent: -50, duration: 42, ease: 'none', repeat: -1 });
        Draggable.create(orbit, {
          type: 'x',
          inertia: true,
          dragResistance: 0.18,
          onPress() {
            marquee.pause();
          },
          onRelease() {
            marquee.resume();
          },
        });
      }

      const reviewTrack = document.querySelector<HTMLElement>('.review-marquee-track');
      if (reviewTrack) {
        const reviewMarquee = gsap.to(reviewTrack, { xPercent: -50, duration: 48, ease: 'none', repeat: -1 });
        Draggable.create(reviewTrack, {
          type: 'x',
          inertia: true,
          dragResistance: 0.12,
          onPress() {
            reviewMarquee.pause();
          },
          onRelease() {
            reviewMarquee.resume();
          },
        });
      }

      [...document.querySelectorAll<HTMLElement>('.journey-interlude')].forEach((block) => {
        const title = block.querySelector<HTMLElement>('.interlude-title');
        if (title && title.dataset.split !== 'true') {
          SplitText.create(title, { type: 'chars,words', wordsClass: 'word', charsClass: 'char' });
          title.dataset.split = 'true';
        }
        const chars = block.querySelectorAll<HTMLElement>('.interlude-title .char');
        const copy = block.querySelectorAll<HTMLElement>('.interlude-grid p, .social-actions, .social-head .eyebrow');
        gsap.set(chars, { yPercent: 110, rotateX: 12, transformOrigin: '50% 100%' });
        gsap.set(copy, { y: 28, autoAlpha: 0 });
        gsap.to(block, {
          '--rule': 1,
          ease: 'none',
          scrollTrigger: { trigger: block, scroller, start: 'top 82%', end: 'top 48%', scrub: 0.35 },
        });
        ScrollTrigger.create({
          trigger: block,
          scroller,
          start: 'top 74%',
          once: true,
          onEnter: () => {
            gsap.to(chars, { yPercent: 0, rotateX: 0, duration: 0.9, ease: 'filmIn', stagger: 0.012, overwrite: 'auto' });
            gsap.to(copy, { y: 0, autoAlpha: 1, duration: 0.75, ease: 'expo.out', stagger: 0.06, delay: 0.08, overwrite: 'auto' });
            const eyebrow = block.querySelector<HTMLElement>('.eyebrow');
            if (eyebrow) {
              const original = eyebrow.textContent ?? '';
              gsap.to(eyebrow, { duration: 0.7, scrambleText: { text: original, chars: 'upperCase', speed: 0.45 } });
            }
          },
        });
      });

    });

    railButtons.forEach((button, index) => {
      button.addEventListener('click', () => {
        const target = chapters[index];
        if (target) lenis.scrollTo(target, { offset: 0, duration: 2.1, easing: (t: number) => 1 - (1 - t) ** 3 });
        fitRailPill(pill, button);
      });
    });

    root.dataset.journeyMotion = 'enhanced';
    ScrollTrigger.refresh();
    return () => {
      context.revert();
      gsap.ticker.remove(ticker);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      ScrollTrigger.scrollerProxy(scroller, {});
      delete root.dataset.journeyMotion;
    };
  }, []);

  return null;
}
