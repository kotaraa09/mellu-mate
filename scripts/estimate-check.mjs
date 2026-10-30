#!/usr/bin/env node
// How often a request's real cost falls inside the range Mellu.mate showed before it.
//
//   node scripts/estimate-check.mjs                     free: replays the saved benchmark runs
//   node scripts/estimate-check.mjs --results <dir>     one bench result, against the runs before it
//
// The estimate is useful only if it is right, so the roadmap asks that at least 7 requests in
// 10 land inside their range. Two ways to count it, neither of which pays for a model call:
//
//   - From the test runs (a new project): each day's runs, against a table built only from
//     the days before it, as a project with fewer than five requests of a kind would see it.
//   - From the project's own requests: each run of a task, against the runs of that kind
//     before it, once five are there - as a project that has used Mellu.mate a while sees it.
//
// --results grades a fresh `node scripts/bench.mjs` run the first way: its runs never fed the
// table they are checked against. It prints what that run cost, from its own result.json.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { collectRuns } from './cost-defaults.mjs';
import { estimate, moneyRange, verdict, minutesRange } from '../hooks/estimate.ts';

const MODEL = 'claude-sonnet-5';
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};

const asDefault = (r) => ({ kind: r.kind, tokens: r.tokens, otherUsd: r.otherUsd, ms: r.ms });
const inTime = (ms, e) => ms >= Math.floor(e.ms[0] / 60_000) * 60_000 && ms <= Math.max(1, Math.ceil(e.ms[1] / 60_000)) * 60_000;

// Each run against what a project would have been shown before it.
export function fromTests(runs, isChecked = () => true) {
  const rows = [];
  for (const r of runs.filter(isChecked)) {
    const before = runs.filter((x) => x.day < r.day).map(asDefault);
    const e = estimate(r.kind, [], before, MODEL);
    if (e) rows.push({ r, e, cost: verdict(r.usd, e), time: inTime(r.ms, e) });
  }
  return rows;
}

export function fromOwn(runs) {
  const rows = [];
  const byTask = {};
  for (const r of runs) (byTask[r.task] ??= []).push(r);
  for (const list of Object.values(byTask)) {
    list.forEach((r, i) => {
      const past = list.slice(0, i).map((x, j) => ({ at: j, kind: x.kind, usd: x.usd, ms: x.ms, model: MODEL, fiveHour: null }));
      const e = estimate(r.kind, past, [], MODEL);
      if (e && e.source === 'own') rows.push({ r, e, cost: verdict(r.usd, e), time: inTime(r.ms, e) });
    });
  }
  return rows;
}

const summary = (label, rows) => {
  const inside = rows.filter((x) => x.cost === 'inside').length;
  const time = rows.filter((x) => x.time).length;
  const pct = (n) => (rows.length ? Math.round((n / rows.length) * 100) : 0);
  console.log(`${label}: cost inside the range in ${inside} of ${rows.length} (${pct(inside)}%), time in ${time} of ${rows.length} (${pct(time)}%)`);
  const byKind = {};
  for (const x of rows) (byKind[x.r.kind] ??= []).push(x);
  for (const [kind, list] of Object.entries(byKind)) {
    const n = list.filter((x) => x.cost === 'inside').length;
    const above = list.filter((x) => x.cost === 'above').length;
    console.log(`  ${kind}: ${n} of ${list.length} inside, ${above} above, ${list.length - n - above} below`);
  }
};

if (process.argv[1] && basename(process.argv[1]) === 'estimate-check.mjs') {
  const dir = arg('--results');
  const all = collectRuns();
  if (dir) {
    const name = basename(dir);
    const day = /outcome-(\d{4}-\d{2}-\d{2})/.exec(name)?.[1];
    const rows = fromTests(all.filter((r) => r.day < day || r.dir === name), (r) => r.dir === name);
    for (const x of rows) {
      console.log(`  ${x.r.task}: $${x.r.usd.toFixed(2)} in ${Math.round(x.r.ms / 1000)}s, shown ${moneyRange(x.e.usd)}, ${minutesRange(x.e.ms)}: ${x.cost}`);
    }
    summary('this run', rows);
    const result = join(dir, 'result.json');
    if (existsSync(result)) {
      const j = JSON.parse(readFileSync(result, 'utf8'));
      console.log(`the run cost $${((j.with?.costUsd ?? 0) + (j.without?.costUsd ?? 0)).toFixed(2)} at list price`);
    }
  } else {
    summary('from the test runs', fromTests(all, (r) => all.some((x) => x.kind === r.kind && x.day < r.day)));
    summary('from the project own requests', fromOwn(all));
  }
}
