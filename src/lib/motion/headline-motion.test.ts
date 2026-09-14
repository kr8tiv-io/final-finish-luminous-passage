import { describe, expect, it } from 'vitest';
import {
  headlineMotionMode,
  headlineMotionSpec,
  headlineStagger,
  headlineStyleForChapter,
  isJourneyMotionOwnedNode,
} from './headline-motion';
import type { JourneyChapterId } from './journey-director';

describe('headline style direction', () => {
  it('assigns a purposeful treatment to every journey chapter', () => {
    expect([
      'portico',
      'foundation',
      'garage',
      'vault',
      'finish-hall',
      'commercial',
      'proof',
      'consultation',
    ].map((chapter) => [chapter, headlineStyleForChapter(chapter as JourneyChapterId)])).toEqual([
      ['portico', 'line-rise'],
      ['foundation', 'line-rise'],
      ['garage', 'lateral-curtain'],
      ['vault', 'depth-settle'],
      ['finish-hall', 'epoxy-mask'],
      ['commercial', 'lateral-curtain'],
      ['proof', 'line-rise'],
      ['consultation', 'depth-settle'],
    ]);
  });

  it('reveals the authoritative studio HTML through one uneven epoxy edge', () => {
    const mask = headlineMotionSpec('epoxy-mask', false);

    expect(mask).toMatchObject({ duration: 0.6, stagger: 0.04, ease: 'power3.out' });
    expect(mask.from.clipPath).toMatch(/^polygon\(/);
    expect(mask.to?.clipPath).toMatch(/^polygon\(/);
    expect(mask.from).not.toHaveProperty('opacity');
    expect(mask.from.clipPath).not.toBe(mask.to?.clipPath);
  });

  it('keeps all three signatures restrained, deterministic, and line-based', () => {
    const rise = headlineMotionSpec('line-rise', false);
    const curtain = headlineMotionSpec('lateral-curtain', false);
    const depth = headlineMotionSpec('depth-settle', false);

    expect(rise).toMatchObject({ duration: 0.6, stagger: 0.055, ease: 'power3.out' });
    expect(rise.from).toMatchObject({ yPercent: 30, opacity: 0 });
    expect(curtain).toMatchObject({ duration: 0.6, stagger: 0.06, ease: 'power3.out' });
    expect(curtain.from).toMatchObject({ xPercent: -13, opacity: 0 });
    expect(depth).toMatchObject({ duration: 0.6, stagger: 0.05, ease: 'power3.out' });
    expect(depth.from).toMatchObject({ y: 14, z: -42, rotationX: 4, opacity: 0 });
    expect(JSON.stringify([rise, curtain, depth])).not.toMatch(/random|elastic|scramble/i);
  });

  it('keeps lateral supporting labels within a 350ms arrival', () => {
    const label = headlineMotionSpec('lateral-curtain', false, 'label');

    expect(label).toMatchObject({ duration: 0.35, stagger: 0, ease: 'power3.out' });
    expect(label.from).toMatchObject({ xPercent: -13, opacity: 0 });
  });

  it('uses shorter movement on compact screens and caps multi-line sequences', () => {
    const desktop = headlineMotionSpec('depth-settle', false);
    const compact = headlineMotionSpec('depth-settle', true);

    expect(compact.duration).toBe(desktop.duration);
    expect(Math.abs(Number(compact.from.y))).toBeLessThan(Math.abs(Number(desktop.from.y)));
    expect(Math.abs(Number(compact.from.z))).toBeLessThan(Math.abs(Number(desktop.from.z)));
    expect(headlineStagger(desktop, 2)).toBe(desktop.stagger);
    expect(desktop.duration + headlineStagger(desktop, 12) * 11).toBeLessThanOrEqual(1.25);
  });
});

describe('headline lifecycle decisions', () => {
  it('prepares, resumes, settles, or disables without replaying completed titles', () => {
    expect(headlineMotionMode({ presentationEnabled: true, phase: 'ready' })).toBe('prepare');
    expect(headlineMotionMode({ presentationEnabled: true, phase: 'entering' })).toBe('resume');
    expect(headlineMotionMode({ presentationEnabled: true, phase: 'settled' })).toBe('settled');
    expect(headlineMotionMode({ presentationEnabled: false, phase: 'ready' })).toBe('static');
    expect(headlineMotionMode({ presentationEnabled: false, phase: 'entering' })).toBe('static');
  });

  it('rejects descendants owned by a nested Astro island or another chapter', () => {
    const chapter = {};
    const owned = { closest: (selector: string) => selector === '.journey-chapter' ? chapter : null };
    const island = {};
    const nestedIsland = { closest: (selector: string) => selector === 'astro-island' ? island : chapter };
    const otherChapter = { closest: (selector: string) => selector === '.journey-chapter' ? {} : null };

    expect(isJourneyMotionOwnedNode(owned, chapter)).toBe(true);
    expect(isJourneyMotionOwnedNode(nestedIsland, chapter)).toBe(false);
    expect(isJourneyMotionOwnedNode(otherChapter, chapter)).toBe(false);
  });
});
