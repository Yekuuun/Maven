// Values the prompt-band mod keeps in $.state, declared under its name.

export type ContextLevel = {
  percent: number | null
  tokens: number | null
  window: number
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
      context: ContextLevel | null
      location: PromptLocation | null
      agents: AgentRow[]
      frame: number
    }
  }
}
