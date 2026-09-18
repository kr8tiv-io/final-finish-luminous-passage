import { useEffect } from 'react';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ensureVisualizerGsap } from '../../lib/visualizer/motion';

/** Editorial entrances never transform the editor, its controls, or its photo. */
export default function VisualizerMotion({ selectedId, hoverRevision = '' }: { selectedId: string; hoverRevision?: string }) {
  useEffect(() => {
    // One registration for the whole visualizer; `motion.ts` owns the kit.
    ensureVisualizerGsap();
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const heading = document.querySelector<HTMLElement>('.visualizer-intro h1');
      if (!heading) return;
      const split = SplitText.create(heading, {
        // `aria: 'none'` because the heading carries its own label; SplitText's "auto"
        // rewrites it from textContent and loses the space the <br> stands for.
        type: 'lines', linesClass: 'studio-title-line', mask: 'lines', autoSplit: true, aria: 'none',
        onSplit: (instance) => gsap.from(instance.lines, {
          yPercent: 106, opacity: 0, duration: .72, stagger: .07, ease: 'power3.out',
        }),
      });
      // First paint reads pillars, then floor, then chips. The canvas owns the first two.
      // Only the swatches fade: fading the buttons would drop their labels below the
      // contrast floor for as long as the stagger runs, and axe reads that as a failure.
      const swatches = [...document.querySelectorAll<HTMLElement>('.finish-grid .chip-swatch')];
      const chipEntrance = swatches.length
        ? gsap.from(swatches, {
          opacity: 0, y: 10, duration: .5, delay: .55, stagger: .012, ease: 'power2.out',
          clearProps: 'opacity,transform',
        })
        : null;
      return () => {
        chipEntrance?.kill();
        split.revert();
      };
    });
    return () => media.revert();
  }, []);

  // Hover set: `glint` on the chips, `underline-travel` on the library's links.
  // Fine pointer only, and neither one moves a hit target.
  useEffect(() => {
    ensureVisualizerGsap();
    const media = gsap.matchMedia();
    media.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
      const cleanups: Array<() => void> = [];
      for (const chip of document.querySelectorAll<HTMLElement>('.finish-grid button, .shortlist-entry')) {
        const glint = chip.querySelector<HTMLElement>('.chip-glint');
        if (!glint) continue;
        const xTo = gsap.quickTo(glint, 'x', { duration: .36, ease: 'power3.out' });
        const yTo = gsap.quickTo(glint, 'y', { duration: .36, ease: 'power3.out' });
        const opacityTo = gsap.quickTo(glint, 'opacity', { duration: .2, ease: 'power2.out' });
        let bounds: DOMRect | null = null;
        const activate = (event?: PointerEvent) => {
          bounds = chip.getBoundingClientRect();
          gsap.set(glint, {
            x: event ? event.clientX - bounds.left : bounds.width * .5,
            y: event ? event.clientY - bounds.top : bounds.height * .5,
          });
          opacityTo(1);
        };
        const track = (event: PointerEvent) => {
          if (!bounds) return;
          xTo(Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)));
          yTo(Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)));
        };
        const reset = () => { bounds = null; opacityTo(0); };
        chip.addEventListener('pointerenter', activate);
        chip.addEventListener('pointermove', track, { passive: true });
        chip.addEventListener('pointerleave', reset);
        chip.addEventListener('focus', () => activate());
        chip.addEventListener('blur', reset);
        cleanups.push(() => {
          chip.removeEventListener('pointerenter', activate);
          chip.removeEventListener('pointermove', track);
          chip.removeEventListener('pointerleave', reset);
          chip.removeEventListener('blur', reset);
          xTo.tween.kill(); yTo.tween.kill(); opacityTo.tween.kill();
          gsap.set(glint, { opacity: 0, x: 0, y: 0 });
        });
      }
      for (const link of document.querySelectorAll<HTMLElement>('.visualizer-shell a[data-underline-travel]')) {
        const rule = link.querySelector<HTMLElement>('.link-rule');
        if (!rule) continue;
        const travel = gsap.to(rule, { scaleX: 1, duration: .18, ease: 'power2.out', easeReverse: true, paused: true });
        const play = () => travel.play();
        const back = () => travel.reverse();
        link.addEventListener('pointerenter', play);
        link.addEventListener('pointerleave', back);
        link.addEventListener('focus', play);
        link.addEventListener('blur', back);
        cleanups.push(() => {
          link.removeEventListener('pointerenter', play);
          link.removeEventListener('pointerleave', back);
          link.removeEventListener('focus', play);
          link.removeEventListener('blur', back);
          travel.kill();
          gsap.set(rule, { scaleX: 0 });
        });
      }
      return () => cleanups.forEach((cleanup) => cleanup());
    });
    return () => media.revert();
    // `hoverRevision` changes when the shortlist row is rebuilt, so its entries are wired too.
  }, [hoverRevision]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const name = document.querySelector<HTMLElement>('.selected-finish h2');
    if (!name) return;
    const tween = gsap.fromTo(name, { opacity: .5 }, { opacity: 1, duration: .2, ease: 'power2.out' });
    return () => { tween.kill(); };
  }, [selectedId]);
  return null;
}

// Retained for the selection interface; swatches do not change position.
export function captureFinishFlip(_shell: HTMLElement | null) {}
