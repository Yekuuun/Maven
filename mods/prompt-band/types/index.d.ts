// Values the prompt-band mod keeps in $.state, declared under its name.

export type LimitLevel = {
  kind: string
  percent: number
}

export type UsageLevel = {
  percent: number | null
  tokens: number | null
  window: number
  limits: LimitLevel[]
  costUsd: number | null
}

export type AgentRow = {
  id: string
  label: string
  status: string
}

export type PromptLocation = {
  user: string
  host: string
  cwd: string
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-band': {
      branch: string | null
      usage: UsageLevel | null
      location: PromptLocation | null
      agents: AgentRow[]
      cast: Record<string, number>
      frame: number
    }
  }
}
