import { describe, expect, it } from 'vitest';
import { dissolveProgress } from './dissolve';

describe('dissolveProgress', () => {
  it('holds the current room until the last stretch of the pin', () => {
    expect(dissolveProgress(0, 0)).toBe(0);
    expect(dissolveProgress(0.71, 0)).toBe(0);
    expect(dissolveProgress(0.72, 0)).toBe(0);
  });

  it('is fully mixed by the end of the breath and stays clamped', () => {
    expect(dissolveProgress(1, 1)).toBe(1);
    expect(dissolveProgress(2, 2)).toBe(1);
    expect(dissolveProgress(-1, -1)).toBe(0);
  });

  it('is monotonic from pin tail through breath', () => {
    const samples = [
      dissolveProgress(0.72, 0),
      dissolveProgress(0.86, 0),
      dissolveProgress(1, 0),
      dissolveProgress(1, 0.5),
      dissolveProgress(1, 1),
    ];
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
    expect(dissolveProgress(1, 0)).toBeGreaterThan(0);
    expect(dissolveProgress(1, 0)).toBeLessThan(1);
  });
});
