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

// What the button runs: the marketplace's listing first, then Mellu.mate, then its two
// companions. A companion that is not installed fails its step, and nothing more.
export const PLUGIN_STEP = ['claude', 'plugin', 'update', 'mellu@mellu-mate']
export const UPDATE_STEPS: string[][] = [
  ['claude', 'plugin', 'marketplace', 'update', 'mellu-mate'],
  PLUGIN_STEP,
  ['claude', 'plugin', 'update', 'filetree@mellu-mate'],
  ['claude', 'plugin', 'update', 'blast-radius@mellu-mate'],
]

// What the panel sends Claude when the button's own update did not finish.
export const ASK_CLAUDE = 'Update the Mellu.mate plugin for me. Run `claude plugin marketplace update mellu-mate`, ' +
  'then `claude plugin update mellu@mellu-mate`, `claude plugin update filetree@mellu-mate` and ' +
  '`claude plugin update blast-radius@mellu-mate`. Tell me in one plain line whether it worked, ' +
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
