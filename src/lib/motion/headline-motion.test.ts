import { describe, expect, it } from 'vitest';
import {
  headlineMotionMode,
  headlineMotionSpec,
  headlineStagger,
  headlineStyleForChapter,
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
      ['finish-hall', 'depth-settle'],
      ['commercial', 'lateral-curtain'],
      ['proof', 'line-rise'],
      ['consultation', 'depth-settle'],
    ]);
  });

  it('keeps all three signatures restrained, deterministic, and line-based', () => {
    const rise = headlineMotionSpec('line-rise', false);
    const curtain = headlineMotionSpec('lateral-curtain', false);
    const depth = headlineMotionSpec('depth-settle', false);

    expect(rise).toMatchObject({ duration: 0.86, stagger: 0.055, ease: 'power3.out' });
    expect(rise.from).toMatchObject({ yPercent: 30, opacity: 0 });
    expect(curtain).toMatchObject({ duration: 0.96, stagger: 0.06, ease: 'power3.out' });
    expect(curtain.from).toMatchObject({ xPercent: -13, opacity: 0 });
    expect(depth).toMatchObject({ duration: 0.98, stagger: 0.05, ease: 'power3.out' });
    expect(depth.from).toMatchObject({ y: 14, z: -42, rotationX: 4, opacity: 0 });
    expect(JSON.stringify([rise, curtain, depth])).not.toMatch(/random|elastic|scramble/i);
  });

  it('uses shorter movement on compact screens and caps multi-line sequences', () => {
    const desktop = headlineMotionSpec('depth-settle', false);
    const compact = headlineMotionSpec('depth-settle', true);

    expect(compact.duration).toBeLessThan(desktop.duration);
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
});
