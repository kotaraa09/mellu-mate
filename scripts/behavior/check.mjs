import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, loadConfig, capture, baselineRows } from './core.mjs';
import { checkRules } from './rules.mjs';
import { makeReview } from './report.mjs';

export function checkProject(root, { onlyOptedIn = false } = {}) {
  // Absence must stay a no-op even for a project that symlinks .claude elsewhere.
  // Once a config exists, loadConfig applies the feature's strict path checks.
  if (!existsSync(join(root, CONFIG))) return null;
  const config = loadConfig(root);
  if (onlyOptedIn && config.verify !== true) return null;
  const run = capture(root, config, 'Verification');
  const rows = baselineRows(root, run);
  const rules = checkRules(root, run, config);
  const review = makeReview(root, run, null, rules);
  return { passed: rows.every((r) => r.status === 'same') && (!rules || rules.passed),
    run: run.hash, review: review.hash, html: review.html,
    issues: rows.filter((r) => r.status !== 'same').map((r) => ({ id: r.id, title: r.title, status: r.status })), rules };
}

// Called only by explicit full verification. Ordinary Stop hooks do no extra work.
export function fullBehaviorGate(root) {
  try {
    const result = checkProject(root, { onlyOptedIn: true });
    if (!result) return false;
    console.log(`\n${result.passed ? 'OK' : 'FAIL'} - behavior examples${result.rules ? ' and source rules' : ''}`);
    for (const row of result.issues) console.log(`  ${row.id}: ${row.status}`);
    if (result.rules && !result.rules.passed) {
      for (const issue of result.rules.problems) console.log(`  ${issue}`);
      for (const rule of result.rules.rules.filter((r) => !r.passed)) console.log(`  ${rule.id}: ${rule.issues.join('; ')}`);
    }
    console.log(`  Review: ${result.html}`);
    return !result.passed;
  } catch (e) { console.log(`\nFAIL - behavior examples could not be verified: ${e.message}`); return true; }
}
