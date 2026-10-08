export type EntryStatus = 'pending' | 'done' | 'failed'

export type Entry = {
  id: string
  n: number
  text: string
  context?: string
  status: EntryStatus
  attempts: number
  emoji?: string
  summary?: string
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-trail': { entries: Entry[]; offset: number; follow: boolean }
  }
}
