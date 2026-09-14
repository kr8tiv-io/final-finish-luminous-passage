import { describe, expect, it } from 'vitest';
import {
  FOUNDATION_STAIR_TIMING,
  journeyFilmProgress,
  journeyFilmTime,
} from './journey-film-timing';

describe('foundation stair film timing', () => {
  it('holds the coherent first and landing frames outside the authored ascent window', () => {
    expect(FOUNDATION_STAIR_TIMING).toEqual({ start: 0.14, end: 0.84 });
    expect(journeyFilmProgress('foundation', 0)).toBe(0);
    expect(journeyFilmProgress('foundation', 0.14)).toBe(0);
    expect(journeyFilmProgress('foundation', 0.84)).toBe(1);
    expect(journeyFilmProgress('foundation', 1)).toBe(1);
  });

  it('maps the climb smoothly and deterministically in either scroll direction', () => {
    const temporalWindow = [0, 0.07, 0.14, 0.315, 0.49, 0.665, 0.84, 0.92, 1]
      .map((progress) => journeyFilmProgress('foundation', progress));

    expect(temporalWindow.map((value) => Number(value.toFixed(5))))
      .toEqual([0, 0, 0, 0.15625, 0.5, 0.84375, 1, 1, 1]);
    expect([...temporalWindow].reverse()).toEqual(
      [...[0, 0.07, 0.14, 0.315, 0.49, 0.665, 0.84, 0.92, 1]].reverse()
        .map((progress) => journeyFilmProgress('foundation', progress)),
    );
  });

  it('preserves linear clocks for every other chapter and exact video endpoints', () => {
    expect(journeyFilmProgress('garage', 0.4)).toBe(0.4);
    expect(journeyFilmTime('foundation', 0.49, 6.5)).toBe(3.25);
    expect(journeyFilmTime('foundation', -1, 6.5)).toBe(0);
    expect(journeyFilmTime('foundation', 2, 6.5)).toBe(6.5);
    expect(journeyFilmTime('foundation', 0.5, Number.NaN)).toBe(0);
    expect(journeyFilmTime('foundation', 0.5, 0)).toBe(0);
  });
});
