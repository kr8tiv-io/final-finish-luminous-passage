import { execFileSync } from 'node:child_process';

/**
 * Article `datePublished`/`dateModified` provenance.
 *
 * The `resources` content collection (`src/content.config.ts`) only carries an `updatedAt`
 * field — there is no `createdAt`/`datePublished` in frontmatter, and Step 32's brief is explicit
 * that dates must never be invented. So `datePublished` is derived from this file's own git
 * history (the commit that first added it) at build time, and the caller records that
 * provenance next to wherever it renders the date. `dateModified` still prefers the frontmatter
 * `updatedAt` a human deliberately set; git's most recent commit date is only its fallback.
 */

const cache = new Map<string, string[]>();

function gitDatesFor(absoluteFilePath: string): string[] {
  if (cache.has(absoluteFilePath)) return cache.get(absoluteFilePath)!;
  let dates: string[] = [];
  try {
    const raw = execFileSync(
      'git',
      ['log', '--follow', '--format=%aI', '--', absoluteFilePath],
      { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    dates = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    // Not a git checkout, git missing from PATH, or the file is untracked (e.g. a draft that
    // was never committed) — the caller falls back to the frontmatter date, never a made-up one.
    dates = [];
  }
  cache.set(absoluteFilePath, dates);
  return dates;
}

export interface ContentDates {
  /** ISO 8601 timestamp of the first commit that added this file, or null if unavailable. */
  datePublished: string | null;
  /** ISO 8601 timestamp of the most recent commit touching this file, or null if unavailable. */
  dateModifiedFromGit: string | null;
  /** Where datePublished came from, for the caller to log/comment — never silently invented. */
  provenance: 'git-history' | 'unavailable';
}

export function getGitContentDates(absoluteFilePath: string): ContentDates {
  const dates = gitDatesFor(absoluteFilePath);
  if (dates.length === 0) {
    return { datePublished: null, dateModifiedFromGit: null, provenance: 'unavailable' };
  }
  // `git log` prints newest first, so the last line is the file's first-ever commit.
  return {
    datePublished: dates[dates.length - 1],
    dateModifiedFromGit: dates[0],
    provenance: 'git-history',
  };
}

/**
 * Guarantees `dateModified` is never chronologically before `datePublished` in the rendered
 * Article schema.
 *
 * This repo's content was authored with an editorial `updatedAt` frontmatter date that does not
 * always match when the file actually landed in git (bulk-authored guides can carry an
 * `updatedAt` earlier than their first commit). Neither date is invented — one is a human-set
 * frontmatter field, the other is real git history — but publishing them as-is can produce
 * `datePublished` after `dateModified`, which is a real inconsistency a structured-data
 * validator would flag. When that happens, this reports the article as last modified on the day
 * it was published, which is the most conservative true statement available.
 */
export function reconcileArticleDates(datePublished: string, dateModifiedCandidate: string): { datePublished: string; dateModified: string } {
  const publishedTime = new Date(datePublished).getTime();
  const candidateTime = new Date(dateModifiedCandidate).getTime();
  return {
    datePublished,
    dateModified: candidateTime >= publishedTime ? dateModifiedCandidate : datePublished,
  };
}
