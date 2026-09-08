import { describe, expect, it } from 'vitest';
import { finishCssBackground, finishPresets } from './finishes';

describe('finish inspiration catalogue', () => {
  it('contains exactly 30 inspiration-only finishes in the approved family mix', () => {
    expect(finishPresets).toHaveLength(30);
    expect(finishPresets.filter((finish) => finish.family === 'flake')).toHaveLength(14);
    expect(finishPresets.filter((finish) => finish.family === 'solid')).toHaveLength(8);
    expect(finishPresets.filter((finish) => finish.family === 'metallic')).toHaveLength(8);
    expect(finishPresets.every((finish) => finish.inspirationOnly)).toBe(true);
  });

  it('uses unique ids, names, and accessible descriptions', () => {
    expect(new Set(finishPresets.map((finish) => finish.id)).size).toBe(30);
    expect(new Set(finishPresets.map((finish) => finish.name)).size).toBe(30);
    expect(finishPresets.every((finish) => finish.description.length >= 24)).toBe(true);
    expect(finishCssBackground(finishPresets[0])).toContain('#');
    expect(finishPresets.find((finish) => finish.id === 'blue-orbit')?.pattern).toBe('ocean');
    expect(finishPresets.every((finish) => Boolean(finish.pattern))).toBe(true);
  });
});
