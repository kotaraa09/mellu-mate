// Run with `claude plugin test .` from the plugin root, like panels.test.tsx.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { latestFrom, newer, updateSteps } from './update'

const pane = {
  component: 'Pane' as const,
  requestId: 'mellu-controls',
  props: { title: 'controls', isFocused: false, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} } as any,
}

const RELEASE = JSON.stringify({ tag_name: 'v1.5.0', html_url: 'https://github.com/kotaraa09/mellu-mate/releases/tag/v1.5.0', draft: false, prerelease: false })

// A session with Mellu.mate 1.4.0 installed, and GitHub answering with `release`.
// The plugins installed, as Claude Code records them: the companions from the old easyclaude
// marketplace here, as a user who came from easyClaude has them.
const INSTALLED = ['mellu@mellu-mate', 'filetree@easyclaude', 'blast-radius@mellu-mate']

const world = (on: On, { release = RELEASE, env = {} as Record<string, string> } = {}) => {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  mock.env(on, env)
  const fetched: string[] = []
  on('http.fetch', async (_$, e: any) => { fetched.push(String(e.url)); return { value: { status: 200, ok: true, headers: {}, text: release } } as any })
  on('fs.read', async (_$, e: any) => {
    if (/installed_plugins\.json$/.test(String(e.path))) {
      return { value: JSON.stringify({ version: 2, plugins: Object.fromEntries(INSTALLED.map((id) => [id, [{ scope: 'user' }]])) }) } as any
    }
    if (/plugin\.json$/.test(String(e.path))) return { value: JSON.stringify({ name: 'mellu', version: '1.4.0' }) } as any
    throw new Error(`not found: ${e.path}`)
  })
  on('fs.exists', async () => ({ value: true }) as any)
  on('session.root', async () => ({ value: '/p' }) as any)
  on('session.usage', async () => ({ value: { startedAt: 0, rateLimits: [], cost: { usd: 0 }, context: { tokens: 1000, window: 200_000, percent: 1 } } }) as any)
  return fetched
}

// The check runs in the background the first time the panel draws; the next drawing shows it.
const drawn = async ($: any) => {
  const first = await $.ui.mount({ plugin: 'mellu', surface: 'terminal', ...pane })
  await first.unmount()
  return $.ui.mount({ plugin: 'mellu', surface: 'terminal', ...pane })
}

describe('the update button', () => {
  test('versions compare by number, not as text', () => {
    expect(newer('1.10.0', '1.9.3')).toBe(true)
    expect(newer('1.4.0', '1.4.0')).toBe(false)
    expect(newer('1.4.0', '1.5.0')).toBe(false)
  })

  test('only a published release counts: no draft, no pre-release', () => {
    expect(latestFrom(RELEASE)).toEqual({ version: '1.5.0', url: 'https://github.com/kotaraa09/mellu-mate/releases/tag/v1.5.0' })
    expect(latestFrom(JSON.stringify({ tag_name: 'v1.6.0', prerelease: true }))).toBe(null)
    expect(latestFrom('not json')).toBe(null)
  })

  test('a newer release shows a button, and pressing it runs the update itself', async ($, on) => {
    world(on)
    const ran: string[] = []
    on('process.run', async (_$, e: any) => { ran.push(e.argv.join(' ')); return { value: { exitCode: 0, stdout: '', stderr: '' } } as any })
    const ui = await drawn($)
    expect(await ui.find({ type: 'Text', text: /Mellu\.mate 1\.5\.0 is out/ })).toBeDefined()
    await ui.press({ key: 'update' })
    await ui.unmount()
    // The old file tree is replaced by the new one; Blast Radius is updated; nothing else runs.
    expect(ran).toEqual([
      'claude plugin marketplace update mellu-mate',
      'claude plugin update mellu@mellu-mate',
      'claude plugin install filetree@mellu-mate',
      'claude plugin uninstall filetree@easyclaude',
      'claude plugin update blast-radius@mellu-mate',
    ])
    // A companion the user never installed is not added.
    expect(updateSteps(['mellu@mellu-mate']).map((x) => x.join(' '))).toEqual(['claude plugin marketplace update mellu-mate', 'claude plugin update mellu@mellu-mate'])
    const after = await $.ui.mount({ plugin: 'mellu', surface: 'terminal', ...pane })
    expect(await after.find({ type: 'Text', text: /Start a new session/ })).toBeDefined()
    expect(await after.find({ key: 'update' })).toBeUndefined()
    await after.unmount()
  })

  test('a failed update says so, and offers to ask Claude instead', async ($, on) => {
    world(on)
    on('process.run', async () => { throw new Error('claude: not found') })
    const sent: string[] = []
    on('prompt.submit', async (_$, e: any) => { sent.push(e.text); return { text: e.text } as any })
    const ui = await drawn($)
    await ui.press({ key: 'update' })
    await ui.unmount()
    const after = await $.ui.mount({ plugin: 'mellu', surface: 'terminal', ...pane })
    expect(await after.find({ type: 'Text', text: /did not finish/ })).toBeDefined()
    await after.press({ key: 'update-ask' })
    await after.unmount()
    expect(sent.length).toBe(1)
    expect(sent[0]).toMatch(/claude plugin update mellu@mellu-mate/)
  })

  test('the same version, or updates turned off, shows nothing and asks GitHub nothing', async ($, on) => {
    const fetched = world(on, { env: { DISABLE_UPDATES: '1' } })
    const ui = await drawn($)
    expect(await ui.find({ key: 'update' })).toBeUndefined()
    await ui.unmount()
    expect(fetched).toEqual([])
  })
})
