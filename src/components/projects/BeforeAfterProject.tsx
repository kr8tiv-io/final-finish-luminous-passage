import { useState, type CSSProperties, type MouseEvent } from 'react';
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
};

export default function BeforeAfterProject({ before, after, label, featured = false, stage = false }: Props) {
  const [reveal, setReveal] = useState(50);
  const style = { '--reveal': `${reveal}%` } as CSSProperties;

  function followMouse(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = Math.round(((event.clientX - bounds.left) / bounds.width) * 100);
    setReveal(Math.min(100, Math.max(0, next)));
  }

  return (
    <figure
      className={`project-comparison${featured ? ' project-comparison--featured' : ''}${stage ? ' project-comparison--stage' : ''}`}
      data-project-comparison
      data-featured-project-comparison={featured ? '' : undefined}
      style={style}
    >
      <div className="comparison-stage" data-comparison-stage onMouseMove={followMouse}>
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
        <span className="comparison-tag comparison-tag--before">After</span>
        <span className="comparison-tag comparison-tag--after">Before</span>
        <span className="comparison-rule" aria-hidden="true"><i>↔</i></span>
        <input
          className="comparison-range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={reveal}
          aria-label={`Reveal the finished floor for ${label}`}
          onChange={(event) => setReveal(Number(event.currentTarget.value))}
        />
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
