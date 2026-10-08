import { expect, test } from 'claude-code/testing'

import { cellWidth, cutToWidth, flatten, splitAtWidth, wrapToRows } from '../hooks/layout'

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
