import { describe, expect, it } from 'vitest';
import { reconcileArticleDates, getGitContentDates } from './git-dates';

describe('reconcileArticleDates', () => {
  it('keeps the frontmatter date when it already falls after datePublished', () => {
    const result = reconcileArticleDates('2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z');
    expect(result).toEqual({ datePublished: '2026-01-01T00:00:00Z', dateModified: '2026-06-01T00:00:00Z' });
  });

  it('falls back dateModified to datePublished when the frontmatter date is earlier', () => {
    // Regression: a guide's frontmatter `updatedAt` (an editorial date) predated the file's own
    // first git commit, which would otherwise render an Article schema with dateModified before
    // datePublished — a real structured-data inconsistency, caught while building Step 32.
    const result = reconcileArticleDates('2026-09-08T08:54:03-06:00', '2026-08-31T00:00:00.000Z');
    expect(result.dateModified).toBe(result.datePublished);
  });

  it('treats an exact match as already consistent', () => {
    const result = reconcileArticleDates('2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z');
    expect(result.dateModified).toBe('2026-05-01T00:00:00Z');
  });
});

describe('getGitContentDates', () => {
  it('reports unavailable (never invents a date) for a path with no git history', () => {
    const result = getGitContentDates('C:/definitely/not/a/real/tracked/file.mdx');
    expect(result).toEqual({ datePublished: null, dateModifiedFromGit: null, provenance: 'unavailable' });
  });

  it('derives real dates for a file that is actually tracked in this repo', () => {
    const result = getGitContentDates(process.cwd() + '/package.json');
    expect(result.provenance).toBe('git-history');
    expect(result.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(result.datePublished!).getTime()).toBeLessThanOrEqual(new Date(result.dateModifiedFromGit!).getTime());
  });
});
