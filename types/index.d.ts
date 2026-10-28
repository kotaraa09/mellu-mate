// What Mellu.mate's hooks module keeps in the session's $.state, so `claude plugin validate`
// can hold every key it names to a declared type.

// One step of the request in progress, from Claude's own step list (TodoWrite, the Task
// tools, or the desktop app's task list).
export type Step = {
  id: string
  title: string
  // What the step is doing, as Claude worded it ("Building page 2").
  doing: string
  status: 'pending' | 'in_progress' | 'completed'
}

// The request the user sent last, and what it has cost so far.
export type Request = {
  // The start of what the user asked, for the panel's first line.
  text: string
  startedAt: number
  // Set when the turn ended; until then the request is running.
  endedAt: number | null
  steps: Step[]
  // The last few actions, in plain words ("Changed checkout.js"), newest last. The panel
  // shows these when Claude keeps no step list, so a request is never only "working".
  recent: string[]
  tools: number
  // The session's cost when the request began, so the request's own cost is the difference.
  costAtStart: number | null
  // Background work still running when the turn ended (a test run, a helper), as Claude Code
  // listed it at the Stop. While any is left the request is waiting, not done. A dev server
  // is left out: it runs until someone stops it.
  waiting?: Waiting[]
}

export type Waiting = {
  id: string
  // What it is doing, in Claude's words ("Run the tests"), or its command.
  label: string
}

// The figures the session reports, read after each tool call and at the end of a turn.
export type Usage = {
  costUsd: number | null
  contextTokens: number | null
  contextWindow: number | null
  contextPercent: number | null
}

// A newer release of Mellu.mate, as the control panel offers it. Claude is never asked: the
// panel checks GitHub's latest release itself, and the user presses Update or does not.
export type UpdateInfo = {
  // The installed version, from the plugin's own plugin.json; null until read.
  current: string | null
  // The latest published release and its page, or null when unknown.
  latest: string | null
  url: string | null
  status: 'idle' | 'updating' | 'done' | 'failed'
}

export type Pressed = {
  key: string
  label: string
  // When it was pressed, so the note goes away after a few seconds.
  at: number
  // Claude was working on a request: the new one waits until that ends.
  isQueued: boolean
}

// --- hooks/savvy-progress: the helpers (subagents) of the session, for the Agents panel. ---

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  // The session's first helper opens the panel once; after that only /mellu-helpers does.
  isAutoOpened: boolean
  // The request whose bar the user closed (its startedAt); the next request shows again.
  dismissedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    mellu: {
      request: Request | null
      usage: Usage
      agents: AgentRun[]
      agentsPanel: Panel
      agentsNow: number
      // The control panel shows what each control does under it, until it is turned off.
      controlsHelp: boolean
      // The control panel button pressed last, until its request is on its way: the panel
      // says so at once, and a second press of it does nothing. Null when none is.
      pressed: Pressed | null
      // Whether the control panel asks "Start a fresh conversation?" before /clear.
      clearAsk: boolean
      // A newer release, and how its update went.
      update: UpdateInfo
    }
  }
}
