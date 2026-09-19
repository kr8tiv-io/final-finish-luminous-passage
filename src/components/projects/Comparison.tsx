import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
import type { ImageVariant, Transformation } from '../../data/transformation-gallery';
import { clampReveal, normalizeImageTransform, resolveDragOwner } from '../../lib/projects/transformation-gallery';
import './comparison.css';

/**
 * The one before/after comparison on this site. Extracted from
 * `TransformationGallery.tsx` in Step 11 so `/projects` renders the same
 * divider the homepage proof act does, rather than a second implementation
 * with its own drag rules and its own endpoints. There is exactly one owner of
 * the divider position here: the `reveal` prop (committed) plus the local
 * `hoverReveal` (transient preview, always cleared on commit, blur, or leave).
 */

type PointerStart = { x: number; y: number; pointerId: number; owner: 'comparison' | 'page' | null } | null;

/** Everything a comparison reads off a project. `Transformation` satisfies it. */
export type ComparisonProject = Pick<Transformation, 'id' | 'tabLabel' | 'title' | 'homeownerCaption' | 'before' | 'after'>;

export function Picture({ image, full, loading }: { image: ImageVariant; full: boolean; loading: 'eager' | 'lazy' }) {
  const crop = normalizeImageTransform(image.crop);
  const cropStyle = {
    objectPosition: image.crop.objectPosition,
    transform: `translate3d(${crop.translateX}%, ${crop.translateY}%, 0) rotate(${crop.rotate}deg) scale(${crop.scale})`,
  };
  // `data-horizon-avoid` (Step 16): the surface plane's 1 px horizon line must never
  // cross a photograph. The line is meant to sit over the FILM plates, which is why the
  // opt-out is on the content images rather than on every `<img>` on the page —
  // `src/lib/motion/surface-store.ts` reads the attribute and the store hides the line
  // for as long as one of these boxes is on its row.
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
      data-horizon-avoid=""
      style={cropStyle}
    />;
  }
  return <picture data-image-quality="full" data-horizon-avoid="">
    <source type="image/avif" srcSet={image.avif} />
    <source type="image/webp" srcSet={image.webp} />
    <img src={image.jpeg} alt={image.alt} width={image.width} height={image.height} loading={loading} decoding="async" draggable={false} style={cropStyle} />
  </picture>;
}

export function valueText(reveal: number): string {
  if (reveal === 0) return 'After photograph fully visible';
  if (reveal === 100) return 'Before photograph fully visible';
  return `${reveal}% before photograph on the left and ${100 - reveal}% after photograph on the right`;
}

export default function Comparison({
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
  project: ComparisonProject;
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
 * Mount point for a page that shows one comparison at a time (`/projects`).
 * The gallery keeps `reveal` in its own store because each pairing appears
 * twice there — once in the featured passage and once in the explore ribbon —
 * and both instances must agree. A standalone comparison has no second
 * instance, so it holds that one value here rather than adding a second owner
 * inside `Comparison`. Astro islands cannot take function props, so this is
 * also what lets `/projects` mount the divider at all.
 */
export function StandaloneComparison({
  project,
  instance = 'archive',
  initialReveal = 50,
  loading = 'lazy',
}: {
  project: ComparisonProject;
  instance?: string;
  initialReveal?: number;
  loading?: 'eager' | 'lazy';
}) {
  const [reveal, setReveal] = useState(initialReveal);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return <Comparison
    project={project}
    instance={instance}
    reveal={reveal}
    onReveal={setReveal}
    hydrated={hydrated}
    full
    loading={loading}
  />;
}
