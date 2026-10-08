// Terminal cells per code point: 0 for combining marks, joiners and variation
// selectors; 2 for Hangul, CJK, full-width forms and emoji; 1 for the rest.
type Range = readonly [number, number]

const ZERO: readonly Range[] = [[0x0300, 0x036f], [0x200b, 0x200f], [0xfe00, 0xfe0f]]
const WIDE: readonly Range[] = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff], [0x1fa70, 0x1faff],
]
// Wide symbols the box draws that sit outside those ranges.
const WIDE_SYMBOLS = new Set([...'✨✅❌❓⚡⏪⏳'])

const CSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g
const CONTROL = /[\u0000-\u001f\u007f]/g

function inRanges(cp: number, ranges: readonly Range[]): boolean {
  return ranges.some(([lo, hi]) => cp >= lo && cp <= hi)
}

function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  if (inRanges(cp, ZERO)) return 0
  if (WIDE_SYMBOLS.has(ch) || inRanges(cp, WIDE)) return 2
  return 1
}

export function cellWidth(s: string): number {
  let cells = 0
  for (const ch of s) cells += charWidth(ch)
  return cells
}

// One clean line: escape sequences gone, control characters and runs of
// whitespace (newlines, tabs) turned into single spaces.
export function flatten(text: string): string {
  return text.replace(CSI, '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()
}

export function splitAtWidth(s: string, cells: number): [head: string, rest: string] {
  let head = ''
  let used = 0
  for (const ch of s) {
    const w = charWidth(ch)
    if (used + w > cells) return [head, s.slice(head.length)]
    head += ch
    used += w
  }
  return [s, '']
}

export function cutToWidth(s: string, cells: number): string {
  if (cellWidth(s) <= cells) return s
  if (cells <= 0) return ''
  return `${splitAtWidth(s, cells - 1)[0].trimEnd()}…`
}

// Splits a word too wide for a row; a row narrower than its first character
// still takes that character, so the split always moves on.
function splitWord(word: string, cells: number): [head: string, rest: string] {
  const [head, rest] = splitAtWidth(word, cells)
  if (head) return [head, rest]
  const first = [...word][0] ?? ''
  return [first, word.slice(first.length)]
}

// Greedy word wrap into at most maxRows rows; what does not fit is folded
// into the last row, cut with an ellipsis.
export function wrapToRows(s: string, cells: number, maxRows: number): string[] {
  if (!s || cells <= 0 || maxRows <= 0) return []
  const rows: string[] = []
  let current = ''
  for (let word of s.split(' ')) {
    while (cellWidth(word) > cells) {
      if (current) {
        rows.push(current)
        current = ''
      }
      const [head, rest] = splitWord(word, cells)
      rows.push(head)
      word = rest
    }
    const candidate = current ? `${current} ${word}` : word
    if (cellWidth(candidate) <= cells) {
      current = candidate
    } else {
      rows.push(current)
      current = word
    }
  }
  if (current) rows.push(current)
  if (rows.length <= maxRows) return rows
  const kept = rows.slice(0, maxRows)
  kept[maxRows - 1] = cutToWidth(`${kept[maxRows - 1]} ${rows.slice(maxRows).join(' ')}`, cells)
  return kept
}
