import { test, expect, mock } from 'claude-code/testing'
import type { AgentStatus, On } from 'claude-code'

// Stands for the engine beneath the plugin: the timer, the session, the git call, the context and its agents.
const stubEngine = (on: On, agents: { id: string; type: string; description: string; status: AgentStatus }[] = []) => {
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('process.run', ($, e) => ({
    value: { exitCode: 0, stdout: 'feature/demo\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('session.usage', ($, e) => ({
    value: { startedAt: 0, rateLimits: [], context: { tokens: 84000, window: 200000, percent: 42 } },
  }))
  on('agent.list', ($, e) => ({ value: agents }))
}

test('reads the branch and context window when the session starts', async ($, on) => {
  stubEngine(on)

  // Records what the plugin writes to its state, before the engine keeps it.
  const writes: Record<string, unknown> = {}
  on('state.set', ($, e, next) => {
    writes[e.key] = e.value
    return next(e)
  })

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  expect(writes.branch).toBe('feature/demo')
  expect((writes.context as { percent: number }).percent).toBe(42)
})

test('draws the branch above the prompt', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'prompt-band', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} } })
  expect(await ui.find({ type: 'Text', text: /branch: feature\/demo/ })).toBeDefined()
  await ui.unmount()
})

test('lists a running agent with its label and status', async ($, on) => {
  stubEngine(on, [{ id: 'a1', type: 'subagent', description: 'refactor the parser', status: 'running' }])

  const writes: Record<string, unknown> = {}
  on('state.set', ($, e, next) => {
    writes[e.key] = e.value
    return next(e)
  })

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  expect(writes.agents).toEqual([{ id: 'a1', label: 'refactor the parser', status: 'running' }])
})

test('keeps active agents first and caps the band at three rows', async ($, on) => {
  stubEngine(on, [
    { id: 'a1', type: 'subagent', description: 'done task', status: 'completed' },
    { id: 'a2', type: 'subagent', description: 'parse the config', status: 'running' },
    { id: 'a3', type: 'subagent', description: 'write the docs', status: 'waiting' },
    { id: 'a4', type: 'subagent', description: 'fix the lint', status: 'pending' },
  ])

  const writes: Record<string, unknown> = {}
  on('state.set', ($, e, next) => {
    writes[e.key] = e.value
    return next(e)
  })

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  expect((writes.agents as { id: string }[]).map(r => r.id)).toEqual(['a2', 'a3', 'a4'])
})

test('truncates long agent labels to the label width', async ($, on) => {
  stubEngine(on, [{ id: 'a1', type: 'subagent', description: 'refactor the parser module now', status: 'running' }])

  const writes: Record<string, unknown> = {}
  on('state.set', ($, e, next) => {
    writes[e.key] = e.value
    return next(e)
  })

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  expect((writes.agents as { label: string }[])[0].label).toBe('refactor the parser modu')
})
