#!/usr/bin/env node
// Exercise all three phases on a new fictional shop, using no model or API calls.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { CONFIG, RULES, LOCAL, localDir, writeJson, git, revision, approveRunner, capture, acceptRows } from './behavior/core.mjs';
import { makeReview } from './behavior/report.mjs';
import { importSource, checkRules } from './behavior/rules.mjs';
import { recordFeature, previewRemoval, applyRemoval } from './behavior/features.mjs';
import { checkProject } from './behavior/check.mjs';

const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parent = join(plugin, 'evals', 'results');
mkdirSync(parent, { recursive: true });
const root = join(parent, `behavior-demo-${Date.now()}-${randomBytes(3).toString('hex')}`);
mkdirSync(root); localDir(root);
const oldTrust = process.env.MELLU_TRUST_FILE;
process.env.MELLU_TRUST_FILE = join(root, LOCAL, 'demo-trust.json');
try {
  const config = { version: 1, verify: true, runner: { command: 'node', args: ['observe.mjs'], timeoutMs: 3000 }, scenarios: [
    { id: 'guest-order', title: 'A guest buys a $50 item', input: { subtotal: 50, member: false } },
    { id: 'member-order', title: 'A member buys and refunds a $50 item', input: { subtotal: 50, member: true } },
  ] };
  writeJson(root, CONFIG, config);
  writeFileSync(join(root, 'membership.mjs'), 'export const discount = () => 0;\n');
  writeFileSync(join(root, 'shipping.mjs'), "export const shipping = () => 'standard';\n");
  const shop = (fixed) => `import { discount } from './membership.mjs';
import { shipping } from './shipping.mjs';
export function checkout(input) {
  const total = input.subtotal * (1 - discount(input));
  return { total, refund: ${fixed ? 'total' : 'input.subtotal'}, delivery: shipping() };
}\n`;
  writeFileSync(join(root, 'shop.mjs'), shop(false));
  writeFileSync(join(root, 'observe.mjs'), `import { readFileSync } from 'node:fs';
import { checkout } from './shop.mjs';
const { input } = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify(checkout(input)));\n`);
  git(root, ['init', '--initial-branch=main']);
  const commit = (message) => {
    git(root, ['add', '--all']);
    git(root, ['-c', 'user.name=Mellu Demo', '-c', 'user.email=demo@example.invalid', 'commit', '-m', message]);
    return revision(root);
  };
  const base = commit('Start the fictional shop');
  approveRunner(root, config);
  const before = capture(root, config, 'Before member discounts');
  writeFileSync(join(root, 'membership.mjs'), 'export const discount = (input) => input.member ? 0.1 : 0;\n');
  commit('Add member discounts');
  const broken = capture(root, config, 'Discount added, refund still uses the old price');
  const behaviorReview = makeReview(root, broken, before);
  writeFileSync(join(root, 'shop.mjs'), shop(true));
  const featureTip = commit('Refund the amount actually paid');
  writeFileSync(join(root, 'shipping.mjs'), "export const shipping = () => 'scheduled';\n");
  commit('Add delivery scheduling afterward');
  const current = capture(root, config, 'Accepted fictional shop with scheduled delivery');
  acceptRows(root, current, current.results.map((r) => ({ id: r.id, reason: 'Fictional demo expectation; not an approval of any user project.' })));
  writeFileSync(join(root, 'POLICY.md'), '# Shop policy\nGuests pay the full item price.\n');
  const source = importSource(root, 'policy', 'POLICY.md');
  writeJson(root, RULES, { version: 1, sources: [{ id: 'policy', path: 'POLICY.md', sha256: source.sha256, textSha256: source.textSha256 }],
    rules: [{ id: 'guest-price', text: 'A guest pays the full item price.', status: 'active', source: {
      id: 'policy', fromLine: 2, toLine: 2, quote: 'Guests pay the full item price.', sha256: source.sha256, textSha256: source.textSha256 }, scenarios: ['guest-order'] }],
    context: [{ source: 'policy', fromLine: 1, toLine: 1, textSha256: source.textSha256, reason: 'Document title.' }] });
  const traced = makeReview(root, current, null, checkRules(root, current, config));
  recordFeature(root, 'memberships', { from: base, to: featureTip, title: 'Member discounts and refunds', scenarios: ['member-order'] });
  commit('Record source rules, accepted examples and feature ownership');
  const plan = previewRemoval(root, 'memberships');
  if (!plan.passed) throw new Error(`Demo removal failed: ${JSON.stringify(plan)}`);
  const applied = applyRemoval(root, plan.hash, 'memberships');
  const checked = checkProject(root);
  if (!checked.passed) throw new Error('Demo failed after applying selective removal.');
  console.log(JSON.stringify({ project: root, behaviorReview: behaviorReview.html, ruleReview: traced.html, removalReview: plan.reviewHtml,
    removal: plan.hash, applied, finalCheck: checked.passed,
    message: 'All three phases ran on a fictional shop. Memberships were removed; later delivery scheduling and the retained guest rule still pass.' }, null, 2));
} catch (e) { console.error(`Behavior demo: ${e.message}`); process.exitCode = 1; }
finally {
  if (oldTrust === undefined) delete process.env.MELLU_TRUST_FILE; else process.env.MELLU_TRUST_FILE = oldTrust;
}
