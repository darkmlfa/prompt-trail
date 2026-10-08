import { expect, test } from 'claude-code/testing'

import {
  bodySize, bottomBorder, cellWidth, cutToWidth, entryRows, flatten, maxOffset, splitAtWidth, topBorder, windowRows,
  wrapToRows,
} from '../hooks/layout'

test('cellWidth counts Hangul and emoji as two cells', () => {
  expect(cellWidth('abc')).toBe(3)
  expect(cellWidth('가나')).toBe(4)
  expect(cellWidth('📏✨⏳')).toBe(6)
  expect(cellWidth('→…│')).toBe(3)
  expect(cellWidth('é')).toBe(1)
})

test('flatten joins lines and drops control codes', () => {
  expect(flatten('a\n\tb   c')).toBe('a b c')
  expect(flatten('\u001b[31mred\u001b[0m done')).toBe('red done')
  expect(flatten('  x\r\n')).toBe('x')
})

test('flatten turns a long pasted block into one line', () => {
  const block = Array.from({ length: 2000 }, (_, i) => `line ${i}\tvalue`).join('\n')
  const flat = flatten(block)
  expect(flat.includes('\n')).toBe(false)
  expect(flat.startsWith('line 0 value line 1 value')).toBe(true)
})

test('splitAtWidth never splits a wide character', () => {
  expect(splitAtWidth('가나다라', 5)).toEqual(['가나', '다라'])
  expect(splitAtWidth('abc', 0)).toEqual(['', 'abc'])
})

test('cutToWidth ends a cut with an ellipsis inside the width', () => {
  expect(cutToWidth('가나다라', 5)).toBe('가나…')
  expect(cutToWidth('abc', 5)).toBe('abc')
  expect(cutToWidth('ab cd', 4)).toBe('ab…')
  expect(cutToWidth('abc', 0)).toBe('')
})

test('wrapToRows wraps on words and cuts the last row', () => {
  expect(wrapToRows('박스 높이를 10줄로 제한, 넘치면 스크롤', 20, 2)).toEqual(['박스 높이를 10줄로', '제한, 넘치면 스크롤'])
  expect(wrapToRows('token-weather 위에 세션 프롬프트 목록 박스를 두는 mod, 준비물 문의 그리고 더 긴 설명이 이어지는 문장', 37, 2))
    .toEqual(['token-weather 위에 세션 프롬프트 목록', '박스를 두는 mod, 준비물 문의 그리고…'])
  expect(wrapToRows('supercalifragilisticexpialidocious', 10, 2)).toEqual(['supercalif', 'ragilisti…'])
  expect(wrapToRows('', 10, 2)).toEqual([])
  expect(wrapToRows('abc', 0, 2)).toEqual([])
})

test('wrapToRows ends when a row is narrower than one wide character', () => {
  expect(wrapToRows('가나', 1, 2)).toEqual(['가', '나'])
})

const PROMPT = '높이도 제한을 둬서 텍스트 10줄이 최대고 그거보다 길면 스크롤로 움직이도록 해야함'
const base = { id: 'a', n: 9, text: PROMPT, attempts: 0 }

test('a summarized entry is its first row and the summary, all in its color', () => {
  expect(entryRows({ ...base, status: 'done', emoji: '📏', summary: '박스 최대 10줄, 넘치면 스크롤' }, 2, 46)).toEqual([
    { text: '📏  9  높이도 제한을 둬서 텍스트 10줄이 최대…', color: '#ffd75f', bold: true },
    { text: '       → 박스 최대 10줄, 넘치면 스크롤', color: '#ffd75f', bold: false },
  ])
})

test('a pending entry waits with an hourglass', () => {
  expect(entryRows({ ...base, status: 'pending' }, 2, 46).map(r => r.text)).toEqual([
    '⏳  9  높이도 제한을 둬서 텍스트 10줄이 최대…',
    '       → 요약 중…',
  ])
})

test('a failed entry shows the rest of the prompt', () => {
  expect(entryRows({ ...base, status: 'failed', attempts: 2 }, 2, 46).map(r => r.text)).toEqual([
    '💬  9  높이도 제한을 둬서 텍스트 10줄이 최대…',
    '         고 그거보다 길면 스크롤로 움직이도록',
    '         해야함',
  ])
})

test('colors cycle by number', () => {
  const color = (n: number) => entryRows({ ...base, n, status: 'pending' }, 1, 46)[0]!.color
  expect([color(1), color(6), color(7)]).toEqual(['#5fd7ff', '#ffaf5f', '#5fd7ff'])
})

test('a narrow box still gives rows', () => {
  expect(() => entryRows({ ...base, status: 'done', emoji: '📏', summary: '요약' }, 3, 4)).not.toThrow()
})

test('windowRows clamps the offset', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ text: `r${i}`, color: '#fff', bold: false }))
  expect(windowRows(rows, 99, 10)).toEqual({ offset: 2, rows: rows.slice(2), above: 2, below: 0 })
  expect(windowRows(rows, -3, 10)).toEqual({ offset: 0, rows: rows.slice(0, 10), above: 0, below: 2 })
  expect(windowRows(rows.slice(0, 4), 0, 10)).toEqual({ offset: 0, rows: rows.slice(0, 4), above: 0, below: 0 })
  expect([maxOffset(12, 10), maxOffset(4, 10)]).toEqual([2, 0])
})

test('bodySize leaves room for the line beneath', () => {
  expect([bodySize(20, 1), bodySize(10, 1), bodySize(5, 1), bodySize(4, 1), bodySize(20, 0)]).toEqual([10, 7, 2, 0, 10])
})

test('borders are exactly the box width', () => {
  expect(topBorder('이번 세션 프롬프트 (12)', 4, 50)).toBe('╭─ 이번 세션 프롬프트 (12) ───────────────── ↑4 ─╮')
  expect(topBorder('이번 세션 프롬프트 (3)', 0, 50)).toBe('╭─ 이번 세션 프롬프트 (3) ───────────────────────╮')
  expect(bottomBorder(2, 50)).toBe('╰─────────────────────────────────────────── ↓2 ─╯')
  expect(bottomBorder(0, 20)).toBe('╰──────────────────╯')
})

test('borders survive a narrow band', () => {
  expect(topBorder('이번 세션 프롬프트 (3)', 0, 12)).toBe('╭─ 이번… ──╮')
  expect(topBorder('이번 세션 프롬프트 (3)', 2, 5)).toBe('╭───╮')
  expect(topBorder('t', 1, 2)).toBe('╭╮')
  expect(topBorder('t', 1, 1)).toBe('')
  expect(bottomBorder(3, 4)).toBe('╰──╯')
})
