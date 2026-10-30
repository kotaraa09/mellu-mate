// The feature map: the user's app as a list of what it does, not of its files.
//
// A beginner thinks in features - "the cart", "checkout", "sold out" - and the file tree shows
// files. Claude keeps the list in docs/FEATURES.md (plan-feature adds a feature, build-task
// keeps its files and tests up to date), and this pane draws it: each feature, a mark on the
// ones whose files changed since the last saved version, a mark on the ones whose tests passed
// after that change, and what a feature does when it is pressed. Like the other panels it runs outside the model, so it adds nothing to a request.
//
// The file, one feature a section:
//
//   ## Cart
//   Holds the plants a shopper picked.
//   - icon: 🛒
//   - files: src/cart.js, src/cart/**
//   - tests: tests/cart.test.js
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

export const FEATURES = 'mellu-features'
// The tab is the icon alone, as the control panel's tab is.
const FEATURES_TITLE = '☰'
export const FEATURES_FILE = 'docs/FEATURES.md'
export const FEATURES_DESCRIPTION = 'Open the list of what your app does'

// The feature whose details show, by name.
const picked = atom({ plugin: 'mellu', key: 'featurePicked' } as const, null)
// One "make the list" request at a time: a double click must not cost two turns.
let askedAt = 0

export type Feature = { name: string; icon: string; about: string; files: string[]; tests: string[] }

// A feature with no icon line, or with more than a symbol on it, gets a dot.
export const DEFAULT_ICON = '•'

const listOf = (s: string): string[] => s.split(',').map((x) => x.trim().replace(/^`|`$/g, '')).filter(Boolean)

export function parseFeatures(md: string): Feature[] {
  const out: Feature[] = []
  let f: Feature | null = null
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim()
    const head = /^##\s+(.+)$/.exec(line)
    if (head) { f = { name: head[1].trim(), icon: DEFAULT_ICON, about: '', files: [], tests: [] }; out.push(f); continue }
    if (!f || !line || line.startsWith('#') || line.startsWith('<!--')) continue
    const icon = /^[-*]\s*icon\s*:\s*(\S+)\s*$/i.exec(line)
    if (icon) { if ([...icon[1]].length <= 2) f.icon = icon[1]; continue }
    const field = /^[-*]\s*(files|tests)\s*:\s*(.*)$/i.exec(line)
    if (field) { f[field[1].toLowerCase() as 'files' | 'tests'].push(...listOf(field[2])); continue }
    if (!f.about) f.about = line
  }
  return out
}

// A path pattern as the file writes it: `*` within a folder, `**` across folders, a folder
// name alone for everything in it.
export function matches(pattern: string, path: string): boolean {
  const p = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
  const f = path.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!/[*?]/.test(p)) return f === p || f.startsWith(`${p}/`)
  const re = p.replace(/[.+^${}()|[\]]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]').replace(/\u0000/g, '.*')
  return new RegExp(`^${re}$`).test(f)
}

export const isChanged = (f: Feature, changed: ReadonlyArray<string>): boolean =>
  changed.some((c) => [...f.files, ...f.tests].some((p) => matches(p, c)))

// What the last check after a change covered, as scripts/verify.mjs records it: whether it
// passed, the changed files it saw, and per step which tests ran - every test ("all", within
// its "dir"), the listed files, or "unknown" where the test tool picked them.
export const CHECKS_FILE = '.claude/mellu-checks/last.json'
export type CheckStep = { name: string; dir?: string; passed: boolean; scope: 'all' | 'listed' | 'unknown'; tests?: string[] }
export type Checks = { at: number; passed: boolean; changed: string[] | null; steps: CheckStep[] }

export function parseChecks(text: string | null): Checks | null {
  if (!text) return null
  try {
    const c = JSON.parse(text)
    return c && typeof c.passed === 'boolean' && Array.isArray(c.steps) ? c : null
  } catch { return null }
}

// The record speaks for the change on screen only when it saw exactly these changed files.
// A file changed by hand after the check makes it stale, and then nothing is marked.
export const coversNow = (c: Checks | null, changed: ReadonlyArray<string>): boolean =>
  !!c && !!c.changed && changed.length > 0 && c.changed.length === changed.length &&
  changed.every((p) => c.changed!.includes(p))

const ranTest = (pattern: string, s: CheckStep): boolean => {
  if (!s.passed) return false
  if (s.scope === 'all') return !s.dir || pattern.replace(/^\.\//, '').startsWith(`${s.dir}/`)
  return s.scope === 'listed' && (s.tests ?? []).some((t) => matches(pattern, t))
}

// Checked: nothing in it changed, the last check covered this change and passed, and every one
// of its test files ran in a step that passed. A feature with no tests is never Checked.
export const isChecked = (f: Feature, changed: ReadonlyArray<string>, c: Checks | null): boolean =>
  !!c && c.passed && coversNow(c, changed) && f.tests.length > 0 && !isChanged(f, changed) &&
  f.tests.every((p) => c.steps.some((s) => ranTest(p, s)))

// The files git sees as changed since the last commit, new ones included. `git status
// --porcelain` puts a rename as "old -> new"; the new name is the one that exists.
export function changedFrom(porcelain: string): string[] {
  return porcelain.split(/\r?\n/).filter((l) => l.length > 3)
    .map((l) => l.slice(3).split(' -> ').pop()!.replace(/^"|"$/g, ''))
}

const MAKE_LIST = `Write ${FEATURES_FILE}: the features this app has, as its user would name them, ` +
  'from the code. One "## <feature>" section each, then one plain line on what it does, then ' +
  '"- icon:" with one emoji that shows it, then "- files:" and "- tests:" lines with the paths or patterns that belong to it. Three to twelve ' +
  'features. Change no other file, and tell me in one plain line what you wrote.'

export const register: Register = (on) => {
  on('command.run', { command: FEATURES }, async ($) => {
    void $.ui.open({ id: FEATURES, title: FEATURES_TITLE })
    return { text: 'Feature list opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: FEATURES }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    let root = ''
    try { root = await $.session.root() } catch { /* no project: the empty list below */ }
    const [md, porcelain, name, checksText] = await Promise.all([
      $.fs.read(`${root}/${FEATURES_FILE}`).then(String, () => null),
      $.process.run(['git', 'status', '--porcelain', '--untracked-files=all'], { cwd: root, timeoutMs: 5000 })
        .then((r: any) => (r.exitCode === 0 ? String(r.stdout ?? '') : ''), () => ''),
      read($, picked),
      $.fs.read(`${root}/${CHECKS_FILE}`).then(String, () => null),
    ])
    const features = md === null ? [] : parseFeatures(md)
    if (!features.length) {
      const ask = async () => {
        const now = await $.clock.now()
        if (now - askedAt < 60_000) return
        askedAt = now
        void $.prompt.submit({ text: MAKE_LIST, asUser: true }).catch(() => undefined)
      }
      return (
        <Box flexDirection="column" paddingX={1} gap={1}>
          <Text bold>No feature list yet</Text>
          <Text color="subtle" wrap="wrap">Claude adds each feature here when it plans one. For an app that already exists, Claude can write the list from the code. That uses one message and changes no code.</Text>
          <Box><Button key="make-list" variant="primary" label="Make the list" onPress={ask} /></Box>
        </Box>
      )
    }
    const changed = changedFrom(porcelain)
    const touched = features.filter((f) => isChanged(f, changed)).length
    const checks = parseChecks(checksText)
    const checked = features.filter((f) => isChecked(f, changed, checks)).length
    const failedNow = !!checks && !checks.passed && coversNow(checks, changed)
    const open = features.find((f) => f.name === name) ?? null
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text color="subtle" wrap="wrap">
          {`${features.length} features${touched ? ` · ${touched} changed since the last saved version` : ''}${checked ? ` · ${checked} checked` : ''}`}
        </Text>
        {failedNow && <Text color="error" wrap="wrap">The last check after this change failed, so nothing is marked Checked.</Text>}
        <Box flexDirection="column">
          {features.map((f) => {
            const isOn = isChanged(f, changed)
            return (
              <Box key={`f-${f.name}`} justifyContent="space-between" alignItems="center" gap={1}>
                <Button key={`b-${f.name}`} plain label={`${f.icon} ${f.name}`}
                  onPress={() => update($, picked, (cur) => (cur === f.name ? null : f.name))} />
                {isOn && <Text color="suggestion">Changed</Text>}
                {!isOn && isChecked(f, changed, checks) && <Text color="success">Checked</Text>}
              </Box>
            )
          })}
        </Box>
        {open && (
          <Box key="details" flexDirection="column" borderStyle="round" borderColor="promptBorder" paddingX={1}>
            <Text bold wrap="wrap">{open.name}</Text>
            {open.about && <Text wrap="wrap">{open.about}</Text>}
            <Text color="subtle" wrap="wrap">
              {isChanged(open, changed) ? 'Changed since the last saved version.'
                : isChecked(open, changed, checks) ? 'Not changed, and its tests passed after the last change.'
                  : 'Not changed since the last saved version.'}
            </Text>
            <Text color="subtle" wrap="wrap">
              {open.tests.length ? `${open.tests.length} test ${open.tests.length === 1 ? 'file checks' : 'files check'} it after each change.` : 'No test checks it yet.'}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
