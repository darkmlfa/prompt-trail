import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entry } from '../types'
import { BACKFILL_LIMIT, backfillFromMessages, contextBefore, latestReply, shouldCapture } from './capture'
import {
  ARROW_DOWN, ARROW_UP, BORDER_COLOR, bodySize, bottomBorder, bottomBorderParts, cellWidth, entryRows, maxOffset, SCROLL_STEP,
  scrollStep, TOGGLE_COLLAPSE, TOGGLE_EXPAND, topBorder, windowRows,
} from './layout'
import type { BodyWindow } from './layout'
import { buildRequest, parseReply, SUMMARY_MODEL } from './summarize'
import type { Parsed } from './summarize'

const TICK_MS = 1000
const MAX_ATTEMPTS = 2

const entriesAtom = atom({ plugin: 'prompt-trail', key: 'entries' } as const, [] as Entry[])
const offsetAtom = atom({ plugin: 'prompt-trail', key: 'offset' } as const, 0)
const followAtom = atom({ plugin: 'prompt-trail', key: 'follow' } as const, true)
const expandedAtom = atom({ plugin: 'prompt-trail', key: 'expanded' } as const, false)

// The box as last drawn, for the scroll hook: the body rows it may show, its
// rows in all, and the rows on screen.
let geometry: { size: number; total: number; visible: number } | undefined

// True while a summary call is out: one at a time.
let inFlight = false

// Ticks left to fill an empty box from the transcript after a start or a
// resume: the resumed transcript may load after the event that announced it.
const BACKFILL_TRIES = 5
let backfillTries = 0

// Fills an empty box with the transcript's prompts; true once there is nothing
// left to do (the box has entries, or now holds the transcript's).
async function backfill($: EngineInterface): Promise<boolean> {
  if ((await read($, entriesAtom)).length > 0) return true
  const found = backfillFromMessages(await $.session.messages(), BACKFILL_LIMIT)
  if (found.length === 0) return false
  await update($, entriesAtom, list => list.length > 0 ? list : found.map((item, i): Entry => ({
    id: crypto.randomUUID(), n: i + 1, text: item.text, context: item.context, status: 'pending', attempts: 0,
  })))
  return true
}

// Summarizes the newest pending entry. The answer is written to that entry by
// id, so an entry cleared while the call was out stays gone.
async function tick($: EngineInterface): Promise<void> {
  if (backfillTries > 0) {
    backfillTries--
    try {
      if (await backfill($)) backfillTries = 0
    } catch {
      // Tried again on the next tick while tries remain.
    }
  }
  if (inFlight) return
  const entry = (await read($, entriesAtom)).findLast(item => item.status === 'pending')
  if (!entry) return
  inFlight = true
  try {
    let context = entry.context
    let parsed: Parsed | null = null
    try {
      context ??= contextBefore(await $.session.messages(), entry.text)
      const result = await $.model.complete({
        model: SUMMARY_MODEL, ...buildRequest(entry.text, context), maxTokens: 300, timeoutMs: 20000,
      })
      parsed = result.isAnswered ? parseReply(result.text) : null
    } catch {
      parsed = null
    }
    await update($, entriesAtom, list => list.map((item): Entry => {
      if (item.id !== entry.id) return item
      if (parsed) return { ...item, context, status: 'done', emoji: parsed.emoji, summary: parsed.summary }
      const attempts = item.attempts + 1
      return { ...item, context, attempts, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending' }
    }))
  } finally {
    inFlight = false
  }
}

// Moves the folded box's own window by `delta` rows; at the bottom it follows
// the newest again.
async function moveBox($: EngineInterface, delta: number): Promise<void> {
  const box = geometry
  if (!box || box.total <= box.size) return
  const last = maxOffset(box.total, box.size)
  const current = (await read($, followAtom)) ? last : Math.min(await read($, offsetAtom), last)
  const offset = Math.min(Math.max(0, current + delta), last)
  await update($, offsetAtom, () => offset)
  await update($, followAtom, () => offset === last)
}

// Folds or unfolds the box. Unfolded, it shows from its end, the newest prompt;
// folded again, its own window follows the newest.
async function toggle($: EngineInterface, band: string): Promise<void> {
  const expanded = await update($, expandedAtom, value => !value)
  if (!expanded) {
    await update($, followAtom, () => true)
    return
  }
  try {
    await $.ui.scroll({ in: band, to: 'end' })
  } catch {
    // The band shows from its top instead.
  }
}

export const register: Register = on => {
  // Fills in the prompts typed before the mod loaded (once: a reload finds
  // the list kept) and starts the summary timer, which a reload starts again.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    backfillTries = BACKFILL_TRIES
    try {
      if (await backfill($)) backfillTries = 0
    } catch {
      // The timer tries again.
    }
    $.clock.every(TICK_MS, () => void tick($))
    return result
  })

  // A /clear or a resume starts another conversation: the box starts over.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      // A resume brings another conversation's prompts to fill in; a /clear
      // starts an empty one, which must not be refilled from the old.
      backfillTries = e.reason === 'resume' ? BACKFILL_TRIES : 0
      try {
        await update($, entriesAtom, () => [])
        await update($, offsetAtom, () => 0)
        await update($, followAtom, () => true)
        await update($, expandedAtom, () => false)
      } catch {
        // Nothing to undo.
      }
    }
    return next(e)
  })

  // Lists the prompt before it goes on, so the box shows it at once; takes it
  // back off when a hook beneath drops it. Never holds the prompt up.
  on('prompt.submit', async ($, e, next) => {
    if (!shouldCapture(e.text, e.origin.kind)) return next(e)
    const id = crypto.randomUUID()
    try {
      // The context is read now, while the reply this prompt answers is the
      // newest one; the summary timer reads the transcript only when this fails.
      let context: string | undefined
      try {
        context = latestReply(await $.session.messages())
      } catch {
        context = undefined
      }
      await update($, entriesAtom, list => {
        const entry: Entry = { id, n: (list.at(-1)?.n ?? 0) + 1, text: e.text, context, status: 'pending', attempts: 0 }
        return [...list, entry]
      })
      await update($, followAtom, () => true)
    } catch {
      // The prompt goes on whatever happens to the list.
    }
    const result = await next(e)
    if (result.drop !== undefined) {
      try {
        await update($, entriesAtom, list => list.filter(entry => entry.id !== id))
      } catch {
        // A dropped prompt left on the list is only a stale row.
      }
    }
    return result
  })

  // The box above whatever the plugins beneath drew (token-weather's line).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    geometry = undefined // set again below only when the folded box is drawn
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const below = await next(e)
    const entries = await read($, entriesAtom)
    if (entries.length === 0) return below
    const size = bodySize(e.props.maxRows, below.type === 'engine' ? 0 : 1)
    if (size === 0) return below
    const cells = e.props.bodyColumns
    const numberWidth = String(entries.at(-1)?.n ?? 1).length
    const rows = entries.flatMap(entry => entryRows(entry, numberWidth, cells - 4))
    // Unfolded, every row is drawn and the engine scrolls the band under the
    // wheel (it only does for a tree taller than the band); folded, the box
    // keeps its own window of at most MAX_BODY_ROWS rows.
    const expanded = await read($, expandedAtom)
    let win: BodyWindow
    if (expanded) {
      win = { offset: 0, rows, above: 0, below: 0 }
    } else {
      const offset = (await read($, followAtom)) ? maxOffset(rows.length, size) : await read($, offsetAtom)
      win = windowRows(rows, offset, size)
      geometry = { size, total: rows.length, visible: win.rows.length }
    }
    const label = expanded ? TOGGLE_COLLAPSE : TOGGLE_EXPAND
    // ▲▼ only while rows are hidden; a band too narrow for them keeps the toggle.
    let arrows = !expanded && win.above + win.below > 0
    let parts = bottomBorderParts(win.below, cells, (arrows ? cellWidth(`${ARROW_UP} ${ARROW_DOWN} ─ `) : 0) + cellWidth(label))
    if (!parts && arrows) {
      arrows = false
      parts = bottomBorderParts(win.below, cells, cellWidth(label))
    }
    const band = e.requestId
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text color={BORDER_COLOR}>{topBorder(`이번 세션 프롬프트 (${entries.length})`, win.above, cells)}</Text>
        {win.rows.map(row => (
          <Box flexDirection="row" width={cells}>
            <Text color={BORDER_COLOR}>│ </Text>
            <Box flexGrow={1}>
              <Text color={row.color} bold={row.bold} wrap="truncate-end">{row.text}</Text>
            </Box>
            <Text color={BORDER_COLOR}> │</Text>
          </Box>
        ))}
        {parts ? (
          <Box flexDirection="row" width={cells}>
            <Text color={BORDER_COLOR}>{parts[0]}</Text>
            {arrows ? <Button key="up" label={ARROW_UP} plain onPress={() => moveBox($, -SCROLL_STEP)} /> : null}
            {arrows ? <Text color={BORDER_COLOR}>{' '}</Text> : null}
            {arrows ? <Button key="down" label={ARROW_DOWN} plain onPress={() => moveBox($, SCROLL_STEP)} /> : null}
            {arrows ? <Text color={BORDER_COLOR}>{' ─ '}</Text> : null}
            <Button key="toggle" label={label} plain onPress={() => toggle($, band)} />
            <Text color={BORDER_COLOR}>{parts[1]}</Text>
          </Box>
        ) : (
          <Text color={BORDER_COLOR}>{bottomBorder(win.below, cells)}</Text>
        )}
        {below}
      </Box>
    )
  })

  // The wheel over the box, or a scroll key while the band holds the focus,
  // moves the box's own window; the line beneath stays where it is.
  on('ui.scroll', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.origin.kind !== 'person') return next(e)
    const box = geometry
    if (!box || box.total <= box.size) return next(e)
    if (e.pointer && (e.pointer.row < 0 || e.pointer.row > box.visible + 1)) return next(e)
    await moveBox($, scrollStep(e.by, e.bodyRows, e.contentRows, box.size, box.total))
    return {}
  })
}
