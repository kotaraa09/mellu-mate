// Conservative selective removal: reverse recorded feature commits in a separate local
// clone, then verify retained examples. Conflicting later edits stop the operation.
// Nothing resets, commits, pushes, migrates data or deletes the owner's checkout.
import { readFileSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CONFIG, BASELINE, FEATURES, LOCAL, RULES, inside, readJson, writeJson, id, need, git, revision,
  localDir, hash, loadConfig, requireRunner, capture, loadBaseline, baselineRows, readArtifact, saveArtifact } from './core.mjs';
import { checkRules } from './rules.mjs';
import { makeReview } from './report.mjs';

function samePath(a, b) {
  const normalize = (p) => process.platform === 'win32' ? realpathSync(p).toLowerCase() : realpathSync(p);
  return normalize(a) === normalize(b);
}
function repository(root) {
  const top = git(root, ['rev-parse', '--show-toplevel']).stdout.trim();
  need(samePath(root, top), 'Run feature removal from the repository root.');
}
function clean(root) {
  repository(root);
  need(!git(root, ['status', '--porcelain', '--untracked-files=normal']).stdout.trim(), 'Save or commit pending changes before rehearsing or applying feature removal. No files were changed.');
}
function commit(root, ref) {
  need(typeof ref === 'string' && ref.trim() && !/[\r\n\0]/.test(ref), 'Name a Git commit.');
  return git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).stdout.trim();
}
export function loadFeatures(root) {
  const file = readJson(root, FEATURES, true) ?? { version: 1, features: [] };
  need(file.version === 1 && Array.isArray(file.features), `${FEATURES} needs version: 1 and a features array.`);
  const ids = new Set(), owned = new Set();
  for (const f of file.features) {
    id(f.id); need(!ids.has(f.id), `Duplicate feature: ${f.id}`); ids.add(f.id);
    need(typeof f.title === 'string' && f.title.trim() && ['active', 'removed'].includes(f.status), `${f.id}: a feature needs a title and active/removed status.`);
    need(Array.isArray(f.commits) && f.commits.length > 0 && f.commits.every((c) => /^[a-f0-9]{40,64}$/.test(c)), `${f.id}: record exact commit hashes.`);
    need(Array.isArray(f.requires) && Array.isArray(f.scenarios), `${f.id}: requires and scenarios must be arrays.`);
    for (const dependency of f.requires) id(dependency, 'Dependency');
    for (const scenario of f.scenarios) id(scenario, 'Scenario');
    if (f.status === 'active') for (const c of f.commits) { need(!owned.has(c), 'One commit is assigned to two active features. Split its ownership before removal.'); owned.add(c); }
  }
  for (const f of file.features) for (const dependency of f.requires) need(ids.has(dependency) && dependency !== f.id, `${f.id}: unknown or self dependency ${dependency}.`);
  return file;
}

export function recordFeature(root, featureId, { from, to = 'HEAD', title = featureId, requires = [], scenarios = [] }) {
  repository(root); id(featureId);
  const book = loadFeatures(root);
  need(!book.features.some((f) => f.id === featureId), `Feature ${featureId} already has a record. Edit its record deliberately instead of overwriting history.`);
  const base = commit(root, from), tip = commit(root, to);
  need(git(root, ['merge-base', '--is-ancestor', base, tip], { allowFailure: true }).status === 0, '--from must be an ancestor of --to.');
  const commits = git(root, ['rev-list', '--reverse', `${base}..${tip}`]).stdout.trim().split('\n').filter(Boolean);
  need(commits.length > 0 && commits.length <= 100, 'Record between 1 and 100 commits for one feature.');
  for (const c of commits) need(git(root, ['rev-list', '--parents', '-n', '1', c]).stdout.trim().split(/\s+/).length === 2, 'Merge commits are not supported for selective removal. Record a linear feature range.');
  const config = loadConfig(root);
  for (const key of scenarios) need(config.scenarios.some((s) => s.id === key), `Unknown owned scenario: ${key}`);
  for (const dependency of requires) need(book.features.some((f) => f.id === dependency && f.status === 'active'), `Unknown active dependency: ${dependency}`);
  const owned = new Set(book.features.filter((f) => f.status === 'active').flatMap((f) => f.commits));
  need(commits.every((c) => !owned.has(c)), 'A commit is already assigned to another active feature.');
  const feature = { id: featureId, title, status: 'active', base, tip, commits, requires, scenarios, recordedAt: new Date().toISOString() };
  book.features.push(feature); writeJson(root, FEATURES, book);
  return feature;
}


// A candidate exists only while one command runs. It sits inside the project, so the
// app's own dependencies (node_modules and the like) still resolve from parent folders,
// and it is deleted at the end, so linters and test tools never find a second copy of
// the project. Leftovers from an interrupted run go at the start of the next one.
function makeCandidate(root, head, featureId) {
  localDir(root);
  dropCandidate(inside(root, `${LOCAL}/candidates`));
  const path = inside(root, `${LOCAL}/candidates/${featureId}-${randomBytes(6).toString('hex')}`);
  git(root, ['clone', '--no-hardlinks', '--no-checkout', '--', realpathSync(root), path]);
  git(path, ['config', 'core.hooksPath', join(path, '.git', 'disabled-hooks')]);
  git(path, ['remote', 'remove', 'origin']);
  git(path, ['checkout', '--detach', head]);
  return path;
}
function dropCandidate(path) { rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }

// Patches are raw bytes: a file in an older encoding (Windows-1252, TIS-620) must not
// be decoded as UTF-8 and come back changed, which git apply reports as a conflict.
const BYTES = { encoding: 'buffer' };
const stagedPatch = (candidate) => git(candidate, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv', 'HEAD'], BYTES).stdout;
const untouched = (candidate) => !git(candidate, ['diff', '--no-ext-diff', '--no-textconv']).stdout.trim() &&
  !git(candidate, ['ls-files', '--others', '--exclude-standard']).stdout.trim();

export function previewRemoval(root, featureId) {
  id(featureId); clean(root);
  const book = loadFeatures(root), feature = book.features.find((f) => f.id === featureId && f.status === 'active');
  need(feature, `No active feature named ${featureId}.`);
  const dependencies = book.features.filter((f) => f.status === 'active' && f.requires.includes(featureId));
  need(!dependencies.length, `Other features depend on ${featureId}: ${dependencies.map((f) => f.id).join(', ')}. Resolve those dependencies first.`);
  const config = loadConfig(root); requireRunner(root, config);
  const head = revision(root);
  for (const c of feature.commits) need(git(root, ['merge-base', '--is-ancestor', c, head], { allowFailure: true }).status === 0, 'A recorded feature commit is not in the current history.');
  const baseline = loadBaseline(root);
  const shared = new Set(book.features.filter((f) => f.id !== featureId && f.status === 'active').flatMap((f) => f.scenarios));
  const retired = new Set(feature.scenarios.filter((key) => !shared.has(key)));
  const retained = config.scenarios.filter((s) => !retired.has(s.id));
  need(retained.length > 0, 'Record at least one retained scenario before removal. There is nothing to verify preservation against.');
  for (const s of retained) need(baseline.entries[s.id], `${s.id}: accept a current example before testing preservation.`);
  const current = capture(root, config, `Before removing ${feature.title}`);
  need(baselineRows(root, current).every((r) => r.status === 'same'), 'Current behavior differs from the accepted examples. Review those changes before removing a feature.');
  const currentRules = checkRules(root, current, config, baseline);
  need(!currentRules || currentRules.passed, 'Current source rules are not verified. Resolve them before removing a feature.');
  const candidate = makeCandidate(root, head, featureId);
  try {
    // Keep today's proof and ownership files. Reversing an old contract along with the
    // code could make a regression disappear merely by deleting the test for it.
    const excludes = [CONFIG, BASELINE, RULES, FEATURES].map((p) => `:(exclude)${p}`);
    const conflicts = [];
    for (const c of [...feature.commits].reverse()) {
      const parent = git(root, ['rev-parse', `${c}^`]).stdout.trim();
      const patch = git(root, ['diff', '--binary', '--no-ext-diff', '--no-textconv', c, parent, '--', '.', ...excludes], BYTES).stdout;
      if (!patch.length) continue;
      const check = git(candidate, ['apply', '--check', '--whitespace=nowarn', '-'], { input: patch, allowFailure: true });
      if (check.error || check.status !== 0) { conflicts.push({ commit: c, message: String(check.stderr || check.error?.message).slice(0, 4000) }); break; }
      git(candidate, ['apply', '--whitespace=nowarn', '-'], { input: patch });
    }
    const baseRecord = { version: 1, feature: featureId, title: feature.title, root: realpathSync(root), head,
      createdAt: new Date().toISOString(), before: current.hash, retiredScenarios: [...retired], conflicts };
    if (conflicts.length) return saveArtifact(root, 'removals', { ...baseRecord, passed: false, reason: 'Later changes conflict with the feature reversal. The original project was not changed.' });
    const nextConfig = { ...config, scenarios: retained };
    writeJson(candidate, CONFIG, nextConfig);
    const nextBaseline = structuredClone(baseline);
    for (const key of retired) delete nextBaseline.entries[key];
    writeJson(candidate, BASELINE, nextBaseline);
    feature.status = 'removed'; feature.removedAt = new Date().toISOString();
    writeJson(candidate, FEATURES, book);
    // Use the approved original runner, with cwd set to the candidate. Its program and
    // fixtures must honor cwd; commands are not sandboxed and this is not a database undo.
    const after = capture(candidate, nextConfig, `After removing ${feature.title}`, root);
    const rows = baselineRows(candidate, after);
    const rules = checkRules(candidate, after, nextConfig, nextBaseline);
    const passed = rows.every((r) => r.status === 'same') && (!rules || rules.passed);
    const review = makeReview(root, after, { ...current, results: current.results.filter((r) => !retired.has(r.id)) }, rules);
    git(candidate, ['add', '--all']);
    const patch = stagedPatch(candidate);
    const patchHash = hash(patch);
    const patchPath = `${LOCAL}/patches/${patchHash}.patch`;
    // saveArtifact makes the parent folder, without changing the original checkout's code.
    saveArtifact(root, 'patches', { patchHash });
    writeFileSync(inside(root, patchPath), patch);
    return saveArtifact(root, 'removals', { ...baseRecord, passed, after: after.hash, review: review.hash, reviewHtml: review.html, patchPath, patchHash,
      retainedScenarios: retained.map((s) => s.id), rules,
      reason: passed ? 'Recorded retained scenarios passed in the candidate. Unrecorded behavior and external data were not checked.' : 'Retained behavior or source rules failed. The original project was not changed.' });
  } finally { dropCandidate(candidate); }
}

export function applyRemoval(root, removalHash, confirmation) {
  const plan = readArtifact(root, 'removals', removalHash);
  need(confirmation === plan.feature, `Review the removal report, then pass --confirm ${plan.feature} to apply it.`);
  need(plan.passed, 'This removal did not pass verification. Nothing was applied.');
  need(samePath(root, plan.root), 'This removal belongs to a different project.');
  clean(root); need(revision(root) === plan.head, 'The project has new commits. Rehearse removal again.');
  const patch = readFileSync(inside(root, plan.patchPath));
  need(hash(patch) === plan.patchHash, 'The reviewed patch changed. Rehearse removal again.');
  // Rebuild the reviewed state from the saved patch alone, and check it again, before
  // the patch reaches the owner's checkout.
  const candidate = makeCandidate(root, plan.head, plan.feature);
  let run;
  try {
    git(candidate, ['apply', '--whitespace=nowarn', '-'], { input: patch });
    git(candidate, ['add', '--all']);
    need(untouched(candidate) && hash(stagedPatch(candidate)) === plan.patchHash, 'The patch does not rebuild the reviewed state. Rehearse removal again.');
    const config = loadConfig(candidate), original = loadConfig(root);
    need(hash(config.runner) === hash(original.runner), 'The candidate runner changed. Rehearse removal again.');
    run = capture(candidate, config, `Recheck removal of ${plan.title}`, root);
    need(baselineRows(candidate, run).every((r) => r.status === 'same'), 'The candidate no longer preserves its accepted examples. Nothing was applied.');
    const rules = checkRules(candidate, run, config);
    need(!rules || rules.passed, 'The source rules no longer pass. Nothing was applied.');
    need(untouched(candidate) && hash(stagedPatch(candidate)) === plan.patchHash, 'The runner changed the candidate during verification. Nothing was applied.');
    // Recheck cleanliness after executing the adapter: a badly behaved runner must not
    // cause a patch to overwrite changes it made in the owner's checkout.
    clean(root); need(revision(root) === plan.head, 'The project changed during verification. Rehearse removal again.');
    git(root, ['apply', '--check', '--whitespace=nowarn', '-'], { input: patch });
    git(root, ['apply', '--whitespace=nowarn', '-'], { input: patch });
  } finally { dropCandidate(candidate); }
  return { feature: plan.feature, applied: true, recheck: run.hash, message: 'Applied as uncommitted changes. Review and commit them when ready. External data was not changed by the patch.' };
}
