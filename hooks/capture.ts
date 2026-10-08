import type { SessionMessage } from 'claude-code'

export const CONTEXT_CHARS = 1500
export const BACKFILL_LIMIT = 50

// Prompts the person typed at the terminal (queued mid-turn ones included) or
// sent through Remote Control; notifications, peers and plugins are left out.
const CAPTURED_ORIGINS = new Set(['composer', 'bridge'])

// Rows the transcript keeps as user messages that the person never typed.
const META_PREFIXES = [
  '<',
  'Base directory for this skill:',
  '[Request interrupted',
  'This session is being continued from a previous conversation',
  'Caveat:',
]

export type Backfill = { text: string; context: string }

export function shouldCapture(text: string, originKind: string): boolean {
  const trimmed = text.trim()
  return CAPTURED_ORIGINS.has(originKind) && trimmed !== '' && !trimmed.startsWith('/')
}

export function isMetaText(text: string): boolean {
  const trimmed = text.trim()
  return META_PREFIXES.some(prefix => trimmed.startsWith(prefix))
}

export function tail(s: string, n: number): string {
  const chars = Array.from(s)
  return chars.length <= n ? s : chars.slice(chars.length - n).join('')
}

function isPrompt(message: SessionMessage): boolean {
  if (message.role !== 'user' || (message.toolResults?.length ?? 0) > 0) return false
  const trimmed = message.text.trim()
  return trimmed !== '' && !isMetaText(trimmed) && !trimmed.startsWith('/')
}

function assistantTextBefore(messages: readonly SessionMessage[], index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role === 'assistant' && message.text.trim()) return message.text
  }
  return ''
}

// The tail of the Claude reply the prompt answered: the nearest assistant text
// before the prompt's own row, or the latest one when the prompt has no row
// (a message delivered mid-turn is stored apart from the messages).
export function contextBefore(messages: readonly SessionMessage[], text: string): string {
  const wanted = text.trim()
  let at = messages.length
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role === 'user' && message.text.trim() === wanted) {
      at = i
      break
    }
  }
  return tail(assistantTextBefore(messages, at), CONTEXT_CHARS)
}

// The tail of the newest Claude text in the transcript: read as a prompt is
// typed, it is the reply that prompt answers.
export function latestReply(messages: readonly SessionMessage[]): string {
  return tail(assistantTextBefore(messages, messages.length), CONTEXT_CHARS)
}

export function backfillFromMessages(messages: readonly SessionMessage[], limit: number): Backfill[] {
  const found: Backfill[] = []
  let lastAssistant = ''
  for (const message of messages) {
    if (message.role === 'assistant' && message.text.trim()) lastAssistant = message.text
    else if (isPrompt(message)) found.push({ text: message.text, context: tail(lastAssistant, CONTEXT_CHARS) })
  }
  return limit > 0 ? found.slice(-limit) : []
}
