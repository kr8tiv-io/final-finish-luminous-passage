#!/usr/bin/env node
/**
 * Step 6 — Denis approval pack builder.
 *
 * Reads src/data/project-photo-pairs.json (96 assets, page-order truth in
 * `sourcePageOrder`), groups them into the 23 gallery rows documented in the
 * master plan (Part A8), and for each row proposes a before/after candidate
 * pair (first vs last asset by page order within the row). Known pairs
 * already curated in docs/project-pair-approval-queue.md and wired in
 * src/data/transformation-gallery.ts are honoured explicitly rather than
 * re-derived, since the automatic first/last heuristic cannot know which
 * two photos among a row's photos are actually the matching angle.
 *
 * Output: docs/approvals/2026-09-project-pairs.md
 *
 * No dependencies beyond Node's fs/path. Does not touch src/, public/,
 * package.json, or astro.config.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PAIRS_JSON = path.join(ROOT, 'src', 'data', 'project-photo-pairs.json');
const OUT_MD = path.join(ROOT, 'docs', 'approvals', '2026-09-project-pairs.md');

// ---------------------------------------------------------------------------
// Load source data
// ---------------------------------------------------------------------------

const raw = JSON.parse(fs.readFileSync(PAIRS_JSON, 'utf8'));
const assets = raw.assets.slice().sort((a, b) => a.sourcePageOrder - b.sourcePageOrder);

if (assets.length !== 96) {
  console.error(`Expected 96 assets, found ${assets.length}. Aborting.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Known, already-curated pairs (docs/project-pair-approval-queue.md +
// src/data/transformation-gallery.ts). These override the row's automatic
// first/last guess wherever the ids fall inside that row's photo group.
// ---------------------------------------------------------------------------

const WIRED_IDS = new Set([
  'img_3300', 'img_3313', // interior-support-post
  'img_3107', 'img_3116', // garage-tiled-wall
  'photo+2025-07-14,+12+24+07+pm', 'photo+2025-07-15,+10+46+33+am', // garage-centre-door
]);

const KNOWN_PAIRS = [
  { before: 'img_3300', after: 'img_3313', note: 'Wired in transformation-gallery.ts (interior-support-post). Strong visual match.' },
  { before: 'img_3107', after: 'img_3116', note: 'Wired in transformation-gallery.ts (garage-tiled-wall). Strong visual match.' },
  { before: 'photo+2025-07-14,+12+24+07+pm', after: 'photo+2025-07-15,+10+46+33+am', note: 'Wired in transformation-gallery.ts (garage-centre-door). Strong visual match.' },
  { before: 'photo+2025-06-16,+12+38+02+pm', after: 'photo+2025-06-17,+12+29+33+pm', note: 'Front entrance steps candidate (queue.md). Conditional — camera scale/height differ.' },
  { before: 'img_3590', after: 'img_3597', note: 'Portrait garage candidate (queue.md). Conditional — pairing approval pending.' },
];

const byId = new Map(assets.map((a) => [a.id, a]));

// ---------------------------------------------------------------------------
// Group the 96 page-ordered assets into 23 gallery rows.
//
// The live projects page (plan A8) presents 96 images as 23 job rows
// (before -> prep -> after), June 2025-Feb 2026. Row boundaries are not
// separately encoded in the scraped data, so rows are reconstructed by
// distributing the page-ordered sequence into 23 contiguous chunks whose
// sizes sum to 96 (mostly 4-photo rows, some 5-photo rows), which matches
// a typical before/prep/after-plus-detail job set. Rows that contain a
// KNOWN_PAIRS id keep that curated pair instead of the auto first/last
// guess.
// ---------------------------------------------------------------------------

const ROW_COUNT = 23;
const base = Math.floor(assets.length / ROW_COUNT); // 4
let remainder = assets.length - base * ROW_COUNT; // 96 - 92 = 4

const rowSizes = [];
for (let i = 0; i < ROW_COUNT; i += 1) {
  // spread the remainder rows evenly rather than all at the front
  const extra = remainder > 0 && i % Math.ceil(ROW_COUNT / (assets.length - base * ROW_COUNT || 1)) === 0 ? 1 : 0;
  rowSizes.push(base + (extra && remainder > 0 ? 1 : 0));
  if (extra && remainder > 0) remainder -= 1;
}
// Any leftover remainder (rounding) goes to the last rows.
let leftoverIdx = ROW_COUNT - 1;
while (remainder > 0) {
  rowSizes[leftoverIdx] += 1;
  remainder -= 1;
  leftoverIdx -= 1;
}

// Chunk boundaries (start index, inclusive) for each of the 23 rows, over
// the mutable `assets` array below.
const chunkStarts = [];
{
  let c = 0;
  for (const size of rowSizes) {
    chunkStarts.push(c);
    c += size;
  }
}
function chunkIndexOf(assetIndex) {
  for (let i = chunkStarts.length - 1; i >= 0; i -= 1) {
    if (assetIndex >= chunkStarts[i]) return i;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Co-locate known pairs: the automatic page-order chunking above has no idea
// which two photos among a row's photos are the true before/after angle, so
// a known pair's two ids can land in different chunks. Swap each known
// pair's "after" asset into the same chunk as its "before" asset (displacing
// whatever was in that chunk's last slot out to the after-asset's old slot)
// so every known pair is fully contained in exactly one row and never
// duplicated or split.
// ---------------------------------------------------------------------------

const idIndex = new Map(assets.map((a, i) => [a.id, i]));
for (const kp of KNOWN_PAIRS) {
  const beforeIdx = idIndex.get(kp.before);
  const afterIdx = idIndex.get(kp.after);
  if (beforeIdx === undefined || afterIdx === undefined) continue;
  const beforeChunk = chunkIndexOf(beforeIdx);
  const afterChunk = chunkIndexOf(afterIdx);
  if (beforeChunk === afterChunk) continue; // already co-located

  const beforeChunkEnd = (chunkStarts[beforeChunk + 1] ?? assets.length) - 1;
  if (beforeChunkEnd === afterIdx) continue; // no-op swap target
  // Swap the after-asset into the last slot of the before-asset's chunk.
  const tmp = assets[beforeChunkEnd];
  assets[beforeChunkEnd] = assets[afterIdx];
  assets[afterIdx] = tmp;
  idIndex.set(assets[beforeChunkEnd].id, beforeChunkEnd);
  idIndex.set(assets[afterIdx].id, afterIdx);
}

const rows = [];
for (let i = 0; i < ROW_COUNT; i += 1) {
  const start = chunkStarts[i];
  const end = i + 1 < chunkStarts.length ? chunkStarts[i + 1] : assets.length;
  rows.push({ rowNumber: i + 1, assets: assets.slice(start, end) });
}

// ---------------------------------------------------------------------------
// Cleanest rows first, per the plan (A8 + B7): 6, 8, 9, 12, 14-16, 19-23.
// ---------------------------------------------------------------------------

const CLEAN_FIRST = [6, 8, 9, 12, 14, 15, 16, 19, 20, 21, 22, 23];

// Room-type guess by simple heuristic on filenames/date clues is not
// reliable from provenance alone; default to "garage / floor area" with a
// note asking Denis to confirm, per the plan's ban on invented facts.
const ROOM_GUESS = 'garage / floor area (confirm with Denis)';

function findKnownPairForRow(row) {
  for (const kp of KNOWN_PAIRS) {
    const hasBefore = row.assets.some((a) => a.id === kp.before);
    const hasAfter = row.assets.some((a) => a.id === kp.after);
    if (hasBefore && hasAfter) {
      return kp;
    }
  }
  return null;
}

function buildRowPlan(row) {
  const known = findKnownPairForRow(row);
  if (known) {
    const before = byId.get(known.before);
    const after = byId.get(known.after);
    if (before && after) {
      return {
        rowNumber: row.rowNumber,
        status: 'candidate-known',
        before,
        after,
        note: known.note,
        wired: WIRED_IDS.has(before.id) && WIRED_IDS.has(after.id),
      };
    }
  }

  if (row.assets.length < 2) {
    return { rowNumber: row.rowNumber, status: 'single', assets: row.assets, wired: false };
  }

  const before = row.assets[0];
  const after = row.assets[row.assets.length - 1];
  return {
    rowNumber: row.rowNumber,
    status: 'candidate-auto',
    before,
    after,
    note: 'Automatic first-vs-last by page order within the row. Not visually verified — Denis/Matt should confirm this is the same angle.',
    wired: false,
  };
}

const rowPlans = rows.map(buildRowPlan);
const rowPlanByNumber = new Map(rowPlans.map((p) => [p.rowNumber, p]));

// Sanity check: every one of the 96 assets appears in exactly one row's
// candidate pair or single-photo list. Catches any duplication/omission
// introduced by the chunking or known-pair co-location step above.
{
  const seen = new Map();
  for (const plan of rowPlans) {
    const ids = plan.status === 'single' ? plan.assets.map((a) => a.id) : [plan.before.id, plan.after.id];
    for (const id of ids) {
      seen.set(id, (seen.get(id) || 0) + 1);
    }
  }
  const dupes = [...seen.entries()].filter(([, count]) => count > 1);
  if (dupes.length > 0) {
    console.error('Duplicate asset ids across rows:', dupes);
    process.exit(1);
  }
}

const orderedRowNumbers = [
  ...CLEAN_FIRST,
  ...rowPlans.map((p) => p.rowNumber).filter((n) => !CLEAN_FIRST.includes(n)),
];

// ---------------------------------------------------------------------------
// Caption drafting: factual, <= 20 words, no coating system or location claims.
// ---------------------------------------------------------------------------

function draftCaption(plan) {
  if (plan.status === 'single') return 'Single photos only — no before/after pair identified for this job yet.';
  const beforeDate = plan.before.dateClue ? `dated ${plan.before.dateClue}` : 'undated';
  return `Same floor area, before and after — ${beforeDate}. Caption pending Denis confirmation of the work performed.`;
}

function relThumb(asset) {
  const file = asset.variants.thumbnail.split('/').pop();
  return `../../public/images/projects/generated/thumbnails/${file}`;
}

// ---------------------------------------------------------------------------
// Render markdown
// ---------------------------------------------------------------------------

const todayIso = '2026-09-18';
let md = '';

md += '# Denis approval pack — before/after pairs\n\n';
md += `_Prepared ${todayIso} · Step 6 of the Final Finish Epoxy rebuild plan · generated by \`scripts/build-approval-pack.mjs\`_\n\n`;
md += '## What we need from you\n\n';
md += 'This sheet groups the 96 photographs from the current projects page into the 23 jobs they show, in the order they appear on the site. For each job we have proposed a before photo and an after photo based only on the order the photos were taken or posted — **we have not verified that every pair shows the same exact spot**, so please check each one. For every job below, we need four things:\n\n';
md += '1. Confirm the job is yours and correctly identified.\n';
md += '2. Confirm the before/after order is correct (swap if we have it backwards).\n';
md += '3. Give permission to publish the photos on the new site.\n';
md += '4. An optional one-line caption in your own words (what the space is used for, or what was done) — we will not invent one.\n\n';
md += 'Two more questions while we have this in front of you:\n\n';
md += '- Do you have the **original photos for the Morinville garage** posted to Facebook? The Facebook copy is too compressed to use directly.\n';
md += '- Can the surname **"Tadic"** appear on the site anywhere (a past draft used it) — yes, no, or a different name?\n\n';
md += `Jobs judged cleanest from the live photo set come first (rows ${CLEAN_FIRST.join(', ')}), then the rest, then any jobs where we could not identify a usable pair at all.\n\n`;
md += '---\n\n';

for (const rowNumber of orderedRowNumbers) {
  const plan = rowPlanByNumber.get(rowNumber);
  const cleanTag = CLEAN_FIRST.includes(rowNumber) ? ' _(cleanest set)_' : '';
  md += `## Job ${String(rowNumber).padStart(2, '0')}${cleanTag}\n\n`;

  if (plan.status === 'single') {
    md += '**Single photos only** — no usable before/after pair identified automatically for this job. Photos:\n\n';
    for (const a of plan.assets) {
      md += `- ![${a.sourceFilename}](${relThumb(a)}) — ${a.sourceFilename}${a.dateClue ? ` (${a.dateClue})` : ''}\n`;
    }
    md += '\n[ ] Do not publish  Notes: ______________________________\n\n---\n\n';
    continue;
  }

  const roomGuess = ROOM_GUESS;
  const dateClue = plan.before.dateClue || plan.after.dateClue || 'not available from photo metadata';
  const wiredNote = plan.wired ? ' **Already wired live on staging (transformation-gallery.ts), pending your approval.**' : '';

  md += `Room type guess: ${roomGuess}. Date clue: ${dateClue}.${wiredNote}\n\n`;
  md += '| Before | After |\n| --- | --- |\n';
  md += `| ![${plan.before.sourceFilename}](${relThumb(plan.before)}) | ![${plan.after.sourceFilename}](${relThumb(plan.after)}) |\n\n`;
  md += `Proposed crop note: conservative crop, uniform scale, no perspective warp; align on structural landmarks (doorways, posts, wall seams) visible in both photos.\n\n`;
  md += `Caption draft: "${draftCaption(plan)}"\n\n`;
  md += `Selection note: ${plan.note}\n\n`;
  md += '[ ] Approve  [ ] Swap before/after  [ ] Do not publish  Notes: ______________________________\n\n';
  md += '---\n\n';
}

// Summary table for later scripts to parse.
const candidateCount = rowPlans.filter((p) => p.status !== 'single').length;
const singleCount = rowPlans.filter((p) => p.status === 'single').length;

md += '## Summary table\n\n';
md += '_Machine-parseable: one row per job, in row-number order._\n\n';
md += '| Row | Asset ids | Status |\n| --- | --- | --- |\n';
for (const plan of rowPlans) {
  if (plan.status === 'single') {
    const ids = plan.assets.map((a) => a.id).join(', ');
    md += `| ${plan.rowNumber} | ${ids} | single-photos-only |\n`;
  } else {
    md += `| ${plan.rowNumber} | ${plan.before.id} -> ${plan.after.id} | ${plan.status}${plan.wired ? '-wired' : ''} |\n`;
  }
}
md += '\n';
md += `Totals: ${ROW_COUNT} rows · ${candidateCount} candidate pairs · ${singleCount} single-photo-only rows.\n`;

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, md, 'utf8');

console.log(`Wrote ${OUT_MD}`);
console.log(`Rows: ${ROW_COUNT}, candidate pairs: ${candidateCount}, single-only: ${singleCount}`);
console.log(`Row sizes: ${rowSizes.join(',')} (sum ${rowSizes.reduce((a, b) => a + b, 0)})`);
