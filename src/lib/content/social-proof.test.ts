import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('customer evidence, not decorative testimonials', () => {
  it('puts the white review stage immediately after the pouring opening', () => {
    const home = read('pages/index.astro');
    const firstEnd = home.indexOf('</section>');
    expect(home.slice(firstEnd, home.indexOf('id="foundation"'))).toContain('<SocialProof');
    expect(home.match(/<SocialProof/g)).toHaveLength(1);
  });
  it('keeps the Google total independent of the selected, uniquely attributed excerpts', () => {
    const proof = JSON.parse(read('data/customer-proof.json'));
    expect(proof.rating.value).toBe(5);
    expect(proof.rating.count).toBe(30);
    expect(proof.rating.verifiedAt).toMatch(/^2026-09-0[89]/);
    expect(proof.reviews.length).toBeGreaterThanOrEqual(14);
    expect(new Set(proof.reviews.map((r: {name:string}) => r.name)).size).toBe(proof.reviews.length);
    for (const review of proof.reviews) {
      expect(review.excerpt.trim().split(/\s+/).length).toBeLessThanOrEqual(25);
      expect(review.rating).toBe(5);
    }
  });
  it('uses full runtime images and separates unconfirmed project pairings', () => {
    const stories = JSON.parse(read('data/home-project-stories.json'));
    expect(stories).toHaveLength(3);
    expect(new Set(stories.flatMap((s: {photos: {id:string}[]}) => s.photos.map(p => p.id))).size).toBe(6);
    for (const story of stories) expect(story.pairingApproved).toBe(false);
    const component = read('components/home/ProjectStory.astro');
    expect(component).not.toContain('variants.thumbnail');
    expect(component).toContain('data-journey-white-stage');
    expect(component).toContain('photo.caption');
  });
  it('removes the dark speckled stair film instead of tinting the whole scene', () => {
    const home = read('pages/index.astro');
    expect(home).not.toContain('/epoxy-walkway.mp4');
    expect(home).toContain('pearl-stair');
    expect(home).toContain('data-material-lens');
  });
});
