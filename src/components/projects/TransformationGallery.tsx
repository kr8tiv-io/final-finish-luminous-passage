import gsap from 'gsap';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { selectedProjectPhotos, transformations } from '../../data/transformation-gallery';
import { ensureGsapKit, ScrollTrigger } from '../../lib/motion/gsap-kit';
import { journeyControls } from '../../lib/motion/journey-controls';
import { onRouteTeardown } from '../../lib/motion/route-lifecycle';
import { getArcCardState, getImageLoadingState, resolveGalleryRender } from '../../lib/projects/gallery';
import {
  CYLINDER_GAP_RATIO,
  CYLINDER_MEDIA,
  cylinderInnerAngle,
  cylinderRadius,
  cylinderRingRotation,
  getCylinderState,
  getFeaturedScrollTarget,
  getGalleryScrollTarget,
  isFeaturedPassageAdmissible,
  resolveFeaturedPresentation,
  type FeaturedNavigation,
} from '../../lib/projects/transformation-gallery';
import Comparison, { Picture } from './Comparison';
import './transformation-gallery.css';

type Props = {
  allowPending?: boolean;
  /** Render the built-in heading and instruction line. The homepage sets its own title. */
  head?: boolean;
  /** Render the flat `Explore all comparisons` strip under the cylinder. */
  explore?: boolean;
  /** Id of an external heading that names this gallery when `head` is false. */
  labelledBy?: string;
};

/** The window's scroll position as an external store (the homepage runs no director). */
const subscribeScroll = (listener: () => void) => {
  window.addEventListener('scroll', listener, { passive: true });
  return () => window.removeEventListener('scroll', listener);
};
const readScroll = () => Math.round(window.scrollY);
const readServerScroll = () => 0;

/**
 * Everything the cylinder needs that only a measurement can supply. `null`
 * means the ring is not built, which is the same thing as "the snap ribbon is
 * what this visitor gets" — there is no third state.
 */
type CylinderGeometry = {
  readonly cardWidth: number;
  readonly gap: number;
  readonly radius: number;
  readonly innerAngle: number;
  /** Document scroll position at which the passage starts sticking, and its travel. */
  readonly start: number;
  readonly travel: number;
};

/**
 * Who owns the passage's height.
 *
 * `reserved` is the server's answer and the only one that can be rendered
 * without a measurement: inside `CYLINDER_MEDIA` the stylesheet has already
 * given the section its whole scroll length, so the page is its final height on
 * the first painted frame. `sticky` is the same reservation with the ring built
 * on top of it — deliberately not a different height. `flow` is the one state
 * that gives the reservation back, and it is only ever reached by a measurement
 * the media query cannot make: a card that does not fit, or a stored `still`
 * preference. Nothing else may release it, because anything else would be a
 * height the visitor watches change.
 */
type PassageHost = 'reserved' | 'sticky' | 'flow';

const INITIAL_REVEAL = 50;
const PROJECT_ARCHIVE_PATH = '/projects';
/** Matches `--passage-top` in `transformation-gallery.css`; the header's own height. */
const PASSAGE_TOP = 88;
/**
 * The per-card step (one viewport, storyboard §2: Act 5 ≈ 3.0 vh over three
 * pairs) used to live here as `CARD_TRAVEL` and was multiplied by
 * `window.innerHeight` to produce the pin's duration. It now lives in
 * `transformation-gallery.css` as `--passage-travel`, because the height has to
 * exist before this island does. Read back by `passageTravel` below.
 */
const passageTravel = (passage: HTMLElement, sticky: HTMLElement): number =>
  Math.max(1, Math.round(passage.getBoundingClientRect().height - sticky.getBoundingClientRect().height));

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

declare global {
  interface Window {
    __ffeCylinder?: {
      /** The ring's live `rotationY`, in degrees. Read-only. */
      readonly rotation: () => number;
      readonly progress: () => number;
      readonly radius: () => number;
      readonly innerAngle: () => number;
      /** Document scroll positions at which the passage sticks and releases. */
      readonly start: () => number;
      readonly end: () => number;
      readonly cards: number;
    };
  }
}

/**
 * Read-only diagnostics, on staging only — the same gate `window.__ffeRoute`
 * and `window.__ffeSurface` use, read off `html[data-environment]`. The Step 23
 * gates need this because the ring's angle is a composed `matrix3d` in the
 * computed style: "rotateY is monotonic across 30 samples" is otherwise
 * unmeasurable without re-deriving it from the matrix in every probe.
 */
function installCylinderProbe(probe: NonNullable<Window['__ffeCylinder']>) {
  if (typeof window === 'undefined' || document.documentElement.dataset.environment === 'production') return;
  Object.defineProperty(window, '__ffeCylinder', { configurable: true, value: probe });
}

function removeCylinderProbe() {
  if (typeof window === 'undefined') return;
  delete window.__ffeCylinder;
}

/**
 * The Act 5 eyebrow. Both words are always printed and the arrow between them
 * never moves; when a different pair takes the front slot each word is clipped
 * out upward while the same word arrives from below in the same clip, so the
 * line re-stamps itself per pair instead of mutating into invented copy.
 * `COPY-DECK.md` Act 5 locks the line to exactly "Concrete → Coated".
 *
 * Keyed on the front index so the swap is a mount, not a tween: nothing is left
 * running to tear down, and `prefers-reduced-motion` turns it off in CSS with
 * both words still printed and static.
 *
 * @motion word-swap
 */
function WordSwapEyebrow({ swapKey }: { swapKey: number }) {
  return <p className="eyebrow transformation-gallery__eyebrow" data-word-swap>
    <span className="transformation-gallery__swap"><span key={`concrete-${swapKey}`}>Concrete</span></span>
    <span aria-hidden="true"> → </span>
    <span className="transformation-gallery__swap"><span key={`coated-${swapKey}`}>Coated</span></span>
  </p>;
}

export default function TransformationGallery({ allowPending = false, head = true, explore = true, labelledBy }: Props) {
  const render = useMemo(() => resolveGalleryRender(transformations, { allowPending }), [allowPending]);
  const pairs = render.pairs;
  const passageRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const featuredNavRef = useRef<HTMLElement>(null);
  const featuredWindowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const firstFeaturedRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const frames = useRef(new Set<number>());
  const [hydrated, setHydrated] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [cylinder, setCylinder] = useState<CylinderGeometry | null>(null);
  const [passageHost, setPassageHost] = useState<PassageHost>('reserved');
  const [progress, setProgress] = useState(0);
  const [featuredNavigation, setFeaturedNavigation] = useState<FeaturedNavigation>(null);
  const [interactionIndex, setInteractionIndex] = useState<number | null>(null);
  const [exploreIndex, setExploreIndex] = useState(0);
  const [reveals, setReveals] = useState<Record<string, number>>({});
  /**
   * Bumped once when the card has stopped changing size (webfont metrics, a
   * decoding image). Step 9's guard, kept: the first frame after hydration can
   * measure a card that has not reached its final height, and a miss there would
   * latch the ribbon for the rest of the visit because nothing resizes again.
   * The one bump re-runs the admission effect exactly once.
   */
  const [settleTick, setSettleTick] = useState(0);
  const scrollY = useSyncExternalStore(subscribeScroll, readScroll, readServerScroll);
  const controls = useSyncExternalStore(journeyControls.subscribe, journeyControls.getSnapshot, journeyControls.getServerSnapshot);
  const passageEnabled = cylinder !== null;

  /** Every queued frame this component owns, so teardown can cancel all of them. */
  const schedule = useCallback((task: () => void) => {
    const id = window.requestAnimationFrame(() => {
      frames.current.delete(id);
      task();
    });
    frames.current.add(id);
    return id;
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

  useEffect(() => {
    let cancelled = false;
    const confirm = () => {
      if (!cancelled) setSettleTick((tick) => (tick === 0 ? 1 : tick));
    };
    const settle = window.setTimeout(confirm, 200);
    void document.fonts?.ready.then(confirm);
    return () => {
      cancelled = true;
      window.clearTimeout(settle);
    };
  }, []);

  /**
   * The cylinder, and the single ScrollTrigger that drives it.
   *
   * `gsap.matchMedia` owns the lifecycle: the query is `CYLINDER_MEDIA` — the
   * media half of the one admission rule — so a visitor who resizes below it,
   * plugs in a touch screen, or turns reduced motion on has the ring reverted
   * for them and lands on the native snap ribbon with nothing left behind. The
   * measured half of the rule (`isFeaturedPassageAdmissible`) is checked inside,
   * because "a real card actually fits" and "the visitor asked for `still`" are
   * not media features.
   *
   * Exactly one ScrollTrigger is created here, its trigger is the *inner*
   * `.transformation-gallery__passage` (storyboard §8 directive 2 — never the
   * chapter, never `.journey`, never with `snap`), and the only thing it writes
   * is the ring's `rotationY`.
   *
   * It does **not** pin. The pin is what Step 23c removed: `pin: passage` with
   * `pinSpacing: true` inserted a 2612 px spacer at hydration time, so the page
   * grew under a visitor standing ~800 px above the act. The host is a
   * sticky-in-flow box whose length the stylesheet reserved before this island
   * existed (see the `@media` block in `transformation-gallery.css`), and this
   * trigger now only *reads* where that box starts and stops sticking.
   *
   * @motion perspective-cylinder
   */
  useEffect(() => {
    if (!hydrated || pairs.length === 0 || typeof window === 'undefined') return;
    ensureGsapKit();
    ScrollTrigger.config({ ignoreMobileResize: true });
    const media = gsap.matchMedia();

    media.add(CYLINDER_MEDIA, () => {
      const passage = passageRef.current;
      const sticky = stickyRef.current;
      const ring = ringRef.current;
      const slot = slotRef.current;
      const nav = featuredNavRef.current;
      const panel = firstFeaturedRef.current;
      if (!passage || !sticky || !ring || !slot || !nav || !panel) return undefined;

      /** The front slot's rect, for a later step's `shrink-to-card` to land on. */
      const writeFrontSlot = () => {
        const rect = slot.getBoundingClientRect();
        if (rect.width === 0) return;
        passage.dataset.frontSlot = [rect.x, rect.y, rect.width, rect.height]
          .map((value) => Math.round(value))
          .join(',');
      };

      const admitted = () => {
        const comparison = panel.querySelector<HTMLElement>('.transformation-comparison');
        const contentHeight = nav.offsetHeight + (comparison?.scrollHeight ?? panel.scrollHeight) + 16;
        return isFeaturedPassageAdmissible({
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          contentHeight,
          still: controls.motionPreference === 'still',
          reducedMotion,
        });
      };
      // The one state that hands the reserved height back. It is set before the
      // early return so the release is a single React commit, not a frame of
      // reserved-then-released.
      if (!admitted()) {
        setPassageHost('flow');
        return undefined;
      }
      setPassageHost('sticky');

      const measure = (): CylinderGeometry => {
        const cardWidth = slot.getBoundingClientRect().width || panel.getBoundingClientRect().width;
        const gap = cardWidth * CYLINDER_GAP_RATIO;
        return {
          cardWidth,
          gap,
          radius: cylinderRadius({ cardWidth, gap, cards: pairs.length }),
          innerAngle: cylinderInnerAngle(pairs.length),
          start: 0,
          // Read off the reserved host rather than recomputed from
          // `window.innerHeight`: the distance the sticky child travels before
          // it releases *is* the trigger's duration, so there is no second
          // arithmetic that could disagree with the stylesheet's.
          travel: passageTravel(passage, sticky),
        };
      };

      // Published before the trigger exists so the ring has its radius on the
      // very first painted frame and never rotates through an unsized cylinder.
      let geometry = measure();
      setCylinder(geometry);
      // Pulls the ring back by one radius so face 0 — which sits at `+radius`,
      // the ring's nearest point — lands exactly on the screen plane.
      gsap.set(ring, { z: -geometry.radius });

      const tween = gsap.fromTo(
        ring,
        { rotationY: 0 },
        {
          rotationY: cylinderRingRotation(1, pairs.length),
          ease: 'none',
          scrollTrigger: {
            trigger: passage,
            // The same two coordinates the sticky child itself uses: it sticks
            // when the host's top reaches the header offset, and releases when
            // the host's bottom reaches the bottom of the stuck box.
            start: `top top+=${PASSAGE_TOP}`,
            end: () => `+=${passageTravel(passage, sticky)}`,
            scrub: true,
            invalidateOnRefresh: true,
            onRefresh: (self) => {
              geometry = { ...measure(), start: self.start, travel: Math.max(1, self.end - self.start) };
              setCylinder(geometry);
              gsap.set(ring, { z: -geometry.radius });
              writeFrontSlot();
            },
            onUpdate: (self) => setProgress(self.progress),
          },
        },
      );

      writeFrontSlot();
      installCylinderProbe({
        rotation: () => Number(gsap.getProperty(ring, 'rotationY')),
        progress: () => tween.scrollTrigger?.progress ?? 0,
        radius: () => geometry.radius,
        innerAngle: () => geometry.innerAngle,
        start: () => tween.scrollTrigger?.start ?? 0,
        end: () => tween.scrollTrigger?.end ?? 0,
        cards: pairs.length,
      });

      return () => {
        removeCylinderProbe();
        tween.scrollTrigger?.kill();
        tween.kill();
        gsap.set(ring, { clearProps: 'transform' });
        delete passage.dataset.frontSlot;
        setCylinder(null);
        setProgress(0);
        // Back to the server's answer, not to `flow`: outside `CYLINDER_MEDIA`
        // the stylesheet reserves nothing, and inside it the height belongs to
        // the page again until a fresh measurement says otherwise.
        setPassageHost('reserved');
        };
    });

    // Step 12: the route lifecycle tears this down at `astro:before-swap`, and
    // React's own unmount call of the same handle is a no-op.
    return onRouteTeardown(() => media.revert());
  }, [controls.motionPreference, hydrated, pairs.length, reducedMotion, settleTick]);

  /**
   * The first measurement is taken before React has committed the `--cylinder`
   * class, so it reads a full-width ribbon card rather than the narrower card
   * the ring actually lays out — a radius derived from the wrong pitch. One
   * refresh on the frame after the class lands re-enters `onRefresh` with the
   * real geometry. It cannot loop: what comes back changes only transform
   * values, and a transform never changes layout.
   */
  useEffect(() => {
    if (!passageEnabled) return;
    const frame = schedule(() => ScrollTrigger.refresh());
    return () => {
      if (frames.current.delete(frame)) window.cancelAnimationFrame(frame);
    };
  }, [passageEnabled, schedule]);

  // While the passage is stuck, the window is the only scroller. A focus ring,
  // a hash jump, or scroll anchoring must never scroll the track sideways instead.
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

  const cylinderState = getCylinderState(progress, pairs.length);
  const passageState = resolveFeaturedPresentation({
    passageEnabled,
    scrollState: { activeIndex: cylinderState.activeIndex, position: cylinderState.position },
    // Deliberately the director's own coordinate, not a seeded one: a jump is
    // held until the *owner* reports movement, which is what makes it settle.
    scrollY: scrollY,
    navigation: featuredNavigation,
    interactionIndex,
    count: pairs.length,
  });
  // `settled` on the cylinder means "flat enough to read and to touch", which is
  // the hold window — not an exact whole-number rotation the ring never sits at
  // for more than one frame.
  const settled = passageState.settled || cylinderState.inHoldWindow;
  const updateReveal = (id: string, value: number) => setReveals((current) => ({ ...current, [id]: value }));
  // `--passage-travel` is deliberately absent: it is declared in
  // `transformation-gallery.css` from `--featured-count`, which the server
  // already renders here, so the act's length has exactly one owner and exists
  // before this island does.
  const passageStyle = {
    '--featured-count': pairs.length,
    '--featured-position': passageState.position,
    '--cylinder-radius': cylinder?.radius ?? 0,
    '--cylinder-inner-angle': `${cylinder?.innerAngle ?? 0}deg`,
    '--front-emphasis': cylinderState.emphasis,
  } as CSSProperties;
  // Held one pixel inside the passage's own end, so "Last" lands on a card the
  // trigger is still holding rather than on the exact frame it releases.
  const featuredScrollTarget = (index: number) => Math.min(
    getFeaturedScrollTarget({
      passageTop: cylinder?.start ?? 0,
      passageTravel: cylinder?.travel ?? 1,
      index,
      count: pairs.length,
    }),
    (cylinder?.start ?? 0) + Math.max(0, (cylinder?.travel ?? 1) - 1),
  );
  const pinTrack = () => {
    const track = featuredWindowRef.current;
    if (!track) return;
    track.scrollLeft = 0;
    track.scrollTop = 0;
  };
  /**
   * First / Previous / Next / Last move the *window* to the scroll position at
   * which the ScrollTrigger holds that card in the front slot. Nothing here
   * touches the ring's angle: the trigger reads the new scroll position and
   * rotates to match, which is why a jump and a scroll can never disagree.
   */
  const scrollToFeatured = (index: number) => {
    // A frame queued by the previous layout must not land on top of this jump.
    cancelQueued();
    setInteractionIndex(null);
    setFeaturedNavigation({ index, scrollY: scrollY });
    pinTrack();
    if (!passageEnabled) {
      // Both axes: `inline` moves the snap ribbon to the card, `block` moves the
      // page to the ribbon. Without the second the card can arrive in the track
      // while the track itself is still below the fold.
      //
      // Once now and once on the next frame. Nothing in this layout reflows on
      // a click, so the immediate call is the one that lands; the queued one
      // only re-asserts the position if a late image decode moved the ribbon
      // under it, and re-asserting an unchanged position is a no-op.
      const jump = () => featuredWindowRef.current?.querySelectorAll<HTMLElement>('[data-featured-panel]')[index]?.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'center',
      });
      jump();
      schedule(jump);
      return;
    }
    window.scrollTo({ top: featuredScrollTarget(index), behavior: 'auto' });
  };
  // Focus moves the window, never the track: the element keeps its own scroll
  // position (preventScroll) and the ring is driven to that card's progress.
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
    className={`transformation-gallery${hydrated ? ' is-hydrated' : ''}${passageEnabled ? ' transformation-gallery--passage transformation-gallery--cylinder' : ''}`}
    style={passageStyle}
    data-gallery-mode="native"
    data-gallery-layout={passageEnabled ? 'passage' : 'native'}
    data-passage-host={passageHost}
    data-featured-index={passageState.activeIndex}
    data-featured-settled={settled}
    data-hold-window={cylinderState.inHoldWindow}
    aria-labelledby={head ? 'transformation-gallery-title' : labelledBy}
  >
    {head ? <div className="transformation-gallery__head">
      <div><h2 id="transformation-gallery-title">See the difference.</h2></div>
      <p>Drag the divider between the concrete and the finished floor. Same job, same room.</p>
    </div> : null}
    {render.reviewBadge ? <p className="transformation-gallery__review-note">Project pairing review · not approved for publication</p> : null}

    <div className="transformation-gallery__passage" ref={passageRef}>
      <div className="transformation-gallery__sticky" ref={stickyRef}>
        {/* Inside the sticky wrapper, because the eyebrow is the act's live
            label: it is driven by the front card's index and has to be on
            screen with the ring, not scrolled away above it. */}
        <WordSwapEyebrow swapKey={passageState.activeIndex} />
        <nav className="transformation-gallery__feature-nav" aria-label="Featured transformation passage" ref={featuredNavRef}>
          <button type="button" disabled={!hydrated || passageState.activeIndex === 0} onClick={() => scrollToFeatured(0)}>First <span className="visually-hidden">featured project</span></button>
          <button type="button" disabled={!hydrated || passageState.activeIndex === 0} onClick={() => scrollToFeatured(Math.max(0, passageState.activeIndex - 1))} aria-label="Previous featured project">←</button>
          <p aria-live="polite" aria-atomic="true"><span>{String(passageState.activeIndex + 1).padStart(2, '0')}</span> / {String(pairs.length).padStart(2, '0')}</p>
          <button type="button" disabled={!hydrated || passageState.activeIndex === pairs.length - 1} onClick={() => scrollToFeatured(Math.min(pairs.length - 1, passageState.activeIndex + 1))} aria-label="Next featured project">→</button>
          <button type="button" disabled={!hydrated || passageState.activeIndex === pairs.length - 1} onClick={() => scrollToFeatured(pairs.length - 1)}>Last <span className="visually-hidden">featured project</span></button>
          {explore ? <a href="#transformation-explore">Skip featured comparisons</a> : null}
        </nav>
        <div className="transformation-gallery__featured-window" ref={featuredWindowRef}>
          <div className="transformation-gallery__ring" ref={ringRef}>
            {pairs.map((project, index) => {
              const active = index === passageState.activeIndex;
              const offset = index - passageState.position;
              const load = getImageLoadingState(index, passageState.activeIndex, pairs.length);
              return <div
                className="transformation-gallery__featured-panel"
                data-featured-panel
                data-active={active}
                data-front={passageEnabled ? active && cylinderState.inHoldWindow : undefined}
                key={project.id}
                ref={index === 0 ? firstFeaturedRef : undefined}
                style={{
                  '--card-index': index,
                  '--card-offset': offset,
                  // The coated side. Off on the front card, ramping up on the
                  // faces turning away, so the ring reads as one glossed floor
                  // catching the light rather than as a stack of photographs.
                  '--card-shine': Math.min(.62, Math.abs(offset) * .46),
                } as CSSProperties}
              >
                <span className="transformation-gallery__shine" aria-hidden="true" />
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
                    setFeaturedNavigation({ index, scrollY: scrollY });
                    setInteractionIndex(index);
                    focusFeatured(index, target);
                  }}
                />
              </div>;
            })}
          </div>
          {/* The geometric twin of the front card: never rotated, so its rect is
              the front slot at any ring angle. Published as `data-front-slot`. */}
          <div className="transformation-gallery__slot" ref={slotRef} aria-hidden="true" />
        </div>
      </div>
    </div>

    {explore ? <section className="transformation-gallery__explore" id="transformation-explore" data-explore-index={exploreIndex} aria-labelledby="transformation-explore-title">
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
    </section> : null}
    <p className="transformation-gallery__source">Edmonton project archive · {passageState.activeIndex + 1} of {pairs.length}. Source images are from the public <a href="https://www.finalfinishepoxy.ca/projects">Final Finish Epoxy project archive</a>. {render.reviewBadge ? 'Pairings shown in this review are pending publication approval.' : 'Only publication-approved pairings are shown.'}</p>
  </section>;
}
