#!/usr/bin/env node
// Writes hooks/estimate-defaults.ts: what the benchmark's requests cost and how long they took,
// by kind, for the estimate a project shows before it has five requests of its own.
//
//   node scripts/cost-defaults.mjs                    from every saved run
//   node scripts/cost-defaults.mjs --before 2026-10-30 only runs saved before that day
//   node scripts/cost-defaults.mjs --check             print the table, write nothing
//
// It reads the traces scripts/bench.mjs keeps under evals/results/: the Mellu.mate arm only,
// as a user with Mellu.mate runs it. Each run is kept as tokens, not dollars, so the estimate
// prices it at the model the user's session runs on. The kind comes from the task's own words,
// read by the same rules the estimate uses, so a task counts where a user's request like it
// would. Runs of a task kept on this computer only (outcome-deck-rules-local) stay out: the
// table is committed. So does setup (outcome-adopt-existing): it runs once in a project, and
// it is not a request a user sends again.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestKind } from '../hooks/estimate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = join(root, 'evals', 'results');
const OUT = join(root, 'hooks', 'estimate-defaults.ts');
const LEFT_OUT = /deck-rules-local|adopt-existing/;
const OUTCOMES = join(root, 'evals', 'outcomes');

// The task's words: as the run recorded them, else its prompt.md without the header.
const promptOf = (task, recorded) => {
  if (recorded) return recorded;
  try { return readFileSync(join(OUTCOMES, task, 'prompt.md'), 'utf8').replace(/^---[\s\S]*?\n---\s*/, '').trim(); } catch { return ''; }
};

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};

// The last result line of a trace: its time, and each model's tokens and cost.
export function traceFigures(text) {
  const result = text.split('\n').filter((l) => l.includes('"type":"result"'))
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).pop();
  if (!result || !result.total_cost_usd || !result.modelUsage) return null;
  const models = Object.entries(result.modelUsage);
  // The main model is the one that cost most; the rest are helpers, kept as they cost.
  models.sort((a, b) => (b[1].costUSD ?? 0) - (a[1].costUSD ?? 0));
  const [, main] = models[0];
  return {
    // A trace that does not split its cache writes counts them all as an hour's.
    tokens: [main.inputTokens ?? 0, main.outputTokens ?? 0, main.cacheReadInputTokens ?? 0,
      main.cacheCreationEphemeral5mInputTokens ?? 0,
      main.cacheCreationEphemeral1hInputTokens ?? ((main.cacheCreationInputTokens ?? 0) - (main.cacheCreationEphemeral5mInputTokens ?? 0))],
    otherUsd: Math.round(models.slice(1).reduce((s, [, m]) => s + (m.costUSD ?? 0), 0) * 10_000) / 10_000,
    ms: result.duration_ms ?? 0,
    usd: result.total_cost_usd,
  };
}

// Every Mellu.mate run under evals/results/ with a trace, as { day, task, kind, ...figures }.
export function collectRuns(resultsDir = RESULTS, { before = null } = {}) {
  const runs = [];
  for (const dir of readdirSync(resultsDir).sort()) {
    const day = /^outcome-(\d{4}-\d{2}-\d{2})/.exec(dir)?.[1];
    if (!day || (before && day >= before)) continue;
    const file = join(resultsDir, dir, 'result.json');
    if (!existsSync(file)) continue;
    let result;
    try { result = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    const prompts = Object.fromEntries((result.with?.cases ?? []).map((c) => [c.name, promptOf(c.name, c.prompt)]));
    for (const entry of readdirSync(join(resultsDir, dir))) {
      const task = Object.keys(prompts).sort((a, b) => b.length - a.length)
        .find((name) => new RegExp(`^with-.*-${name}-\\d+$`).test(entry));
      if (!task || LEFT_OUT.test(task)) continue;
      const trace = join(resultsDir, dir, entry, 'trace.jsonl');
      if (!existsSync(trace)) continue;
      const figures = traceFigures(readFileSync(trace, 'utf8'));
      const kind = requestKind(prompts[task] ?? '');
      if (figures && kind) runs.push({ day, dir, task, kind, ...figures });
    }
  }
  return runs;
}

export function render(runs) {
  const rows = runs.map((r) => `  { kind: '${r.kind}', tokens: [${r.tokens.join(', ')}], otherUsd: ${r.otherUsd}, ms: ${r.ms} }, // ${r.task} ${r.day}`);
  return `// Written by scripts/cost-defaults.mjs from the benchmark's saved runs. Do not edit: run it again.
// What each run used, for the estimate a project shows before it has five requests of a kind.
import type { DefaultRun } from './estimate'

export const DEFAULTS: DefaultRun[] = [
${rows.join('\n')}
]
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const runs = collectRuns(RESULTS, { before: arg('--before') });
  const byKind = {};
  for (const r of runs) (byKind[r.kind] ??= []).push(r);
  for (const [kind, list] of Object.entries(byKind)) {
    const tasks = [...new Set(list.map((r) => r.task))].join(', ');
    console.log(`${kind}: ${list.length} runs (${tasks})`);
    if (process.argv.includes('--check')) for (const t of new Set(list.map((r) => r.task))) console.log(`  ${t}`);
  }
  if (!process.argv.includes('--check')) {
    writeFileSync(OUT, render(runs));
    console.log(`wrote ${runs.length} runs to hooks/estimate-defaults.ts`);
  }
}
