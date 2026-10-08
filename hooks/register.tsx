import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Entry } from '../types'
import { shouldCapture } from './capture'
import { BORDER_COLOR, bodySize, bottomBorder, entryRows, maxOffset, topBorder, windowRows } from './layout'

const entriesAtom = atom({ plugin: 'prompt-trail', key: 'entries' } as const, [] as Entry[])
const offsetAtom = atom({ plugin: 'prompt-trail', key: 'offset' } as const, 0)
const followAtom = atom({ plugin: 'prompt-trail', key: 'follow' } as const, true)

// The box as last drawn, for the scroll hook: the body rows it may show, its
// rows in all, and the rows on screen.
let geometry: { size: number; total: number; visible: number } | undefined

export const register: Register = on => {
  // Lists the prompt before it goes on, so the box shows it at once; takes it
  // back off when a hook beneath drops it. Never holds the prompt up.
  on('prompt.submit', async ($, e, next) => {
    if (!shouldCapture(e.text, e.origin.kind)) return next(e)
    const id = crypto.randomUUID()
    try {
      await update($, entriesAtom, list => {
        const entry: Entry = { id, n: (list.at(-1)?.n ?? 0) + 1, text: e.text, status: 'pending', attempts: 0 }
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
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const below = await next(e)
    const entries = await read($, entriesAtom)
    if (entries.length === 0) return below
    const size = bodySize(e.props.maxRows, below.type === 'engine' ? 0 : 1)
    if (size === 0) return below
    const cells = e.props.bodyColumns
    const numberWidth = String(entries.at(-1)?.n ?? 1).length
    const rows = entries.flatMap(entry => entryRows(entry, numberWidth, cells - 4))
    const offset = (await read($, followAtom)) ? maxOffset(rows.length, size) : await read($, offsetAtom)
    const win = windowRows(rows, offset, size)
    geometry = { size, total: rows.length, visible: win.rows.length }
    const { Box, Text } = $.ui.resolve(e)
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
        <Text color={BORDER_COLOR}>{bottomBorder(win.below, cells)}</Text>
        {below}
      </Box>
    )
  })
}
