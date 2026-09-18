/**
 * Step 29/30 copy + claims gate.
 *
 * Three independent checks, each reported as a number so a regression is visible
 * rather than merely "passing":
 *
 *  1. FORBIDDEN TERMS — a grep over `src/**` for every term that
 *     `docs/context/CONTEXT-SHEET.md` A8 lists as not claimable, plus the
 *     competitor names A5 forbids. `src/content/resources/**` (Step 31 owns the 50
 *     guides) and `src/pages/index.astro` (the homepage, governed by
 *     `docs/context/COPY-DECK.md` and edited by another agent) are excluded.
 *     Exceptions are declared in ALLOWANCES below and are printed on every run, so
 *     an exemption can never be silent.
 *
 *  2. RENDERED COPY — exclamation points and average sentence length, measured on
 *     the built HTML in `dist/client` rather than on source strings, because that
 *     is what a reader actually gets. Customer quotes are verbatim and may carry
 *     exclamation points (COPY-DECK standing rule 1); they live only on the
 *     homepage, which this check skips along with the rest of the excluded set.
 *
 *  3. SHINGLE SIMILARITY — Jaccard overlap of word 5-grams between every pair of
 *     service/area pages, measured twice. The raw score alone is not a usable
 *     gate: seven pages that differ only by city name scored 0.677 raw on the
 *     pre-Step-30 tree, because the town name recurs often enough to break a
 *     fifth of the shingles. A check that cannot fail on the exact case it exists
 *     to catch is not a check, so the same pairs are also compared with every
 *     town name replaced by one placeholder token. Those seven pages score 1.000
 *     normalized; both scores must sit under THRESHOLD.
 *
 * Checks 2 and 3 need a build. Run `npm run build:staging` first; without
 * `dist/client` the script reports them as skipped and still runs check 1.
 *
 * Usage: node scripts/validate-copy-claims.mjs [--json]
 * Exit code 1 on any failure, so it can be wired into a CI gate.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = 'src';
const DIST = join('dist', 'client');
const SENTENCE_WORD_LIMIT = 20;
/**
 * A companion ceiling on any single sentence. The average alone is not enough: a
 * 52-word sentence dropped into a 23-sentence page lifts the mean by under two
 * words and passes, which the falsifiability probe in `output/step-29/`
 * demonstrated. Both numbers are reported.
 */
const LONGEST_SENTENCE_LIMIT = 45;
const SIMILARITY_THRESHOLD = 0.8;

/** Paths (POSIX-style, prefix match) this gate does not own. */
const EXCLUDED = ['src/content/resources', 'src/pages/index.astro'];

/**
 * Every allowance is a (term, file) pair with a written reason. Anything not
 * listed here is a failure. Keep this list short and keep the reasons literal.
 */
const ALLOWANCES = [
  {
    term: 'warranty',
    file: 'src/pages/warranty.astro',
    reason:
      'The warranty page is a deliberate anti-claim: it states that no year count or lifetime promise appears on this site and that terms live in the quote. A8 forbids inventing a term, not refusing to.',
  },
  {
    term: 'warranty',
    file: 'src/components/SiteFooter.astro',
    reason: 'Footer link label pointing at that same anti-claim page.',
  },
  {
    term: 'warranty',
    file: 'src/components/nav/nav-destinations.ts',
    reason: 'Navigation label pointing at that same anti-claim page.',
  },
  {
    term: 'foreign-phone-number',
    file: 'src/lib/quote/consultation-contract.test.ts',
    reason: 'Unit-test fixture using a reserved 555 number. Never rendered.',
  },
  { term: 'foreign-phone-number', file: 'src/lib/quote/email.test.ts', reason: 'Unit-test fixture, 555 number. Never rendered.' },
  { term: 'foreign-phone-number', file: 'src/lib/quote/schema.test.ts', reason: 'Unit-test fixture, 555 number. Never rendered.' },
  {
    term: 'years-with-a-number',
    file: 'src/lib/security/headers.ts',
    reason: 'A code comment on the HSTS max-age ("2 years"). Not copy, not rendered.',
  },
];

/**
 * Hits this step found, cannot fix, and is handing to a named owner. A deferral
 * is printed on every run and is NOT an approval: it is a debt with an address.
 * Deferrals do not fail the gate; leaving one undocumented would.
 */
const DEFERRALS = [
  {
    term: ['Sherwood Park', 'St. Albert', 'Leduc', 'Fort Saskatchewan', 'Spruce Grove', 'Beaumont'],
    file: 'src/layouts/BaseLayout.astro',
    owner: 'Step 32 (LocalBusiness schema) — src/layouts/** is owned by the concurrent structured-data agent',
    reason:
      'The site-wide HomeAndConstructionBusiness schema lists six towns in `areaServed`. A8 lists towns beyond Edmonton as not claimable, so this is a live claim conflict, identical in kind to the ones Step 29/30 removed from the visible copy. Step 29 was explicitly barred from editing this file while another agent holds it. Fix: reduce `areaServed` to Edmonton, or to a GeoCircle centred on Edmonton, matching /service-area.',
  },
];

const TERM_CHECKS = [
  // A5: competitors' names must never appear attached to a Final Finish claim.
  { term: 'Whitcrete', pattern: /whitcrete/gi },
  { term: 'Fusion Floors', pattern: /fusion\s*floors/gi },
  { term: 'B.Protek', pattern: /b\.?\s*protek/gi },
  { term: 'PE Coatings', pattern: /\bPE\s+Coatings\b/g },
  { term: 'Sealing Innovation', pattern: /sealing\s*innovation/gi },
  { term: 'Garage Living', pattern: /garage\s+living/gi },
  { term: 'Floor X2', pattern: /floor\s*x\s*2/gi },
  // A8 not-claimable.
  { term: 'warranty', pattern: /warrant(y|ies)/gi },
  { term: 'polyaspartic', pattern: /polyaspartic/gi },
  { term: 'polyurea', pattern: /polyurea/gi },
  { term: 'years-with-a-number', pattern: /\b(?:\d+|one|two|three|four|five|ten|fifteen|twenty)[-\s]*(?:\+\s*)?years?\b|\byears\s+(?:in\s+business|of\s+experience)\b/gi },
  { term: '#1', pattern: /#\s*1\b/g },
  { term: 'affordable', pattern: /affordable/gi },
  { term: 'Tadic', pattern: /tadic/gi },
  // A8: towns beyond Edmonton, with no evidence Denis serves them.
  { term: 'Sherwood Park', pattern: /sherwood\s+park/gi },
  { term: 'St. Albert', pattern: /st\.?\s*albert/gi },
  { term: 'Leduc', pattern: /leduc/gi },
  { term: 'Spruce Grove', pattern: /spruce\s+grove/gi },
  { term: 'Stony Plain', pattern: /stony\s+plain/gi },
  { term: 'Beaumont', pattern: /beaumont/gi },
  { term: 'Fort Saskatchewan', pattern: /fort\s+saskatchewan/gi },
  { term: 'Nisku', pattern: /nisku/gi },
  { term: 'Morinville', pattern: /morinville/gi },
  { term: 'Devon', pattern: /\bdevon\b/gi },
];

/** Denis's number, in every form the tree writes it. Anything else is a hit. */
const ALLOWED_PHONE = /^(?:\+?1[-.\s]?)?\(?780\)?[-.\s]?991[-.\s]?1651$/;
const PHONE_SHAPE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;

function toPosix(path) {
  return path.split(sep).join('/');
}

function isExcluded(posixPath) {
  return EXCLUDED.some((prefix) => posixPath === prefix || posixPath.startsWith(`${prefix}/`));
}

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!isExcluded(toPosix(full))) await walk(full, out);
    } else if (/\.(astro|ts|tsx|js|mjs|json|md|mdx)$/.test(entry.name) && !isExcluded(toPosix(full))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Blanks out full-line comments so a note explaining why a claim was removed does
 * not read as the claim itself. Deliberately conservative: only a line whose first
 * non-space character starts a comment is blanked, never a trailing `//` after
 * code, because over-stripping would let a real claim hide from this gate. HTML
 * comments are blanked across lines for the same reason.
 *
 * Lines are replaced by empty strings rather than removed, so reported line
 * numbers still match the file.
 */
function blankComments(source) {
  const withoutHtml = source.replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, ' '));
  let inBlock = false;
  return withoutHtml.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      return '';
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlock = true;
      return '';
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return '';
    return line;
  });
}

/**
 * Context rules that turn a raw match into a non-claim. Each one is narrow and
 * stays falsifiable: none of them exempts a line that also carries a number, so
 * "10-year warranty" on any page is still a failure.
 */
function exemptByContext(term, line, file) {
  const hasNumber = /\d/.test(line.replace(/\/areas\/|\+1-780-991-1651|780/g, ''));

  // A link or label pointing at the anti-claim page is not a warranty claim.
  if (term === 'warranty' && !hasNumber) {
    if (/href=["']\/warranty["']/.test(line)) return 'links the /warranty anti-claim page';
    if (/\/warranty/.test(line)) return 'references the /warranty anti-claim page';
  }

  // The 301 map has to name the URLs it retires. A town inside `/areas/<slug>` is
  // a legacy address, not a statement that the business serves that town.
  if (file === 'src/middleware.ts' && /\/areas\//.test(line)) return 'retired URL in the Step 30 redirect map';

  return null;
}

function allowed(term, file) {
  return ALLOWANCES.some((entry) => entry.term === term && entry.file === file);
}

function deferred(term, file) {
  return DEFERRALS.find((entry) => entry.file === file && [entry.term].flat().includes(term));
}

async function checkTerms() {
  const files = await walk(SRC);
  const hits = [];
  for (const file of files) {
    const posix = toPosix(file);
    const source = await readFile(file, 'utf8');
    const lines = blankComments(source);

    for (const { term, pattern } of TERM_CHECKS) {
      lines.forEach((line, index) => {
        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          const context = exemptByContext(term, line, posix);
          hits.push({
            term,
            file: posix,
            line: index + 1,
            text: line.trim().slice(0, 160),
            allowed: allowed(term, posix) || Boolean(context),
            contextReason: context,
            deferred: Boolean(deferred(term, posix)),
            match: match[0],
          });
        }
      });
    }

    lines.forEach((line, index) => {
      for (const match of line.matchAll(PHONE_SHAPE)) {
        if (ALLOWED_PHONE.test(match[0].trim())) continue;
        hits.push({
          term: 'foreign-phone-number',
          file: posix,
          line: index + 1,
          text: line.trim().slice(0, 160),
          allowed: allowed('foreign-phone-number', posix),
          deferred: Boolean(deferred('foreign-phone-number', posix)),
          match: match[0],
        });
      }
    });
  }
  return { filesScanned: files.length, hits };
}

/* ---------------------------------------------------------------- rendered */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…' };

function decode(text) {
  return text.replace(/&(#?\w+);/g, (whole, name) => ENTITIES[name] ?? whole);
}

/**
 * Removes every element carrying `data-copy-exempt`, subtree and all. That
 * attribute marks copy this step does not write — currently the resource-card
 * descriptions on `/resources`, which come from `src/content/resources`
 * frontmatter and belong to Step 31. Without it the 50 guide descriptions
 * dominate that page's sentence average and hide its own four sentences.
 */
function stripExempt(html) {
  let out = html;
  for (;;) {
    const open = /<([a-z][\w-]*)([^>]*\sdata-copy-exempt(?:=("[^"]*"|'[^']*'|[^\s>]*))?)[^>]*>/i.exec(out);
    if (!open) return out;
    const tag = open[1];
    const openRe = new RegExp(`<${tag}(\\s|>)`, 'gi');
    const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
    let depth = 1;
    let cursor = open.index + open[0].length;
    let end = out.length;
    while (depth > 0) {
      openRe.lastIndex = cursor;
      closeRe.lastIndex = cursor;
      const nextOpen = openRe.exec(out);
      const nextClose = closeRe.exec(out);
      if (!nextClose) break;
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth += 1;
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth -= 1;
        cursor = nextClose.index + nextClose[0].length;
        end = cursor;
      }
    }
    out = out.slice(0, open.index) + ' ' + out.slice(end);
  }
}

/** Elements that end a run of text. Without these, a heading and the paragraph
 *  under it merge into one enormous "sentence" and every measurement is wrong. */
const BLOCK_TAGS = 'p|h1|h2|h3|h4|h5|h6|li|dt|dd|figcaption|blockquote|td|th|section|article|div|header|footer|aside|nav|ol|ul|dl|main|span|br';

/** Visible text inside <main>, as one string per block element. */
function mainBlocks(html) {
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (!main) return [];
  return decode(
    stripExempt(main[1])
      .replace(/<(script|style|svg|template|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(new RegExp(`</?(?:${BLOCK_TAGS})(?:\\s[^>]*)?/?>`, 'gi'), ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .split(' ')
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}


async function distPages() {
  if (!existsSync(DIST)) return null;
  const pages = [];
  const seek = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await seek(full);
      else if (entry.name === 'index.html') {
        const route = `/${toPosix(relative(DIST, dir))}`.replace(/\/$/, '') || '/';
        pages.push({ route, file: full });
      }
    }
  };
  await seek(DIST);
  return pages;
}

/** Routes whose rendered copy this gate does not own. */
const EXCLUDED_ROUTES = new Set(['/', '/dev/surface']);

function isOwnedRoute(route) {
  return !EXCLUDED_ROUTES.has(route) && !route.startsWith('/resources/');
}

/**
 * Prose sentences only. A chunk counts when it sits inside one block element and
 * ends in terminal punctuation. Headings, eyebrows, button labels, and the chip
 * rows the visualizer renders carry no full stop, so they are not measured as
 * sentences — before this filter, a run of finish names scored as one 90-word
 * "sentence" and made the numbers meaningless.
 */
function sentences(blocks) {
  return blocks
    .flatMap((block) => block.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z]/.test(s) && /[.!?]["')\]]?$/.test(s) && s.split(/\s+/).length > 1);
}

function wordCount(sentence) {
  return sentence.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/** Every place name a city-substitution page could swap in, plus Edmonton. */
const PLACE_NAMES = /\b(edmonton|sherwood\s+park|st\.?\s*albert|leduc|fort\s+saskatchewan|spruce\s+grove|stony\s+plain|beaumont|nisku|morinville|devon|strathcona\s+county|alberta)\b/gi;

function shingles(text, size = 5, normalizePlaces = false) {
  const flattened = normalizePlaces ? text.replace(PLACE_NAMES, ' place ') : text;
  const words = flattened.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i + size <= words.length; i += 1) set.add(words.slice(i, i + size).join(' '));
  return set;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared / (a.size + b.size - shared);
}

async function checkRendered() {
  const pages = await distPages();
  if (!pages) return null;
  const owned = pages.filter((page) => isOwnedRoute(page.route));
  const report = [];
  for (const page of owned) {
    const html = await readFile(page.file, 'utf8');
    const blocks = mainBlocks(html);
    const text = blocks.join(' ');
    const list = sentences(blocks);
    const words = list.reduce((total, sentence) => total + wordCount(sentence), 0);
    const longest = list.reduce((worst, sentence) => (wordCount(sentence) > wordCount(worst || '') ? sentence : worst), '');
    report.push({
      route: page.route,
      sentences: list.length,
      words,
      average: list.length ? Number((words / list.length).toFixed(2)) : 0,
      exclamations: (text.match(/!/g) ?? []).length,
      longest,
      longestWords: longest ? wordCount(longest) : 0,
      text,
    });
  }
  return report;
}

function checkSimilarity(report) {
  const candidates = report.filter(
    (page) => page.route.startsWith('/services') || page.route.startsWith('/areas') || page.route === '/service-area',
  );
  const grams = new Map(candidates.map((page) => [page.route, shingles(page.text)]));
  const placeless = new Map(candidates.map((page) => [page.route, shingles(page.text, 5, true)]));
  const pairs = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const [a, b] = [candidates[i].route, candidates[j].route];
      pairs.push({
        a,
        b,
        similarity: Number(jaccard(grams.get(a), grams.get(b)).toFixed(4)),
        normalized: Number(jaccard(placeless.get(a), placeless.get(b)).toFixed(4)),
      });
    }
  }
  pairs.sort((x, y) => Math.max(y.similarity, y.normalized) - Math.max(x.similarity, x.normalized));
  return pairs;
}

/* -------------------------------------------------------------------- main */

const json = process.argv.includes('--json');
const failures = [];

const terms = await checkTerms();
const unallowed = terms.hits.filter((hit) => !hit.allowed && !hit.deferred);
const allowedHits = terms.hits.filter((hit) => hit.allowed);
const deferredHits = terms.hits.filter((hit) => hit.deferred);

const rendered = await checkRendered();
let similarity = [];
let worstAverage = null;
let worstSentence = null;
let exclamationTotal = null;

if (rendered) {
  exclamationTotal = rendered.reduce((total, page) => total + page.exclamations, 0);
  worstAverage = rendered.reduce((worst, page) => (page.average > (worst?.average ?? -1) ? page : worst), null);
  worstSentence = rendered.reduce((worst, page) => (page.longestWords > (worst?.longestWords ?? -1) ? page : worst), null);
  similarity = checkSimilarity(rendered);
}

if (unallowed.length) failures.push(`${unallowed.length} forbidden-term hit(s) in src`);
if (exclamationTotal) failures.push(`${exclamationTotal} exclamation point(s) in owned rendered copy`);
if (worstAverage && worstAverage.average > SENTENCE_WORD_LIMIT)
  failures.push(`${worstAverage.route} averages ${worstAverage.average} words per sentence (limit ${SENTENCE_WORD_LIMIT})`);
if (worstSentence && worstSentence.longestWords > LONGEST_SENTENCE_LIMIT)
  failures.push(`${worstSentence.route} has a ${worstSentence.longestWords}-word sentence (limit ${LONGEST_SENTENCE_LIMIT}): "${worstSentence.longest.slice(0, 120)}…"`);
const worstPair = similarity[0];
if (worstPair && Math.max(worstPair.similarity, worstPair.normalized) >= SIMILARITY_THRESHOLD)
  failures.push(
    `${worstPair.a} and ${worstPair.b} share ${worstPair.similarity} of their 5-gram shingles (${worstPair.normalized} with town names normalized; limit ${SIMILARITY_THRESHOLD})`,
  );

if (json) {
  console.log(JSON.stringify({ terms, rendered: rendered?.map(({ text, ...rest }) => rest) ?? null, similarity, failures }, null, 2));
} else {
  console.log(
    `Forbidden-term grep: ${terms.filesScanned} files scanned, ${unallowed.length} unallowed hit(s), ${allowedHits.length} declared allowance(s), ${deferredHits.length} deferred hit(s).`,
  );
  const byTerm = new Map();
  for (const hit of unallowed) byTerm.set(hit.term, (byTerm.get(hit.term) ?? 0) + 1);
  for (const [term, count] of [...byTerm].sort((a, b) => b[1] - a[1])) console.log(`  ${term}: ${count}`);
  for (const hit of unallowed) console.log(`  ! ${hit.file}:${hit.line} [${hit.term}] ${hit.text}`);
  const allowedByFile = new Map();
  for (const hit of allowedHits) {
    const key = `${hit.file} [${hit.term}]${hit.contextReason ? ` — ${hit.contextReason}` : ''}`;
    allowedByFile.set(key, (allowedByFile.get(key) ?? 0) + 1);
  }
  for (const [key, count] of allowedByFile) console.log(`  ~ allowed x${count}: ${key}`);
  for (const entry of DEFERRALS) {
    const count = deferredHits.filter((hit) => hit.file === entry.file).length;
    console.log(`  > DEFERRED x${count}: ${entry.file} -> ${entry.owner}`);
  }

  if (!rendered) {
    console.log('\nRendered checks skipped: no dist/client. Run `npm run build:staging` first.');
  } else {
    console.log(`\nRendered copy: ${rendered.length} owned route(s).`);
    for (const page of [...rendered].sort((a, b) => b.average - a.average))
      console.log(
        `  ${page.average.toFixed(2)} avg · longest ${String(page.longestWords).padStart(2)} · ${String(page.sentences).padStart(2)} sentences · ${page.exclamations} "!"  ${page.route}`,
      );
    if (worstAverage) console.log(`  worst average: ${worstAverage.route} at ${worstAverage.average} (limit ${SENTENCE_WORD_LIMIT})`);
    if (worstSentence) console.log(`  longest single sentence: ${worstSentence.longestWords} words on ${worstSentence.route} (limit ${LONGEST_SENTENCE_LIMIT})`);
    console.log(`\nMax service/area shingle similarity: raw ${worstPair?.similarity ?? 'n/a'} · town-normalized ${worstPair?.normalized ?? 'n/a'} (${worstPair?.a ?? '-'} vs ${worstPair?.b ?? '-'})`);
    for (const pair of similarity.slice(0, 5)) console.log(`  raw ${pair.similarity}  norm ${pair.normalized}  ${pair.a}  ${pair.b}`);
  }

  console.log(failures.length ? `\nFAIL\n - ${failures.join('\n - ')}` : '\nPASS');
}

process.exit(failures.length ? 1 : 0);
