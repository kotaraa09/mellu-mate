// Real adapters and Git histories, with failures injected. No Claude login or API calls.
import { test, assert, assertMatch, projectDir, run, repoRoot, runVerify } from './harness.mjs';
import { writeFileSync, readFileSync, existsSync, mkdirSync, symlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { CONFIG, BASELINE, RULES, LOCAL, loadConfig, approveRunner, capture, readArtifact, hash, compare,
  loadBaseline, baselineRows, acceptRows, inside, git, revision, writeJson } from '../scripts/behavior/core.mjs';
import { makeReview } from '../scripts/behavior/report.mjs';
import { importSource, checkRules, addRule, addContext } from '../scripts/behavior/rules.mjs';
import { checkProject } from '../scripts/behavior/check.mjs';

function throws(fn, pattern) {
  let error; try { fn(); } catch (e) { error = e; }
  assert(error, 'The operation unexpectedly succeeded.');
  if (pattern) assertMatch(error.message, pattern, 'It must explain the refusal.');
}
function fixture({ approve = true, runner, expected = false } = {}) {
  const root = projectDir(); mkdirSync(join(root, '.claude'));
  const config = { version: 1, verify: false, runner: { command: 'node', args: ['observe.mjs'], timeoutMs: 10000 },
    scenarios: [
      { id: 'guest', title: 'Guest pays full price', input: { subtotal: 50, member: false }, ...(expected ? { expected: { total: 50 } } : {}) },
      { id: 'member', title: 'Member pays full price', input: { subtotal: 50, member: true } },
    ] };
  writeJson(root, CONFIG, config);
  writeFileSync(join(root, 'shop.mjs'), 'export const checkout = (input) => ({ total: input.subtotal });\n');
  writeFileSync(join(root, 'observe.mjs'), runner ?? `import { readFileSync } from 'node:fs';
import { checkout } from './shop.mjs';
const { input } = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify(checkout(input)));
`);
  if (approve) approveRunner(root, config);
  return { root, config };
}
const accept = (root, run) => acceptRows(root, run, run.results.map((r) => ({ id: r.id, reason: 'Owner confirmed this example.' })));
const cli = (root, args, env = {}) => run(join(repoRoot, 'scripts', 'behavior.mjs'), { cwd: root, args, env });
function saveCommit(root, message) {
  git(root, ['add', '--all']);
  git(root, ['-c', 'user.name=Mellu Test', '-c', 'user.email=mellu@example.invalid', 'commit', '-m', message]);
  return revision(root);
}

test('behavior: an unapproved runner executes nothing', () => {
  const { root, config } = fixture({ approve: false, runner: "import { writeFileSync } from 'node:fs'; writeFileSync('executed.txt','yes'); console.log('{}');" });
  throws(() => capture(root, config), /not been approved/);
  assert(!existsSync(join(root, 'executed.txt')), 'Unapproved code ran.');
});
test('behavior: approval is scoped separately from ordinary verification', async () => {
  const { root, config } = fixture();
  writeJson(root, '.claude/verify.json', { steps: [{ name: 'ok', cmd: 'node -e "process.exit(0)"' }] });
  const r = await runVerify(root, ['--trust']); assert(r.code === 0, r.out);
  assert(capture(root, config).results.every((r) => r.status === 'ok'), 'Approving verify replaced runner approval.');
});
test('behavior: runner changes invalidate execution approval', () => {
  const { root, config } = fixture(); config.runner.args.push('--changed');
  throws(() => capture(root, config), /not been approved/);
});
test('behavior: a mistyped verification setting cannot silently disable the gate', () => {
  const { root, config } = fixture(); config.verify = 'true'; writeJson(root, CONFIG, config);
  throws(() => loadConfig(root), /without quotes/);
});
test('behavior: same input is replayed against two real code versions', () => {
  const { root, config } = fixture();
  const before = capture(root, config, 'Before');
  writeFileSync(join(root, 'shop.mjs'), 'export const checkout = (input) => ({ total: input.subtotal * (input.member ? 0.9 : 1) });\n');
  const after = capture(root, config, 'After');
  const rows = compare(before.results, after.results);
  assert(rows.find((r) => r.id === 'guest').status === 'same', `Guest should be unchanged: ${JSON.stringify(rows)}`);
  assert(rows.find((r) => r.id === 'member').status === 'changed', `A real discount must be detected: ${JSON.stringify(rows)}`);
  assert(rows[1].before.value.total === 50 && rows[1].after.value.total === 45, 'The diff must contain observed values.');
});
test('behavior: an unstable observation cannot become an accepted example', () => {
  const { root, config } = fixture({ runner: 'console.log(JSON.stringify({value: Math.random()}));' });
  const run = capture(root, config);
  assert(run.results.every((r) => r.status === 'unstable'), 'Changing outputs must not be a pass.');
  throws(() => accept(root, run), /cannot be accepted/);
  assert(!existsSync(join(root, BASELINE)), 'A failed acceptance wrote a baseline.');
});
for (const [name, runner] of [
  ['nonzero exit', 'console.log("{}"); process.exit(4);'],
  ['invalid JSON', 'console.log("success!");'],
  ['no output', ''],
  ['timeout', 'setTimeout(()=>{},10000);'],
]) test(`behavior: ${name} is a failed observation`, () => {
  const { root, config } = fixture({ runner });
  config.runner.timeoutMs = 100; approveRunner(root, config);
  const observed = capture(root, config);
  assert(observed.results.every((r) => r.status === 'error'), `${name} was counted as success.`);
  throws(() => accept(root, observed), /cannot be accepted/);
});
test('behavior: explicit expected results cannot be bypassed by accepting a run', () => {
  const { root, config } = fixture({ expected: true }); config.scenarios[0].expected = { total: 45 };
  const observed = capture(root, config);
  assert(baselineRows(root, observed)[0].status === 'expectation-failed', 'A wrong expected value must fail.');
  throws(() => accept(root, observed), /cannot be accepted/);
});
test('behavior: changed inputs, added and removed examples require review', () => {
  const { root, config } = fixture(); const before = capture(root, config); accept(root, before);
  config.scenarios[0].input.subtotal = 100;
  config.scenarios.splice(1, 1, { id: 'new', title: 'New example', input: null });
  writeFileSync(join(root, 'observe.mjs'), 'console.log("{}");');
  const statuses = baselineRows(root, capture(root, config)).map((r) => r.status);
  assert(statuses.includes('scenario-changed') && statuses.includes('added') && statuses.includes('removed'), 'Changing the scenario set must not hide a regression.');
});
test('behavior: accepted examples persist across independent CLI processes', async () => {
  const { root, config } = fixture(); accept(root, capture(root, config));
  const result = await cli(root, ['check']); assert(result.code === 0, result.out);
  writeFileSync(join(root, 'shop.mjs'), 'export const checkout = () => ({ total: 0 });\n');
  const changed = await cli(root, ['check']); assert(changed.code === 1, changed.out);
  assertMatch(changed.out, /changed/, 'A later process must keep the old expectation.');
});
test('behavior: saved observations detect tampering', () => {
  const { root, config } = fixture(); const run = capture(root, config);
  const file = join(root, LOCAL, 'runs', `${run.hash}.json`);
  const edited = JSON.parse(readFileSync(file, 'utf8')); edited.results[0].value.total = 999;
  writeFileSync(file, JSON.stringify(edited));
  throws(() => readArtifact(root, 'runs', run.hash), /artifact changed/);
});
test('behavior: review imports are bound to the baseline they reviewed', () => {
  const { root, config } = fixture(); const observed = capture(root, config);
  const review = makeReview(root, observed);
  const decisions = [{ id: 'guest', reason: 'Correct guest price.' }];
  acceptRows(root, observed, decisions, { baselineHash: review.baselineHash });
  assert(Object.keys(loadBaseline(root).entries).join() === 'guest', 'Import must accept only selected examples.');
  throws(() => acceptRows(root, observed, decisions, { baselineHash: review.baselineHash }), /changed since this review/);
});
test('behavior: without the owner at a terminal, no command accepts a result', async () => {
  // Claude's commands get no terminal on stdin. A result it just broke must stay unaccepted.
  const { root, config } = fixture(); const observed = capture(root, config);
  const review = makeReview(root, observed);
  const file = join(root, 'decisions.json');
  writeFileSync(file, JSON.stringify({ report: review.hash, after: observed.hash, decisions: [{ id: 'guest', reason: 'Fine.' }] }));
  for (const args of [['accept', observed.hash, '--reason', 'Fine.'], ['accept', observed.hash, '--scenario', 'guest', '--reason', 'Fine.'], ['review-apply', file]]) {
    const result = await cli(root, args);
    assert(result.code === 1, result.out); assertMatch(result.out, /Only the project owner/, 'It must say who can accept.');
  }
  assert(!existsSync(join(root, BASELINE)), 'A result was accepted without the owner.');
});
test('behavior: an acceptance batch fails atomically', () => {
  const { root, config } = fixture(); const run = capture(root, config);
  throws(() => acceptRows(root, run, [{ id: 'guest', reason: 'Correct.' }, { id: 'member', reason: '' }]), /say why/);
  assert(!existsSync(join(root, BASELINE)), 'An incomplete batch wrote partial acceptance.');
});
test('behavior: HTML evidence escapes executable text and supports decision export', () => {
  const { root, config } = fixture(); config.scenarios[0].title = '</script><img src=x onerror=alert(1)>';
  const report = makeReview(root, capture(root, config));
  const html = readFileSync(report.html, 'utf8');
  assert(!html.includes('<img src=x'), 'Observed text was inserted as active HTML.');
  assertMatch(html, /&lt;\/script&gt;/, 'A title must be escaped.');
  assertMatch(html, /Download selected decisions/, 'The report must expose row decisions.');
  assertMatch(html, /connect-src 'none'/, 'The report must not send evidence to a server.');
});
test('behavior: local paths reject traversal and symlink escapes', () => {
  const root = projectDir(), outside = projectDir();
  throws(() => inside(root, '../escape.json'), /outside/);
  const link = join(root, 'linked');
  symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  throws(() => writeJson(root, 'linked/escape.json', {}), /Symbolic links/);
  assert(!existsSync(join(outside, 'escape.json')), 'A write escaped the project.');
});
test('behavior: report controls filter rows and export only selected, explained decisions', async () => {
  const { root, config } = fixture();
  const observation = capture(root, config), report = makeReview(root, observation);
  const html = readFileSync(report.html, 'utf8');
  const controls = Object.fromEntries(['filter', 'download', 'notice'].map((key) => [key, { textContent: '', addEventListener(event, handler) { this[event] = handler; } }]));
  const rows = ['same', 'changed'].map((status, index) => ({ dataset: { status, id: config.scenarios[index].id }, hidden: false, selected: false,
    textarea: { value: '', focused: false, focus() { this.focused = true; } },
    querySelector(selector) { return selector === 'input:checked' ? this.selected : this.textarea; } }));
  let blob, link;
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document: { getElementById: (key) => controls[key], querySelectorAll: (selector) => selector === 'article' ? rows : [],
      createElement() { link = { click() { this.clicked = true; } }; return link; } },
    Blob, URL: { createObjectURL(value) { blob = value; return 'blob:local-demo'; }, revokeObjectURL() {} }, setTimeout() {},
  });
  controls.filter.change({ target: { value: 'changes' } });
  assert(rows[0].hidden && !rows[1].hidden, 'The changes filter must hide unchanged rows.');
  controls.download.click(); assertMatch(controls.notice.textContent, /Select at least one/, 'Empty selection needs an explanation.');
  rows[1].selected = true; controls.download.click();
  assert(rows[1].textarea.focused && !blob, 'Unexplained acceptance must not export.');
  rows[1].textarea.value = 'The owner chose this result.'; controls.download.click();
  const exported = JSON.parse(await blob.text());
  assert(exported.report === report.hash && exported.after === observation.hash, 'Export must be bound to the exact review.');
  assert(exported.decisions.length === 1 && exported.decisions[0].id === 'member' && link.clicked, 'Only the selected row should be downloaded.');
});
test('behavior: a runner that changes a Git project during capture produces no acceptable results', () => {
  const { root, config } = fixture({ runner: "import { writeFileSync } from 'node:fs'; writeFileSync('unexpected.txt','changed'); console.log('{}');" });
  git(root, ['init', '--initial-branch=main']); saveCommit(root, 'Stable source');
  const observed = capture(root, config);
  assert(observed.results.every((r) => r.status === 'unstable'), 'Source changes during observation must invalidate the run.');
  throws(() => accept(root, observed), /cannot be accepted/);
});
test('behavior: full verification opts in, fast verification does not run extra scenarios', async () => {
  const { root, config } = fixture();
  const plain = await runVerify(root); assert(plain.code === 0, plain.out);
  config.verify = true; writeJson(root, CONFIG, config);
  const missing = await runVerify(root); assert(missing.code === 1, missing.out);
  assertMatch(missing.out, /FAIL - behavior/, 'Full verification must enforce the opted-in examples.');
  const fast = await runVerify(root, ['--fast']); assert(fast.code === 0, fast.out);
  accept(root, capture(root, config));
  const passed = await runVerify(root); assert(passed.code === 0, passed.out);
});
test('behavior: init refuses to overwrite an existing project config', async () => {
  const { root } = fixture(); const before = readFileSync(join(root, CONFIG), 'utf8');
  const result = await cli(root, ['init']); assert(result.code === 1, result.out);
  assert(readFileSync(join(root, CONFIG), 'utf8') === before, 'Init overwrote existing config.');
});
test('behavior: projects without a behavior config retain verification through a symlinked settings folder', async () => {
  const root = projectDir(), settings = projectDir();
  symlinkSync(settings, join(root, '.claude'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = await runVerify(root);
  assert(result.code === 0, `Opt-in behavior checks affected an unrelated project: ${result.out}`);
});

function ruleFixture() {
  const { root, config } = fixture({ expected: true });
  writeFileSync(join(root, 'POLICY.md'), '# Shop policy\nGuests pay full price.\n');
  const source = importSource(root, 'policy', 'POLICY.md');
  writeJson(root, RULES, { version: 1, sources: [{ id: source.id, path: source.path, sha256: source.sha256, textSha256: source.textSha256 }],
    rules: [{ id: 'full-price', text: 'Guests pay the item price.', status: 'active', source: {
      id: 'policy', fromLine: 2, toLine: 2, quote: 'Guests pay full price.', sha256: source.sha256, textSha256: source.textSha256 }, scenarios: ['guest'] }],
    context: [{ source: 'policy', fromLine: 1, toLine: 1, textSha256: source.textSha256, reason: 'Document title.' }] });
  return { root, config };
}
test('rules: exact source quotes and passing expectations provide traceable evidence', () => {
  const { root, config } = ruleFixture(); const observed = capture(root, config), result = checkRules(root, observed, config);
  assert(result.passed, JSON.stringify(result));
  assert(result.rules[0].source.quote === 'Guests pay full price.', 'Source evidence was lost.');
  const report = makeReview(root, observed, null, result), html = readFileSync(report.html, 'utf8');
  assertMatch(html, /<blockquote>Guests pay full price\.<\/blockquote>/, 'A rule should show the actual source passage.');
  assertMatch(html, /href="#scenario-guest"/, 'The passage should link to its executable example.');
});
test('rules: changing the source invalidates the rule evidence', () => {
  const { root, config } = ruleFixture(); writeFileSync(join(root, 'POLICY.md'), '# Shop policy\nGuests receive a discount.\n');
  const result = checkRules(root, capture(root, config), config);
  assert(!result.passed && !result.sources[0].valid, 'A changed source was treated as reviewed.');
});
test('rules: Windows checkout line endings do not invalidate unchanged source text', () => {
  const { root, config } = ruleFixture();
  const original = readFileSync(join(root, 'POLICY.md'), 'utf8');
  writeFileSync(join(root, 'POLICY.md'), original.replaceAll('\n', '\r\n'));
  assert(checkRules(root, capture(root, config), config).passed, 'CRLF conversion alone was treated as a new source.');
});
test('rules: a wrong observed outcome fails even when the quote is correct', () => {
  const { root, config } = ruleFixture();
  writeFileSync(join(root, 'shop.mjs'), 'export const checkout = () => ({ total: 1 });\n');
  const result = checkRules(root, capture(root, config), config);
  assert(!result.passed && result.rules[0].issues.some((s) => s.includes('expectation failed')), 'A source citation hid a wrong outcome.');
});
test('rules: reimporting edited sources still requires reviewing existing interpretations', () => {
  const { root, config } = ruleFixture(); writeFileSync(join(root, 'POLICY.md'), '# Revised shop policy\nGuests pay full price.\n');
  importSource(root, 'policy', 'POLICY.md');
  const result = checkRules(root, capture(root, config), config);
  assert(!result.passed && result.rules[0].issues.some((s) => s.includes('interpretation needs review')), 'Reimport silently reaffirmed old interpretations.');
});
test('rules: a new unclassified source line blocks a completeness claim', () => {
  const { root, config } = ruleFixture();
  writeFileSync(join(root, 'POLICY.md'), '# Shop policy\nGuests pay full price.\nRefunds use the amount paid.\n');
  const source = importSource(root, 'policy', 'POLICY.md');
  const book = JSON.parse(readFileSync(join(root, RULES), 'utf8'));
  Object.assign(book.rules[0].source, { sha256: source.sha256, textSha256: source.textSha256 });
  book.context[0].textSha256 = source.textSha256; writeJson(root, RULES, book);
  const result = checkRules(root, capture(root, config), config);
  assert(!result.passed && result.sources[0].unreviewedLines.includes(3), 'A source line vanished from coverage.');
});
test('rules: wrong quotes, unresolved rules and missing examples all fail', () => {
  const { root, config } = ruleFixture();
  const book = JSON.parse(readFileSync(join(root, RULES), 'utf8'));
  book.rules[0].source.quote = 'An invented quote.'; book.rules[0].status = 'unresolved'; book.rules[0].scenarios = ['missing'];
  writeJson(root, RULES, book);
  const result = checkRules(root, capture(root, config), config);
  assert(!result.passed && result.rules[0].issues.length >= 3, 'Missing evidence became a pass.');
});
test('rules: observed values alone cannot verify an interpretation', () => {
  const { root, config } = ruleFixture(); delete config.scenarios[0].expected;
  assert(!checkRules(root, capture(root, config), config).passed, 'A rule without an expected outcome passed.');
  accept(root, capture(root, config));
  assert(checkRules(root, capture(root, config), config).passed, 'Owner-approved examples should be usable evidence.');
});
test('rules: PDF imports pin both the original and the extracted text', () => {
  const { root } = fixture();
  writeFileSync(join(root, 'policy.pdf'), '%PDF-demo'); writeFileSync(join(root, 'policy.txt'), 'Page 1\nFull price.\n');
  throws(() => importSource(root, 'pdf', 'policy.pdf'), /needs --text/);
  const source = importSource(root, 'pdf', 'policy.pdf', 'policy.txt');
  assert(source.sha256 !== source.textSha256 && source.textPath === 'policy.txt', 'Both source files must be fingerprinted.');
});
test('rules: a non-UTF-8 extract cannot silently lose source information', () => {
  const { root } = fixture(); writeFileSync(join(root, 'bad.txt'), Buffer.from([255, 254, 253]));
  throws(() => importSource(root, 'invalid', 'bad.txt'), /not valid UTF-8/);
});
test('rules: rule-add and context-add copy the quote and hashes, so a written rule checks', async () => {
  const { root, config } = fixture({ expected: true });
  writeFileSync(join(root, 'POLICY.md'), '# Shop policy\nGuests pay full price.\n');
  importSource(root, 'policy', 'POLICY.md');
  throws(() => addRule(root, 'full-price', { source: 'policy', lines: '7', text: 'Guests pay the item price.' }), /not in policy/);
  throws(() => addRule(root, 'full-price', { source: 'missing', lines: '2', text: 'x' }), /Unknown source/);
  const added = await cli(root, ['rule-add', 'full-price', '--source', 'policy', '--lines', '2', '--text', 'Guests pay the item price.', '--scenarios', 'guest']);
  assert(added.code === 0, added.out);
  addContext(root, { source: 'policy', lines: '1', reason: 'Document title.' });
  assert(checkRules(root, capture(root, config), config).passed, 'Rules written by the commands must check.');
  // An edited source makes both entries stale; writing them again is the review.
  writeFileSync(join(root, 'POLICY.md'), '# Shop policy\nGuests pay full price, always.\n');
  importSource(root, 'policy', 'POLICY.md');
  assert(!checkRules(root, capture(root, config), config).passed, 'A changed source must need review.');
  addRule(root, 'full-price', { source: 'policy', lines: '2', text: 'Guests always pay the item price.', scenarios: ['guest'] });
  assert(addContext(root, { source: 'policy', lines: '1', reason: 'Document title.' }).replaced, 'The same lines must replace their old entry.');
  assert(checkRules(root, capture(root, config), config).passed, 'Reviewed entries must check again.');
  const unresolved = await cli(root, ['rule-add', 'full-price', '--source', 'policy', '--lines', '2', '--text', 'Unclear.', '--unresolved']);
  assert(unresolved.code === 0 && JSON.parse(unresolved.out).status === 'unresolved', unresolved.out);
});
