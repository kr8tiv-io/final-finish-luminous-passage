import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
} from 'react';
import { selectedProjectPhotos, transformations, type ImageVariant, type Transformation } from '../../data/transformation-gallery';
import { journeyControls } from '../../lib/motion/journey-controls';
import { journeyDirector } from '../../lib/motion/journey-director';
import { getArcCardState, getImageLoadingState, resolveGalleryRender } from '../../lib/projects/gallery';
import {
  clampReveal,
  getFeaturedPassageState,
  getFeaturedScrollTarget,
  getGalleryScrollTarget,
  isFeaturedPassageAdmissible,
  normalizeImageTransform,
  resolveDragOwner,
  resolveFeaturedPresentation,
  type FeaturedNavigation,
} from '../../lib/projects/transformation-gallery';
import './transformation-gallery.css';

type Props = { allowPending?: boolean };
type PointerStart = { x: number; y: number; pointerId: number; owner: 'comparison' | 'page' | null } | null;
type PassageGeometry = { start: number; travel: number; contentHeight: number };

const INITIAL_REVEAL = 50;
const PROJECT_ARCHIVE_PATH = '/projects';

function Picture({ image, full, loading }: { image: ImageVariant; full: boolean; loading: 'eager' | 'lazy' }) {
  const crop = normalizeImageTransform(image.crop);
  const cropStyle = {
    objectPosition: image.crop.objectPosition,
    transform: `translate3d(${crop.translateX}%, ${crop.translateY}%, 0) rotate(${crop.rotate}deg) scale(${crop.scale})`,
  };
  if (!full) {
    return <img
      src={image.thumbnail}
      alt={image.alt}
      width={image.width}
      height={image.height}
      loading="lazy"
      decoding="async"
      draggable={false}
      data-image-quality="thumbnail"
      style={cropStyle}
    />;
  }
  return <picture data-image-quality="full">
    <source type="image/avif" srcSet={image.avif} />
    <source type="image/webp" srcSet={image.webp} />
    <img src={image.jpeg} alt={image.alt} width={image.width} height={image.height} loading={loading} decoding="async" draggable={false} style={cropStyle} />
  </picture>;
}

function valueText(reveal: number): string {
  if (reveal === 0) return 'After photograph fully visible';
  if (reveal === 100) return 'Before photograph fully visible';
  return `${reveal}% before photograph on the left and ${100 - reveal}% after photograph on the right`;
}

function Comparison({
  project,
  instance,
  reveal,
  onReveal,
  hydrated,
  full,
  loading,
  onInteractionStart,
  onInteractionEnd,
  onFocusWithin,
}: {
  project: Transformation;
  instance: string;
  reveal: number;
  onReveal: (value: number) => void;
  hydrated: boolean;
  full: boolean;
  loading: 'eager' | 'lazy';
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  onFocusWithin?: (target: HTMLElement | null) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<PointerStart>(null);
  const [hoverReveal, setHoverReveal] = useState<number | null>(null);
  const displayedReveal = hoverReveal ?? reveal;
  const titleId = `${instance}-${project.id}-title`;
  const style = { '--reveal': `${displayedReveal}%` } as CSSProperties;

  const commitReveal = (value: number) => {
    setHoverReveal(null);
    onReveal(clampReveal(value));
  };
  const revealFromPointer = (clientX: number) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    return bounds ? clampReveal(((clientX - bounds.left) / Math.max(1, bounds.width)) * 100) : reveal;
  };
  const isControlTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('button,input'));
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!hydrated || isControlTarget(event.target)) return;
    setHoverReveal(null);
    pointerStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, owner: null };
    onInteractionStart?.();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    if (!start) {
      if (isControlTarget(event.target)) {
        setHoverReveal(null);
        return;
      }
      if (event.pointerType === 'mouse' && event.buttons === 0 && !stageRef.current?.contains(document.activeElement)) {
        setHoverReveal(revealFromPointer(event.clientX));
        onInteractionStart?.();
      }
      return;
    }
    const owner = start.owner ?? resolveDragOwner({ startsInComparison: true, deltaX: event.clientX - start.x, deltaY: event.clientY - start.y });
    if (owner === 'undecided') return;
    start.owner = owner === 'comparison' ? 'comparison' : 'page';
    if (owner !== 'comparison') return;
    if (!stageRef.current?.hasPointerCapture(event.pointerId)) stageRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
    commitReveal(revealFromPointer(event.clientX));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current) return;
    if (stageRef.current?.hasPointerCapture(event.pointerId)) stageRef.current.releasePointerCapture(event.pointerId);
    pointerStart.current = null;
    setHoverReveal(null);
    onInteractionEnd?.();
  };
  const onPointerLeave = () => {
    if (pointerStart.current) return;
    setHoverReveal(null);
    if (!stageRef.current?.contains(document.activeElement)) onInteractionEnd?.();
  };
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    setHoverReveal(null);
    onInteractionStart?.();
    onFocusWithin?.(event.target instanceof HTMLElement ? event.target : null);
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    onInteractionEnd?.();
  };

  return <article className="transformation-comparison" aria-labelledby={titleId}>
    <div
      ref={stageRef}
      className="transformation-stage"
      style={style}
      data-comparison
      data-static-fallback="side-by-side"
      data-displayed-reveal={displayedReveal}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerMove}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocusCapture={onFocus}
      onBlurCapture={onBlur}
    >
      <div className="transformation-photo transformation-photo--before"><Picture image={project.before} full={full} loading={loading} /></div>
      <div className="transformation-photo transformation-photo--after"><Picture image={project.after} full={full} loading={loading} /></div>
      <span className="transformation-label transformation-label--before">Before</span>
      <span className="transformation-label transformation-label--after">After</span>
      <span className="transformation-divider" aria-hidden="true"><i>↔</i></span>
      <input
        className="transformation-range"
        type="range"
        min="0"
        max="100"
        step="1"
        value={reveal}
        aria-label={`Move the before and after divider for ${project.title}`}
        aria-valuetext={valueText(reveal)}
        disabled={!hydrated}
        onInput={(event) => commitReveal(Number(event.currentTarget.value))}
      />
      <div className="transformation-stage__actions" aria-label={`Comparison controls for ${project.title}`}>
        <button type="button" aria-label="Show before photograph" disabled={!hydrated} onClick={() => commitReveal(100)}>Before</button>
        <button type="button" aria-label="Show after photograph" disabled={!hydrated} onClick={() => commitReveal(0)}>After</button>
      </div>
    </div>
    <div className="transformation-caption">
      <div><p className="transformation-index">{project.tabLabel}</p><h3 id={titleId}>{project.title}</h3></div>
      <p className="transformation-rationale">{project.homeownerCaption}</p>
    </div>
  </article>;
}

/**
 * Production fallback. Never an empty section and never an "archive" apology:
 * single finished-floor photographs carry no pairing claim, so they can be
 * published while every before/after pairing is still awaiting approval.
 */
function SelectedPhotos() {
  return <section className="transformation-gallery transformation-gallery--selected" aria-labelledby="transformation-gallery-title">
    <div className="transformation-gallery__head">
      <div><p className="eyebrow">Selected from the public project archive</p><h2 id="transformation-gallery-title">Selected project photos.</h2></div>
      <p>Finished floors, photographed on site. Each caption describes only what is visible in its frame.</p>
    </div>
    <ul className="transformation-gallery__photo-grid">
      {selectedProjectPhotos.map((photo, index) => <li key={photo.id} className="transformation-gallery__photo">
        <figure>
          <div className="transformation-gallery__photo-frame"><Picture image={photo.image} full loading={index < 3 ? 'eager' : 'lazy'} /></div>
          <figcaption>{photo.caption}</figcaption>
        </figure>
      </li>)}
    </ul>
    <a className="transformation-gallery__archive-link" href={PROJECT_ARCHIVE_PATH}>See the project archive</a>
  </section>;
}

export default function TransformationGallery({ allowPending = false }: Props) {
  const render = useMemo(() => resolveGalleryRender(transformations, { allowPending }), [allowPending]);
  const pairs = render.pairs;
  const passageRef = useRef<HTMLDivElement>(null);
  const featuredNavRef = useRef<HTMLElement>(null);
  const featuredWindowRef = useRef<HTMLDivElement>(null);
  const firstFeaturedRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const frames = useRef(new Set<number>());
  const [hydrated, setHydrated] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [passageEnabled, setPassageEnabled] = useState(false);
  const [passageGeometry, setPassageGeometry] = useState<PassageGeometry>({ start: 0, travel: 1, contentHeight: 0 });
  const [featuredNavigation, setFeaturedNavigation] = useState<FeaturedNavigation>(null);
  const [interactionIndex, setInteractionIndex] = useState<number | null>(null);
  const [exploreIndex, setExploreIndex] = useState(0);
  const [reveals, setReveals] = useState<Record<string, number>>({});
  const journey = useSyncExternalStore(journeyDirector.subscribe, journeyDirector.getSnapshot, journeyDirector.getServerSnapshot);
  const controls = useSyncExternalStore(journeyControls.subscribe, journeyControls.getSnapshot, journeyControls.getServerSnapshot);

  /** Every queued frame this component owns, so teardown can cancel all of them. */
  const schedule = useCallback((task: () => void) => {
    const id = window.requestAnimationFrame(() => {
      frames.current.delete(id);
      task();
    });
    frames.current.add(id);
    return id;
  }, []);
  const cancelFrame = useCallback((id: number) => {
    if (frames.current.delete(id)) window.cancelAnimationFrame(id);
  }, []);
  const cancelQueued = useCallback(() => {
    frames.current.forEach((id) => window.cancelAnimationFrame(id));
    frames.current.clear();
  }, []);

  useEffect(() => {
    setHydrated(true);
    journeyControls.hydrate();
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => cancelQueued, [cancelQueued]);

  const measurePassage = useCallback(() => {
    const passage = passageRef.current;
    const panel = firstFeaturedRef.current;
    const nav = featuredNavRef.current;
    if (!passage || !panel || !nav || typeof window === 'undefined') return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const comparisonHeight = panel.querySelector<HTMLElement>('.transformation-comparison')?.scrollHeight ?? panel.scrollHeight;
    const contentHeight = nav.offsetHeight + comparisonHeight + 16;
    const admitted = isFeaturedPassageAdmissible({
      viewportWidth,
      viewportHeight,
      contentHeight,
      still: controls.motionPreference === 'still',
      reducedMotion,
    });
    const stickyTop = 88;
    const passageTop = passage.getBoundingClientRect().top + window.scrollY;
    setPassageEnabled(admitted);
    const next = {
      start: passageTop - stickyTop,
      travel: Math.max(1, viewportHeight * .72 * Math.max(1, pairs.length - 1)),
      contentHeight,
    };
    setPassageGeometry((current) => current.start === next.start && current.travel === next.travel && current.contentHeight === next.contentHeight ? current : next);
  }, [controls.motionPreference, pairs.length, reducedMotion]);

  useEffect(() => {
    const frame = schedule(() => {
      measurePassage();
      journeyDirector.invalidateGeometry();
    });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measurePassage);
    const comparison = firstFeaturedRef.current?.querySelector<HTMLElement>('.transformation-comparison');
    if (comparison) observer?.observe(comparison);
    if (featuredNavRef.current) observer?.observe(featuredNavRef.current);
    return () => {
      cancelFrame(frame);
      observer?.disconnect();
    };
  }, [cancelFrame, journey.viewportWidth, journey.viewportHeight, measurePassage, schedule]);

  // The first frame after hydration can measure a card that has not reached its
  // final size (webfont metrics, a decoding image), and a miss there would latch
  // the native layout for the rest of the visit because nothing resizes again.
  // The single admission decision is therefore confirmed once the card settles.
  useEffect(() => {
    let cancelled = false;
    const confirm = () => {
      if (!cancelled) schedule(measurePassage);
    };
    const settle = window.setTimeout(confirm, 200);
    void document.fonts?.ready.then(confirm);
    return () => {
      cancelled = true;
      window.clearTimeout(settle);
    };
  }, [measurePassage, schedule]);

  useEffect(() => {
    if (!passageEnabled) return;
    const frame = schedule(() => {
      measurePassage();
      journeyDirector.invalidateGeometry();
    });
    // Teardown of the passage cancels every frame this layout queued, so a
    // measurement or a reposition scheduled under the sticky layout can never
    // land on the native one and move a settled card.
    return () => {
      cancelFrame(frame);
      cancelQueued();
    };
  }, [cancelFrame, cancelQueued, measurePassage, passageEnabled, schedule]);

  // While pinned, the window is the only scroller. A focus ring, a hash jump,
  // or scroll anchoring must never scroll the inner track sideways instead.
  useEffect(() => {
    const track = featuredWindowRef.current;
    if (!track || !passageEnabled) return;
    const pin = () => {
      if (track.scrollLeft !== 0) track.scrollLeft = 0;
      if (track.scrollTop !== 0) track.scrollTop = 0;
    };
    pin();
    track.addEventListener('scroll', pin, { passive: true });
    return () => track.removeEventListener('scroll', pin);
  }, [passageEnabled]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || pairs.length === 0) return;
    const update = () => {
      const cards = [...viewport.querySelectorAll<HTMLElement>('[data-explore-card]')];
      const center = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
      let closest = 0;
      for (let index = 1; index < cards.length; index += 1) {
        const rect = cards[index].getBoundingClientRect();
        const closestRect = cards[closest].getBoundingClientRect();
        if (Math.abs(rect.left + rect.width / 2 - center) < Math.abs(closestRect.left + closestRect.width / 2 - center)) closest = index;
      }
      setExploreIndex(closest);
    };
    update();
    viewport.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(viewport);
    return () => {
      viewport.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [pairs.length]);

  if (render.mode === 'selected-photos') return <SelectedPhotos />;

  /**
   * The director owns the scroll coordinate. Until it has published its first
   * frame (`revision === 0` — `JourneyMotion` starts it, and on a cold load
   * that island can hydrate after this one), fall back to reading the live
   * scroll position rather than trusting its zero. This adds no listener and
   * no second owner: the moment the director speaks, it wins.
   */
  const passageScrollY = journey.revision === 0 && hydrated && typeof window !== 'undefined' ? window.scrollY : journey.scrollY;
  const scrollPassageState = getFeaturedPassageState(
    passageEnabled ? Math.min(1, Math.max(0, (passageScrollY - passageGeometry.start) / passageGeometry.travel)) : 0,
    pairs.length,
  );
  const passageState = resolveFeaturedPresentation({
    passageEnabled,
    scrollState: scrollPassageState,
    // Deliberately the director's own coordinate, not the seeded one: a jump is
    // held until the *owner* reports movement, which is what makes it settle.
    scrollY: journey.scrollY,
    navigation: featuredNavigation,
    interactionIndex,
    count: pairs.length,
  });
  const updateReveal = (id: string, value: number) => setReveals((current) => ({ ...current, [id]: value }));
  /**
   * The single presentation input, published to CSS: `--featured-position` is
   * the continuous index (0 … n-1, fractional between cards) and
   * `--featured-count` is n. Step 23 replaces the panel transform with the
   * jh3y cylinder by reading only these two — no new state, no second owner.
   */
  const passageStyle = {
    '--passage-travel': `${passageGeometry.travel}px`,
    '--featured-panel-height': `${Math.max(1, passageGeometry.contentHeight - (featuredNavRef.current?.offsetHeight ?? 0) - 16)}px`,
    '--featured-count': pairs.length,
    '--featured-position': passageState.position,
  } as CSSProperties;
  const featuredScrollTarget = (index: number) => getFeaturedScrollTarget({
    passageTop: passageGeometry.start,
    passageTravel: passageGeometry.travel,
    index,
    count: pairs.length,
  });
  const pinTrack = () => {
    const track = featuredWindowRef.current;
    if (!track) return;
    track.scrollLeft = 0;
    track.scrollTop = 0;
  };
  const scrollToFeatured = (index: number) => {
    // A frame queued by the previous layout must not land on top of this jump.
    cancelQueued();
    setInteractionIndex(null);
    setFeaturedNavigation({ index, scrollY: journey.scrollY });
    pinTrack();
    if (!passageEnabled) {
      schedule(() => featuredWindowRef.current?.querySelectorAll<HTMLElement>('[data-featured-panel]')[index]?.scrollIntoView({
        behavior: 'auto',
        block: 'center',
      }));
      return;
    }
    window.scrollTo({ top: featuredScrollTarget(index), behavior: 'auto' });
  };
  // Focus moves the window, never the track: the element keeps its own scroll
  // position (preventScroll) and the passage is driven to that card's progress.
  const focusFeatured = (index: number, target: HTMLElement | null) => {
    target?.focus({ preventScroll: true });
    pinTrack();
    if (!passageEnabled) return;
    window.scrollTo({ top: featuredScrollTarget(index), behavior: 'auto' });
  };
  const scrollToExplore = (index: number) => {
    const viewport = viewportRef.current;
    const card = viewport?.querySelectorAll<HTMLElement>('[data-explore-card]')[index];
    if (!viewport || !card) return;
    setExploreIndex(index);
    const target = getGalleryScrollTarget({
      cardLeft: card.getBoundingClientRect().left,
      viewportLeft: viewport.getBoundingClientRect().left,
      scrollLeft: viewport.scrollLeft,
      scrollPaddingStart: Number.parseFloat(getComputedStyle(viewport).scrollPaddingInlineStart) || 0,
      maximumScrollLeft: Math.max(0, viewport.scrollWidth - viewport.clientWidth),
    });
    viewport.scrollTo({ left: target, behavior: reducedMotion || controls.motionPreference === 'still' ? 'auto' : 'smooth' });
  };

  return <section
    className={`transformation-gallery${hydrated ? ' is-hydrated' : ''}${passageEnabled ? ' transformation-gallery--passage' : ''}`}
    style={passageStyle}
    data-gallery-mode="native"
    data-gallery-layout={passageEnabled ? 'passage' : 'native'}
    data-featured-index={passageState.activeIndex}
    data-featured-settled={passageState.settled}
    aria-labelledby="transformation-gallery-title"
  >
    <div className="transformation-gallery__head"><div><p className="eyebrow">Selected from the public project archive</p><h2 id="transformation-gallery-title">See the difference.</h2></div><p>Move each divider to compare the original concrete with the finished floor. Captions point to features visible in both photographs.</p></div>
    {render.reviewBadge ? <p className="transformation-gallery__review-note">Project pairing review · not approved for publication</p> : null}

    <div className="transformation-gallery__passage" ref={passageRef}>
      <div className="transformation-gallery__sticky">
        <nav className="transformation-gallery__feature-nav" aria-label="Featured transformation passage" ref={featuredNavRef}>
          <button type="button" disabled={!hydrated || passageState.activeIndex === 0} onClick={() => scrollToFeatured(0)}>First <span className="visually-hidden">featured project</span></button>
          <button type="button" disabled={!hydrated || passageState.activeIndex === 0} onClick={() => scrollToFeatured(Math.max(0, passageState.activeIndex - 1))} aria-label="Previous featured project">←</button>
          <p aria-live="polite" aria-atomic="true"><span>{String(passageState.activeIndex + 1).padStart(2, '0')}</span> / {String(pairs.length).padStart(2, '0')}</p>
          <button type="button" disabled={!hydrated || passageState.activeIndex === pairs.length - 1} onClick={() => scrollToFeatured(Math.min(pairs.length - 1, passageState.activeIndex + 1))} aria-label="Next featured project">→</button>
          <button type="button" disabled={!hydrated || passageState.activeIndex === pairs.length - 1} onClick={() => scrollToFeatured(pairs.length - 1)}>Last <span className="visually-hidden">featured project</span></button>
          <a href="#transformation-explore">Skip featured comparisons</a>
        </nav>
        <div className="transformation-gallery__featured-window" ref={featuredWindowRef}>
          {pairs.map((project, index) => {
            const active = index === passageState.activeIndex;
            const distance = index - passageState.position;
            const load = getImageLoadingState(index, passageState.activeIndex, pairs.length);
            return <div
              className="transformation-gallery__featured-panel"
              data-featured-panel
              data-active={active}
              aria-hidden={passageEnabled && !active ? true : undefined}
              inert={passageEnabled && !active ? true : undefined}
              key={project.id}
              ref={index === 0 ? firstFeaturedRef : undefined}
              style={{
                '--panel-x': `${distance * 104}%`,
                '--panel-y': `${Math.min(24, Math.abs(distance) * 18)}px`,
                '--panel-tilt': `${active ? 0 : Math.max(-1.5, Math.min(1.5, distance * 1.25))}deg`,
                '--panel-scale': active ? 1 : .955,
              } as CSSProperties}
            >
              <Comparison
                project={project}
                instance="featured"
                reveal={reveals[project.id] ?? INITIAL_REVEAL}
                onReveal={(value) => updateReveal(project.id, value)}
                hydrated={hydrated}
                full={!hydrated || load.full}
                loading={hydrated ? load.loading : 'lazy'}
                // Hovering holds the card that is already showing; it never
                // retargets the passage, so a card sliding under the cursor
                // after a jump cannot steal the counter from the card asked for.
                onInteractionStart={() => setInteractionIndex((current) => index === passageState.activeIndex ? index : current)}
                onInteractionEnd={() => setInteractionIndex(null)}
                // Keyboard focus is deliberate, so it does retarget.
                onFocusWithin={(target) => {
                  setFeaturedNavigation({ index, scrollY: journey.scrollY });
                  setInteractionIndex(index);
                  focusFeatured(index, target);
                }}
              />
            </div>;
          })}
        </div>
      </div>
    </div>

    <section className="transformation-gallery__explore" id="transformation-explore" data-explore-index={exploreIndex} aria-labelledby="transformation-explore-title">
      <div className="transformation-gallery__explore-head">
        <div><p className="eyebrow">Every matched view</p><h3 id="transformation-explore-title">Explore all comparisons.</h3></div>
        <nav aria-label="Explore project comparison navigation">
          <button type="button" disabled={!hydrated || exploreIndex === 0} onClick={() => scrollToExplore(Math.max(0, exploreIndex - 1))} aria-label="Previous project comparison">←</button>
          <p><span>{String(exploreIndex + 1).padStart(2, '0')}</span> / {String(pairs.length).padStart(2, '0')}</p>
          <button type="button" disabled={!hydrated || exploreIndex === pairs.length - 1} onClick={() => scrollToExplore(Math.min(pairs.length - 1, exploreIndex + 1))} aria-label="Next project comparison">→</button>
        </nav>
      </div>
      <div className="transformation-gallery__viewport" ref={viewportRef} role="region" tabIndex={0} aria-label="Explore project comparisons by scrolling horizontally.">
        <div className="transformation-gallery__track">
          {pairs.map((project, index) => {
            const active = index === exploreIndex;
            const arc = getArcCardState(index, exploreIndex);
            const load = getImageLoadingState(index, exploreIndex, pairs.length);
            return <div
              className="transformation-gallery__slide"
              data-explore-card
              data-active={active}
              key={project.id}
              style={{
                '--card-rotate': `${active ? 0 : arc.rotateY}deg`,
                '--card-depth': `${active ? 0 : arc.translateZ}px`,
                '--card-opacity': `${arc.opacity}`,
              } as CSSProperties}
            >
              <Comparison
                project={project}
                instance="explore"
                reveal={reveals[project.id] ?? INITIAL_REVEAL}
                onReveal={(value) => updateReveal(project.id, value)}
                hydrated={hydrated}
                full={!hydrated || load.full}
                loading={hydrated ? load.loading : 'lazy'}
              />
            </div>;
          })}
        </div>
      </div>
    </section>
    <p className="transformation-gallery__source">Source images are from the public <a href="https://www.finalfinishepoxy.ca/projects">Final Finish Epoxy project archive</a>. {render.reviewBadge ? 'Pairings shown in this review are pending publication approval.' : 'Only publication-approved pairings are shown.'}</p>
  </section>;
}
