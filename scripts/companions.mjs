// The file tree and Blast Radius: plugins of their own, from Mellu.mate's marketplace.
//
// 1.2.0 listed them under "dependencies" in plugin.json. A fresh install brought them along,
// but `claude plugin update` from 1.1.x did not, and Claude Code then refuses to load a
// plugin whose dependency is missing: no skills, no hooks, no panels, and nothing on screen
// to say so. Now Mellu.mate loads without them, and this says once which ones are missing
// and how to add them.
//
// The note is a systemMessage: the user sees it and Claude does not, so it costs no tokens.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const COMPANIONS = [
  { id: 'filetree@mellu-mate', name: 'the file tree' },
  { id: 'blast-radius@mellu-mate', name: 'Blast Radius' },
];

// The companions with no install record, in any scope. An unreadable record says nothing:
// a wrong "missing" would send someone to install what they have.
// Each comes with `old: true` when the user has it only under the old easyclaude marketplace
// name, as a user who came from easyClaude does: an update under the new name cannot reach it.
export function missingCompanions({ configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude') } = {}) {
  let installed;
  try {
    installed = JSON.parse(readFileSync(join(configDir, 'plugins', 'installed_plugins.json'), 'utf8')).plugins;
  } catch { return []; }
  if (!installed || typeof installed !== 'object') return [];
  const has = (id) => Array.isArray(installed[id]) && installed[id].length > 0;
  return COMPANIONS.filter((c) => !has(c.id))
    .map((c) => ({ ...c, old: has(c.id.replace(/@mellu-mate$/, '@easyclaude')) }));
}

// The note for a new session, or null. Once for each set of missing companions, when Claude
// Code gives the plugin a data folder to remember that in; every new session when it does not.
export function companionsNotice(payload, { configDir, dataDir = process.env.CLAUDE_PLUGIN_DATA } = {}) {
  if ((payload.source ?? 'startup') !== 'startup') return null;
  const missing = missingCompanions(configDir ? { configDir } : {});
  if (!missing.length) return null;

  const key = missing.map((c) => `${c.id}${c.old ? ':old' : ''}`).join(',');
  const marker = dataDir ? join(dataDir, 'companions-noted') : null;
  if (marker) {
    try { if (readFileSync(marker, 'utf8').trim() === key) return null; } catch { /* not noted yet */ }
    try { mkdirSync(dataDir, { recursive: true }); writeFileSync(marker, key); } catch { /* show it anyway */ }
  }

  const say = (list, what, how) => {
    if (!list.length) return null;
    const names = list.map((c) => c.name).join(' and ');
    return `Mellu.mate: ${names} ${list.length > 1 ? 'are' : 'is'} ${what}. ${how}, ` +
      'run this in a terminal, then start a new session:\n' +
      list.flatMap((c) => [`claude plugin install ${c.id}`, ...(c.old ? [`claude plugin uninstall ${c.id.replace(/@mellu-mate$/, '@easyclaude')}`] : [])]).join('\n');
  };
  const old = missing.filter((c) => c.old);
  return [
    say(missing.filter((c) => !c.old), 'not installed', `To add ${missing.length - old.length > 1 ? 'them' : 'it'}`),
    say(old, 'installed under the old easyClaude name, where updates cannot reach', `To move ${old.length > 1 ? 'them' : 'it'}`),
  ].filter(Boolean).join('\n\n');
}
