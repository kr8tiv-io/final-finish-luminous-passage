import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { transformations, type Transformation } from '../../data/transformation-gallery';
import { journeyControls } from '../../lib/motion/journey-controls';
import { journeyDirector } from '../../lib/motion/journey-director';
import {
  clampReveal,
  getGalleryProgressForTarget,
  getGalleryScrollTarget,
  getNearestGalleryIndex,
  getVerticalScrollPosition,
  isScrollDrivenGalleryAdmissible,
  resolveDragOwner,
} from '../../lib/projects/transformation-gallery';
import './transformation-gallery.css';

gsap.registerPlugin(ScrollTrigger);

type PointerStart = { x: number; y: number; pointerId: number; owner: 'comparison' | 'page' | null } | null;

function Picture({ image }: { image: Transformation['before'] }) {
  return (
    <picture>
      <source type="image/avif" srcSet={image.avif} />
      <source type="image/webp" srcSet={image.webp} />
      <img
        src={image.jpeg}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading="lazy"
        draggable={false}
        decoding="async"
      />
    </picture>
  );
}

function Comparison({ project, hasHydrated }: { project: Transformation; hasHydrated: boolean }) {
  const [reveal, setReveal] = useState(50);
  const pointerStart = useRef<PointerStart>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const style = { '--reveal': `${reveal}%` } as CSSProperties;

  const setRevealFromPointer = (clientX: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    setReveal(clampReveal(((clientX - bounds.left) / bounds.width) * 100));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, owner: null };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    if (!start || event.pointerType === 'mouse' && event.buttons !== 1) return;
    const owner = start.owner ?? resolveDragOwner({
      startsInComparison: true,
      deltaX: event.clientX - start.x,
      deltaY: event.clientY - start.y,
    });
    if (owner === 'undecided') return;
    start.owner = owner === 'comparison' ? 'comparison' : 'page';
    if (owner !== 'comparison') return;
    if (!stageRef.current?.hasPointerCapture(event.pointerId)) stageRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
    setRevealFromPointer(event.clientX);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (stageRef.current?.hasPointerCapture(event.pointerId)) stageRef.current.releasePointerCapture(event.pointerId);
    pointerStart.current = null;
  };

  return (
    <article className={`transformation-card transformation-card--${project.frame}`} aria-labelledby={`${project.id}-title`}>
      <div
        ref={stageRef}
        className="transformation-stage"
        style={style}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
      >
        <div className="transformation-photo transformation-photo--before"><Picture image={project.before} /></div>
        <div className="transformation-photo transformation-photo--after"><Picture image={project.after} /></div>
        {reveal < 100 && <span className={`transformation-label ${reveal === 0 ? 'transformation-label--left' : 'transformation-label--right'}`}>Before</span>}
        {reveal > 0 && <span className={`transformation-label ${reveal === 100 ? 'transformation-label--right' : 'transformation-label--left'}`}>After</span>}
        <span className="transformation-divider" aria-hidden="true"><i>↔</i></span>
        <input
          className="transformation-range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={reveal}
          aria-label={`Reveal before and after photographs for ${project.title}`}
          aria-valuetext={`${reveal}% after photograph visible`}
          disabled={!hasHydrated}
          onChange={(event) => setReveal(clampReveal(Number(event.currentTarget.value)))}
        />
      </div>
      <div className="transformation-caption" data-gallery-swipe-zone>
        <div>
          <p className="transformation-index">{project.tabLabel}</p>
          <h3 id={`${project.id}-title`}>{project.title}</h3>
        </div>
        <p className="transformation-rationale">{project.homeownerCaption}</p>
      </div>
    </article>
  );
}

export default function TransformationGallery() {
  const galleryRef = useRef<HTMLElement>(null);
  const pinShellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeTweenRef = useRef<gsap.core.Tween | null>(null);
  const pinTriggerRef = useRef<ScrollTrigger | null>(null);
  const pinTargetProgressesRef = useRef<number[]>([]);
  const scrollDrivenRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [scrollDriven, setScrollDriven] = useState(false);
  const [pinRange, setPinRange] = useState<{ start: number; end: number } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const journeySnapshot = useSyncExternalStore(journeyControls.subscribe, journeyControls.getSnapshot, journeyControls.getServerSnapshot);

  useEffect(() => {
    setHasHydrated(true);
    journeyControls.hydrate();
  }, []);

  useEffect(() => {
    scrollDrivenRef.current = scrollDriven;
  }, [scrollDriven]);

  const restoreSnap = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.style.scrollSnapType = '';
    activeTweenRef.current = null;
  };

  const stopGalleryTween = () => {
    activeTweenRef.current?.kill();
    restoreSnap();
  };

  useEffect(() => {
    stopGalleryTween();
  }, [journeySnapshot.motionPreference]);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateReducedMotion = () => {
      setReducedMotion(reducedMotionQuery.matches);
      if (reducedMotionQuery.matches) stopGalleryTween();
    };
    updateReducedMotion();
    reducedMotionQuery.addEventListener('change', updateReducedMotion);
    return () => reducedMotionQuery.removeEventListener('change', updateReducedMotion);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    let frame = 0;
    const updateMode = () => {
      frame = 0;
      const horizontalTravel = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const next = isScrollDrivenGalleryAdmissible({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        horizontalTravel,
        still: journeySnapshot.motionPreference === 'still',
        reducedMotion,
      });
      setScrollDriven((current) => current === next ? current : next);
    };
    const requestModeUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateMode);
    };
    updateMode();
    const resizeObserver = new ResizeObserver(requestModeUpdate);
    resizeObserver.observe(viewport);
    resizeObserver.observe(track);
    window.addEventListener('resize', requestModeUpdate, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', requestModeUpdate);
    };
  }, [journeySnapshot.motionPreference, reducedMotion]);

  useEffect(() => {
    const shell = pinShellRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!hasHydrated || !scrollDriven || !shell || !viewport || !track) return;

    const actualTravel = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    if (!isScrollDrivenGalleryAdmissible({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      horizontalTravel: actualTravel,
      shellHeight: shell.getBoundingClientRect().height,
      still: journeySnapshot.motionPreference === 'still',
      reducedMotion,
    })) {
      setScrollDriven(false);
      return;
    }

    viewport.scrollLeft = 0;
    const refreshPinTargets = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const maximumTravel = Math.max(1, viewport.scrollWidth - viewport.clientWidth);
      const scrollPaddingStart = Number.parseFloat(getComputedStyle(viewport).scrollPaddingInlineStart) || 0;
      const trackX = Number(gsap.getProperty(track, 'x')) || 0;
      pinTargetProgressesRef.current = [...viewport.querySelectorAll<HTMLElement>('[data-transformation-card]')].map((card) => (
        getGalleryProgressForTarget(getGalleryScrollTarget({
          cardLeft: card.getBoundingClientRect().left - trackX,
          viewportLeft: viewportRect.left,
          scrollLeft: 0,
          scrollPaddingStart,
          maximumScrollLeft: maximumTravel,
        }), maximumTravel)
      ));
    };
    refreshPinTargets();

    const ctx = gsap.context(() => {
      const horizontalTravel = () => Math.max(1, viewport.scrollWidth - viewport.clientWidth);
      const tween = gsap.to(track, {
        x: () => -horizontalTravel(),
        ease: 'none',
        overwrite: 'auto',
        scrollTrigger: {
          trigger: shell,
          pin: shell,
          start: 'top 80px',
          end: () => `+=${horizontalTravel()}`,
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => setActiveIndex(getNearestGalleryIndex(self.progress, pinTargetProgressesRef.current)),
          onRefresh: (self) => {
            refreshPinTargets();
            pinTriggerRef.current = self;
            setPinRange({ start: self.start, end: self.end });
            journeyDirector.invalidateGeometry();
          },
        },
      });
      pinTriggerRef.current = tween.scrollTrigger ?? null;
    }, galleryRef);

    ScrollTrigger.refresh();
    const geometryFrame = window.requestAnimationFrame(() => journeyDirector.invalidateGeometry());
    return () => {
      const progress = pinTriggerRef.current?.progress ?? 0;
      pinTriggerRef.current = null;
      pinTargetProgressesRef.current = [];
      setPinRange(null);
      ctx.revert();
      journeyDirector.invalidateGeometry();
      window.cancelAnimationFrame(geometryFrame);
      if (progress > 0 && progress < 1) {
        window.requestAnimationFrame(() => shell.scrollIntoView({ block: 'start', behavior: 'auto' }));
      }
    };
  }, [hasHydrated, scrollDriven, journeySnapshot.motionPreference, reducedMotion]);

  const scrollToProject = (index: number) => {
    const pinnedTrigger = pinTriggerRef.current;
    if (scrollDriven && pinnedTrigger) {
      const target = getVerticalScrollPosition({
        start: pinnedTrigger.start,
        end: pinnedTrigger.end,
        progress: pinTargetProgressesRef.current[index] ?? 0,
      });
      window.scrollTo({
        top: target,
        behavior: journeySnapshot.motionPreference === 'still' || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
      return;
    }
    const viewport = viewportRef.current;
    const card = viewport?.querySelectorAll<HTMLElement>('[data-transformation-card]')[index];
    if (!viewport || !card) return;
    const target = getGalleryScrollTarget({
      cardLeft: card.getBoundingClientRect().left,
      viewportLeft: viewport.getBoundingClientRect().left,
      scrollLeft: viewport.scrollLeft,
      scrollPaddingStart: Number.parseFloat(getComputedStyle(viewport).scrollPaddingInlineStart) || 0,
      maximumScrollLeft: Math.max(0, viewport.scrollWidth - viewport.clientWidth),
    });
    const still = journeySnapshot.motionPreference === 'still' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stopGalleryTween();
    if (still) {
      viewport.scrollLeft = target;
      return;
    }
    viewport.style.scrollSnapType = 'none';
    activeTweenRef.current = gsap.to(viewport, {
      scrollLeft: target,
      duration: 0.62,
      ease: 'power3.out',
      overwrite: true,
      onComplete: restoreSnap,
      onInterrupt: restoreSnap,
    });
  };

  const handleComparisonFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (!scrollDrivenRef.current) return;
    const slide = (event.target as HTMLElement).closest<HTMLElement>('[data-transformation-card]');
    const pinnedTrigger = pinTriggerRef.current;
    if (!slide || !pinnedTrigger) return;
    const slides = [...slide.parentElement!.querySelectorAll<HTMLElement>('[data-transformation-card]')];
    const index = slides.indexOf(slide);
    const target = getVerticalScrollPosition({
      start: pinnedTrigger.start,
      end: pinnedTrigger.end,
      progress: pinTargetProgressesRef.current[index] ?? 0,
    });
    if (Math.abs(window.scrollY - target) > 2) window.scrollTo({ top: target, behavior: 'auto' });
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateActiveProject = () => {
      if (scrollDrivenRef.current) return;
      const cards = [...viewport.querySelectorAll<HTMLElement>('[data-transformation-card]')];
      if (cards.length === 0) return;
      const viewportRect = viewport.getBoundingClientRect();
      const center = viewportRect.left + viewportRect.width / 2;
      const next = cards.reduce((closest, card, index) => (
        Math.abs(card.getBoundingClientRect().left + card.getBoundingClientRect().width / 2 - center) < Math.abs(cards[closest].getBoundingClientRect().left + cards[closest].getBoundingClientRect().width / 2 - center)
          ? index
          : closest
      ), 0);
      setActiveIndex(next);
    };
    updateActiveProject();
    viewport.addEventListener('scroll', updateActiveProject, { passive: true });
    const resizeObserver = new ResizeObserver(updateActiveProject);
    resizeObserver.observe(viewport);
    viewport.querySelectorAll<HTMLElement>('[data-transformation-card]').forEach((card) => resizeObserver.observe(card));
    const stopForManualScroll = () => stopGalleryTween();
    const stopForManualKey = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', ' '].includes(event.key)) stopGalleryTween();
    };
    viewport.addEventListener('wheel', stopForManualScroll, { passive: true });
    viewport.addEventListener('touchstart', stopForManualScroll, { passive: true });
    viewport.addEventListener('pointerdown', stopForManualScroll, { passive: true });
    viewport.addEventListener('keydown', stopForManualKey);
    return () => {
      viewport.removeEventListener('scroll', updateActiveProject);
      viewport.removeEventListener('wheel', stopForManualScroll);
      viewport.removeEventListener('touchstart', stopForManualScroll);
      viewport.removeEventListener('pointerdown', stopForManualScroll);
      viewport.removeEventListener('keydown', stopForManualKey);
      resizeObserver.disconnect();
      stopGalleryTween();
    };
  }, []);

  return (
    <section className={`transformation-gallery${scrollDriven ? ' transformation-gallery--scroll-driven' : ''}`} ref={galleryRef} data-gallery-mode={scrollDriven ? 'pinned' : 'native'} data-gallery-pin-start={pinRange?.start.toFixed(1)} data-gallery-pin-end={pinRange?.end.toFixed(1)} aria-labelledby="transformation-gallery-title">
      <div className="transformation-gallery__head">
        <div>
          <p className="eyebrow">Selected from the project archive</p>
          <h2 id="transformation-gallery-title">See the difference.</h2>
        </div>
        <p>Use the divider to compare what is visible in each view.</p>
      </div>

      <div className="transformation-gallery__pin-shell" ref={pinShellRef} onFocusCapture={handleComparisonFocus}>
        <div className="transformation-gallery__viewport" ref={viewportRef} role="region" tabIndex={0} aria-label="Transformation gallery. Swipe or scroll horizontally to compare projects.">
          <div className="transformation-gallery__track" ref={trackRef}>
            {transformations.map((project) => (
              <div className="transformation-gallery__slide" data-transformation-card key={project.id}>
                <Comparison project={project} hasHydrated={hasHydrated} />
              </div>
            ))}
          </div>
        </div>

        <div className="transformation-gallery__controls" aria-label="Transformation gallery controls">
          <button type="button" className="gallery-arrow" onClick={() => scrollToProject(Math.max(activeIndex - 1, 0))} disabled={!hasHydrated || activeIndex === 0} aria-label="Previous transformation">←</button>
          <div className="gallery-tabs" aria-label="Choose a transformation">
            {transformations.map((project, index) => (
              <button
                type="button"
                className={index === activeIndex ? 'is-active' : ''}
                key={project.id}
                onClick={() => scrollToProject(index)}
                disabled={!hasHydrated}
                aria-current={index === activeIndex ? 'true' : undefined}
              >
                <span aria-hidden="true" />{project.tabLabel}
              </button>
            ))}
          </div>
          <button type="button" className="gallery-arrow" onClick={() => scrollToProject(Math.min(activeIndex + 1, transformations.length - 1))} disabled={!hasHydrated || activeIndex === transformations.length - 1} aria-label="Next transformation">→</button>
        </div>
        <a className="transformation-gallery__continue" href="#transformation-gallery-source">Continue down <span aria-hidden="true">↓</span></a>
      </div>

      <p id="transformation-gallery-source" className="transformation-gallery__source">Source: Final Finish Epoxy public projects archive. Pairings were selected for visible framing and remain pending client approval.</p>
    </section>
  );
}
