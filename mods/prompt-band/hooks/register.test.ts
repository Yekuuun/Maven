import { test, expect, mock } from 'claude-code/testing'
import type { AgentStatus, On } from 'claude-code'

type Agent = { id: string; type: string; description: string; status: AgentStatus }

// Stands for the engine beneath the plugin: the timer, the session, the git call, the usage and the agents.
// With gitMissing, git cannot start, as on a machine without git on its PATH.
const stubEngine = (on: On, agents: Agent[] = [], { gitMissing = false } = {}) => {
  mock.clock(on)
  mock.env(on, { USER: 'yekuuun', HOME: '/home/yekuuun' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('process.run', ($, e) => {
    if (gitMissing && e.argv[0] === 'git') throw new Error('git: not found')
    return {
      value: {
        exitCode: 0,
        stdout: e.argv[0] === 'git' ? 'feature/demo\n' : 'yekuuun-laptop\n',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('session.usage', ($, e) => ({
    value: {
      startedAt: 0,
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23 },
        { kind: 'seven_day', percentUsed: 41.5 },
      ],
      context: { tokens: 84000, window: 200000, percent: 42 },
    },
  }))
  on('agent.list', ($, e) => ({ value: agents }))
  on('command.register', ($, e) => ({ value: undefined }))
}

// Records what the plugin writes to its state, before the engine keeps it.
const recordWrites = (on: On) => {
  const writes: Record<string, unknown> = {}
  on('state.set', ($, e, next) => {
    writes[e.key] = e.value
    return next(e)
  })
  return writes
}

const bandProps = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
const paneProps = { title: 'The Fellowship', isFocused: false, bodyColumns: 40, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} }

test('reads the branch, the context window and the rate limits when the session starts', async ($, on) => {
  stubEngine(on)
  const writes = recordWrites(on)

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  expect(writes.branch).toBe('feature/demo')
  expect(writes.usage).toEqual({
    percent: 42,
    tokens: 84000,
    window: 200000,
    limits: [
      { kind: 'five_hour', percent: 23 },
      { kind: 'seven_day', percent: 41.5 },
    ],
    costUsd: null,
  })
})

test('draws one line above the prompt: location and branch, then context and usage, no rule', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'prompt-band', surface: 'terminal', component: 'AbovePrompt', props: bandProps })
  expect(await ui.find({ type: 'Text', text: /yekuuun@yekuuun-laptop/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /feature\/demo/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /42%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /5h 23%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /7d 42%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /─/ })).toBeUndefined()
  await ui.unmount()
})

test('keeps active agents first and lists them all', async ($, on) => {
  stubEngine(on, [
    { id: 'a1', type: 'subagent', description: 'done task', status: 'completed' },
    { id: 'a2', type: 'subagent', description: 'parse the config', status: 'running' },
    { id: 'a3', type: 'subagent', description: 'write the docs', status: 'waiting' },
    { id: 'a4', type: 'subagent', description: 'fix the lint', status: 'pending' },
  ])
  const writes = recordWrites(on)

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  expect((writes.agents as { id: string }[]).map(r => r.id)).toEqual(['a2', 'a3', 'a4', 'a1'])
})

test('gives each agent the next companion, in order of arrival', async ($, on) => {
  stubEngine(on, [
    { id: 'a1', type: 'subagent', description: 'parse the config', status: 'running' },
    { id: 'a2', type: 'subagent', description: 'write the docs', status: 'running' },
  ])
  const writes = recordWrites(on)

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  expect(writes.cast).toEqual({ a1: 0, a2: 1 })
})

test('draws each agent in the pane with its companion and its quest', async ($, on) => {
  stubEngine(on, [{ id: 'a1', type: 'subagent', description: 'parse the config', status: 'running' }])
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'prompt-band', surface: 'terminal', component: 'Pane', requestId: 'fellowship', props: paneProps })
  expect(await ui.find({ type: 'Text', text: /Gandalf/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /parse the config/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /on the quest/ })).toBeDefined()
  await ui.unmount()
})

test('opens the pane when an agent sets out', async ($, on) => {
  stubEngine(on, [{ id: 'a1', type: 'subagent', description: 'parse the config', status: 'running' }])
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  expect(opened).toContain('fellowship')
})

test('leaves the pane closed when no agent is on the road', async ($, on) => {
  stubEngine(on)
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  expect(opened).toEqual([])
})

// A Windows machine: the user and host come from the environment, no shell is started.
test('reads the location from the Windows environment', async ($, on) => {
  mock.clock(on)
  mock.env(on, { USERNAME: 'emaisin', COMPUTERNAME: 'EPHEC-PC42', USERPROFILE: 'C:\\Users\\emaisin' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('process.run', ($, e) => {
    if (e.argv[0] !== 'git') throw new Error(`${e.argv[0]}: not found`)
    return { value: { exitCode: 0, stdout: 'master\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.usage', ($, e) => ({ value: { startedAt: 0, rateLimits: [], context: { window: 200000 } } }))
  on('agent.list', ($, e) => ({ value: [] }))
  on('command.register', ($, e) => ({ value: undefined }))
  const writes = recordWrites(on)

  await $.session.start({ cwd: 'C:\\Users\\emaisin\\Repos\\Holocron', surface: 'terminal', isInteractive: true })

  expect(writes.location).toEqual({ user: 'emaisin', host: 'EPHEC-PC42', cwd: '~\\Repos\\Holocron' })
  expect(writes.branch).toBe('master')
})

// git missing from the PATH: the band still starts, without a branch.
test('keeps going when git cannot start', async ($, on) => {
  stubEngine(on, [{ id: 'a1', type: 'subagent', description: 'parse the config', status: 'running' }], {
    gitMissing: true,
  })
  const writes = recordWrites(on)

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  expect(writes.branch).toBeNull()
  expect((writes.agents as { id: string }[]).map(r => r.id)).toEqual(['a1'])
})
