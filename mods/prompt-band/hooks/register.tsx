import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, LimitLevel, PromptLocation, UsageLevel } from '../types'

const BRANCH = atom({ plugin: 'prompt-band', key: 'branch' } as const, null as string | null)
const USAGE = atom({ plugin: 'prompt-band', key: 'usage' } as const, null as UsageLevel | null)
const LOCATION = atom({ plugin: 'prompt-band', key: 'location' } as const, null as PromptLocation | null)
const AGENTS = atom({ plugin: 'prompt-band', key: 'agents' } as const, [] as AgentRow[])
const CAST = atom({ plugin: 'prompt-band', key: 'cast' } as const, {} as Record<string, number>)
const FRAME = atom({ plugin: 'prompt-band', key: 'frame' } as const, 0)

const PANE = 'fellowship'
const PANE_TITLE = '🧙 The Fellowship'
const TICK_MS = 500
const BRANCH_EVERY_TICKS = 10
const MAX_BAR_WIDTH = 40
const ACTIVE = ['pending', 'running', 'waiting']
const MAIN_BRANCHES = ['main', 'master']

// Who walks beside each agent, handed out in order of arrival.
const FELLOWSHIP = [
  { name: 'Gandalf', emoji: '🧙' },
  { name: 'Frodo', emoji: '💍' },
  { name: 'Sam', emoji: '🥔' },
  { name: 'Aragorn', emoji: '👑' },
  { name: 'Legolas', emoji: '🏹' },
  { name: 'Gimli', emoji: '🪓' },
  { name: 'Boromir', emoji: '📯' },
  { name: 'Merry', emoji: '🍺' },
  { name: 'Pippin', emoji: '🍎' },
  { name: 'Galadriel', emoji: '✨' },
  { name: 'Elrond', emoji: '📜' },
  { name: 'Faramir', emoji: '🐎' },
  { name: 'Éowyn', emoji: '👸' },
  { name: 'Arwen', emoji: '🌟' },
  { name: 'Bilbo', emoji: '📖' },
  { name: 'Treebeard', emoji: '🌳' },
]

const QUEST: Record<string, { emoji: string; text: string; color: string }> = {
  pending: { emoji: '⏳', text: 'getting ready', color: 'subtle' },
  running: { emoji: '⚔️', text: 'on the quest', color: 'warning' },
  waiting: { emoji: '💤', text: 'waiting', color: 'subtle' },
  idle: { emoji: '💤', text: 'resting', color: 'subtle' },
  completed: { emoji: '✅', text: 'quest complete', color: 'success' },
  failed: { emoji: '💀', text: 'has fallen', color: 'error' },
  killed: { emoji: '🛑', text: 'recalled', color: 'subtle' },
}

// The part of the engine interface this mod calls, beside its state.
type Engine = Parameters<typeof update>[0] & {
  process: { run: (argv: readonly string[]) => Promise<{ exitCode: number; stdout: string }> }
  env: { get: (name: string) => Promise<string | undefined> }
  session: {
    usage: () => Promise<Measure>
  }
  agent: {
    list: () => Promise<{ id: string; name?: string; description: string; status: string }[]>
  }
  ui: { open: (pane: { id: string; title?: string }) => Promise<unknown> }
}

type Measure = {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: { kind: string; percentUsed: number }[]
  cost?: { usd: number }
}

// The person closed the pane: no agent reopens it until /fellowship does.
let isPaneMuted = false
const seenAgents = new Set<string>()

// $.process.run rejects when the executable cannot start (git or hostname missing
// from the PATH): the band then goes without that value instead of stopping.
const runQuietly = async ($: Engine, argv: readonly string[]) => {
  try {
    const { exitCode, stdout } = await $.process.run(argv)
    return exitCode === 0 ? stdout.trim() : null
  } catch {
    return null
  }
}

const refreshBranch = async ($: Engine) => {
  const branch = await runQuietly($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  await update($, BRANCH, () => branch)
}

// User and home come from the environment, under their Unix or Windows names: no shell
// is needed, so the band works on a Windows machine without sh on its PATH. The host
// falls back on the `hostname` executable, which macOS, Linux and Windows all ship.
const refreshLocation = async ($: Engine, cwd: string) => {
  const user = (await $.env.get('USER')) ?? (await $.env.get('USERNAME'))
  const host = (await $.env.get('COMPUTERNAME')) ?? (await runQuietly($, ['hostname']))
  if (!user || !host) return
  // Git Bash sets HOME to /c/Users/<name> while the session's cwd reads C:\Users\<name>:
  // whichever of the two is a prefix of cwd is the home to shorten.
  const homes = [await $.env.get('HOME'), await $.env.get('USERPROFILE')]
  const home = homes.find(h => h && cwd.startsWith(h))
  const shown = home ? `~${cwd.slice(home.length)}` : cwd
  await update($, LOCATION, () => ({ user, host, cwd: shown }))
}

const toUsage = (m: Measure): UsageLevel => ({
  percent: m.context.percent ?? null,
  tokens: m.context.tokens ?? null,
  window: m.context.window,
  limits: m.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed })),
  costUsd: m.cost?.usd ?? null,
})

const refreshUsage = async ($: Engine) => {
  const measure = await $.session.usage()
  await update($, USAGE, () => toUsage(measure))
}

// Active agents first, then finished ones. A new agent gets the next companion and,
// unless the person closed it, opens the pane.
const refreshAgents = async ($: Engine) => {
  const agents = await $.agent.list()
  const ordered = [...agents].sort(
    (a, b) => Number(ACTIVE.includes(b.status)) - Number(ACTIVE.includes(a.status)),
  )
  const rows: AgentRow[] = ordered.map(a => ({
    id: a.id,
    label: a.name ?? a.description,
    status: a.status,
  }))
  await update($, AGENTS, () => rows)

  const newcomers = rows.filter(r => !seenAgents.has(r.id))
  if (newcomers.length === 0) return
  newcomers.forEach(r => seenAgents.add(r.id))
  await update($, CAST, cast => {
    const next = { ...cast }
    for (const r of newcomers) {
      if (next[r.id] === undefined) next[r.id] = Object.keys(next).length % FELLOWSHIP.length
    }
    return next
  })
  // Opened unasked: a surface that places no pane refuses it, and the band goes on.
  if (!isPaneMuted && newcomers.some(r => ACTIVE.includes(r.status))) {
    $.ui.open({ id: PANE, title: PANE_TITLE }).catch(() => undefined)
  }
}

const contextColor = (percent: number | null) =>
  percent === null ? 'subtle' : percent >= 85 ? 'error' : percent >= 60 ? 'warning' : 'subtle'

const limitColor = (percent: number) => (percent >= 90 ? 'error' : percent >= 75 ? 'warning' : 'subtle')

// Main branches stand out in yellow, so an accidental commit on main is easy to spot.
const branchColor = (branch: string) => (MAIN_BRANCHES.includes(branch) ? 'warning' : 'subtle')

const formatTokens = (n: number) => `${Math.round(n / 1000)}k`

const contextText = (usage: UsageLevel) =>
  usage.percent === null
    ? `🧠 ${formatTokens(usage.window)}`
    : `🧠 ${usage.percent}% · ${formatTokens(usage.tokens ?? 0)}/${formatTokens(usage.window)}`

const LIMIT_NAMES: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'budget' }

const limitText = (limit: LimitLevel) => `${LIMIT_NAMES[limit.kind] ?? limit.kind} ${Math.round(limit.percent)}%`

// A block that moves along the bar, one cell per frame, while the agent works.
const workingCells = (frame: number, width: number) => {
  const start = frame % width
  return Array.from({ length: width }, (_, i) => ((i - start + width) % width < 4 ? '█' : '░')).join('')
}

const questBar = (row: AgentRow, frame: number, width: number) => {
  if (ACTIVE.includes(row.status)) return workingCells(frame, width)
  return '█'.repeat(width)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)

    await $.command.register({
      name: 'fellowship',
      description: 'Open the pane of running agents (the Fellowship)',
    })

    await refreshLocation($, e.cwd)
    await refreshBranch($)
    await refreshUsage($)
    await refreshAgents($)

    let ticks = 0
    $.clock.every(TICK_MS, () => {
      ticks += 1
      void (async () => {
        await refreshAgents($)
        const agents = await read($, AGENTS)
        // The bar only moves while someone is on the road: no redraw otherwise.
        if (agents.some(a => ACTIVE.includes(a.status))) await update($, FRAME, n => n + 1)
        if (ticks % BRANCH_EVERY_TICKS === 0) await refreshBranch($)
      })()
    })

    return started
  })

  // Every new reading of the context window, the rate limits or the cost.
  on('session.measure', async ($, e, next) => {
    await update($, USAGE, () => toUsage(e))
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\bgit\s+(switch|checkout)\b/.test(e.command)) await refreshBranch($)
    return ran
  })

  on('command.run', { command: 'fellowship' }, async $ => {
    isPaneMuted = false
    await $.ui.open({ id: PANE, title: PANE_TITLE })
    return { text: 'The Fellowship is gathered.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') isPaneMuted = true
    return next(e)
  })

  // One greyed line across the whole width: where we are on the left, what is spent on the right.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const branch = await read($, BRANCH)
    const usage = await read($, USAGE)
    const location = await read($, LOCATION)

    if (branch === null && usage === null && location === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box width={e.props.bodyColumns} justifyContent="space-between" flexWrap="wrap">
        <Box>
          {location !== null ? <Text color="subtle">{`${location.user}@${location.host}:${location.cwd}`}</Text> : null}
          {branch !== null ? <Text color="subtle">{'  '}</Text> : null}
          {branch !== null ? <Text color={branchColor(branch)}>{`🌿 ${branch}`}</Text> : null}
        </Box>
        {usage !== null ? (
          <Box>
            <Text color={contextColor(usage.percent)}>{contextText(usage)}</Text>
            {usage.limits.map(limit => (
              <Text key={limit.kind} color={limitColor(limit.percent)}>{`   ⏱ ${limitText(limit)}`}</Text>
            ))}
            {usage.limits.length === 0 && usage.costUsd !== null ? (
              <Text color="subtle">{`   💰 $${usage.costUsd.toFixed(2)}`}</Text>
            ) : null}
          </Box>
        ) : null}
      </Box>
    )
  })

  // The pane beside the transcript: one companion per agent, its quest and its bar.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const agents = await read($, AGENTS)
    const cast = await read($, CAST)
    const frame = await read($, FRAME)
    const columns = e.props.bodyColumns ?? 40
    const barWidth = Math.max(8, Math.min(MAX_BAR_WIDTH, columns - 2))
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 2) / 3))

    if (agents.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No agent on the road.</Text>
          <Text dimColor>The Fellowship awaits its next quest.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {agents.slice(0, room).map(row => {
          const companion = FELLOWSHIP[cast[row.id] ?? 0]
          const quest = QUEST[row.status] ?? QUEST.idle
          return (
            <Box key={row.id} flexDirection="column" marginBottom={1}>
              <Text>
                {`${companion.emoji} `}
                <Text bold>{companion.name}</Text>
                <Text dimColor>{` · ${row.label}`}</Text>
              </Text>
              <Text>
                <Text color={quest.color}>{questBar(row, frame, barWidth)}</Text>
                <Text dimColor>{` ${quest.emoji} ${quest.text}`}</Text>
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
