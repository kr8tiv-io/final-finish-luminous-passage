#!/usr/bin/env node
/**
 * scripts/check-budgets.mjs — Step 34 budget gate.
 *
 * Reads a delivery report written by `scripts/measure-delivery.mjs`
 * (output/delivery/<label>.json) and compares it against the single source of
 * truth for thresholds, `budgets.json` at the repo root. Exits non-zero when a
 * gated metric is over budget.
 *
 * This exists separately from the probe so a threshold change never means
 * editing measurement code, and so CI can re-check an uploaded artifact
 * without re-running a browser.
 *
 * Comparisons are made on exact integers. A 5 MiB arrival budget missed by
 * 2381 bytes is a FAIL and prints as `+2381 B`; it is never rounded to
 * "5.00 MB" and waved through.
 *
 * Usage:
 *   node scripts/check-budgets.mjs                 # newest report in output/delivery
 *   node scripts/check-budgets.mjs --label step34
 *   node scripts/check-budgets.mjs --report path/to/report.json --json
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUDGETS_PATH = path.join(ROOT, 'budgets.json');
const DELIVERY_DIR = path.join(ROOT, 'output', 'delivery');

export { compareBudgets } from './measure-delivery.mjs';
import { compareBudgets } from './measure-delivery.mjs';

export function parseArgs(argv) {
  const args = { label: null, report: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--label') args.label = argv[++i];
    else if (arg === '--report') args.report = argv[++i];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.error(
        'Usage: node scripts/check-budgets.mjs [--label <name>] [--report <path>] [--json]',
      );
      process.exit(0);
    }
  }
  return args;
}

/** Newest *.json in output/delivery by mtime. */
export async function findLatestReport(dir = DELIVERY_DIR) {
  let names;
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch {
    return null;
  }
  if (!names.length) return null;
  const stats = await Promise.all(
    names.map(async (name) => {
      const full = path.join(dir, name);
      return { full, mtimeMs: (await stat(full)).mtimeMs };
    }),
  );
  stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return stats[0].full;
}

function mib(bytes) {
  return (bytes / (1024 * 1024)).toFixed(3);
}

export function formatRow(row) {
  const fmt = (value) => {
    if (value === null) return '—';
    if (row.unit === 'bytes') return `${value} B (${mib(value)} MiB)`;
    if (row.unit === 'score') return value.toFixed(4);
    return `${Math.round(value)} ms`;
  };
  return {
    project: row.project,
    metric: row.metric,
    actual: fmt(row.actual),
    budget: `${row.compare === 'lt' ? '<' : '<='} ${fmt(row.limit)}`,
    result: row.pass ? 'PASS' : 'FAIL',
    over: row.pass ? '' : row.unit === 'bytes' ? `+${row.over} B` : `+${row.over.toFixed(4)}`,
    note: row.reason ?? '',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const budgets = JSON.parse(await readFile(BUDGETS_PATH, 'utf8'));

  const reportPath = args.report
    ? path.resolve(ROOT, args.report)
    : args.label
      ? path.join(DELIVERY_DIR, `${args.label}.json`)
      : await findLatestReport();

  if (!reportPath) {
    console.error(
      `[check-budgets] No delivery report found in ${path.relative(ROOT, DELIVERY_DIR)}. Run: node scripts/measure-delivery.mjs --label <name>`,
    );
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const { rows, failures, ok } = compareBudgets(report, budgets);

  if (args.json) {
    console.log(JSON.stringify({ report: path.relative(ROOT, reportPath), ok, rows }, null, 2));
  } else {
    console.log(
      `[check-budgets] ${path.relative(ROOT, reportPath)} (label "${report.label}", measured ${report.generatedAt} against ${report.baseUrl})\n`,
    );
    console.table(rows.map(formatRow));

    for (const result of report.results ?? []) {
      const reported = [
        `CLS scroll ${result.cls?.scroll?.value?.toFixed(4) ?? '—'} (reported, not gated)`,
        `CLS naive sum ${result.cls?.naiveSum?.toFixed(4) ?? '—'} (what the pre-Step-34 probe gated on)`,
        `fonts ${((result.fonts?.bytes ?? 0) / 1024).toFixed(1)} KB (Step 13)`,
        `video preload ${[...new Set((result.videos ?? []).map((v) => v.preload ?? 'null'))].join('/') || '—'} (Step 17)`,
      ];
      console.log(`  ${result.label ?? result.project}: ${reported.join(' · ')}`);
    }
  }

  if (!ok) {
    console.error(`\n[check-budgets] FAIL — ${failures.length} gated metric(s) over budget:`);
    for (const row of failures) {
      console.error(
        `  ${row.project} ${row.metric}: ${row.actual} ${row.unit} vs budget ${row.limit} ${row.unit}${row.reason ? ` (${row.reason})` : ` (over by ${row.over})`}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log('\n[check-budgets] PASS — every gated metric is within budget.');
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main().catch((err) => {
    console.error('[check-budgets] Failed:', err);
    process.exitCode = 1;
  });
}
