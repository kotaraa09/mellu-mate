// Versioned observations and owner-approved examples. No model calls or dependencies.
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, renameSync, lstatSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { isTrusted, trust } from '../trust.mjs';

export const CONFIG = '.claude/behavior.json';
export const BASELINE = '.claude/behavior-baseline.json';
export const RULES = '.claude/behavior-rules.json';
export const FEATURES = '.claude/behavior-features.json';
export const LOCAL = '.claude/behavior-local';
export const equal = isDeepStrictEqual;
export const canonical = (v) => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x);
export const hash = (v) => createHash('sha256').update(typeof v === 'string' || Buffer.isBuffer(v) ? v : canonical(v)).digest('hex');
export const id = (v, name = 'id') => {
  if (typeof v !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(v)) throw new Error(`${name} must use lowercase letters, numbers and hyphens (1-64 characters).`);
  return v;
};
export const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const need = (condition, message) => { if (!condition) throw new Error(message); };

// Check existing ancestors too: a project-local name must not write through a symlink
// to somewhere else. All generated paths use this, including intermediate folders.
export function inside(root, name) {
  need(typeof name === 'string' && name.length > 0 && !isAbsolute(name) && !/^[a-z]:/i.test(name), 'Use a relative path inside the project.');
  const base = realpathSync(root);
  const path = resolve(base, name);
  const rel = relative(base, path);
  need(rel && !rel.split(/[\\/]/).includes('..') && !isAbsolute(rel), `Path is outside the project: ${name}`);
  let part = base;
  for (const segment of rel.split(/[\\/]/)) {
    part = join(part, segment);
    // lstat detects broken links, which existsSync alone would overlook.
    try { need(!lstatSync(part).isSymbolicLink(), `Symbolic links are not supported here: ${name}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return path;
}

export function readJson(root, name, optional = false) {
  const path = inside(root, name);
  if (optional && !existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { throw new Error(`Cannot read ${name}: ${e.message}`); }
}

export function writeJson(root, name, value) {
  const path = inside(root, name);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  renameSync(temp, path);
  return path;
}

export function localDir(root) {
  const path = inside(root, LOCAL);
  mkdirSync(path, { recursive: true });
  const ignore = inside(root, `${LOCAL}/.gitignore`);
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n', { flag: 'wx' });
  return path;
}

export function loadConfig(root) {
  const c = readJson(root, CONFIG);
  need(object(c) && c.version === 1, `${CONFIG} needs version: 1.`);
  need(c.verify === undefined || typeof c.verify === 'boolean', 'verify must be true or false, without quotes.');
  need(object(c.runner) && typeof c.runner.command === 'string' && c.runner.command.trim() && !/[\r\n\0]/.test(c.runner.command), 'runner.command must name an executable.');
  need(Array.isArray(c.runner.args) && c.runner.args.every((a) => typeof a === 'string' && !a.includes('\0')), 'runner.args must be an array of strings.');
  need(c.runner.timeoutMs === undefined || (Number.isInteger(c.runner.timeoutMs) && c.runner.timeoutMs >= 100 && c.runner.timeoutMs <= 30000), 'runner.timeoutMs must be 100-30000 milliseconds.');
  need(Array.isArray(c.scenarios) && c.scenarios.length > 0 && c.scenarios.length <= 100, 'Define between 1 and 100 scenarios.');
  const ids = new Set();
  for (const s of c.scenarios) {
    need(object(s), 'Each scenario must be an object.');
    id(s.id, 'Scenario id');
    need(!ids.has(s.id), `Duplicate scenario: ${s.id}`); ids.add(s.id);
    need(typeof s.title === 'string' && s.title.trim(), `${s.id} needs a plain-language title.`);
    need(Object.hasOwn(s, 'input'), `${s.id} needs input (null is allowed).`);
  }
  return c;
}

const commands = (config) => [{ cmd: canonical(config.runner) }];
export function approveRunner(root, config) { trust(root, commands(config), 'behavior'); }
export function requireRunner(root, config) {
  need(isTrusted(root, commands(config), 'behavior'),
    `The scenario runner has not been approved on this computer. No scenarios ran.\nRunner: ${canonical(config.runner)}\nAfter the user agrees, run behavior.mjs trust.`);
}

const noHooks = join(tmpdir(), `mellu-no-hooks-${randomBytes(16).toString('hex')}`);
export function git(root, args, { allowFailure = false, input, encoding = 'utf8' } = {}) {
  // No hooks, external diff drivers, textconv or pager are needed to read/patch a tree.
  const r = spawnSync('git', ['-c', `core.hooksPath=${noHooks}`, '-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', ...args], {
    cwd: root, input, encoding, timeout: 30000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0' },
    windowsHide: true,
  });
  if (!allowFailure) need(!r.error && r.status === 0, `Git could not ${args[0]}: ${r.error?.message || String(r.stderr).trim()}`);
  return r;
}

export function revision(root) {
  const r = git(root, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

// HEAD alone does not identify observations of uncommitted work. Record its diff
// and untracked file contents too. Without Git, report that provenance is unavailable.
function workingTree(root) {
  try {
    const diff = git(root, ['diff', 'HEAD', '--binary', '--no-ext-diff', '--no-textconv']).stdout;
    const files = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).stdout.split('\0').filter(Boolean).sort();
    need(files.length <= 5000, 'Too many untracked files to fingerprint.');
    const digest = createHash('sha256').update(diff);
    let bytes = 0;
    for (const file of files) {
      if (file.replaceAll(String.fromCharCode(92), '/').startsWith(`${LOCAL}/`)) continue;
      const data = readFileSync(inside(root, file)); bytes += data.length;
      need(bytes <= 64 * 1024 * 1024, 'Untracked files exceed the provenance budget.');
      digest.update(file).update('\0').update(hash(data)).update('\0');
    }
    return { hash: digest.digest('hex') };
  } catch { return { hash: null, note: 'Working-tree provenance unavailable (no Git, unreadable files, symlinks or too many untracked files).' }; }
}

function observe(root, runner, scenario) {
  const start = Date.now();
  const r = spawnSync(runner.command === 'node' ? process.execPath : runner.command, runner.args, {
    cwd: root, input: JSON.stringify({ id: scenario.id, input: scenario.input }) + '\n', encoding: 'utf8',
    timeout: runner.timeoutMs ?? 5000, maxBuffer: 256 * 1024, shell: false, windowsHide: true,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, PWD: root, INIT_CWD: root, CI: '1', FORCE_COLOR: '0', MELLU_BEHAVIOR: '1' },
  });
  const ms = Date.now() - start;
  if (r.error || r.status !== 0) return { status: 'error', error: r.error?.message || `Runner exited ${r.status ?? r.signal}. ${r.stderr || ''}`.slice(0, 1500), ms };
  try { return { status: 'ok', value: JSON.parse(r.stdout), ms }; }
  catch { return { status: 'error', error: 'Runner must print exactly one JSON value to stdout. Put diagnostic messages on stderr.', ms }; }
}

export function saveArtifact(root, kind, body) {
  localDir(root);
  const digest = hash(body);
  writeJson(root, `${LOCAL}/${kind}/${digest}.json`, { ...body, hash: digest });
  return { ...body, hash: digest };
}

export function readArtifact(root, kind, digest) {
  need(typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest), 'Use the full artifact hash printed by the command.');
  const value = readJson(root, `${LOCAL}/${kind}/${digest}.json`);
  const { hash: saved, ...body } = value;
  need(saved === digest && hash(body) === digest, `The saved ${kind} artifact changed. Run the comparison again.`);
  return value;
}

export function capture(root, config, label = 'Observation', approvalRoot = root) {
  requireRunner(approvalRoot, config);
  const head = revision(root), beforeTree = workingTree(root);
  const runnerHash = hash(config.runner);
  const results = config.scenarios.map((s) => {
    const first = observe(root, config.runner, s);
    const second = first.status === 'ok' ? observe(root, config.runner, s) : null;
    let result = first;
    if (second && (second.status !== 'ok' || !equal(first.value, second.value))) {
      result = { status: 'unstable', error: 'Two runs gave different results. Reset test state and remove changing timestamps or random values.', first, second };
    }
    return { id: s.id, title: s.title, input: s.input, caseHash: hash({ runner: config.runner, input: s.input }), runnerHash,
      ...(Object.hasOwn(s, 'expected') ? { expected: s.expected } : {}), ...result };
  });
  const afterTree = workingTree(root);
  // A runner that edits source between observations invalidates the whole observation,
  // even if its printed values happen to match. Fixture state should be ignored by Git.
  if (head !== revision(root) || (beforeTree.hash && afterTree.hash && beforeTree.hash !== afterTree.hash)) {
    for (const r of results) { r.status = 'unstable'; r.error = 'Project files changed while observing behavior. Use isolated fixtures and keep the source stable.'; }
  }
  return saveArtifact(approvalRoot, 'runs', { version: 1, label, capturedAt: new Date().toISOString(), head, workingTree: beforeTree, configHash: hash(config), results });
}

export function loadBaseline(root) {
  const baseline = readJson(root, BASELINE, true);
  if (!baseline) return { version: 1, entries: {} };
  need(baseline.version === 1 && object(baseline.entries), `${BASELINE} is not a valid baseline.`);
  for (const [key, e] of Object.entries(baseline.entries)) {
    id(key);
    need(object(e) && e.result?.id === key && e.result?.status === 'ok' && Object.hasOwn(e.result, 'value') &&
      typeof e.result.caseHash === 'string' && typeof e.reason === 'string' && e.reason.trim(), `Invalid accepted example: ${key}`);
  }
  return baseline;
}

export function expectedPass(r) { return r.status === 'ok' && (!Object.hasOwn(r, 'expected') || equal(r.expected, r.value)); }

export function compare(before, after) {
  const old = new Map(before.map((r) => [r.id, r]));
  const current = new Map(after.map((r) => [r.id, r]));
  return [...new Set([...old.keys(), ...current.keys()])].map((key) => {
    const a = old.get(key), b = current.get(key);
    const status = !b ? 'removed' : b.status !== 'ok' ? b.status : !expectedPass(b) ? 'expectation-failed'
      : !a ? 'added' : a.status !== 'ok' ? 'no-baseline' : a.caseHash !== b.caseHash ? 'scenario-changed'
        : equal(a.value, b.value) ? 'same' : 'changed';
    return { id: key, title: b?.title ?? a.title, status, before: a ?? null, after: b ?? null };
  });
}

export const baselineResults = (baseline) => Object.values(baseline.entries).map((e) => e.result);

// A decision is bound to exact observed values and to the baseline it reviewed. A
// downloaded review cannot silently approve a newer run or overwrite someone else's decision.
export function acceptRows(root, run, decisions, { baselineHash } = {}) {
  const baseline = loadBaseline(root);
  if (baselineHash) need(hash(baseline) === baselineHash, 'The accepted examples changed since this review. Generate a new review.');
  const observed = new Map(run.results.map((r) => [r.id, r]));
  need(Array.isArray(decisions) && decisions.length > 0, 'Choose at least one result to accept.');
  const seen = new Set();
  for (const d of decisions) {
    id(d.id); need(!seen.has(d.id), `Duplicate decision: ${d.id}`); seen.add(d.id);
    need(typeof d.reason === 'string' && d.reason.trim(), `${d.id}: say why this behavior is intended.`);
    const r = observed.get(d.id);
    if (!r) {
      need(Object.hasOwn(baseline.entries, d.id), `Unknown scenario: ${d.id}`);
      delete baseline.entries[d.id];
    } else {
      need(expectedPass(r), `${d.id} failed or is unstable, or does not match its explicit expected value. It cannot be accepted.`);
      baseline.entries[d.id] = { result: r, run: run.hash, acceptedAt: new Date().toISOString(), reason: d.reason.trim() };
    }
  }
  writeJson(root, BASELINE, baseline);
  return baseline;
}

export function baselineRows(root, run) { return compare(baselineResults(loadBaseline(root)), run.results); }
