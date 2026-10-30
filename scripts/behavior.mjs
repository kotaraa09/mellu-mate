#!/usr/bin/env node
// On-demand tools. Run --help for the two phases. No Claude/API calls.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { CONFIG, inside, loadConfig, approveRunner, capture, readArtifact, loadBaseline, baselineResults,
  acceptRows, compare, writeJson, need, localDir, hash } from './behavior/core.mjs';
import { makeReview } from './behavior/report.mjs';
import { importSource, checkRules, sourceLines, addRule, addContext } from './behavior/rules.mjs';
import { checkProject } from './behavior/check.mjs';

const HELP = `Mellu.mate behavior lab (experimental; no model calls)

Run from the project root, or add --root <folder>.

Phase 1: review and protect behavior
  init                            create an example config and runner; overwrite nothing
  trust                           approve the displayed runner on this computer
  run [label]                     run each example twice; print a saved observation hash
  review <after> [--before <run>]  HTML comparison with accepted examples or an earlier run
  accept <run> --reason <words> [--scenario <id>]
                                  the owner accepts observed results (asks in a terminal)
  review-apply <decisions.json>    the owner imports decisions from the HTML review (asks in a terminal)
  check                           check all examples and source rules against expectations
  status                          show setup and accepted examples; execute nothing

Phase 2: trace source rules
  source-add <id> <path> [--text <extract.txt>]
                                  fingerprint source and optional PDF text extract
  source-lines <id>               show numbered source text for precise rule references
  rule-add <id> --source <id> --lines <12-15> --text <words> [--scenarios <id,id>] [--unresolved]
                                  record a rule; its quote and hashes come from the source
  context-add --source <id> --lines <12-15> --reason <words>
                                  mark lines that hold no rule, and say why
  rules-check [run]               verify quotes, classifications, examples and expectations


Runners execute as you, without a shell or a sandbox. Use deterministic test fixtures,
honor the working directory, and avoid production services. Nothing installs dependencies,
spends API credits, pushes code or runs database migrations on its own.
Read docs/behavior-lab.md for the formats, limits and a runnable demo.`;

// Accepting a result changes what every later check protects, so the owner types the
// approval. Claude runs commands with no terminal on stdin, so it cannot accept a result
// it just broke. This stops a routine approval, not a deliberate workaround; the
// accepted examples file still shows in the Git diff.
async function ownerConfirms(changes) {
  need(process.stdin.isTTY, 'Only the project owner can accept results, in their own terminal. Nothing was accepted.\n' +
    `Ask the owner to run: node "${fileURLToPath(import.meta.url)}" ${process.argv.slice(2).map((a) => (/[\s"]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  console.log('These results become the expected behavior for later checks:');
  for (const c of changes) console.log(`  ${c.id}: ${c.change}\n    Reason: ${c.reason}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { need((await rl.question('Type ACCEPT to approve, or press Enter to cancel: ')).trim() === 'ACCEPT', 'Not approved. Nothing was accepted.'); }
  finally { rl.close(); }
}

// One line per decision: what the owner approves, in observed values.
function describe(rows, decisions) {
  const shown = (r) => (r ? (r.status === 'ok' ? JSON.stringify(r.value) : r.status) : 'nothing');
  return decisions.map((d) => {
    const row = rows.find((r) => r.id === d.id);
    const change = !row?.after ? 'remove this example' : row.status === 'same' ? `keep ${shown(row.after)}` : `${shown(row.before)} -> ${shown(row.after)}`;
    return { id: d.id, change, reason: d.reason };
  });
}

function parse(argv) {
  const values = [], flags = {};
  for (let n = 0; n < argv.length; n++) {
    if (!argv[n].startsWith('--')) { values.push(argv[n]); continue; }
    const key = argv[n].slice(2);
    need(['root', 'before', 'reason', 'scenario', 'text', 'scenarios', 'source', 'lines', 'unresolved', 'help'].includes(key), `Unknown option --${key}.`);
    if (key === 'help' || key === 'unresolved') { flags[key] = true; continue; }
    need(argv[n + 1] !== undefined && !argv[n + 1].startsWith('--'), `--${key} needs a value.`);
    need(!Object.hasOwn(flags, key), `--${key} was supplied twice.`);
    flags[key] = argv[++n];
  }
  return { values, flags };
}

function init(root) {
  need(!existsSync(inside(root, CONFIG)) && !existsSync(inside(root, '.claude/behavior-example.mjs')), 'An example or config already exists. Nothing was overwritten.');
  const config = { version: 1, verify: false, runner: { command: 'node', args: ['.claude/behavior-example.mjs'], timeoutMs: 5000 },
    scenarios: [{ id: 'guest-order', title: 'A guest buys a $50 item', input: { subtotal: 50, member: false } },
      { id: 'member-order', title: 'A member buys a $50 item', input: { subtotal: 50, member: true } }] };
  const runner = `// Example only. Replace this with observations from your actual application.\nimport { readFileSync } from 'node:fs';\nconst { input } = JSON.parse(readFileSync(0, 'utf8'));\nconsole.log(JSON.stringify({ total: input.subtotal }));\n`;
  writeJson(root, CONFIG, config);
  writeFileSync(inside(root, '.claude/behavior-example.mjs'), runner, { flag: 'wx' });
  localDir(root);
  return { created: [CONFIG, '.claude/behavior-example.mjs'], message: 'These are demonstration examples, not checks of your app. Connect a real runner before relying on them. Review its command, then approve it with trust.' };
}

async function main() {
  const { values: [command, ...args], flags } = parse(process.argv.slice(2));
  if (!command || flags.help) { console.log(HELP); return; }
  const root = resolve(flags.root ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  const print = (v) => console.log(JSON.stringify(v, null, 2));
  const runById = (value) => readArtifact(root, 'runs', value);
  if (command === 'init') return print(init(root));
  if (command === 'status') {
    const config = existsSync(inside(root, CONFIG)) ? loadConfig(root) : null;
    return print({ configured: Boolean(config), fullVerify: config?.verify === true, scenarios: config?.scenarios.map((s) => ({ id: s.id, title: s.title })) ?? [],
      accepted: Object.keys(loadBaseline(root).entries), runner: config?.runner ?? null });
  }
  if (command === 'trust') {
    const config = loadConfig(root); approveRunner(root, config);
    return print({ approved: config.runner, message: 'Runner approved for this project on this computer. Changed runner commands require approval again.' });
  }
  if (command === 'run') {
    const run = capture(root, loadConfig(root), args.join(' ') || 'Observation');
    print(run); if (run.results.some((r) => r.status !== 'ok')) process.exitCode = 1;
    return;
  }
  if (command === 'review') {
    const run = runById(args[0]);
    const config = loadConfig(root);
    // A historical run cannot prove today's rulebook. Only show rule verdicts when
    // definitions match; source hashes are independently checked by checkRules.
    const rules = run.configHash === hash(config) ? checkRules(root, run, config) : null;
    return print(makeReview(root, run, flags.before ? runById(flags.before) : null, rules));
  }
  if (command === 'accept') {
    const run = runById(args[0]);
    need(run.configHash === hash(loadConfig(root)), 'The examples changed since this observation. Run them again, then accept the new run.');
    need(typeof flags.reason === 'string' && flags.reason.trim(), 'Say why this behavior is intended, with --reason.');
    const rows = compare(baselineResults(loadBaseline(root)), run.results);
    const decisions = (flags.scenario ? [flags.scenario] : rows.map((r) => r.id)).map((key) => ({ id: key, reason: flags.reason }));
    await ownerConfirms(describe(rows, decisions));
    return print({ accepted: Object.keys(acceptRows(root, run, decisions).entries) });
  }
  if (command === 'review-apply') {
    need(args[0], 'Name the decisions JSON file you downloaded.');
    const text = readFileSync(resolve(args[0]), 'utf8'); need(text.length <= 1024 * 1024, 'The decisions file is too large.');
    const decisions = JSON.parse(text), report = readArtifact(root, 'reviews', decisions.report);
    need(decisions.after === report.after, 'The decisions refer to a different observation.');
    need(Array.isArray(decisions.decisions) && decisions.decisions.every((d) => report.rows.some((r) => r.id === d.id)), 'A decision names an example outside this review.');
    need(hash(loadBaseline(root)) === report.baselineHash, 'The accepted examples changed since this review. Generate a new review.');
    await ownerConfirms(describe(report.rows, decisions.decisions));
    return print({ accepted: Object.keys(acceptRows(root, runById(report.after), decisions.decisions, { baselineHash: report.baselineHash }).entries) });
  }
  if (command === 'check') {
    const result = checkProject(root); need(result, `No ${CONFIG}. Run init, then connect real scenarios.`);
    print(result); if (!result.passed) process.exitCode = 1; return;
  }
  if (command === 'source-add') return print(importSource(root, args[0], args[1], flags.text));
  if (command === 'source-lines') return console.log(sourceLines(root, args[0]));
  if (command === 'rule-add') return print(addRule(root, args[0], { source: flags.source, lines: flags.lines, text: flags.text,
    scenarios: flags.scenarios?.split(',') ?? [], unresolved: flags.unresolved === true }));
  if (command === 'context-add') return print(addContext(root, { source: flags.source, lines: flags.lines, reason: flags.reason }));
  if (command === 'rules-check') {
    const config = loadConfig(root), run = args[0] ? runById(args[0]) : capture(root, config, 'Source rule check');
    need(run.configHash === hash(config), 'The examples changed since this observation. Run rules-check without a run id to check the current definitions.');
    const result = checkRules(root, run, config); need(result, 'No source rules are recorded. Use source-add first.');
    print(result); if (!result.passed) process.exitCode = 1; return;
  }
  throw new Error(`Unknown command: ${command}. Run --help.`);
}

// An executable entry point; importing the engine modules never executes commands.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`Behavior lab: ${e.message}`); process.exitCode = 1; });
}
