import { useEffect } from 'react';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

/** Editorial entrances never transform the editor, its controls, or its photo. */
export default function VisualizerMotion({ selectedId }: { selectedId: string }) {
  useEffect(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const heading = document.querySelector<HTMLElement>('.visualizer-intro h1');
      if (!heading) return;
      const split = SplitText.create(heading, {
        type: 'lines', linesClass: 'studio-title-line', autoSplit: true,
        onSplit: (instance) => gsap.from(instance.lines, {
          y: 12, opacity: 0, duration: .65, stagger: .06, ease: 'power3.out',
        }),
      });
      return () => split.revert();
    });
    return () => media.revert();
  }, []);
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
