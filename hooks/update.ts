// The update button: the control panel says when a newer release of Mellu.mate is out, and
// updates it when the user presses the button.
//
// Claude Code can update a plugin by itself, but only from a marketplace with auto-update
// on, which is off for Mellu.mate's, and the switch is in /plugin, which the desktop app
// only browses. Turning it on for everyone would also bring every release to everyone at
// once. So the panel checks GitHub's latest published release, and the user decides. Claude
// is never asked, so neither the check nor the update costs a token.
//
// Pure, so the tests can call it; panels.tsx does the fetching and the running.

// The latest published release. A draft, a pre-release or a work branch never counts.
export const RELEASES = 'https://api.github.com/repos/kotaraa09/mellu-mate/releases/latest'

// GitHub answers 60 unsigned requests an hour from one address, so the answer is kept.
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

// Claude Code's own switches that turn its updates off. The user set them on purpose; panels.tsx
// reads each by name, as the engine requires.
export const UPDATES_OFF = ['DISABLE_UPDATES', 'DISABLE_AUTOUPDATER', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC']

// What the button runs, from the plugins installed (`installed_plugins.json`): the
// marketplace's listing first, then Mellu.mate, then each companion the user has. A user who
// came from easyClaude has them under the old marketplace name, where `update ...@mellu-mate`
// cannot reach them: the new copy is installed, then the old one removed, since two copies of
// one name run the hooks of one only. A companion the user never installed is not added.
export const PLUGIN_STEP = ['claude', 'plugin', 'update', 'mellu@mellu-mate']
const COMPANIONS = ['filetree', 'blast-radius']

export function updateSteps(installed: readonly string[]): string[][] {
  const has = new Set(installed)
  const steps: string[][] = [['claude', 'plugin', 'marketplace', 'update', 'mellu-mate'], PLUGIN_STEP]
  for (const name of COMPANIONS) {
    if (has.has(`${name}@mellu-mate`)) steps.push(['claude', 'plugin', 'update', `${name}@mellu-mate`])
    else if (has.has(`${name}@easyclaude`)) {
      steps.push(['claude', 'plugin', 'install', `${name}@mellu-mate`], ['claude', 'plugin', 'uninstall', `${name}@easyclaude`])
    }
  }
  return steps
}

// The ids in Claude Code's record of installed plugins, or none when it cannot be read.
export function installedFrom(text: string): string[] {
  try {
    const plugins = JSON.parse(text)?.plugins
    return plugins && typeof plugins === 'object' ? Object.keys(plugins).filter((id) => Array.isArray(plugins[id]) && plugins[id].length) : []
  } catch { return [] }
}

// What the panel sends Claude when the button's own update did not finish.
export const ASK_CLAUDE = 'Update the Mellu.mate plugin for me. Run `claude plugin marketplace update mellu-mate`, ' +
  'then `claude plugin update mellu@mellu-mate`, and update `filetree` and `blast-radius` from ' +
  'the mellu-mate marketplace too. Where `claude plugin list` shows either one from the old easyclaude ' +
  'marketplace, install it from mellu-mate, then uninstall the easyclaude copy. Tell me in one plain line whether it worked, ' +
  'and that the new version starts in a new session.'

const parts = (v: string): number[] => v.replace(/^v/, '').split(/[.+-]/).slice(0, 3).map((n) => Number(n) || 0)

// Whether version `a` is newer than `b`, number by number: 1.10.0 is newer than 1.9.3.
export function newer(a: string, b: string): boolean {
  const pa = parts(a), pb = parts(b)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

// The release GitHub's answer names, or null for anything but a published one.
export function latestFrom(text: string): { version: string; url: string } | null {
  try {
    const r = JSON.parse(text)
    if (!r || r.draft || r.prerelease || typeof r.tag_name !== 'string') return null
    const version = r.tag_name.replace(/^v/, '')
    if (!/^\d+\.\d+\.\d+/.test(version)) return null
    return { version, url: typeof r.html_url === 'string' ? r.html_url : 'https://github.com/kotaraa09/mellu-mate/releases' }
  } catch { return null }
}
