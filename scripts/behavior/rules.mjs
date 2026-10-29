// Trace each recorded rule to a quoted source span and executable examples.
// This checks traceability, not whether an interpretation is semantically correct.
import { readFileSync, existsSync } from 'node:fs';
import { inside, readJson, writeJson, RULES, id, hash, need, object, equal, loadBaseline, expectedPass } from './core.mjs';

const linesOf = (text) => text.replace(/\r\n/g, '\n').split('\n');
// Git on Windows may check a text file out with CRLF in the candidate. That is not
// a new rulebook. Binary originals (including PDFs) still use exact byte hashes.
const textHash = (bytes) => hash(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const sourceHash = (path, bytes) => /\.(?:md|txt|csv)$/i.test(path) ? textHash(bytes) : hash(bytes);
export function loadRules(root) {
  const book = readJson(root, RULES, true);
  if (!book) return null;
  need(book.version === 1 && Array.isArray(book.sources) && Array.isArray(book.rules) && Array.isArray(book.context), `${RULES} needs version: 1 and sources, rules and context arrays.`);
  const sourceIds = new Set(), ruleIds = new Set();
  for (const s of book.sources) {
    id(s.id); need(!sourceIds.has(s.id), `Duplicate source: ${s.id}`); sourceIds.add(s.id);
    inside(root, s.path); inside(root, s.textPath ?? s.path);
    need(/^[a-f0-9]{64}$/.test(s.sha256) && /^[a-f0-9]{64}$/.test(s.textSha256), `${s.id}: source hashes are missing. Import the source again.`);
  }
  for (const r of book.rules) {
    id(r.id); need(!ruleIds.has(r.id), `Duplicate rule: ${r.id}`); ruleIds.add(r.id);
    need(typeof r.text === 'string' && r.text.trim(), `${r.id}: explain the rule in plain words.`);
    need(['active', 'unresolved'].includes(r.status), `${r.id}: status must be active or unresolved.`);
    need(object(r.source) && sourceIds.has(r.source.id), `${r.id}: source is missing or unknown.`);
    need(typeof r.source.quote === 'string' && r.source.quote.trim(), `${r.id}: include an exact source quote.`);
    need(Array.isArray(r.scenarios) && r.scenarios.every((x) => typeof x === 'string'), `${r.id}: scenarios must be an array of scenario ids.`);
  }
  for (const c of book.context) {
    need(object(c) && sourceIds.has(c.source) && typeof c.reason === 'string' && c.reason.trim(), 'Each context span needs a source and a reason why it is not a requirement.');
  }
  return book;
}

export function importSource(root, sourceId, path, textPath) {
  id(sourceId);
  const raw = readFileSync(inside(root, path));
  const textFile = textPath ?? path;
  need(/\.(?:md|txt|csv)$/i.test(textFile), 'Use a Markdown, text or CSV extract. A PDF needs --text pointing at its extracted text; the original PDF is fingerprinted too.');
  const textRaw = readFileSync(inside(root, textFile));
  need(textRaw.length > 0 && textRaw.length <= 4 * 1024 * 1024 && !textRaw.includes(0), 'The source extract must contain UTF-8 text, up to 4 MB.');
  try { new TextDecoder('utf-8', { fatal: true }).decode(textRaw); }
  catch { throw new Error('The source extract is not valid UTF-8. Convert it to UTF-8 before importing it.'); }
  const book = loadRules(root) ?? { version: 1, sources: [], rules: [], context: [] };
  const entry = { id: sourceId, path, ...(textPath ? { textPath } : {}), sha256: sourceHash(path, raw), textSha256: textHash(textRaw) };
  const previous = book.sources.findIndex((s) => s.id === sourceId);
  if (previous < 0) book.sources.push(entry); else book.sources[previous] = entry;
  writeJson(root, RULES, book);
  return { ...entry, lineCount: linesOf(textRaw.toString('utf8')).length };
}

// "12" or "12-15", checked against the current extract. The quote is copied from those
// lines and the hashes from the imported source, so nothing long is typed by hand.
function lineSpan(root, book, sourceId, lines) {
  const source = book?.sources.find((s) => s.id === sourceId);
  need(source, `Unknown source: ${sourceId}. Import it with source-add first.`);
  const m = /^(\d+)(?:-(\d+))?$/.exec(String(lines ?? ''));
  need(m, 'Give the source lines as 12 or 12-15.');
  const text = linesOf(readFileSync(inside(root, source.textPath ?? source.path), 'utf8'));
  const fromLine = Number(m[1]), toLine = Number(m[2] ?? m[1]);
  need(span({ fromLine, toLine }, text.length), `Lines ${lines} are not in ${sourceId}, which has ${text.length} lines.`);
  return { source, fromLine, toLine, quote: text.slice(fromLine - 1, toLine).join('\n').trim() };
}

// Writing a rule again replaces it: that is how an interpretation is reviewed after
// its source changed.
export function addRule(root, ruleId, { source: sourceId, lines, text, scenarios = [], unresolved = false }) {
  id(ruleId);
  const book = loadRules(root);
  const { source, fromLine, toLine, quote } = lineSpan(root, book, sourceId, lines);
  need(quote, `Lines ${lines} are empty. Quote the lines that state the rule.`);
  need(typeof text === 'string' && text.trim(), 'Explain the rule in plain words, with --text.');
  for (const key of scenarios) id(key, 'Scenario id');
  const rule = { id: ruleId, text: text.trim(), status: unresolved ? 'unresolved' : 'active',
    source: { id: source.id, fromLine, toLine, quote, sha256: source.sha256, textSha256: source.textSha256 }, scenarios };
  const previous = book.rules.findIndex((r) => r.id === ruleId);
  if (previous < 0) book.rules.push(rule); else book.rules[previous] = rule;
  writeJson(root, RULES, book);
  return { ...rule, replaced: previous >= 0 };
}

export function addContext(root, { source: sourceId, lines, reason }) {
  const book = loadRules(root);
  const { source, fromLine, toLine } = lineSpan(root, book, sourceId, lines);
  need(typeof reason === 'string' && reason.trim(), 'Say why these lines are not a rule, with --reason.');
  const entry = { source: source.id, fromLine, toLine, textSha256: source.textSha256, reason: reason.trim() };
  // The same lines again replace their old entry, as a rule does.
  const previous = book.context.findIndex((c) => c.source === entry.source && c.fromLine === fromLine && c.toLine === toLine);
  if (previous < 0) book.context.push(entry); else book.context[previous] = entry;
  writeJson(root, RULES, book);
  return { ...entry, replaced: previous >= 0 };
}

const span = (v, count) => Number.isInteger(v.fromLine) && Number.isInteger(v.toLine) && v.fromLine >= 1 && v.toLine >= v.fromLine && v.toLine <= count;

export function checkRules(root, run, config, baseline = loadBaseline(root)) {
  const book = loadRules(root);
  if (!book) return null;
  const problems = [], sources = [], rules = [];
  const sourceMap = new Map();
  const results = new Map(run.results.map((r) => [r.id, r]));
  const cases = new Map(config.scenarios.map((s) => [s.id, s]));
  if (!book.sources.length || !book.rules.length) problems.push('No source rules are recorded. Nothing has been verified against a rulebook.');
  for (const s of book.sources) {
    let text = '', valid = false;
    try {
      const raw = readFileSync(inside(root, s.path));
      const extract = readFileSync(inside(root, s.textPath ?? s.path));
      valid = sourceHash(s.path, raw) === s.sha256 && textHash(extract) === s.textSha256;
      text = extract.toString('utf8');
    } catch (e) { problems.push(`${s.id}: ${e.message}`); }
    if (!valid) problems.push(`${s.id}: the source or its extract changed. Re-import it and review its rule interpretations.`);
    const lines = linesOf(text);
    sourceMap.set(s.id, { lines, valid, covered: new Set() });
  }
  for (const r of book.rules) {
    const source = sourceMap.get(r.source.id);
    const issues = [];
    if (!source.valid) issues.push('source changed or is missing');
    const validSpan = span(r.source, source.lines.length);
    const quote = validSpan ? source.lines.slice(r.source.fromLine - 1, r.source.toLine).join('\n').trim() : '';
    if (!validSpan || quote !== r.source.quote.replace(/\r\n/g, '\n').trim()) issues.push('source quote does not match its exact line span');
    else for (let n = r.source.fromLine; n <= r.source.toLine; n++) source.covered.add(n);
    // A re-import never silently reaffirms an interpretation of an edited document.
    if (r.source.textSha256 !== book.sources.find((s) => s.id === r.source.id).textSha256) issues.push('interpretation needs review against the current extract hash');
    if (r.source.sha256 !== book.sources.find((s) => s.id === r.source.id).sha256) issues.push('interpretation needs review against the current original source hash');
    if (r.status === 'unresolved') issues.push('interpretation is unresolved');
    if (!r.scenarios.length) issues.push('no executable examples');
    for (const key of r.scenarios) {
      const result = results.get(key), scenario = cases.get(key);
      if (!result || !scenario) { issues.push(`${key}: scenario is missing`); continue; }
      const accepted = baseline.entries[key]?.result;
      if (!expectedPass(result)) issues.push(`${key}: execution or explicit expectation failed`);
      else if (!Object.hasOwn(scenario, 'expected') && !(accepted && accepted.caseHash === result.caseHash && equal(accepted.value, result.value))) issues.push(`${key}: no matching accepted or explicit expected result`);
    }
    rules.push({ id: r.id, text: r.text, source: r.source, scenarios: r.scenarios, passed: issues.length === 0, issues });
  }
  for (const c of book.context) {
    const source = sourceMap.get(c.source);
    if (!span(c, source.lines.length)) { problems.push(`${c.source}: a context span has invalid line numbers.`); continue; }
    if (c.textSha256 !== book.sources.find((s) => s.id === c.source).textSha256) { problems.push(`${c.source}: a context classification needs review against the current extract hash.`); continue; }
    for (let n = c.fromLine; n <= c.toLine; n++) source.covered.add(n);
  }
  for (const s of book.sources) {
    const source = sourceMap.get(s.id);
    const unreviewedLines = source.lines.flatMap((line, i) => line.trim() && !source.covered.has(i + 1) ? [i + 1] : []);
    sources.push({ id: s.id, path: s.path, textPath: s.textPath ?? s.path, valid: source.valid, unreviewedLines });
    if (unreviewedLines.length) problems.push(`${s.id}: ${unreviewedLines.length} nonempty source line(s) are not classified as a rule or context.`);
  }
  return { passed: !problems.length && rules.every((r) => r.passed), sources, rules, problems,
    limit: 'Checks cover the recorded interpretations and examples. Line classification does not prove that extraction or interpretation is complete or correct.' };
}

export function sourceLines(root, sourceId) {
  const book = loadRules(root);
  const s = book?.sources.find((s) => s.id === sourceId);
  need(s, `Unknown source: ${sourceId}`);
  need(existsSync(inside(root, s.textPath ?? s.path)), 'The source extract is missing.');
  return linesOf(readFileSync(inside(root, s.textPath ?? s.path), 'utf8')).map((line, n) => `${n + 1}: ${line}`).join('\n');
}
