import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const directory = 'src/content/resources';
const files = (await readdir(directory)).filter((name) => name.endsWith('.mdx')).sort();
const failures = [];
const ids = new Set(files.map((name) => name.replace(/\.mdx$/, '')));
const titles = new Map();
const bodyHashes = new Map();
const requiredFields = ['title:', 'description:', 'intent:', 'category:', 'primaryService:', 'sources:', 'reviewer:', 'reviewerWorkflow:', 'relatedResources:', 'draft:', 'reviewStatus:', 'updatedAt:'];

// Step 31 claims sweep — Final Finish's own not-claimable list (docs/context/CONTEXT-SHEET.md A8,
// docs/context/COPY-DECK.md "Words that never appear"). These check for a *specific claim*, not
// the bare topic word: guides literally titled "Floor Coating Warranty Questions" or "Polyaspartic
// Floors Neutral Guide" are expected to use "warranty"/"polyaspartic" as ordinary vocabulary while
// discussing the topic neutrally (see docs/context/CLAIMS-LEDGER.md's own precedent of exempting
// warranty.astro, a deliberate anti-claim page, from the bare-word grep for the same reason).
const COMPETITORS = ['Whitcrete', 'Fusion Floors', 'B.Protek', 'PE Coatings', 'Sealing Innovation', 'Garage Living'];
const TOWNS = ['Sherwood Park', 'St. Albert', 'Leduc', 'Fort Saskatchewan', 'Spruce Grove', 'Beaumont'];
const claimChecks = [
  { name: 'competitor name/number', re: new RegExp(COMPETITORS.join('|'), 'i') },
  { name: 'town beyond Edmonton', re: new RegExp(TOWNS.join('|'), 'i') },
  { name: 'a price stated as fact', re: /\$\s?\d/ },
  { name: 'a cure time stated as fact ("N hours/days to cure")', re: /\d+ ?(hours|days) to cure/i },
  { name: '"years in business" / "years of experience"', re: /\b\d+\+?\s*years?\s*(in business|of experience)\b|\byears? of experience\b|\byears? in business\b/i },
  { name: '"#1" claim', re: /#1\b/ },
  { name: '"affordable" claim', re: /\baffordable\b/i },
  { name: 'a specific warranty length stated as fact', re: /\b\d+[-\s]?year(s)?\b[^.]{0,40}\bwarrant\w*|\bwarrant\w*[^.]{0,40}\b\d+[-\s]?year(s)?\b/i },
  { name: 'a polyaspartic/polyurea installation recommendation', re: /\b(recommend\w*|install\w*)\b[^.]{0,25}\b(polyaspartic|polyurea)\b|\b(polyaspartic|polyurea)\b[^.]{0,25}\b(recommend\w*|install\w*)\b/i },
];

/** True if `!` at `index` sits inside a straight- or curly-quoted span on its own line-ish run. */
function hasExclamationOutsideQuotes(text) {
  // Drop fenced/inline code, then strip quoted spans (both quote styles the guides use), then
  // check what is left. This is a heuristic, not a full parser, but the guides' prose is plain
  // enough (no nested quotes) that it holds.
  const stripped = text
    .replace(/`[^`]*`/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/[“][^”]*[”]/g, '');
  return /!/.test(stripped);
}

const today = new Date();
today.setHours(23, 59, 59, 999);

function firstCommitDate(absolutePath) {
  try {
    const raw = execFileSync('git', ['log', '--follow', '--format=%aI', '--', absolutePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    return lines.length ? new Date(lines[lines.length - 1]) : null;
  } catch {
    return null; // not a git checkout, git missing, or file untracked — skip this specific check
  }
}

for (const name of files) {
  const filePath = join(directory, name);
  const raw = await readFile(filePath, 'utf8');
  const parts = raw.split('---');
  if (parts.length < 3) { failures.push(`${name}: missing frontmatter`); continue; }
  const [frontmatter, body] = [parts[1], parts.slice(2).join('---')];
  for (const field of requiredFields) if (!frontmatter.includes(field)) failures.push(`${name}: missing ${field}`);

  const title = /^title: "(.+)"$/m.exec(frontmatter)?.[1];
  if (!title) failures.push(`${name}: missing title`);
  else if (titles.has(title)) failures.push(`${name}: duplicate title with ${titles.get(title)}`);
  else titles.set(title, name);

  const sourceUrls = [...frontmatter.matchAll(/^\s+url: "(https?:\/\/[^"\s]+)"$/gm)].map((match) => match[1]);
  if (!sourceUrls.length) failures.push(`${name}: has no source URLs`);
  for (const url of sourceUrls) if (!body.includes(`](${url})`)) failures.push(`${name}: source URL is not cited inline: ${url}`);

  // Related links: 2-4 real, distinct, non-self slugs (Step 31 requirement 4).
  const related = /^relatedResources: \[(.*)\]$/m.exec(frontmatter)?.[1].match(/"([^"]+)"/g)?.map((value) => value.slice(1, -1)) ?? [];
  const ownId = name.replace(/\.mdx$/, '');
  for (const id of related) if (!ids.has(id)) failures.push(`${name}: unknown related resource ${id}`);
  if (related.includes(ownId)) failures.push(`${name}: relatedResources lists itself`);
  if (new Set(related).size !== related.length) failures.push(`${name}: relatedResources has a duplicate entry`);
  if (related.length < 2 || related.length > 4) failures.push(`${name}: relatedResources must list 2-4 guides, found ${related.length}`);

  const normalized = body.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  if (bodyHashes.has(normalized)) failures.push(`${name}: duplicate body with ${bodyHashes.get(normalized)}`);
  else bodyHashes.set(normalized, name);

  const headings = [...body.matchAll(/^##+\s+(.+)$/gm)].map((match) => match[1].trim());
  if (!headings.length || headings.some((heading) => !heading)) failures.push(`${name}: needs a non-empty reader-facing section heading`);
  const sections = body.split(/^##+\s+.+$/gm).slice(1);
  if (!sections.some((section) => /[\p{L}]{2,}/u.test(section))) failures.push(`${name}: needs explanatory prose beneath a section heading`);

  // The FAQ lives in frontmatter but renders on the page and in FAQPage JSON-LD, so it is
  // reader-facing copy: it gets the same claims sweep and the same checks as the body.
  const faqText = [...frontmatter.matchAll(/^\s+-?\s*(?:question|answer): "(.*)"$/gm)].map((match) => match[1]).join('\n');
  const readerText = `${body}\n${faqText}`;
  if (/^faq:/m.test(frontmatter) && !faqText) failures.push(`${name}: faq block present but no quoted question/answer pairs found`);

  // Claims sweep (Step 31 requirement 2).
  for (const check of claimChecks) if (check.re.test(readerText)) failures.push(`${name}: contains ${check.name}`);
  if (hasExclamationOutsideQuotes(readerText)) failures.push(`${name}: contains "!" outside quotes`);

  // No leftover placeholder/editorial language in a published body (Step 31 requirement 7).
  const draftFlag = /^draft:\s*(\w+)/m.exec(frontmatter)?.[1];
  const reviewStatus = /^reviewStatus:\s*"(.*)"$/m.exec(frontmatter)?.[1];
  const isPublished = draftFlag === 'false' && (reviewStatus === 'approved' || reviewStatus === 'published');
  if (isPublished) {
    if (/\bdraft\b/i.test(readerText)) failures.push(`${name}: published body still says "draft"`);
    if (/\bTODO\b/.test(readerText)) failures.push(`${name}: published body contains TODO`);
    if (/\blorem\b/i.test(readerText)) failures.push(`${name}: published body contains lorem ipsum placeholder text`);
  }

  // Truthful dates (Step 31 requirement 3): updatedAt must parse, must not be in the future, and
  // must not predate the file's own first commit (bulk-authored guides can carry an editorial
  // date earlier than when they actually landed in git — see src/lib/seo/git-dates.ts).
  const updatedAtRaw = /^updatedAt:\s*"?([^"\n]+)"?\s*$/m.exec(frontmatter)?.[1];
  if (!updatedAtRaw) {
    failures.push(`${name}: missing updatedAt`);
  } else {
    const updatedAt = new Date(updatedAtRaw);
    if (Number.isNaN(updatedAt.getTime())) failures.push(`${name}: updatedAt "${updatedAtRaw}" is not a valid date`);
    else {
      if (updatedAt.getTime() > today.getTime()) failures.push(`${name}: updatedAt "${updatedAtRaw}" is in the future`);
      const firstCommit = firstCommitDate(resolve(filePath));
      if (firstCommit && updatedAt.getTime() < firstCommit.getTime() - 86_400_000) {
        failures.push(`${name}: updatedAt "${updatedAtRaw}" predates the file's first commit (${firstCommit.toISOString().slice(0, 10)})`);
      }
    }
  }
}

if (files.length < 50) failures.push(`expected at least 50 resources, found ${files.length}`);
if (failures.length) throw new Error(`Content validation failed:\n${failures.join('\n')}`);
console.log(`${files.length} resources validated: unique titles, source alignment, internal links, review metadata, reader-purpose structure, related links, truthful dates, and the forbidden-claims sweep.`);
