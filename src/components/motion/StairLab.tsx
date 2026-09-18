/**
 * The Step 20 side-by-side, and nothing else.
 *
 * `/lab/stairs` exists to put option A (the pearl-graded walkway film) and option B
 * (the 2.5D `DepthPlate`) under one scroll so Matt can judge them against each
 * other. This island is the single owner of that route's scroll coordinate: it
 * reads scroll once per frame, derives a 0–1 progress per panel from the panel's
 * own box, and hands the same number to both mechanics — the film's `currentTime`
 * and the plate's `progress` prop. Neither panel reads scroll itself, so the two
 * cannot drift apart, and nothing here touches `journey-director.ts`, which owns
 * the homepage's coordinates and is not involved on this route.
 *
 * The plate is rendered through a portal into panel B's host rather than being
 * mounted from the Astro page, because the page cannot pass a live value into an
 * island. One island, one scroll reader, two consumers.
 *
 * `window.__stairLab` is the probe the Step 20 captures read. It carries a
 * monotonicity counter for the scrub: a forward scroll that ever moved
 * `video.currentTime` backwards increments it, so "monotonic" is measured on the
 * real element rather than asserted from the mapping.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DepthPlate from './DepthPlate';

const FILM_FPS = 24;

declare global {
  interface Window {
    __stairLab?: {
      readonly a: number;
      readonly b: number;
      readonly videoTime: number;
      readonly videoDuration: number;
      readonly videoReadyState: number;
      readonly monotonicViolations: number;
      readonly samples: number;
      readonly plateProgress: number | null;
      readonly plateFrames: number | null;
    };
  }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function panelProgress(section: HTMLElement): number {
  const travel = section.offsetHeight - window.innerHeight;
  if (travel <= 0) return 0;
  return clamp01(-section.getBoundingClientRect().top / travel);
}

export default function StairLab() {
  const [plateHost, setPlateHost] = useState<HTMLElement | null>(null);
  const [plateProgress, setPlateProgress] = useState(0);
  const filmProgress = useRef(0);
  const lastTime = useRef(-1);
  const violations = useRef(0);
  const samples = useRef(0);
  const scheduled = useRef(0);

  const measure = useCallback(() => {
    scheduled.current = 0;
    const panelA = document.querySelector<HTMLElement>('[data-stair-panel="a"]');
    const panelB = document.querySelector<HTMLElement>('[data-stair-panel="b"]');
    const video = document.querySelector<HTMLVideoElement>('[data-stair-film]');
    if (panelA && video) {
      const p = panelProgress(panelA);
      const previousProgress = filmProgress.current;
      filmProgress.current = p;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (duration > 0) {
        // Quantise to the film's own 24 fps grid: an un-quantised seek per scroll
        // event asks the decoder for frames it has already shown and stutters.
        const frame = Math.round(p * (duration * FILM_FPS - 1));
        const time = Math.min(duration - 1 / (2 * FILM_FPS), frame / FILM_FPS);
        if (Math.abs(time - lastTime.current) >= 1 / (2 * FILM_FPS)) {
          // Monotonicity is a property of the pair (scroll direction, seek direction):
          // scrolling forward must never seek backwards. Measured, not assumed.
          if (lastTime.current >= 0 && time < lastTime.current && p >= previousProgress) violations.current += 1;
          lastTime.current = time;
          video.currentTime = time;
        }
        samples.current += 1;
      }
      panelA.dataset.stairProgress = p.toFixed(4);
    }
    if (panelB) {
      const p = panelProgress(panelB);
      panelB.dataset.stairProgress = p.toFixed(4);
      setPlateProgress(p);
    }
  }, []);

  const request = useCallback(() => {
    if (scheduled.current) return;
    scheduled.current = window.requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    setPlateHost(document.querySelector<HTMLElement>('[data-stair-plate-host]'));
    const video = document.querySelector<HTMLVideoElement>('[data-stair-film]');
    video?.pause();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    video?.addEventListener('loadedmetadata', request);
    measure();
    return () => {
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
      video?.removeEventListener('loadedmetadata', request);
      if (scheduled.current) window.cancelAnimationFrame(scheduled.current);
    };
  }, [measure, request]);

  useEffect(() => {
    window.__stairLab = {
      get a() { return filmProgress.current; },
      get b() { return plateProgress; },
      get videoTime() { return document.querySelector<HTMLVideoElement>('[data-stair-film]')?.currentTime ?? -1; },
      get videoDuration() { return document.querySelector<HTMLVideoElement>('[data-stair-film]')?.duration ?? -1; },
      get videoReadyState() { return document.querySelector<HTMLVideoElement>('[data-stair-film]')?.readyState ?? -1; },
      get monotonicViolations() { return violations.current; },
      get samples() { return samples.current; },
      get plateProgress() {
        const value = document.querySelector<HTMLElement>('[data-depth-plate]')?.dataset.plateProgress;
        return value === undefined ? null : Number(value);
      },
      get plateFrames() {
        const value = document.querySelector<HTMLElement>('[data-depth-plate]')?.dataset.plateFrames;
        return value === undefined ? null : Number(value);
      },
    };
    return () => {
      delete window.__stairLab;
    };
  }, [plateProgress]);

  if (!plateHost) return null;
  // Lab-only overrides so the Step 20 gates can run a control with the overscan
  // guard removed and show the hole counter move. Absent on every real route.
  const params = new URLSearchParams(window.location.search);
  const overscan = params.has('overscan') ? Number(params.get('overscan')) : undefined;
  const pitchDegrees = params.has('pitch') ? Number(params.get('pitch')) : undefined;
  return createPortal(
    <DepthPlate
      progress={plateProgress}
      overscan={Number.isFinite(overscan) ? overscan : undefined}
      pitchDegrees={Number.isFinite(pitchDegrees) ? pitchDegrees : undefined}
    />,
    plateHost,
  );
}
