import { useState, type CSSProperties } from 'react';
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
  const style = { '--reveal': `${reveal}%` } as CSSProperties;

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
      <div className="comparison-stage" data-comparison-stage>
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
          aria-valuetext={`${reveal}% finished floor`}
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
