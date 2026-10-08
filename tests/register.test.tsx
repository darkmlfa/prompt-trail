import { expect, test } from 'claude-code/testing'

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
