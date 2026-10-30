// The estimate's part in a session: the status line while the user types, the estimate kept
// on the request when it is sent, and the request's real figures saved when it ends. The
// rules themselves are in estimate.ts, which has no engine in it, so scripts can use them.
//
// Claude Code takes one hook per event from a plugin, so panels.tsx hooks prompt.edit,
// prompt.submit and turn.complete, and calls in here for this part.
import type { Kind, LimitReading, PastRequest, Request, ShownEstimate } from '../types'
import { DEFAULTS } from './estimate-defaults'
import { HISTORY_DIR, HISTORY_FILE, beforeLine, estimate, fiveHourOf, parseHistory, requestKind, shareOf, withRequest } from './estimate'

// How long the draft must stay still before the line changes: one change per key made it
// flicker, and a half-second pause is where a word ends.
export const SETTLE_MS = 500

// Read once a session, and kept in step with each write: the file is the project's, and
// nothing else writes it.
let history: PastRequest[] | null = null
let settle: { cancel: () => void } | null = null

async function projectRoot($: any): Promise<string | null> {
  try { return await $.session.root() } catch { return null }
}

export async function loadHistory($: any): Promise<PastRequest[]> {
  if (history) return history
  const root = await projectRoot($)
  let text: string | null = null
  if (root) try { text = String(await $.fs.read(`${root}/${HISTORY_FILE}`)) } catch { /* none yet */ }
  history = parseHistory(text)
  return history
}

// For a test, and for a session that starts over in another project.
export const forgetHistory = () => { history = null }

const limitsOf = (u: any): LimitReading[] =>
  Array.isArray(u?.rateLimits)
    ? u.rateLimits
      .filter((l: any) => l && typeof l.kind === 'string' && typeof l.percentUsed === 'number')
      .map((l: any) => ({ kind: l.kind, percentUsed: l.percentUsed, ...(l.resetsAt ? { resetsAt: l.resetsAt } : {}) }))
    : []

async function readLimits($: any): Promise<LimitReading[]> {
  try { return limitsOf(await $.session.usage()) } catch { return [] }
}

async function modelOf($: any): Promise<string> {
  try { return String(await $.session.model()) } catch { return '' }
}

// The estimate for these words, with the window as it reads now.
export async function estimateFor($: any, text: string): Promise<{ kind: Kind | null; estimate: ShownEstimate | null; limits: LimitReading[] }> {
  const kind = requestKind(text)
  if (!kind) return { kind: null, estimate: null, limits: [] }
  const [past, model, limits] = await Promise.all([loadHistory($), modelOf($), readLimits($)])
  return { kind, estimate: estimate(kind, past, DEFAULTS, model), limits }
}

// The draft changed. Once it settles, the status line shows what a request like it usually
// costs; with no words left, `restore` puts back the line about the last request. While a
// request runs the line is that request's, and a draft typed meanwhile leaves it alone.
export function draftChanged($: any, text: string, isRunning: () => Promise<boolean>, restore: () => void) {
  settle?.cancel()
  settle = $.clock.after(SETTLE_MS, () => {
    settle = null
    void (async () => {
      if (await isRunning()) return
      const { kind, estimate: e, limits } = await estimateFor($, text)
      if (!kind) return restore()
      $.ui.status(beforeLine(kind, e, limits))
    })().catch(() => undefined)
  })
}

// The request is on its way: a draft still settling must not take the line from it.
export const cancelDraft = () => {
  settle?.cancel()
  settle = null
}

// What a request keeps from the moment it is sent: its kind, the estimate the user saw, and
// the 5-hour window, for its share at the end.
export async function atSubmit($: any, text: string): Promise<Pick<Request, 'kind' | 'estimate' | 'limitAtStart'>> {
  cancelDraft()
  const { kind, estimate: e, limits } = await estimateFor($, text)
  return { kind, estimate: e, limitAtStart: fiveHourOf(limits) }
}

// The request ended: its real figures join the project's history. A request with no kind (a
// command) or no cost has nothing to add, and an interrupted one is left out: what it cost
// says nothing about what the request would have cost.
export async function atEnd($: any, r: Request, spentUsd: number | null, endedAt: number, isAborted: boolean): Promise<void> {
  if (!r.kind || spentUsd === null || isAborted) return
  const [past, model, limits, root] = await Promise.all([loadHistory($), modelOf($), readLimits($), projectRoot($)])
  if (!root) return
  const entry: PastRequest = {
    at: r.startedAt, kind: r.kind, usd: Math.round(spentUsd * 10_000) / 10_000, ms: endedAt - r.startedAt, model,
    fiveHour: shareOf(r.limitAtStart ?? null, fiveHourOf(limits)),
  }
  history = withRequest(past, entry)
  try {
    await $.fs.write(`${root}/${HISTORY_DIR}/.gitignore`, '# Mellu.mate: what your requests cost. Yours alone, never saved in a version.\n*\n')
    await $.fs.write(`${root}/${HISTORY_FILE}`, JSON.stringify(history, null, 1) + '\n')
  } catch { /* a read-only project keeps the history for this session only */ }
}
