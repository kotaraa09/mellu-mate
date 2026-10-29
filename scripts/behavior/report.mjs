import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inside, LOCAL, saveArtifact, hash, loadBaseline, baselineResults, compare } from './core.mjs';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
const shown = (r) => !r ? '(not present)' : r.status === 'ok' ? JSON.stringify(r.value, null, 2) : r.error;
const statusText = (s) => ({ same: 'Unchanged', added: 'New example', removed: 'Removed example', changed: 'Behavior changed',
  'scenario-changed': 'Different input or runner', 'expectation-failed': 'Expected result failed', error: 'Could not run', unstable: 'Unstable result', 'no-baseline': 'Before was not verified' }[s] ?? s);

function ruleEvidence(report) {
  if (!report) return '';
  return `<section aria-label="Source rules"><h2>Source rules</h2><p>${report.passed ? 'Every recorded rule has matching source text and passing examples.' : 'Some recorded rules still need attention.'}</p>
${report.problems.length ? `<ul>${report.problems.map((p) => `<li>${escape(p)}</li>`).join('')}</ul>` : ''}
${report.rules.map((rule) => {
    const source = report.sources.find((s) => s.id === rule.source.id);
    return `<details class="rule"><summary>${rule.passed ? '✓' : '!'} ${escape(rule.id)} · ${escape(rule.text)}</summary>
<blockquote>${escape(rule.source.quote)}</blockquote><p class="footnote">Source: ${escape(source?.path ?? rule.source.id)} · lines ${rule.source.fromLine}–${rule.source.toLine}</p>
<p class="footnote">Examples: ${rule.scenarios.map((key) => `<a href="#scenario-${escape(key)}">${escape(key)}</a>`).join(', ') || 'none recorded'}</p>
${rule.issues.length ? `<ul>${rule.issues.map((issue) => `<li>${escape(issue)}</li>`).join('')}</ul>` : '<p class="footnote">The recorded examples matched their expected outcomes.</p>'}</details>`;
  }).join('')}
<p class="footnote">These checks cover the recorded interpretations and examples. They do not prove that every requirement was extracted or understood correctly.</p></section>`;
}

export function makeReview(root, run, beforeRun = null, ruleReport = null) {
  const baseline = loadBaseline(root);
  const rows = compare(beforeRun ? beforeRun.results : baselineResults(baseline), run.results);
  const report = saveArtifact(root, 'reviews', {
    version: 1, createdAt: new Date().toISOString(), after: run.hash, before: beforeRun?.hash ?? 'accepted-examples',
    baselineHash: hash(baseline), rows, ruleReport,
  });
  const data = JSON.stringify({ report: report.hash, after: run.hash }).replaceAll('<', String.fromCharCode(92) + 'u003c');
  const cliPath = fileURLToPath(new URL('../behavior.mjs', import.meta.url));
  const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'">
<title>Mellu.mate · Behavior review</title>
<style>
:root{color-scheme:light;--ink:#272825;--muted:#64675e;--line:#dddcd2;--paper:#fbfaf4;--green:#245340;--pink:#f4ded9}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:44px 24px 64px}
header{border-bottom:1px solid var(--line);padding-bottom:24px}.eyebrow{color:var(--green);letter-spacing:.13em;font-size:12px;font-weight:750;text-transform:uppercase}
h1{font-size:clamp(28px,5vw,42px);letter-spacing:-.04em;line-height:1.1;margin:12px 0}p{max-width:760px;color:var(--muted)}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.stat{background:#eeeee4;padding:10px 16px;border-radius:8px}
button,select,textarea{font:inherit}button,select{padding:10px 14px;border:1px solid var(--line);border-radius:7px;background:white;color:var(--ink)}button{cursor:pointer}button.primary{background:var(--green);color:white;border:0}button:disabled{opacity:.5;cursor:default}.toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:24px 0}.rule{margin:10px 0;background:#eeeee4;border-radius:8px;border:0}blockquote{border-left:3px solid var(--green);padding-left:16px;margin-left:0;white-space:pre-wrap}a{color:var(--green)}article{scroll-margin-top:20px}
article{border:1px solid var(--line);border-radius:12px;background:white;margin:16px 0;overflow:hidden}article h2{font-size:19px;margin:0}article .top{padding:18px 22px;display:flex;gap:16px;align-items:start;justify-content:space-between}.badge{font-size:12px;font-weight:700;padding:5px 9px;border-radius:30px;background:var(--pink);white-space:nowrap}.same .badge{background:#e2eee6}.values{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)}.values>div{padding:16px 22px;min-width:0}.values>div+div{border-left:1px solid var(--line)}.label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}pre{font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}details{padding:12px 22px;border-top:1px solid var(--line)}summary{cursor:pointer;color:var(--muted)}.decision{padding:16px 22px;border-top:1px solid var(--line);display:flex;gap:12px;flex-wrap:wrap;align-items:center}textarea{width:100%;padding:10px;border:1px solid var(--line);border-radius:6px;resize:vertical}.check{display:flex;align-items:center;gap:8px}.footnote{font-size:13px}code{overflow-wrap:anywhere}#notice{color:var(--green)}[hidden]{display:none!important}
@media(max-width:650px){main{padding:28px 16px}.values{grid-template-columns:1fr}.values>div+div{border-left:0;border-top:1px solid var(--line)}article .top{flex-direction:column}.badge{white-space:normal}}
</style>
<main><header><div class="eyebrow">Mellu.mate / Behavior review</div><h1>What changed for your users?</h1>
<p>These are recorded results from running the same examples twice. Review changes, then download your decisions. Nothing in this page changes your project.</p>
<div class="footnote">Current observation: ${escape(run.label)} · ${escape(run.capturedAt)}<br>Compared with: ${escape(beforeRun?.label ?? 'your accepted examples')}<br>Only the examples below were checked. Unchanged results do not prove the rest of the app works.</div></header>
<div class="stats"><span class="stat"><b>${rows.filter((r) => r.status !== 'same').length}</b> need review</span><span class="stat"><b>${rows.filter((r) => r.status === 'same').length}</b> unchanged</span><span class="stat"><b>${rows.filter((r) => ['error', 'unstable', 'expectation-failed'].includes(r.status)).length}</b> failed or unstable</span></div>
${ruleEvidence(ruleReport)}
<div class="toolbar"><label>Show <select id="filter"><option value="all">All examples</option><option value="changes">Needs review</option><option value="same">Unchanged</option></select></label><button class="primary" id="download">Download selected decisions</button></div><p id="notice" role="status"></p>
${rows.map((r) => `<article id="scenario-${escape(r.id)}" class="${escape(r.status)}" data-status="${escape(r.status)}" data-id="${escape(r.id)}"><div class="top"><div><h2>${escape(r.title)}</h2><span class="footnote">${escape(r.id)}</span></div><span class="badge">${escape(statusText(r.status))}</span></div>
<div class="values"><div><div class="label">Before</div><pre>${escape(shown(r.before))}</pre></div><div><div class="label">After</div><pre>${escape(shown(r.after))}</pre></div></div>
<details><summary>Input and evidence</summary><pre>${escape(JSON.stringify({ input: r.after ? r.after.input : r.before?.input, expected: r.after?.expected, caseHash: r.after?.caseHash, head: run.head, workingTree: run.workingTree, run: run.hash }, null, 2))}</pre></details>
${['error', 'unstable', 'expectation-failed'].includes(r.status) ? '<div class="decision">Fix this example before accepting it.</div>' : `<div class="decision"><label class="check"><input type="checkbox">${r.status === 'removed' ? 'Accept removal of this example' : 'Accept this observed result'}</label><textarea rows="2" aria-label="Reason for ${escape(r.id)}" placeholder="Why is this the intended behavior?"></textarea></div>`}</article>`).join('')}
<p class="footnote">Import the downloaded file in your own terminal with <code>node &quot;${escape(cliPath)}&quot; review-apply &lt;file&gt;</code> after reviewing it. Decisions are bound to this exact report and the accepted examples it compared against.</p>
</main><script>
const evidence=${data};
document.getElementById('filter').addEventListener('change',event=>{document.querySelectorAll('article').forEach(row=>{const same=row.dataset.status==='same';row.hidden=event.target.value==='changes'?same:event.target.value==='same'?!same:false;});});
document.querySelectorAll('a[href^="#scenario-"]').forEach(link=>link.addEventListener('click',()=>{document.getElementById('filter').value='all';document.querySelectorAll('article').forEach(row=>{row.hidden=false;});}));
document.getElementById('download').addEventListener('click',()=>{const decisions=[];for(const row of document.querySelectorAll('article')){if(!row.querySelector('input:checked'))continue;const reason=row.querySelector('textarea').value.trim();if(!reason){document.getElementById('notice').textContent='Add a reason for each selected example.';row.querySelector('textarea').focus();return;}decisions.push({id:row.dataset.id,reason});}if(!decisions.length){document.getElementById('notice').textContent='Select at least one example to accept.';return;}const url=URL.createObjectURL(new Blob([JSON.stringify({...evidence,decisions},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='mellu-decisions.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);document.getElementById('notice').textContent='Decisions downloaded. Your project has not changed yet.';});
</script></html>`;
  const file = inside(root, `${LOCAL}/reviews/${report.hash}.html`);
  writeFileSync(file, html);
  return { ...report, html: file };
}
