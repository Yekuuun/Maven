import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, ContextLevel, PromptLocation } from '../types'

const BRANCH = atom({ plugin: 'prompt-band', key: 'branch' } as const, null as string | null)
const CONTEXT = atom({ plugin: 'prompt-band', key: 'context' } as const, null as ContextLevel | null)
const LOCATION = atom({ plugin: 'prompt-band', key: 'location' } as const, null as PromptLocation | null)
const AGENTS = atom({ plugin: 'prompt-band', key: 'agents' } as const, [] as AgentRow[])
const FRAME = atom({ plugin: 'prompt-band', key: 'frame' } as const, 0)

const TICK_MS = 500
const CONTEXT_EVERY_TICKS = 10
const BAR_WIDTH = 24
const LABEL_WIDTH = 24
const RULE_WIDTH = 48
const MAX_AGENTS = 3
const ACTIVE = ['pending', 'running', 'waiting']
const MAIN_BRANCHES = ['main', 'master']

// The part of the engine interface this mod calls, beside its state.
type Engine = Parameters<typeof update>[0] & {
  process: { run: (argv: readonly string[]) => Promise<{ exitCode: number; stdout: string }> }
  session: {
    usage: () => Promise<{ context: { tokens?: number; window: number; percent?: number } }>
  }
  agent: {
    list: () => Promise<{ id: string; name?: string; description: string; status: string }[]>
  }
}

const refreshBranch = async ($: Engine) => {
  const { exitCode, stdout } = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = exitCode === 0 ? stdout.trim() : null
  await update($, BRANCH, () => branch)
}

// User, host and home come from one shell call; the working directory comes from the session.
const refreshLocation = async ($: Engine, cwd: string) => {
  const { exitCode, stdout } = await $.process.run([
    'sh',
    '-c',
    'printf "%s|%s|%s" "$(whoami)" "$(hostname)" "$HOME"',
  ])
  if (exitCode !== 0) return
  const [user, host, home] = stdout.split('|')
  const shown = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
  await update($, LOCATION, () => ({ user, host, cwd: shown }))
}

const refreshContext = async ($: Engine) => {
  const { context } = await $.session.usage()
  const level: ContextLevel = {
    percent: context.percent ?? null,
    tokens: context.tokens ?? null,
    window: context.window,
  }
  await update($, CONTEXT, () => level)
}

// Active agents first, then finished ones, a few at most.
const refreshAgents = async ($: Engine) => {
  const agents = await $.agent.list()
  const ordered = [...agents].sort(
    (a, b) => Number(ACTIVE.includes(b.status)) - Number(ACTIVE.includes(a.status)),
  )
  const rows: AgentRow[] = ordered.slice(0, MAX_AGENTS).map(a => ({
    id: a.id,
    label: (a.name ?? a.description).slice(0, LABEL_WIDTH),
    status: a.status,
  }))
  await update($, AGENTS, () => rows)
}

const contextColor = (percent: number | null) =>
  percent === null ? 'subtle' : percent >= 85 ? 'error' : percent >= 60 ? 'warning' : 'success'

// Main branches stand out in yellow, so an accidental commit on main is easy to spot.
const branchColor = (branch: string) => (MAIN_BRANCHES.includes(branch) ? 'warning' : 'success')

const formatTokens = (n: number) => `${Math.round(n / 1000)}k`

const contextText = (context: ContextLevel) =>
  context.percent === null
    ? `🧠 window ${formatTokens(context.window)}`
    : `🧠 ${context.percent}% (${formatTokens(context.tokens ?? 0)} / ${formatTokens(context.window)})`

// A block that moves along the bar, one cell per frame, while the agent works.
const workingCells = (frame: number) => {
  const start = frame % BAR_WIDTH
  return Array.from({ length: BAR_WIDTH }, (_, i) =>
    (i - start + BAR_WIDTH) % BAR_WIDTH < 4 ? '█' : '░',
  ).join('')
}

// Red while an agent works, green once it completed, grey if it failed or was stopped.
const agentBar = (row: AgentRow, frame: number) => {
  if (ACTIVE.includes(row.status)) return { color: 'error', cells: workingCells(frame) }
  if (row.status === 'completed') return { color: 'success', cells: '█'.repeat(BAR_WIDTH) }
  return { color: 'subtle', cells: '█'.repeat(BAR_WIDTH) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)

    await refreshLocation($, e.cwd)
    await refreshBranch($)
    await refreshContext($)
    await refreshAgents($)

    let ticks = 0
    $.clock.every(TICK_MS, () => {
      ticks += 1
      void (async () => {
        await update($, FRAME, n => n + 1)
        await refreshAgents($)
        if (ticks % CONTEXT_EVERY_TICKS === 0) {
          await refreshBranch($)
          await refreshContext($)
        }
      })()
    })

    return started
  })

  on('turn.complete', async ($, e, next) => {
    await refreshContext($)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\bgit\s+(switch|checkout)\b/.test(e.command)) await refreshBranch($)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const branch = await read($, BRANCH)
    const context = await read($, CONTEXT)
    const location = await read($, LOCATION)
    const agents = await read($, AGENTS)
    const frame = await read($, FRAME)

    if (branch === null && context === null && location === null && agents.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {agents.map(row => {
          const bar = agentBar(row, frame)
          return (
            <Box key={row.id}>
              <Text>{row.label.padEnd(LABEL_WIDTH)} </Text>
              <Text color={bar.color}>{bar.cells}</Text>
            </Box>
          )
        })}
        <Text color="subtle">{'─'.repeat(RULE_WIDTH)}</Text>
        <Box>
          {location !== null ? (
            <Text color="success">{`${location.user}@${location.host}`}</Text>
          ) : null}
          {location !== null ? <Text>{':'}</Text> : null}
          {location !== null ? <Text color="subtle">{location.cwd}</Text> : null}
          {branch !== null ? <Text>{'  '}</Text> : null}
          {branch !== null ? (
            <Text color={branchColor(branch)}>{`🌿 ${branch}`}</Text>
          ) : null}
          {branch !== null && context !== null ? <Text>{' - '}</Text> : null}
          {context !== null ? (
            <Text color={contextColor(context.percent)}>{contextText(context)}</Text>
          ) : null}
        </Box>
      </Box>
    )
  })
}
