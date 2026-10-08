import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { mountBand, passPrompts, PROPS, submit, texts, weather } from './helpers'

test('with no prompts the band shows only what is beneath', async ($, on) => {
  weather(on)
  const ui = await mountBand($)
  expect(await texts(ui)).toEqual(['WEATHER'])
})

test('a typed prompt appears in a box above the line beneath', async ($, on) => {
  weather(on); passPrompts(on)
  await submit($, '로그인 버그 고쳐줘')
  expect(await texts(await mountBand($))).toEqual([
    '╭─ 이번 세션 프롬프트 (1) ───────────────────────╮',
    '│ ', '⏳ 1  로그인 버그 고쳐줘', ' │',
    '│ ', '      → 요약 중…', ' │',
    '╰────────────────────────────────────────────────╯',
    'WEATHER',
  ])
})

test('rows take the entry color and the first row is bold', async ($, on) => {
  weather(on); passPrompts(on)
  await submit($, '로그인 버그 고쳐줘')
  const ui = await mountBand($)
  const first = await ui.find({ type: 'Text', text: '⏳ 1  로그인 버그 고쳐줘' })
  const second = await ui.find({ type: 'Text', text: '      → 요약 중…' })
  expect(first?.props).toMatchObject({ color: '#5fd7ff', bold: true })
  expect(second?.props).toMatchObject({ color: '#5fd7ff', bold: false })
})

test('notifications, peers and slash commands are not listed', async ($, on) => {
  weather(on); passPrompts(on)
  await submit($, '작업 끝남', 'task-notification')
  await submit($, '/clear')
  expect(await texts(await mountBand($))).toEqual(['WEATHER'])
})

test('a dropped prompt is taken back off the list', async ($, on) => {
  weather(on)
  on('prompt.submit', () => ({ drop: '막힘' }))
  await submit($, '막힐 프롬프트')
  expect(await texts(await mountBand($))).toEqual(['WEATHER'])
})

test('twelve rows show as ten with the hidden count on top', async ($, on) => {
  weather(on); passPrompts(on)
  for (let i = 1; i <= 6; i++) await submit($, `p${i}`)
  const t = await texts(await mountBand($))
  expect(t[0]).toBe('╭─ 이번 세션 프롬프트 (6) ────────────────── ↑2 ─╮')
  expect(t.filter(x => x === '│ ').length).toBe(10)
  expect(t.at(-2)).toBe('╰────────────────────────────────────────────────╯')
})

test('a survey keeps the band to itself', async ($, on) => {
  weather(on); passPrompts(on)
  await submit($, 'p1')
  expect(await texts(await mountBand($, { ...PROPS, hasSurvey: true }))).toEqual(['WEATHER'])
})

test('only the terminal is drawn on', async ($, on) => {
  weather(on); passPrompts(on)
  await submit($, 'p1')
  expect(await texts(await mountBand($, PROPS, 'desktop'))).toEqual(['WEATHER'])
})

test('a low band shrinks the box and keeps the line beneath', async ($, on) => {
  weather(on); passPrompts(on)
  for (let i = 1; i <= 6; i++) await submit($, `p${i}`)
  const t = await texts(await mountBand($, { ...PROPS, maxRows: 7 }))
  expect(t.filter(x => x === '│ ').length).toBe(4)
  expect(t.at(-1)).toBe('WEATHER')
})

test('a band too low for two rows draws no box', async ($, on) => {
  weather(on); passPrompts(on)
  await submit($, 'p1')
  expect(await texts(await mountBand($, { ...PROPS, maxRows: 4 }))).toEqual(['WEATHER'])
})

test('the engine drawing beneath takes no row', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))
  passPrompts(on)
  for (let i = 1; i <= 6; i++) await submit($, `p${i}`)
  const ui = await mountBand($, { ...PROPS, maxRows: 7 })
  expect((await texts(ui)).filter(x => x === '│ ').length).toBe(5)
  const drawn = await ui.drawn()
  expect(drawn.type === 'Box' && drawn.children?.at(-1)).toEqual({ type: 'engine', ref: 0 })
})

function passScroll(on: On) {
  const passed: number[] = []
  on('ui.scroll', ($, e) => {
    passed.push(e.by)
    return {}
  })
  return passed
}

const wheel = ($: Engine, by: number, row: number | undefined = 1) => $.ui.scroll({
  component: 'AbovePrompt', requestId: 'band', offset: 0, by, bodyRows: 20, contentRows: 13,
  origin: { kind: 'person' }, ...(row === undefined ? {} : { pointer: { column: 5, row } }),
})

test('the wheel over the box moves its window and the counts follow', async ($, on) => {
  weather(on); passPrompts(on); passScroll(on)
  for (let i = 1; i <= 6; i++) await submit($, `p${i}`)
  const ui = await mountBand($)
  await wheel($, -1)
  let t = await texts(ui)
  expect(t[0]!.endsWith(' ↑1 ─╮')).toBe(true)
  expect(t.at(-2)!.endsWith(' ↓1 ─╯')).toBe(true)
  await wheel($, -5)
  t = await texts(ui)
  expect(t[0]).toBe('╭─ 이번 세션 프롬프트 (6) ───────────────────────╮')
  expect(t.at(-2)!.endsWith(' ↓2 ─╯')).toBe(true)
})

test('the wheel past the end stays at the end', async ($, on) => {
  weather(on); passPrompts(on); passScroll(on)
  for (let i = 1; i <= 6; i++) await submit($, `p${i}`)
  const ui = await mountBand($)
  await wheel($, 9)
  const t = await texts(ui)
  expect(t[0]!.endsWith(' ↑2 ─╮')).toBe(true)
  expect(t.at(-2)).toBe('╰────────────────────────────────────────────────╯')
})

test('a new prompt jumps back to the bottom', async ($, on) => {
  weather(on); passPrompts(on); passScroll(on)
  for (let i = 1; i <= 6; i++) await submit($, `p${i}`)
  const ui = await mountBand($)
  await wheel($, -2)
  await submit($, 'p7')
  const t = await texts(ui)
  expect(t[0]).toBe('╭─ 이번 세션 프롬프트 (7) ────────────────── ↑4 ─╮')
  expect(t.at(-2)).toBe('╰────────────────────────────────────────────────╯')
})

test('the wheel over the line beneath goes to the engine', async ($, on) => {
  weather(on); passPrompts(on); const passed = passScroll(on)
  for (let i = 1; i <= 6; i++) await submit($, `p${i}`)
  await mountBand($)
  await wheel($, -1, 12)
  expect(passed).toEqual([-1])
})

test('nothing to scroll goes to the engine', async ($, on) => {
  weather(on); passPrompts(on); const passed = passScroll(on)
  await submit($, 'p1')
  await mountBand($)
  await wheel($, -1)
  expect(passed).toEqual([-1])
})

test('a scroll key with no pointer moves the box too', async ($, on) => {
  weather(on); passPrompts(on); const passed = passScroll(on)
  for (let i = 1; i <= 6; i++) await submit($, `p${i}`)
  const ui = await mountBand($)
  await wheel($, -1, undefined)
  expect(passed).toEqual([])
  expect((await texts(ui))[0]!.endsWith(' ↑1 ─╮')).toBe(true)
})
