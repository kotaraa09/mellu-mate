// Run with `claude plugin test .` from the plugin root, like panels.test.tsx.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { changedFrom, isChanged, matches, parseFeatures } from './features'

const pane = {
  component: 'Pane' as const,
  requestId: 'mellu-features',
  props: { title: 'Your app', isFocused: false, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} } as any,
}

const LIST = `# Your app

## Cart
Holds the plants a shopper picked.
- icon: 🛒
- files: src/cart.js, src/cart/**
- tests: tests/cart.test.js

## Checkout
Takes the address and the payment.
- icon: 💳
- icon: far-too-long
- files: \`src/checkout.js\`
- tests: tests/checkout.test.js, tests/pay.test.js

## Admin page
Lets you mark plants sold out.
- files: admin/
`

// A project with `list` as its feature file and `status` as what git reports changed.
const world = (on: On, { list = LIST as string | null, status = ' M src/cart/badge.js\n' } = {}) => {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('session.root', async () => ({ value: '/p' }) as any)
  on('fs.read', async (_$, e: any) => {
    if (list !== null && /docs[\\/]FEATURES\.md$/.test(String(e.path))) return { value: list } as any
    throw new Error(`not found: ${e.path}`)
  })
  on('process.run', async () => ({ value: { exitCode: 0, stdout: status, stderr: '' } }) as any)
}

describe('the feature map', () => {
  test('reads each feature, its line, its files and its tests', () => {
    const f = parseFeatures(LIST)
    expect(f.map((x) => x.name)).toEqual(['Cart', 'Checkout', 'Admin page'])
    expect(f[0].about).toBe('Holds the plants a shopper picked.')
    expect(f.map((x) => x.icon)).toEqual(['🛒', '💳', '•'])
    expect(f[1].files).toEqual(['src/checkout.js'])
    expect(f[1].tests).toEqual(['tests/checkout.test.js', 'tests/pay.test.js'])
    expect(f[2].tests).toEqual([])
  })

  test('a pattern matches as the file writes it', () => {
    expect(matches('src/cart/**', 'src/cart/badge/view.js')).toBe(true)
    expect(matches('src/*.js', 'src/cart.js')).toBe(true)
    expect(matches('src/*.js', 'src/cart/badge.js')).toBe(false)
    expect(matches('admin/', 'admin/index.html')).toBe(true)
    expect(matches('src/cart.js', 'src/cart.json')).toBe(false)
    expect(matches('src/a.b', 'src/axb')).toBe(false)
  })

  test('changed files come from git, renames by their new name', () => {
    expect(changedFrom(' M src/a.js\n?? new.js\nR  old.js -> src/b.js\n')).toEqual(['src/a.js', 'new.js', 'src/b.js'])
    const [cart, checkout] = parseFeatures(LIST)
    expect(isChanged(cart, ['src/cart/badge.js'])).toBe(true)
    expect(isChanged(checkout, ['src/cart/badge.js'])).toBe(false)
    expect(isChanged(checkout, ['tests/pay.test.js'])).toBe(true)
  })

  test('the pane marks the changed feature, and a press shows what it does', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ plugin: 'mellu', surface: 'terminal', ...pane })
    expect(await ui.find({ type: 'Text', text: /3 features · 1 changed/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Changed' })).toBeDefined()
    await ui.press({ key: 'b-Checkout' })
    await ui.unmount()
    const after = await $.ui.mount({ plugin: 'mellu', surface: 'terminal', ...pane })
    expect(await after.find({ type: 'Text', text: 'Takes the address and the payment.' })).toBeDefined()
    expect(await after.find({ type: 'Text', text: /2 test files check it/ })).toBeDefined()
    expect(await after.find({ type: 'Text', text: /Not changed since/ })).toBeDefined()
    await after.unmount()
  })

  test('with no list, one press asks Claude to write it, and a second press sends nothing', async ($, on) => {
    world(on, { list: null })
    const sent: string[] = []
    on('prompt.submit', async (_$, e: any) => { sent.push(e.text); return { text: e.text } as any })
    const ui = await $.ui.mount({ plugin: 'mellu', surface: 'terminal', ...pane })
    expect(await ui.find({ type: 'Text', text: 'No feature list yet' })).toBeDefined()
    await ui.press({ key: 'make-list' })
    await ui.press({ key: 'make-list' })
    await ui.unmount()
    expect(sent.length).toBe(1)
    expect(sent[0]).toMatch(/docs\/FEATURES\.md/)
    expect(sent[0]).toMatch(/Change no other file/)
  })
})
