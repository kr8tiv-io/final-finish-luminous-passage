#!/usr/bin/env node
// Context-engineering graph: validate docs/context/graph.json and render docs/context/graph.md.
// Node built-ins only, no npm deps.
//
// Usage:
//   node scripts/context-graph.mjs                 # validate + render + print summary
//   node scripts/context-graph.mjs --brief step-23  # also print step-23's per-step brief

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GRAPH_PATH = path.join(ROOT, 'docs', 'context', 'graph.json');
const MD_PATH = path.join(ROOT, 'docs', 'context', 'graph.md');
const VOCAB_PATH = path.join(ROOT, 'docs', 'context', 'MOTION-VOCABULARY.md');

const NODE_TYPES = new Set(['source', 'lock', 'decision', 'asset', 'step', 'gate', 'agent', 'artifact']);
const STATUSES = new Set(['todo', 'doing', 'done', 'blocked', 'n/a']);
const EDGE_TYPES = new Set(['informs', 'constrains', 'produces', 'verifies', 'depends_on', 'owned_by']);

function loadGraph() {
  if (!existsSync(GRAPH_PATH)) {
    console.error(`No graph found at ${GRAPH_PATH}`);
    process.exit(1);
  }
  const raw = readFileSync(GRAPH_PATH, 'utf8');
  let graph;
  try {
    graph = JSON.parse(raw);
  } catch (err) {
    console.error(`graph.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }
  return graph;
}

// The vocabulary tables are the contract; this is their schema. A table is only read
// as a vocabulary table when its header is exactly these columns in this order, so the
// schema table, the tagging table and any future prose table are ignored rather than
// mis-parsed into empty rows that would pass every check.
const VOCAB_COLUMNS = ['id', 'kind', 'status', 'duration', 'ease', 'property', 'trigger', 'reduced-motion', 'reference', 'owner'];
const VOCAB_KINDS = new Set(['text', 'scene', 'hover', 'layout']);
const VOCAB_STATUSES = new Set(['implemented', 'planned']);
/** Columns that must carry a real, specific value on an `implemented` row. */
const VOCAB_MEASURED = ['duration', 'ease', 'reduced-motion', 'reference', 'owner'];

/** Markdown cells may contain an escaped pipe (`\|`), which is not a cell boundary. */
function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

const isSeparatorRow = (line) => /^\|[\s:|-]+\|$/.test(line.trim());

/**
 * Parse every vocabulary table in MOTION-VOCABULARY.md into rows keyed by id.
 * Returns { rows: Map<id, row>, problems: string[] }.
 */
function parseMotionVocabulary() {
  if (!existsSync(VOCAB_PATH)) {
    return { rows: new Map(), problems: [`MOTION-VOCABULARY.md not found at ${VOCAB_PATH}`] };
  }
  const lines = readFileSync(VOCAB_PATH, 'utf8').split('\n');
  const rows = new Map();
  const problems = [];
  let inTable = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith('|')) { inTable = false; continue; }
    if (isSeparatorRow(line)) continue;
    const cells = splitTableRow(line);

    if (!inTable) {
      // A header row for a vocabulary table opens one; any other table is skipped.
      inTable = cells.length === VOCAB_COLUMNS.length
        && cells.every((cell, i) => cell.toLowerCase() === VOCAB_COLUMNS[i]);
      continue;
    }

    const where = `MOTION-VOCABULARY.md:${index + 1}`;
    if (cells.length !== VOCAB_COLUMNS.length) {
      problems.push(`${where}: row has ${cells.length} cells, expected ${VOCAB_COLUMNS.length}`);
      continue;
    }
    const row = Object.fromEntries(VOCAB_COLUMNS.map((column, i) => [column, cells[i]]));
    const id = row.id.replace(/`/g, '').trim();
    if (!id) { problems.push(`${where}: row has no id`); continue; }
    if (rows.has(id)) { problems.push(`${where}: duplicate vocabulary id "${id}"`); continue; }

    for (const column of VOCAB_COLUMNS) {
      if (!row[column] || /^-+$/.test(row[column])) problems.push(`${where}: "${id}" has an empty "${column}" cell`);
      if (/TODO/i.test(row[column])) problems.push(`${where}: "${id}" still has a TODO in "${column}"`);
    }
    const kind = row.kind.replace(/`/g, '').trim();
    const status = row.status.replace(/`/g, '').trim();
    if (!VOCAB_KINDS.has(kind)) problems.push(`${where}: "${id}" has invalid kind "${kind}"`);
    if (!VOCAB_STATUSES.has(status)) problems.push(`${where}: "${id}" has invalid status "${status}"`);
    if (status === 'implemented') {
      for (const column of VOCAB_MEASURED) {
        // An implemented row is a measurement, so it must cite where it was measured
        // and must not hide behind a placeholder in the columns that carry the numbers.
        if (/^(n\/a|tbd|\?+)$/i.test(row[column])) {
          problems.push(`${where}: implemented id "${id}" has placeholder "${row[column]}" in "${column}"`);
        }
      }
      if (!/:\d+/.test(row.owner)) {
        problems.push(`${where}: implemented id "${id}" has no file:line in "owner" (got "${row.owner}")`);
      }
    }
    rows.set(id, { ...row, id, kind, status });
  }

  if (rows.size === 0) problems.push('MOTION-VOCABULARY.md contains no vocabulary table rows');
  return { rows, problems };
}

function motionTouching(node) {
  const haystack = `${node.title ?? ''} ${(node.files ?? []).join(' ')}`.toLowerCase();
  return /motion|journey|film|veil|headline|transition|scroll|gsap|scrub|dolly|fold|pour|stair|nav|hover|split/.test(haystack);
}

function validate(graph) {
  const errors = [];
  const warnings = [];

  if (graph.version !== 1) errors.push(`Unexpected graph version: ${graph.version}`);
  if (!Array.isArray(graph.nodes)) errors.push('graph.nodes is not an array');
  if (!Array.isArray(graph.edges)) errors.push('graph.edges is not an array');
  if (errors.length) return { errors, warnings };

  const nodesById = new Map();
  for (const node of graph.nodes) {
    if (!node.id) { errors.push(`Node missing id: ${JSON.stringify(node)}`); continue; }
    if (nodesById.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
    nodesById.set(node.id, node);
    if (!NODE_TYPES.has(node.type)) errors.push(`Node ${node.id} has invalid type "${node.type}"`);
    if (!STATUSES.has(node.status)) errors.push(`Node ${node.id} has invalid status "${node.status}"`);
  }

  for (const edge of graph.edges) {
    if (!EDGE_TYPES.has(edge.type)) errors.push(`Edge ${edge.from}->${edge.to} has invalid type "${edge.type}"`);
    if (!nodesById.has(edge.from)) errors.push(`Edge references unknown "from" node: ${edge.from}`);
    if (!nodesById.has(edge.to)) errors.push(`Edge references unknown "to" node: ${edge.to}`);
  }

  const steps = graph.nodes.filter((n) => n.type === 'step');
  const gates = graph.nodes.filter((n) => n.type === 'gate');

  // Rule 1: every step has >= 1 gate via a verifies edge.
  for (const step of steps) {
    const hasGate = graph.edges.some((e) => e.type === 'verifies' && e.to === step.id && nodesById.get(e.from)?.type === 'gate');
    if (!hasGate) errors.push(`Step ${step.id} has no gate via a verifies edge`);
  }

  // Rule 2: MOTION-VOCABULARY.md is itself valid — every row complete, every implemented
  // row carrying a measured duration/ease/reduced-motion/reference and a file:line owner.
  const vocabulary = parseMotionVocabulary();
  for (const problem of vocabulary.problems) errors.push(`MOTION-VOCABULARY: ${problem}`);
  const vocabComplete = vocabulary.problems.length === 0;

  // Rule 3: every motion-touching step cites >= 1 vocab id. An error once the
  // vocabulary is complete (Step 14); a warning only while it is still a stub.
  for (const step of steps) {
    if (!motionTouching(step)) continue;
    const cites = Array.isArray(step.vocab) && step.vocab.length > 0;
    if (!cites) {
      const msg = `Step ${step.id} ("${step.title}") touches motion but cites no vocab id`;
      if (vocabComplete) errors.push(msg);
      else warnings.push(`${msg} (warning only: MOTION-VOCABULARY.md not yet complete)`);
    }
  }

  // Rule 4: a cited id must exist. A typo in a `vocab` array is otherwise invisible,
  // and a step built against an id nobody defined is a step built against nothing.
  for (const step of steps) {
    for (const id of step.vocab ?? []) {
      if (!vocabulary.rows.has(id)) {
        errors.push(`Step ${step.id} cites vocab id "${id}", which is not defined in MOTION-VOCABULARY.md`);
      }
    }
  }

  // Rule 5: every copy step (29, 30, 31) has an edge from CLAIMS-LEDGER.
  for (const id of ['step-29', 'step-30', 'step-31']) {
    if (!nodesById.has(id)) { warnings.push(`Copy step ${id} not found in graph`); continue; }
    const hasLedgerEdge = graph.edges.some((e) => e.to === id && nodesById.get(e.from)?.id === 'artifact-claims-ledger');
    if (!hasLedgerEdge) errors.push(`Copy step ${id} has no edge from artifact-claims-ledger`);
  }

  // Rule 6: no step depends_on a blocked node.
  for (const edge of graph.edges) {
    if (edge.type !== 'depends_on') continue;
    const target = nodesById.get(edge.to);
    if (target?.status === 'blocked') errors.push(`${edge.from} depends_on blocked node ${edge.to}`);
  }

  // Rule 7: no two steps in the same parallel set share an owned file.
  // A "parallel set" = steps with the same phase that do not depend_on one another (directly or transitively).
  const dependsOn = new Map();
  for (const s of steps) dependsOn.set(s.id, new Set());
  for (const e of graph.edges) {
    if (e.type === 'depends_on' && dependsOn.has(e.from)) dependsOn.get(e.from).add(e.to);
  }
  function reachable(fromId) {
    const seen = new Set();
    const stack = [...(dependsOn.get(fromId) ?? [])];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of dependsOn.get(cur) ?? []) stack.push(next);
    }
    return seen;
  }
  const byPhase = new Map();
  for (const s of steps) {
    const key = s.phase ?? 'unphased';
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key).push(s);
  }
  for (const [, list] of byPhase) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const aReaches = reachable(a.id);
        const bReaches = reachable(b.id);
        if (aReaches.has(b.id) || bReaches.has(a.id)) continue; // ordered, not parallel
        const filesA = new Set(a.files ?? []);
        const filesB = new Set(b.files ?? []);
        const shared = [...filesA].filter((f) => filesB.has(f));
        if (shared.length) {
          errors.push(`Parallel steps ${a.id} and ${b.id} (phase ${a.phase}) share owned file(s): ${shared.join(', ')}`);
        }
      }
    }
  }

  return { errors, warnings, nodesById, steps, gates, vocabulary };
}

function summarize(graph, result) {
  const byType = {};
  for (const n of graph.nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;
  const byStatus = {};
  for (const n of graph.nodes.filter((n) => n.type === 'step')) byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;

  const lines = [];
  lines.push('Context graph summary');
  lines.push('======================');
  lines.push(`Nodes: ${graph.nodes.length} (${Object.entries(byType).map(([t, c]) => `${t}:${c}`).join(', ')})`);
  lines.push(`Edges: ${graph.edges.length}`);
  lines.push(`Steps by status: ${Object.entries(byStatus).map(([s, c]) => `${s}:${c}`).join(', ') || 'none'}`);
  if (result.vocabulary) {
    const rows = [...result.vocabulary.rows.values()];
    const implemented = rows.filter((r) => r.status === 'implemented').length;
    const cited = new Set(graph.nodes.flatMap((n) => n.vocab ?? []));
    const uncited = rows.filter((r) => !cited.has(r.id)).map((r) => r.id);
    lines.push(`Vocabulary: ${rows.length} ids (${implemented} implemented, ${rows.length - implemented} planned), ${cited.size} cited by steps`);
    if (uncited.length) lines.push(`  (defined but not yet cited by any step: ${uncited.join(', ')})`);
  }
  lines.push(`Errors: ${result.errors.length}`);
  for (const e of result.errors) lines.push(`  ERROR  ${e}`);
  lines.push(`Warnings: ${result.warnings.length}`);
  for (const w of result.warnings) lines.push(`  WARN   ${w}`);
  return lines.join('\n');
}

function mermaidStatusClass(status) {
  return { todo: 'stTodo', doing: 'stDoing', done: 'stDone', blocked: 'stBlocked', 'n/a': 'stNa' }[status] ?? 'stTodo';
}

function renderMermaid(graph) {
  const steps = graph.nodes.filter((n) => n.type === 'step');
  const byPhase = new Map();
  for (const s of steps) {
    const key = s.phase ?? 'unphased';
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key).push(s);
  }
  const lines = [];
  lines.push('```mermaid');
  lines.push('flowchart TD');
  const phaseOrder = [...byPhase.keys()].sort();
  for (const phase of phaseOrder) {
    lines.push(`  subgraph ${phase}["${phase}"]`);
    for (const s of byPhase.get(phase).sort((a, b) => a.id.localeCompare(b.id))) {
      const safeTitle = s.title.replace(/"/g, "'").replace(/[<>]/g, '').slice(0, 48);
      lines.push(`    ${s.id}["${s.id}: ${safeTitle}"]:::${mermaidStatusClass(s.status)}`);
    }
    lines.push('  end');
  }
  for (const e of graph.edges) {
    if (e.type !== 'depends_on') continue;
    const fromIsStep = e.from.startsWith('step-');
    const toIsStep = e.to.startsWith('step-');
    if (fromIsStep && toIsStep) lines.push(`  ${e.to} --> ${e.from}`);
  }
  lines.push('  classDef stTodo fill:#eee,stroke:#888');
  lines.push('  classDef stDoing fill:#ffe,stroke:#996');
  lines.push('  classDef stDone fill:#e6ffe6,stroke:#484');
  lines.push('  classDef stBlocked fill:#fee,stroke:#844');
  lines.push('  classDef stNa fill:#f5f5f5,stroke:#aaa,stroke-dasharray: 3 3');
  lines.push('```');
  return lines.join('\n');
}

function renderBrief(graph, nodesById, step) {
  const inputs = graph.edges.filter((e) => e.to === step.id && e.type === 'informs').map((e) => e.from);
  const constraints = graph.edges.filter((e) => e.to === step.id && e.type === 'constrains').map((e) => e.from);
  const deps = graph.edges.filter((e) => e.from === step.id && e.type === 'depends_on').map((e) => e.to);
  const gate = graph.edges.find((e) => e.to === step.id && e.type === 'verifies');
  const gateNode = gate ? nodesById.get(gate.from) : null;
  const owners = graph.edges.filter((e) => e.from === step.id && e.type === 'owned_by').map((e) => e.to);

  const lines = [];
  lines.push(`### ${step.id} — ${step.title}`);
  lines.push('');
  lines.push(`- **Phase:** ${step.phase ?? 'n/a'}`);
  lines.push(`- **Tier:** ${step.tier ?? 'n/a'}`);
  lines.push(`- **Owner(s):** ${owners.length ? owners.join(', ') : (step.owner ?? 'n/a')}`);
  lines.push(`- **Status:** ${step.status}`);
  lines.push(`- **Files:** ${(step.files ?? []).join(', ') || 'n/a'}`);
  lines.push(`- **Inputs (informs):** ${inputs.length ? inputs.join(', ') : 'none recorded'}`);
  lines.push(`- **Constraints (locks):** ${constraints.length ? constraints.join(', ') : 'none recorded'}`);
  lines.push(`- **Depends on:** ${deps.length ? deps.join(', ') : 'none'}`);
  lines.push(`- **Vocabulary ids cited:** ${(step.vocab ?? []).join(', ') || 'none yet'}`);
  lines.push(`- **Gate:** ${gateNode ? gateNode.title : 'MISSING — see validation errors'}`);
  return lines.join('\n');
}

function renderMarkdown(graph, result) {
  const { nodesById, steps } = result;
  const lines = [];
  lines.push('# Context graph — rendered view');
  lines.push('');
  lines.push('_Generated by `scripts/context-graph.mjs` from `docs/context/graph.json`. Do not hand-edit; edit the JSON and re-run the script._');
  lines.push('');
  lines.push('## Phase map');
  lines.push('');
  lines.push(renderMermaid(graph));
  lines.push('');
  lines.push('## Per-step briefs');
  lines.push('');
  for (const step of steps.sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(renderBrief(graph, nodesById, step));
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const briefIdx = args.indexOf('--brief');
  const briefTarget = briefIdx >= 0 ? args[briefIdx + 1] : null;

  const graph = loadGraph();
  const result = validate(graph);
  const summary = summarize(graph, result);
  console.log(summary);

  const markdown = renderMarkdown(graph, result);
  writeFileSync(MD_PATH, markdown + '\n');
  console.log(`\nRendered ${MD_PATH}`);

  if (briefTarget) {
    const step = result.nodesById?.get(briefTarget);
    if (!step || step.type !== 'step') {
      console.error(`\n--brief: no step found with id "${briefTarget}"`);
      process.exitCode = 1;
    } else {
      console.log(`\n${renderBrief(graph, result.nodesById, step)}`);
    }
  }

  if (result.errors.length) process.exitCode = 1;
}

main();
