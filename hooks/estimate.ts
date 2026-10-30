// What a request will cost, shown before Claude starts it, and what it did cost, shown after.
//
// A beginner fears a large bill, and could not know what a request would cost until it had
// run. Claude Code tells a plugin each change to the draft in the prompt box, so the estimate
// is on the status line while the user types, before Enter: they can still change or shorten
// the request. It is worked out here from the words alone, with no model call, so it costs
// nothing.
//
// The range is what this project's own requests of the same kind cost: the 10th to the 90th
// percentile of the last 30, so about 8 in 10 land inside it. With fewer than five of them it
// comes from the benchmark's runs (estimate-defaults.ts), priced at the session's model, and
// the line says so. The share of the 5-hour limit comes only from the project's own requests:
// Anthropic publishes no limit in dollars, and the plan behind the limit differs per person,
// so no dollar figure is turned into a percent.
//
// The limits are the account's, not the session's: other sessions and claude.ai move them too.
// A request's share is the change across it, kept only when the window did not reset in
// between, and the line says "about".
import type { Kind, LimitReading, PastRequest, ShownEstimate } from '../types'

// --- the kind of request, from its words ------------------------------------------------
// The bug and feature tests are prompt-check.mjs's own, copied: a hooks module has no Node,
// and prompt-check.mjs loads node:fs. tests/scripts.test.mjs holds the two to the same answer
// on a list of requests, so one cannot change without the other failing.
const WRAPPED = /<(system-reminder|task-notification|agent-message)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const userWords = (prompt: string): string => String(prompt ?? '').replace(WRAPPED, ' ').trim()

const BUG_REPORT = new RegExp([
  /(?<![a-z])(bugs?|broken|breaks?|crash(es|ed|ing)?|errors?|exceptions?|fail(s|ed|ing)?|wrong)(?![a-z])/.source,
  /(?<![a-z])(doesn'?t|does not|isn'?t|is not|won'?t|stopped|not) work/.source,
  'พัง', 'ไม่ทำงาน', 'ใช้ไม่ได้', 'ใช้งานไม่ได้', 'บั๊ก', 'ผิดพลาด',
  /(?<!งาน|ที่|เรื่อง)ค้าง(?!ไว้|คา)/.source,
].join('|'), 'i')
const ASKS_FOR_ERROR = new RegExp([
  /(?:^|[.!?\n])\s*(?:(?:also|and|then|please|let's|can you|could you|would you|i want you to|i'd like you to)\s+)*(?:add|show|display|create|write|handle|return|throw|raise|log)\s+(?:(?:a|an|the|some|any|more|better|clear|clearer|friendly|helpful|proper|nice|nicer|custom|inline|validation)\s+){0,3}errors?(?![a-z])[^.!?\n]*/.source,
  /^\s*(?:ช่วย|รบกวน)?\s*(?:เพิ่ม|ใส่|ให้แสดง|ทำให้แสดง)[^.!?\n]*?(?:errors?|ผิดพลาด)[^.!?\n]*/.source,
].join('|'), 'gi')
export const looksLikeBug = (prompt: string): boolean => {
  const words = userWords(prompt)
  return !/^\s*\//.test(words) && BUG_REPORT.test(words.replace(ASKS_FOR_ERROR, ' '))
}
const FEATURE = new RegExp([
  /(?<![a-z])(add|adding|build|create|implement|support|allow|enable|let (me|users?|shoppers?|customers?|people|visitors?)|i (want|need|would like|'d like)|we need|can you make|could you make)(?![a-z])/.source,
  'เพิ่ม', 'อยากให้มี', 'อยากได้', 'ทำระบบ', 'สร้าง',
].join('|'), 'i')
const NOT_A_FEATURE = /(?<![a-z])(add|write|create)\s+(a |an |some |more )?(tests?|comments?|docs?|documentation|logging|logs?|types?)(?![a-z])/i
export const asksForFeature = (prompt: string): boolean => {
  const words = userWords(prompt)
  return !/^\s*\//.test(words) && !/\?\s*$/.test(words) && FEATURE.test(words) &&
    !NOT_A_FEATURE.test(words) && !looksLikeBug(words)
}

// Our own three. A rename comes before the bug test: "rename it, the name is wrong" is a
// rename. A page change is how something looks, asked without a new feature.
const RENAME = /(?<![a-z])(rename|renaming|retitle|change [^.?!]{0,30}(name|title)s? (from|to)|change (the|its|my|our) (name|title))(?![a-z])|เปลี่ยนชื่อ/i
const MAKE = /^\s*(please\s+|can you\s+|could you\s+)?make(?![a-z])|ทำให้/i
const PAGE = /(?<![a-z])(colou?rs?|fonts?|styles?|styling|layout|spacing|padding|margins?|bigger|smaller|wider|narrower|align(ed)?|cent(er|re)(ed)?|looks?|design|css|theme|dark mode|darker|lighter|bold|icons?)(?![a-z])|สี|ฟอนต์|ตัวอักษร|หน้าตา|ขนาด|ตำแหน่ง/i
// "When I click Pay, nothing happens. Please fix it" opens like a question and is a bug.
const QUESTION = /\?\s*$|^\s*(what|how|why|explain)(?![a-z])|ไหม\s*$|มั้ย\s*$|ทำไม/i
// A bug in words prompt-check.mjs has no need to catch: its line there is about a test, and
// these ask for a fix all the same.
const FIX = /(?<![a-z])(fix|nothing happens|does nothing|doesn'?t do anything|not showing|disappeared)(?![a-z])|แก้|ไม่ขึ้น/i

export const KIND_NAMES: Record<Kind, string> = {
  bug: 'bug fix', feature: 'new feature', page: 'page change', rename: 'rename', question: 'question', other: 'request',
}
// "after 5 bug fixes": the kind's name for more than one.
const PLURAL: Record<Kind, string> = {
  bug: 'bug fixes', feature: 'new features', page: 'page changes', rename: 'renames', question: 'questions', other: 'requests',
}

// The kind of request the words read as; null for a command, or too few words to tell.
export const requestKind = (text: string): Kind | null => {
  const words = userWords(text)
  if (!words || /^\s*\//.test(words)) return null
  // Thai has no spaces between words, so a short Thai draft counts by its length.
  const enough = words.split(/\s+/).length >= 3 || (/[฀-๿]/.test(words) && words.length >= 8)
  if (!enough) return null
  if (RENAME.test(words)) return 'rename'
  if (looksLikeBug(words) || FIX.test(words)) return 'bug'
  if (asksForFeature(words)) return 'feature'
  if (QUESTION.test(words)) return 'question'
  if (PAGE.test(words)) return 'page'
  // "Make the checker follow every rule": a beginner's way to ask for a feature, which
  // prompt-check.mjs leaves alone because its line there is for "add" and "build".
  if (MAKE.test(words)) return 'feature'
  return 'other'
}

// --- prices -----------------------------------------------------------------------------
// USD per million tokens: input, output, cache read, cache write. The engine reports tokens,
// not money, for a helper and for a benchmark run on another model, so those are estimates.
const PRICES: [RegExp, [number, number, number, number]][] = [
  [/fable|mythos/, [10, 50, 0.25, 12.5]],
  [/opus-5-5/, [4, 20, 0.2, 5]],
  [/opus/, [5, 25, 0.5, 6.25]],
  [/sonnet/, [2, 10, 0.2, 2.5]],
  [/haiku/, [1, 5, 0.1, 1.25]],
]
export const priceOf = (model: string): [number, number, number, number] =>
  PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? [4, 20, 0.2, 5]

// A benchmark run's tokens on the main model - input, output, cache read, cache writes kept
// five minutes, and kept an hour - and what its helpers cost as they ran.
export type DefaultRun = { kind: Kind; tokens: [number, number, number, number, number]; otherUsd: number; ms: number }

// Claude Code keeps its cache an hour, and an hour's write costs twice the input price, not
// the 1.25 times of a five-minute one: priced at 1.25, a run came out a fifth too cheap.
export const priced = (model: string, run: DefaultRun): number => {
  const [input, output, read, write] = priceOf(model)
  const [i, o, r, w5, w60] = run.tokens
  return (i * input + o * output + r * read + w5 * write + w60 * input * 2) / 1e6 + run.otherUsd
}

// --- the range ----------------------------------------------------------------------------
export const MIN_OWN = 5
const RECENT = 30
const LOW = 0.1
const HIGH = 0.9

// Interpolated, as a spreadsheet's PERCENTILE.INC.
export const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b)
  if (!s.length) return 0
  const at = (s.length - 1) * q
  const lo = Math.floor(at)
  const a = s[lo] ?? 0
  return a + ((s[Math.min(lo + 1, s.length - 1)] ?? a) - a) * (at - lo)
}
const range = (xs: number[]): [number, number] => [quantile(xs, LOW), quantile(xs, HIGH)]

// The estimate for a kind; null when neither the project nor the benchmark has enough.
export function estimate(kind: Kind, past: PastRequest[], defaults: DefaultRun[], model: string): ShownEstimate | null {
  const own = past.filter((p) => p.kind === kind).slice(-RECENT)
  const tests = defaults.filter((d) => d.kind === kind)
  const isOwn = own.length >= MIN_OWN
  if (!isOwn && tests.length < 3) return null
  const shares = own.map((p) => p.fiveHour).filter((x): x is number => typeof x === 'number')
  return {
    kind,
    source: isOwn ? 'own' : 'tests',
    count: isOwn ? own.length : tests.length,
    usd: range(isOwn ? own.map((p) => p.usd) : tests.map((d) => priced(model, d))),
    ms: range(isOwn ? own.map((p) => p.ms) : tests.map((d) => d.ms)),
    fiveHour: shares.length >= MIN_OWN ? range(shares) : null,
  }
}

// --- words --------------------------------------------------------------------------------
const cents = (usd: number): string => `$${usd.toFixed(2)}`
// Outward to the cent, past float noise: 0.38 is 38.00000000000001 cents.
const downCents = (usd: number): number => Math.floor(usd * 100 + 1e-9) / 100
const upCents = (usd: number): number => Math.ceil(usd * 100 - 1e-9) / 100
export const moneyRange = ([lo, hi]: [number, number]): string => {
  const a = downCents(lo)
  const b = upCents(hi)
  if (b <= 0.01) return 'under $0.01'
  return a === b ? cents(a) : `${cents(a)}-${b.toFixed(2)}`
}
export const minutesRange = ([lo, hi]: [number, number]): string => {
  const a = Math.floor(lo / 60_000)
  const b = Math.max(1, Math.ceil(hi / 60_000))
  if (b <= 1) return 'under 1 min'
  return a === b ? `${a} min` : a === 0 ? `under ${b} min` : `${a}-${b} min`
}
export const shareRange = ([lo, hi]: [number, number]): string => {
  if (hi < 1) return 'under 1%'
  const a = Math.floor(lo)
  const b = Math.ceil(hi)
  return a === b ? `${a}%` : `${a}-${b}%`
}

// The 5-hour window's reading, when the session has one.
export const fiveHourOf = (limits: LimitReading[]): LimitReading | null => limits.find((l) => l.kind === 'five_hour') ?? null

// The status line while the user types: what this request usually costs.
export function beforeLine(kind: Kind, e: ShownEstimate | null, limits: LimitReading[]): string {
  const name = KIND_NAMES[kind]
  if (!e) return `Mellu.mate: ${name}, no estimate yet. It shows after 5 ${PLURAL[kind]} in this project`
  const parts = [`usually ${moneyRange(e.usd)}`, minutesRange(e.ms)]
  const now = fiveHourOf(limits)
  if (e.fiveHour) parts.push(`about ${shareRange(e.fiveHour)} of your 5-hour limit${now ? ` (now ${Math.round(now.percentUsed)}%)` : ''}`)
  else if (now) parts.push(`5-hour limit now ${Math.round(now.percentUsed)}%`)
  const note = e.source === 'tests' ? ` (from test runs: yours after 5 ${PLURAL[kind]})` : ''
  return `Mellu.mate: ${name}, ${parts.join(', ')}${note}`
}

// Where the real cost fell against the range.
export const verdict = (usd: number, e: ShownEstimate): 'inside' | 'above' | 'below' => {
  const lo = downCents(e.usd[0])
  const hi = upCents(e.usd[1])
  return usd > hi ? 'above' : usd < lo ? 'below' : 'inside'
}

// The figures beside the estimate, once the request is done: on the bar and the status line.
export function afterFigures(usd: number | null, e: ShownEstimate | null | undefined): string {
  if (usd === null) return ''
  const real = usd < 0.01 ? 'under $0.01' : cents(usd)
  if (!e) return real
  const v = verdict(usd, e)
  return `${real} (usual ${moneyRange(e.usd)}${v === 'inside' ? '' : `, ${v}`})`
}

// --- the project's own history ------------------------------------------------------------
// In a folder of its own, with a .gitignore of "*": the costs are the user's own and stay out
// of every saved version, with nothing added to the project's own .gitignore.
export const HISTORY_DIR = '.claude/mellu-costs'
export const HISTORY_FILE = `${HISTORY_DIR}/requests.json`
const KEEP = 300

export const parseHistory = (text: string | null): PastRequest[] => {
  try {
    const list = JSON.parse(text ?? '[]')
    return Array.isArray(list)
      ? list.filter((p) => p && typeof p.kind === 'string' && typeof p.usd === 'number' && typeof p.ms === 'number')
      : []
  } catch {
    return []
  }
}

export const withRequest = (past: PastRequest[], p: PastRequest): PastRequest[] =>
  [...past.filter((x) => x.at !== p.at), p].slice(-KEEP)

// A request's share of the 5-hour window: the change across it, or null when the window
// reset in between, a reading is missing, or the share went down (a reset the reading missed).
export function shareOf(start: LimitReading | null, end: LimitReading | null): number | null {
  if (!start || !end || start.resetsAt !== end.resetsAt) return null
  const d = end.percentUsed - start.percentUsed
  return d >= 0 ? Math.round(d * 10) / 10 : null
}
