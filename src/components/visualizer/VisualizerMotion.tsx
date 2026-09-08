import { useEffect } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { Observer } from 'gsap/Observer';
import { SplitText } from 'gsap/SplitText';
import { ensureVisualizerGsap } from '../../lib/visualizer/motion';

export default function VisualizerMotion({ selectedId }: { selectedId: string }) {
  useEffect(() => {
    ensureVisualizerGsap();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const intro = document.querySelector('.visualizer-intro');
    const title = intro?.querySelector('h1');
    const context = gsap.context(() => {
      if (title && !title.dataset.split) {
        const split = SplitText.create(title, { type: 'words,chars', charsClass: 'char' });
        title.dataset.split = 'true';
        gsap.from(split.chars, {
          yPercent: 110,
          opacity: 0,
          stagger: 0.016,
          duration: 0.9,
          ease: 'alcove',
        });
      }
      gsap.from('.visualizer-intro > p, .alcove-frame', {
        autoAlpha: 0,
        y: 28,
        duration: 1.1,
        stagger: 0.12,
        ease: 'power3.out',
        delay: 0.15,
      });
      gsap.from('.visualizer-shell', {
        y: 48,
        autoAlpha: 0,
        duration: 1.2,
        ease: 'alcove',
        delay: 0.2,
      });
    });

    return () => context.revert();
  }, []);

  useEffect(() => {
    ensureVisualizerGsap();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const name = document.querySelector<HTMLElement>('.selected-finish h2');
    if (!name || reduced) return;
    const split = SplitText.create(name, { type: 'chars,words' });
    const tween = gsap.from(split.chars, {
      yPercent: 110,
      opacity: 0,
      stagger: 0.02,
      duration: 0.7,
      ease: 'alcove',
    });
    return () => {
      tween.kill();
      split.revert();
    };
  }, [selectedId]);

  useEffect(() => {
    ensureVisualizerGsap();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;

    const shell = document.querySelector<HTMLElement>('.visualizer-shell');
    if (!shell) return undefined;
    const state = (shell as HTMLElement & { _flipState?: ReturnType<typeof Flip.getState> })._flipState;
    if (state) {
      Flip.from(state, {
        targets: '.finish-grid button, .finish-live-swatch',
        duration: 0.85,
        ease: 'alcove',
        absolute: true,
        fade: true,
        scale: true,
        nested: true,
        prune: true,
      });
      delete (shell as HTMLElement & { _flipState?: ReturnType<typeof Flip.getState> })._flipState;
    }

    return undefined;
  }, [selectedId]);

  useEffect(() => {
    ensureVisualizerGsap();
    const stage = document.querySelector<HTMLElement>('[data-finish-stage]');
    if (!stage || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const observer = Observer.create({
      target: stage,
      type: 'pointer',
      onMove: (self) => {
        if ((self.event?.target as HTMLElement | null)?.closest('.plane-guide, .upload-button, input')) return;
        const rect = stage.getBoundingClientRect();
        const pointer = self.event as PointerEvent | MouseEvent | undefined;
        const px = self.x ?? pointer?.clientX ?? 0;
        const py = self.y ?? pointer?.clientY ?? 0;
        const x = (px - rect.left) / rect.width;
        const y = (py - rect.top) / rect.height;
        stage.dispatchEvent(new CustomEvent('finish-light', { detail: { x, y } }));
      },
    });
    return () => observer.kill();
  }, []);

  return null;
}

export function captureFinishFlip(shell: HTMLElement | null) {
  if (!shell || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  ensureVisualizerGsap();
  (shell as HTMLElement & { _flipState?: ReturnType<typeof Flip.getState> })._flipState = Flip.getState('.finish-grid button, .finish-live-swatch', {
    props: 'backgroundColor,opacity',
  });
}
