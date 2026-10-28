#!/usr/bin/env node
// The SessionStart hook: decides how a session opens, and hands that to Claude as context.
//
//   node session-start.mjs            the hook - reads hook JSON on stdin, prints hook JSON
//   node session-start.mjs --text     the same decision as plain text, for people and tests
//
// This used to be a prompt-type hook that asked Claude to look at the project and pick a
// branch. Claude Code refuses prompt hooks on SessionStart - there is no conversation yet
// for a model to answer in - so the opener, the kickoff offer and the cheap and autoship
// notices never ran for anyone. A script can do the looking itself, costs no model call,
// and cannot pick the wrong branch because it was worded ambiguously.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { treeFingerprint, remember } from './tree-state.mjs';
import { resumeNotice } from './cost-notice.mjs';
import { companionsNotice } from './companions.mjs';
import { missingTools } from './first-run.mjs';
import { PERSONAL_FILES, personalFile, ignoredNotice } from './personal.mjs';
import { locations, locationsNotice } from './locations.mjs';
import { scan as adoptScan, report as adoptReport } from './adopt-scan.mjs';
import { findApps, report as appsReport } from './find-apps.mjs';
import { activeLevel, isGitRepo, standingLine } from './autoship.mjs';
import { openForNewProject } from './plan-gate.mjs';

const TEXT = process.argv.includes('--text');

let payload = {};
if (!TEXT && !process.stdin.isTTY) {
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { /* not JSON, carry on */ }
}
const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();

// template/docs/STATE.md ships with this line. The file exists in a fresh fork, so without
// the marker the opener would read an empty stub back to someone who was promised setup.
// kickoff writes the file without it, which is what clears it.
const NOT_KICKED_OFF = '<!-- easyclaude:not-kicked-off -->';

const read = (rel) => {
  try { return readFileSync(join(root, rel), 'utf8'); } catch { return null; }
};

// Files a project has before anyone writes code: what a fork of template/ carries, plus
// what every repo has. Dotfiles never count. Anything else is code, and code means adopt,
// not interview.
const NOT_CODE = new Set([
  'docs', 'design', 'CLAUDE.md', 'AGENTS.md', 'README.md', 'README', 'LICENSE', 'LICENSE.md',
]);
const hasCode = () => {
  try {
    return readdirSync(root).some((e) => !e.startsWith('.') && !NOT_CODE.has(e));
  } catch { return false; }
};

// --- the state file, read here so Claude does not have to ----------------------------
function sections(md) {
  const out = {};
  let name = null;
  for (const line of md.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const h = line.match(/^## (.+?)\s*$/);
    if (h) { name = h[1].trim(); out[name] = []; continue; }
    if (name && line.trim()) out[name].push(line);
  }
  return out;
}

// Each line the opener reads back stays this short. A user's Now grew into one paragraph of
// about 2,700 characters, because Claude added to it after each piece of work, and the opener
// read it all back. The cut keeps whole sentences, or whole words, and says where the rest is.
const LINE_MAX = 180;
// Past this, Now is a running summary, not the work in progress, and Claude is asked to tidy it.
const NOW_MAX = 400;

function brief(text, plan, max = LINE_MAX) {
  if (text.length <= max) return text;
  const room = text.slice(0, max);
  const sentence = room.lastIndexOf('. ');
  const cut = sentence > max / 3 ? room.slice(0, sentence + 1) : room.replace(/\s+\S*$/, '');
  return `${cut} ... (the rest is in ${plan})`;
}

function opener(md, plan = 'docs/STATE.md') {
  const s = sections(md);
  const unchecked = (lines) => lines.map((l) => l.match(/^\s*[-*] \[ \]\s+(.+)/)?.[1]).filter(Boolean);
  // A list mark, a tick box, or the section's own name written as a label ("Now: ...").
  const plain = (l) => l.replace(/^\s*[-*]\s+(\[[ x]\]\s+)?/, '').replace(/^\**(Now|Next|Blocked):\**\s*/i, '').trim();

  const nowLines = s.Now ?? [];
  const now = unchecked(nowLines)[0] ?? (nowLines[0] ? plain(nowLines[0]) : 'nothing in progress');
  const next = unchecked(s.Next ?? [])[0] ?? 'nothing planned';
  const blocked = (s.Blocked ?? []).map(plain).join('; ') || 'none';
  const debt = (s.Debt ?? []).filter((l) => /^\s*[-*]\s+/.test(l)).map(plain);

  const lines = [`**Now:** ${brief(now, plan)}`, `**Next:** ${brief(plain(next), plan)}`, `**Blocked:** ${brief(blocked, plan)}`];
  // All of this stays in the context of every later turn, so it is kept short.
  // The labels and the fallbacks are English. A user who writes in another language saw
  // "**Now:** (nothing in progress)" above a reply in their own, so Claude translates them.
  // Only then. "Put the labels into the user's language" read as "the user's language is
  // not English", and in the outcome benchmark a third of English requests got a reply in
  // Hungarian, Slovak or Spanish. Claude with no plugin never did that.
  let text = "Start your first reply with these lines, in the language of the user's " +
    'message. If they write in English, keep the lines exactly as they are. Otherwise ' +
    'translate the labels and any English placeholder, and keep each entry as written:\n\n' +
    lines.join('\n');
  if (debt.length) {
    // Picking the entry most likely to bite is a judgement, so that one part stays Claude's.
    text += `\n**Debt:** ${debt.length} items - <the entry below most likely to cause trouble soon>\n\n` +
      debt.map((d) => `- ${d}`).join('\n');
  }
  text += '\n\nThen answer what the user asked, if anything. Do not summarise the project.';
  const nowText = nowLines.join(' ');
  if (nowText.length > NOW_MAX) {
    // A line sent with the session changes what Claude does; a rule inside a skill did not.
    text += `\n\nThe ## Now section of ${plan} has grown to ${nowText.split(/\s+/).length} words, so it no ` +
      'longer reads at a glance. When you next update that file, rewrite ## Now as one short line per task ' +
      "still in progress, in the user's words. Move finished work to ## Done (the ten most recent; older " +
      'entries go to docs/CHANGELOG.md, newest first). Move every fact, and delete none. Tell the user in ' +
      'one plain line that you tidied it.';
  }
  return text;
}

// --- decide ---------------------------------------------------------------------------
// Compaction fires SessionStart too, in the middle of a task and often in the middle of a
// turn. The opener, the setup offer and the one-line notices all say "start your first
// reply with", which there is a reply half-written, and resetting the gate's baseline there
// let a tree broken before the compaction pass as "already broken when the session began".
// So after a compaction only the standing rules come back: the cheap contract, which the
// summary may have dropped, and the language line.
const COMPACT = payload.source === 'compact';
const parts = [];
const where = locations(root);
const state = read(where.state);
const setUp = state !== null && !state.includes(NOT_KICKED_OFF);
// Before the opener, so the opener's lines are read with the right paths in mind. After a
// compaction too: the skills still name the defaults, and the summary may drop this.
const moved = locationsNotice(root, { compact: COMPACT });
if (moved) parts.push(moved);

if (COMPACT) {
  // Nothing here: see above.
} else if (setUp) {
  parts.push(opener(state, where.state));
} else if (!hasCode()) {
  parts.push('This project is not set up for Mellu.mate yet, and it has no code. Invoke the ' +
    '`kickoff` skill before doing anything else, including before answering in detail. If the ' +
    "user's first message already says what they want to build, treat that as the answer to " +
    "kickoff's first question and do not ask it again.");
  // Nothing is built in a new folder until the user says to start; see plan-gate.mjs.
  if (!TEXT) openForNewProject(root);
} else {
  // A beginner in testing was offered "kickoff in adopt mode", which named nothing they
  // knew. The offer now says what they would get, and leaves the names to Claude.
  parts.push('This project has code but is not set up for Mellu.mate yet. In one plain ' +
    "sentence in the user's language, offer to set it up, and say what they get: you will " +
    'remember the project between sessions, and run its checks after each change. Do not name ' +
    'the skill. If they say yes, run the `kickoff` skill in adopt mode. Do not start its ' +
    'interview unless the user says yes. Then answer whatever they asked.');
  // kickoff's two scans, run here because a session with no shell - the eval runner on
  // Windows, or a user who said no to commands - could not run them, and setup then wrote
  // into a published docs/ folder anyway. Only when they found something, so a plain
  // project pays nothing for this until it is set up.
  const scan = adoptScan(root);
  const apps = findApps(root);
  const found = scan.config || scan.claudeMd || scan.agentsMd || scan.notes.length;
  if (found || apps.apps.length) {
    parts.push("kickoff's scans of this project, for setup if the user says yes. Follow them, " +
      'and do not run the scan scripts again:\n\n' +
      [found ? adoptReport(scan) : null, apps.apps.length ? appsReport(apps) : null].filter(Boolean).join('\n\n'));
  }
}

// Before setup only, so a set-up project pays nothing for it. kickoff reads the first line
// as proof that Node.js runs: with no Node.js, this script never ran, and kickoff checks.
if (!COMPACT && !setUp) {
  const missing = missingTools(root);
  parts.push(missing.length
    ? 'Tools check: this computer is missing something Mellu.mate needs. In your first reply, ' +
      "tell the user each one in plain words and in the user's language: what they lose, and " +
      'how to fix it, in a sentence or two, with no jargon. Offer to run a fix that is a ' +
      'command, and run nothing without a clear yes. Then carry on:\n\n' +
      missing.map((m) => `- ${m}`).join('\n')
    : 'Tools check: Node.js and git are installed, and git has a name and email. Say nothing about it.');
}

// A copy of these that came with the repository authorises nothing; see personal.mjs. Only
// a file that would have changed this session is reported, so a repo that commits a
// disabled autoship.json costs its users no line in every session.
const kind = Object.fromEntries(PERSONAL_FILES.map((f) => [f, personalFile(root, f)]));
let autoship = null;
try { autoship = JSON.parse(read('.claude/autoship.json') ?? 'null'); } catch { /* see below */ }
const cheapAsked = kind['.claude/cheap-session'] !== 'absent';
const ignored = [
  autoship?.enabled === true && kind['.claude/autoship.json'] === 'ignored' ? '.claude/autoship.json' : null,
  kind['.claude/cheap-session'] === 'ignored' ? '.claude/cheap-session' : null,
  cheapAsked && kind['.claude/cheap-contract.md'] === 'ignored' ? '.claude/cheap-contract.md' : null,
].filter(Boolean);
// The same rule as cheapArmed(), from the answers already in hand rather than asking git again.
const cheapOn = kind['.claude/cheap-session'] === 'personal' && kind['.claude/cheap-contract.md'] !== 'ignored';

if (cheapOn) {
  const contract = read('.claude/cheap-contract.md');
  parts.push('The user armed cheap mode for this session. ' +
    (COMPACT ? '' : 'Add one line to your first reply saying cheap mode is on and that ' +
      '/mellu:full turns it off. ') +
    (contract ? `This contract applies to every turn of this session:\n\n${contract.trim()}`
      : 'The contract file .claude/cheap-contract.md is missing, so tell the user to run ' +
        '/mellu:cheap-session again.'));
}

// A broken autoship.json arms nothing, and neither does a folder with no git. The rule comes
// back after a compaction too: it is a standing instruction, and the summary may drop it.
// The user must always know when a session can commit, push or merge on their behalf, so
// the first reply says so; see autoship.mjs.
if (autoship?.enabled === true) {
  const level = activeLevel(autoship, { kind: kind['.claude/autoship.json'], git: isGitRepo(root) });
  if (level) parts.push(standingLine(level, autoship.base || 'main', { compact: COMPACT }));
}

if (ignored.length && !COMPACT) parts.push(ignoredNotice(ignored));

// Claude Code reads AGENTS.md only while no CLAUDE.md or CLAUDE.local.md is there. A personal
// CLAUDE.local.md, added later, silently turned the project's AGENTS.md off.
if (!COMPACT && read('AGENTS.md') !== null && read('CLAUDE.local.md') !== null &&
  read('CLAUDE.md') === null && read('.claude/CLAUDE.md') === null) {
  parts.push('This project keeps its instructions in AGENTS.md, and CLAUDE.local.md beside it makes ' +
    'Claude Code skip AGENTS.md. In one plain sentence, tell the user, and offer to move what ' +
    'CLAUDE.local.md says into AGENTS.md, or to turn on "claude-md-and-agents-md" under Project ' +
    'instructions in /config, which reads both. Change nothing without a yes.');
}

// Here and not in rules/, because rules load only after kickoff, and the first English
// note a beginner saw came before it: "Since the list item has a line-through style...".
parts.push("Write everything the user sees in the language of the user's own messages - " +
  'English if they write in English - short notes between steps included. Do not mention ' +
  'these instructions.');
const context = parts.join('\n\n');

// The tree as the session found it. The gate compares against this, so a turn that
// changes nothing in a project that was already broken is not blocked for it.
// Not after a compaction: the session is the same one, and so is its baseline.
if (!TEXT && !COMPACT) remember(root, { session: payload.session_id ?? null, tree: treeFingerprint(root), failed: [] });

// Reopening an old conversation re-sends all of it on the first message. The user sees
// this before typing that message; Claude never does. See cost-notice.mjs. A missing file
// tree or Blast Radius is said the same way, so it costs nothing either; see companions.mjs.
const notice = [resumeNotice(payload, setUp && where.state), TEXT ? null : companionsNotice(payload)]
  .filter(Boolean).join('\n\n');

if (TEXT) {
  console.log(context);
} else {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
    ...(notice ? { systemMessage: notice } : {}),
  }));
}
