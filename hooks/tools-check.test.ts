// Run with `claude plugin test .` from the plugin root, like panels.test.tsx.
import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// A computer with some programs installed. A missing one cannot start, so the engine rejects.
const computer = (on: On, installed: string[], os = 'Windows_NT') => {
  on('env.get', async (_$, e: any) => ({ value: e.name === 'OS' ? os : undefined }) as any)
  on('process.run', async (_$, e: any) => {
    const name = String(e.argv[0])
    if (!installed.includes(name)) throw new Error(`${name}: not found`)
    return { value: { exitCode: 0, stdout: `${name} 1.0\n`, stderr: '' } } as any
  })
  on('classic.SessionStart', async () => ({}) as any)
  on('session.usage',async () => ({ value: { startedAt: 0, rateLimits: [], context: { tokens: 0, window: 200_000, percent: 0 }, cost: { usd: 0 } } }) as any)
}

const start = async ($: any, source = 'startup') =>
  (await $.classic.SessionStart({ source } as any)) as { additionalContext?: string[] }

describe('the tools check', () => {
  test('with no Node.js, Claude is told to offer the install, with the command for Windows', async ($, on) => {
    computer(on, ['git'])
    const text = ((await start($)).additionalContext ?? []).join('\n')
    expect(text).toMatch(/Node\.js is not installed/)
    expect(text).toMatch(/winget install --id OpenJS\.NodeJS\.LTS -e/)
    expect(text).toMatch(/only after the user says yes/)
    expect(text).not.toMatch(/Git is not installed/)
  })

  test('with neither, both are offered in one note', async ($, on) => {
    computer(on, [])
    const text = ((await start($)).additionalContext ?? []).join('\n')
    expect(text).toMatch(/Node\.js is not installed/)
    expect(text).toMatch(/winget install --id Git\.Git -e/)
  })

  test('with Node.js installed, nothing is added: the session opener checks git itself', async ($, on) => {
    computer(on, ['node'])
    expect((await start($)).additionalContext ?? []).toEqual([])
  })

  test('a resumed session is not checked again', async ($, on) => {
    computer(on, [])
    expect((await start($, 'resume')).additionalContext ?? []).toEqual([])
  })
})
