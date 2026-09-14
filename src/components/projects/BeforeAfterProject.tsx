import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { clampReveal, resolveDragOwner } from '../../lib/projects/transformation-gallery';
import './before-after-project.css';

type ProjectImage = {
  variants: { avif: string; webp: string; jpeg: string; thumbnail: string };
  width: number;
  height: number;
};

type Props = {
  before: ProjectImage;
  after: ProjectImage;
  label: string;
  featured?: boolean;
  stage?: boolean;
  pairingApproved?: boolean;
};

export default function BeforeAfterProject({ before, after, label, featured = false, stage = false, pairingApproved = false }: Props) {
  const [reveal, setReveal] = useState(50);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; pointerId: number; owner: 'comparison' | 'page' | null } | null>(null);
  const style = { '--reveal': `${reveal}%` } as CSSProperties;

  const revealFromPointer = (clientX: number) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    return bounds ? clampReveal(((clientX - bounds.left) / Math.max(1, bounds.width)) * 100) : reveal;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, owner: null };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    if (!start) return;
    const owner = start.owner ?? resolveDragOwner({ startsInComparison: true, deltaX: event.clientX - start.x, deltaY: event.clientY - start.y });
    if (owner === 'undecided') return;
    start.owner = owner === 'comparison' ? 'comparison' : 'page';
    if (owner !== 'comparison') return;
    if (!stageRef.current?.hasPointerCapture(event.pointerId)) stageRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
    setReveal(revealFromPointer(event.clientX));
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (stageRef.current?.hasPointerCapture(event.pointerId)) stageRef.current.releasePointerCapture(event.pointerId);
    pointerStart.current = null;
  };

  if (!pairingApproved) {
    return <figure className="project-comparison project-evidence">
      <div className="project-evidence-views">
        {[before, after].map((photo, index) => <figure key={photo.variants.jpeg}>
          <picture><source type="image/webp" srcSet={photo.variants.webp} /><img src={photo.variants.jpeg} alt={`${label}: ${index === 0 ? 'concrete preparation' : 'finished floor'}`} width={photo.width} height={photo.height} loading="lazy" decoding="async" /></picture>
          <figcaption>{index === 0 ? 'Concrete preparation' : 'Finished surface'}</figcaption>
        </figure>)}
      </div>
      <figcaption>{label}<small>Project pairing awaiting confirmation</small></figcaption>
    </figure>;
  }

  return (
    <figure
      className={`project-comparison${featured ? ' project-comparison--featured' : ''}${stage ? ' project-comparison--stage' : ''}`}
      data-project-comparison
      data-featured-project-comparison={featured ? '' : undefined}
      style={style}
    >
      <div ref={stageRef} className="comparison-stage" data-comparison-stage onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd}>
        <picture className="comparison-picture comparison-before">
          <source media="(max-width: 767px)" type="image/webp" srcSet={before.variants.thumbnail} sizes="100vw" />
          <source media="(min-width: 768px)" type="image/avif" srcSet={before.variants.avif} sizes="(max-width: 1440px) 50vw, 720px" />
          <source media="(min-width: 768px)" type="image/webp" srcSet={before.variants.webp} sizes="(max-width: 1440px) 50vw, 720px" />
          <img src={before.variants.jpeg} alt={`${label}: concrete floor before coating`} width={before.width} height={before.height} loading="lazy" decoding="async" />
        </picture>
        <picture className="comparison-picture comparison-after">
          <source media="(max-width: 767px)" type="image/webp" srcSet={after.variants.thumbnail} sizes="100vw" />
          <source media="(min-width: 768px)" type="image/avif" srcSet={after.variants.avif} sizes="(max-width: 1440px) 50vw, 720px" />
          <source media="(min-width: 768px)" type="image/webp" srcSet={after.variants.webp} sizes="(max-width: 1440px) 50vw, 720px" />
          <img src={after.variants.jpeg} alt={`${label}: finished coated floor`} width={after.width} height={after.height} loading="lazy" decoding="async" />
        </picture>
        <span className="comparison-tag comparison-tag--before">Before</span>
        <span className="comparison-tag comparison-tag--after">After</span>
        <span className="comparison-rule" aria-hidden="true"><i>↔</i></span>
        <input
          className="comparison-range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={reveal}
          aria-label={`Reveal the finished floor for ${label}`}
          aria-valuetext={`${reveal}% finished floor`}
          onChange={(event) => setReveal(clampReveal(Number(event.currentTarget.value)))}
        />
        <div className="comparison-actions" aria-label={`Comparison controls for ${label}`}>
          <button type="button" aria-label="Show before photograph" onClick={() => setReveal(0)}>Before</button>
          <button type="button" aria-label="Show after photograph" onClick={() => setReveal(100)}>After</button>
        </div>
      </div>
      {!featured && (
        <figcaption>
          <span>{label}</span>
          <small><i aria-hidden="true" />Pairing review</small>
        </figcaption>
      )}
    </figure>
  );
}
