import { describe, expect, it } from 'vitest';
import { compareBudgets, pairLongTaskWithFrame, reduceClsSessionWindows } from './measure-delivery.mjs';
import { formatRow } from './check-budgets.mjs';

/**
 * The two pure functions Step 34 rests on:
 *  - reduceClsSessionWindows: the CLS-spec session-window reducer that replaced
 *    the whole-session sum which was reading exactly 1.0 / 2.0 on every run.
 *  - compareBudgets: the one place thresholds are applied, and the reason a
 *    2381-byte overshoot on a 5 MiB budget cannot be rounded away.
 */

const shift = (startTime, value, hadRecentInput = false) => ({ startTime, value, hadRecentInput });

describe('reduceClsSessionWindows', () => {
  it('returns zero for no entries', () => {
    const result = reduceClsSessionWindows([]);
    expect(result.value).toBe(0);
    expect(result.windowCount).toBe(0);
    expect(result.largestWindow).toBeNull();
  });

  it('tolerates a non-array input', () => {
    expect(reduceClsSessionWindows(undefined).value).toBe(0);
    expect(reduceClsSessionWindows(null).entryCount).toBe(0);
  });

  it('drops entries with hadRecentInput and counts them', () => {
    const result = reduceClsSessionWindows([
      shift(100, 0.5, true),
      shift(200, 0.01, false),
    ]);
    expect(result.value).toBeCloseTo(0.01, 6);
    expect(result.excludedByInput).toBe(1);
    expect(result.entryCount).toBe(1);
  });

  it('groups entries less than the 1s gap apart into one window', () => {
    const result = reduceClsSessionWindows([
      shift(0, 0.004),
      shift(500, 0.004),
      shift(900, 0.004),
    ]);
    expect(result.windowCount).toBe(1);
    expect(result.value).toBeCloseTo(0.012, 6);
    expect(result.largestWindow).toMatchObject({ start: 0, end: 900, entryCount: 3 });
  });

  it('opens a new window after a gap longer than 1s', () => {
    const result = reduceClsSessionWindows([
      shift(0, 0.01),
      shift(2500, 0.03),
      shift(2900, 0.01),
    ]);
    expect(result.windowCount).toBe(2);
    // The metric is the LARGEST window, not the total.
    expect(result.value).toBeCloseTo(0.04, 6);
    expect(result.naiveSum).toBeCloseTo(0.05, 6);
  });

  it('caps a window at 5s even when entries never stop arriving', () => {
    const entries = [];
    for (let t = 0; t <= 9000; t += 500) entries.push(shift(t, 0.001));
    const result = reduceClsSessionWindows(entries);
    expect(result.windowCount).toBeGreaterThan(1);
    for (const win of result.windows) {
      expect(win.end - win.start).toBeLessThanOrEqual(5000);
    }
  });

  it('honours custom gap and window sizes', () => {
    const entries = [shift(0, 0.01), shift(300, 0.01)];
    expect(reduceClsSessionWindows(entries, { gapMs: 100 }).windowCount).toBe(2);
    expect(reduceClsSessionWindows(entries, { gapMs: 1000 }).windowCount).toBe(1);
  });

  it('sorts entries that arrive out of order', () => {
    const result = reduceClsSessionWindows([shift(900, 0.004), shift(0, 0.004), shift(500, 0.004)]);
    expect(result.windowCount).toBe(1);
    expect(result.largestWindow.start).toBe(0);
    expect(result.largestWindow.end).toBe(900);
  });

  it('separates the session-window value from the whole-session sum — the bug this replaced', () => {
    // Two maximal full-viewport shifts, 30s apart: a naive sum reads 2.0 (and
    // gates on it); the spec metric is one window's worth, 1.0.
    const result = reduceClsSessionWindows([shift(1200, 1), shift(31_200, 1)]);
    expect(result.naiveSum).toBe(2);
    expect(result.value).toBe(1);
    expect(result.windowCount).toBe(2);
  });

  it('ignores entries with non-finite values or times', () => {
    const result = reduceClsSessionWindows([
      shift(0, Number.NaN),
      shift(Number.POSITIVE_INFINITY, 0.5),
      shift(10, 0.02),
    ]);
    expect(result.entryCount).toBe(1);
    expect(result.value).toBeCloseTo(0.02, 6);
  });
});

const BUDGETS = {
  gated: {
    arrivalBytes: { desktop: 5242880, phone: 838861 },
    routeBytes: { desktop: 18874368, phone: 12582912 },
    lcpMs: 2500,
    clsArrival: 0.02,
    inpMs: 200,
    longTaskMaxMs: 200,
  },
};

const result = (project, overrides = {}) => ({
  project,
  label: `${project} viewport`,
  arrivalBytes: 100,
  routeBytes: 100,
  lcpMs: 900,
  clsArrival: 0,
  inpMs: 40,
  longestLongTaskMs: 40,
  ...overrides,
});

describe('compareBudgets', () => {
  it('passes when every gated metric is inside budget', () => {
    const { ok, failures, rows } = compareBudgets({ results: [result('desktop')] }, BUDGETS);
    expect(ok).toBe(true);
    expect(failures).toHaveLength(0);
    expect(rows).toHaveLength(6);
  });

  it('treats a byte budget as inclusive at the exact limit', () => {
    const { ok } = compareBudgets(
      { results: [result('desktop', { arrivalBytes: 5242880 })] },
      BUDGETS,
    );
    expect(ok).toBe(true);
  });

  it('fails a 2381-byte overshoot on a 5 MiB budget and reports the exact overage', () => {
    // The real integration-branch desktop arrival: 5.00 MB when rounded, a fail in bytes.
    const { ok, failures } = compareBudgets(
      { results: [result('desktop', { arrivalBytes: 5245261 })] },
      BUDGETS,
    );
    expect(ok).toBe(false);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ metric: 'arrivalBytes', over: 2381, pass: false });
    // And it must still print as a fail, not as a tidy "5.00 MiB".
    expect(formatRow(failures[0]).result).toBe('FAIL');
    expect(formatRow(failures[0]).over).toBe('+2381 B');
  });

  it('picks the per-viewport threshold rather than a shared one', () => {
    const report = { results: [result('desktop', { arrivalBytes: 1_000_000 }), result('phone', { arrivalBytes: 1_000_000 })] };
    const { failures } = compareBudgets(report, BUDGETS);
    expect(failures.map((row) => row.project)).toEqual(['phone']);
  });

  it('gates CLS strictly below the threshold', () => {
    expect(compareBudgets({ results: [result('desktop', { clsArrival: 0.02 })] }, BUDGETS).ok).toBe(false);
    expect(compareBudgets({ results: [result('desktop', { clsArrival: 0.0199 })] }, BUDGETS).ok).toBe(true);
  });

  it('fails loudly when a metric is missing from the report instead of skipping it', () => {
    const { ok, failures } = compareBudgets(
      { results: [result('desktop', { inpMs: null })] },
      BUDGETS,
    );
    expect(ok).toBe(false);
    expect(failures[0]).toMatchObject({ metric: 'inpMs', reason: 'metric missing from report' });
  });

  it('fails when the report names a viewport the budgets do not cover', () => {
    const { failures } = compareBudgets({ results: [result('tablet')] }, BUDGETS);
    expect(failures.map((row) => row.metric)).toEqual(['arrivalBytes', 'routeBytes']);
  });

  it('handles an empty or malformed report without throwing', () => {
    expect(compareBudgets({}, BUDGETS).ok).toBe(true);
    expect(compareBudgets(undefined, BUDGETS).rows).toEqual([]);
    expect(compareBudgets({ results: [result('desktop')] }, {}).ok).toBe(false);
  });
});

describe('pairLongTaskWithFrame', () => {
  const frame = (startTime, duration, tag) => ({ startTime, duration, tag });

  it('returns null when nothing overlaps', () => {
    expect(pairLongTaskWithFrame({ startTime: 0, duration: 100 }, [frame(500, 100, 'a')])).toBeNull();
    expect(pairLongTaskWithFrame({ startTime: 0, duration: 100 }, [])).toBeNull();
    expect(pairLongTaskWithFrame({ startTime: 0, duration: 100 }, undefined)).toBeNull();
  });

  it('pairs a task that sits inside a frame', () => {
    const match = pairLongTaskWithFrame({ startTime: 120, duration: 40 }, [frame(100, 200, 'outer')]);
    expect(match.tag).toBe('outer');
  });

  it('pairs a frame that sits inside a task', () => {
    const match = pairLongTaskWithFrame({ startTime: 100, duration: 500 }, [frame(200, 40, 'inner')]);
    expect(match.tag).toBe('inner');
  });

  it('prefers the greatest overlap, not the nearest start', () => {
    // `near` starts 1 ms away but barely overlaps; `big` starts later and covers the task.
    const match = pairLongTaskWithFrame({ startTime: 1000, duration: 400 }, [
      frame(999, 5, 'near'),
      frame(1010, 500, 'big'),
    ]);
    expect(match.tag).toBe('big');
  });

  it('does not pair on a zero-width touch at the boundary', () => {
    expect(pairLongTaskWithFrame({ startTime: 0, duration: 100 }, [frame(100, 50, 'touching')])).toBeNull();
  });
});
