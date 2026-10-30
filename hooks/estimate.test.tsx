// Run with `claude plugin test .` from the plugin root, beside panels.test.tsx.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { afterFigures, beforeLine, estimate, minutesRange, moneyRange, parseHistory, priced, quantile, requestKind, shareOf, shareRange, withRequest } from './estimate'
import type { DefaultRun } from './estimate'
import { DEFAULTS } from './estimate-defaults'
import { forgetHistory, SETTLE_MS } from './estimate-hooks'
import type { PastRequest } from '../types'

// To the hundredth: figures summed in floating point miss by a hair.
const near = (x: number | undefined): number | undefined => (x === undefined ? x : Math.round(x * 100) / 100)

const past = (kind: PastRequest['kind'], usd: number, ms = 120_000, fiveHour: number | null = null, at = usd * 1e6): PastRequest =>
  ({ at, kind, usd, ms, model: 'claude-opus-5-5', fiveHour })

describe('the kind of request', () => {
  test('reads a bug, a feature, a rename, a page change and a question from plain words', () => {
    expect(requestKind('When someone pays without a code, the checkout breaks')).toBe('bug')
    expect(requestKind('When I click the Pay button, nothing happens. Please fix it')).toBe('bug')
    expect(requestKind('Please add a way to mark a plant as sold out')).toBe('feature')
    expect(requestKind("Please change the shop's name from Plant Corner to Green Corner")).toBe('rename')
    expect(requestKind('make the header text bigger and blue')).toBe('page')
    expect(requestKind('how does the cart total work?')).toBe('question')
    expect(requestKind('ช่วยเปลี่ยนชื่อร้านเป็น Green Corner')).toBe('rename')
  })

  test('says nothing for a command or a draft too short to tell', () => {
    expect(requestKind('/mellu:ship')).toBe(null)
    expect(requestKind('fix')).toBe(null)
    expect(requestKind('')).toBe(null)
  })
})

describe('the range', () => {
  test('is the 10th to the 90th percentile of the last requests of the kind', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(near(quantile([1, 2, 3, 4, 5], 0.1))).toBe(1.4)
    const own = [0.1, 0.2, 0.3, 0.4, 0.5].map((u) => past('bug', u))
    const e = estimate('bug', own, [], 'claude-opus-5-5')
    expect(e?.source).toBe('own')
    expect(near(e?.usd[0])).toBe(0.14)
    expect(near(e?.usd[1])).toBe(0.46)
  })

  test('comes from the test runs, priced at the model, with fewer than five of the project', () => {
    const runs: DefaultRun[] = [1, 2, 3].map(() => ({ kind: 'rename', tokens: [0, 10_000, 0, 0, 0], otherUsd: 0, ms: 60_000 }))
    const four = [1, 2, 3, 4].map((u) => past('rename', u))
    const e = estimate('rename', four, runs, 'claude-sonnet-5')
    expect(e?.source).toBe('tests')
    // 10,000 output tokens at Sonnet's $10 a million.
    expect(e?.usd).toEqual([0.1, 0.1])
    expect(near(estimate('rename', four, runs, 'claude-opus-5-5')?.usd[0])).toBe(0.2)
    expect(estimate('page', [], runs, 'claude-sonnet-5')).toBe(null)
  })

  test('prices an hour of cache at twice the input, as Claude Code keeps it', () => {
    expect(near(priced('claude-sonnet-5', { kind: 'bug', tokens: [0, 0, 0, 0, 1e6], otherUsd: 0.5, ms: 0 }))).toBe(4.5)
    expect(near(priced('claude-sonnet-5', { kind: 'bug', tokens: [0, 0, 0, 1e6, 0], otherUsd: 0, ms: 0 }))).toBe(2.5)
  })

  test('has a share of the 5-hour limit only from five of the project own readings', () => {
    const four = [0.1, 0.2, 0.3, 0.4, 0.5].map((u, i) => past('bug', u, 60_000, i < 4 ? 2 : null))
    expect(estimate('bug', four, [], 'x')?.fiveHour).toBe(null)
    const five = [0.1, 0.2, 0.3, 0.4, 0.5].map((u, i) => past('bug', u, 60_000, i + 1))
    expect(near(estimate('bug', five, [], 'x')?.fiveHour?.[1])).toBe(4.6)
  })

  test('has test runs for the kinds the benchmark covers', () => {
    for (const kind of ['bug', 'feature', 'rename'] as const) expect(estimate(kind, [], DEFAULTS, 'claude-opus-5-5')).not.toBe(null)
  })
})

describe('the words', () => {
  test('round outward, and say a tiny figure plainly', () => {
    expect(moneyRange([0.234, 0.391])).toBe('$0.23-0.40')
    expect(moneyRange([0.001, 0.004])).toBe('under $0.01')
    expect(minutesRange([20_000, 50_000])).toBe('under 1 min')
    expect(minutesRange([20_000, 170_000])).toBe('under 3 min')
    expect(minutesRange([190_000, 350_000])).toBe('3-6 min')
    expect(shareRange([0, 0.4])).toBe('under 1%')
    expect(shareRange([1.2, 3.6])).toBe('1-4%')
  })

  test('say where the estimate comes from, and the limit only when there is one', () => {
    const own = [0.2, 0.25, 0.3, 0.35, 0.4].map((u, i) => past('bug', u, 240_000, i + 2))
    const e = estimate('bug', own, [], 'x')
    expect(beforeLine('bug', e, [{ kind: 'five_hour', percentUsed: 26 }]))
      .toBe('Mellu.mate: bug fix, usually $0.22-0.38, 4 min, about 2-6% of your 5-hour limit (now 26%)')
    const tests = estimate('rename', [], DEFAULTS, 'claude-opus-5-5')
    expect(beforeLine('rename', tests, [])).toMatch(/^Mellu\.mate: rename, usually \$[\d.]+-[\d.]+, .* \(from test runs: yours after 5 renames\)$/)
    expect(beforeLine('page', null, [])).toBe('Mellu.mate: page change, no estimate yet. It shows after 5 page changes in this project')
  })

  test('put the real cost beside the usual range after the request', () => {
    const e = estimate('bug', [0.2, 0.25, 0.3, 0.35, 0.4].map((u) => past('bug', u)), [], 'x')
    expect(afterFigures(0.31, e)).toBe('$0.31 (usual $0.22-0.38)')
    expect(afterFigures(0.9, e)).toBe('$0.90 (usual $0.22-0.38, above)')
    expect(afterFigures(0.31, null)).toBe('$0.31')
    expect(afterFigures(null, e)).toBe('')
  })
})

describe('the history', () => {
  test('keeps a request once, and the share of the limit only within one window', () => {
    let list = withRequest([], past('bug', 0.2, 1, null, 5))
    list = withRequest(list, past('bug', 0.3, 1, null, 5))
    expect(list.map((p) => p.usd)).toEqual([0.3])
    expect(parseHistory('not json')).toEqual([])
    expect(parseHistory('[{"kind":"bug"}]')).toEqual([])
    const at = '2026-10-30T06:50:00.000Z'
    expect(shareOf({ kind: 'five_hour', percentUsed: 26, resetsAt: at }, { kind: 'five_hour', percentUsed: 29, resetsAt: at })).toBe(3)
    expect(shareOf({ kind: 'five_hour', percentUsed: 80, resetsAt: at }, { kind: 'five_hour', percentUsed: 2, resetsAt: 'later' })).toBe(null)
    expect(shareOf(null, { kind: 'five_hour', percentUsed: 2 })).toBe(null)
  })
})

// A session: the project folder, its files, the model, and the figures the engine reports.
const session = (on: On, files: Record<string, string>, figures: { usd: () => number; five: () => number }) => {
  forgetHistory()
  const clock = mock.clock(on, { now: 1_000_000 })
  const status: (string | undefined)[] = []
  on('ui.status', async (_$, e: any) => { status.push(e.text); return { value: undefined } as any })
  on('session.root', async () => ({ value: '/p' }) as any)
  on('session.model', async () => ({ value: 'claude-opus-5-5' }) as any)
  on('fs.exists', async () => ({ value: false }) as any)
  on('session.usage', async () => ({ value: { startedAt: 0, cost: { usd: figures.usd() },
    rateLimits: [{ kind: 'five_hour', percentUsed: figures.five(), resetsAt: '2026-10-30T06:50:00.000Z' }],
    context: { tokens: 1000, window: 200_000, percent: 1 } } }) as any)
  on('fs.read', async (_$, e: any) => {
    const rel = String(e.path).replace(/\\/g, '/').replace(/^([A-Za-z]:)?\/p\//, '')
    if (rel in files) return { value: files[rel] } as any
    throw new Error(`not found: ${e.path}`)
  })
  on('fs.write', async (_$, e: any) => {
    files[String(e.path).replace(/\\/g, '/').replace(/^([A-Za-z]:)?\/p\//, '')] = e.text
    return { value: undefined } as any
  })
  on('prompt.edit', async (_$, e: any) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }) as any)
  on('prompt.submit', async (_$, e: any) => ({ text: e.text }) as any)
  on('turn.complete', async () => ({ text: '' }) as any)
  // What the band shows with nothing of Mellu.mate's: the engine draws it in a session.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return { clock, status }
}
const type = ($: any, before: string, typed: string) =>
  $.prompt.edit({ origin: { kind: 'composer' }, text: before, cursor: before.length, start: before.length, end: before.length, inputText: typed })

describe('in a session', () => {
  test('the status line shows the estimate once the draft settles, before Enter', async ($, on) => {
    const { clock, status } = session(on, {}, { usd: () => 0, five: () => 26 })
    await type($, '', 'the checkout breaks when I pay')
    expect(status.some((s) => s?.includes('bug fix'))).toBe(false)
    await clock.advance(SETTLE_MS)
    expect(status[status.length - 1]).toMatch(/^Mellu\.mate: bug fix, usually \$[\d.]+-[\d.]+, .*5-hour limit now 26% \(from test runs: yours after 5 bug fixes\)$/)
    // Emptied, the line goes back to what it said before.
    await $.prompt.edit({ origin: { kind: 'composer' }, text: 'the checkout breaks when I pay', cursor: 0, start: 0, end: 30, inputText: '' })
    await clock.advance(SETTLE_MS)
    expect(status[status.length - 1]).toBe(undefined)
  })

  test('a finished request joins the history, and the bar shows its cost beside the estimate', async ($, on) => {
    let usd = 1
    let five = 26
    const files: Record<string, string> = {}
    const { clock } = session(on, files, { usd: () => usd, five: () => five })
    await $.prompt.submit({ text: 'the checkout breaks when I pay' } as any)
    await clock.advance(1000)
    usd = 1.31
    five = 29
    await clock.advance(239_000)
    await $.turn.complete({ reason: 'answer', answer: 'Fixed.', durationMs: 1000, isAborted: false, turnId: 't1' } as any)
    await clock.advance(10)
    const saved = parseHistory(files['.claude/mellu-costs/requests.json'] ?? null)
    expect(saved.length).toBe(1)
    expect(saved[0]?.kind).toBe('bug')
    expect(near(saved[0]?.usd)).toBe(0.31)
    expect(saved[0]?.ms).toBe(240_000)
    expect(saved[0]?.fiveHour).toBe(3)
    expect(files['.claude/mellu-costs/.gitignore']).toMatch(/^\*$/m)
    // The bar's figure: the real cost beside the range shown before, and the time it took.
    const ui = await $.ui.mount({ plugin: 'mellu', surface: 'terminal', component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} } as any })
    expect(await ui.find({ type: 'Text', text: /^\$0\.31 \(usual \$[\d.]+-[\d.]+(, (above|below))?\) · 4m 0s$/ })).toBeDefined()
    await ui.unmount()
  })

  test('an interrupted request is not kept', async ($, on) => {
    const files: Record<string, string> = {}
    const { clock } = session(on, files, { usd: () => 1, five: () => 26 })
    await $.prompt.submit({ text: 'the checkout breaks when I pay' } as any)
    await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1000, isAborted: true, turnId: 't1' } as any)
    await clock.advance(10)
    expect(files['.claude/mellu-costs/requests.json']).toBe(undefined)
  })
})
