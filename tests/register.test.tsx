import type { ModelCompleteInput, On, SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
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

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const

function session(on: On, messages: SessionMessage[] = []) {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.messages', () => ({ value: messages }))
}

function haiku(on: On, replies: string[], wait?: () => Promise<void>) {
  const calls: ModelCompleteInput[] = []
  on('model.complete', async ($, e) => {
    calls.push(e)
    if (wait) await wait()
    return { value: { isAnswered: true, text: replies[calls.length - 1] ?? 'nope', usage: USAGE } }
  })
  return calls
}

test('a pending entry gets its emoji and summary from Haiku', async ($, on) => {
  const clock = mock.clock(on); weather(on); passPrompts(on); session(on)
  const calls = haiku(on, ['{"emoji":"🐛","summary":"로그인 버그 수정 요청"}'])
  await $.session.start(START)
  await submit($, '로그인 버그 고쳐줘')
  await clock.advance(1000)
  const t = await texts(await mountBand($))
  expect(t).toContain('🐛 1  로그인 버그 고쳐줘')
  expect(t).toContain('      → 로그인 버그 수정 요청')
  expect(calls[0]!.model).toBe('haiku')
})

test('one call at a time, newest first', async ($, on) => {
  const clock = mock.clock(on); weather(on); passPrompts(on); session(on)
  const calls = haiku(on, ['{"emoji":"🐛","summary":"둘째"}', '{"emoji":"🎨","summary":"첫째"}'], () => clock.sleep(5000))
  await $.session.start(START)
  await submit($, '첫 프롬프트'); await submit($, '둘째 프롬프트')
  await clock.advance(1000); await clock.advance(1000)
  expect(calls.length).toBe(1)
  expect(calls[0]!.prompt).toContain('둘째 프롬프트')
  await clock.advance(5000); await clock.advance(1000)
  expect(calls.length).toBe(2)
  expect(calls[1]!.prompt).toContain('첫 프롬프트')
})

test('a reply that is no summary is tried twice, then the rest of the prompt shows', async ($, on) => {
  const clock = mock.clock(on); weather(on); passPrompts(on); session(on)
  const calls = haiku(on, ['nope', 'nope'])
  await $.session.start(START)
  await submit($, '높이도 제한을 둬서 텍스트 10줄이 최대고 그거보다 길면 스크롤로 움직이도록 해야함')
  await clock.advance(1000); await clock.advance(1000); await clock.advance(1000)
  expect(calls.length).toBe(2)
  const t = await texts(await mountBand($))
  expect(t.some(x => x.startsWith('💬 1  높이도'))).toBe(true)
  expect(t.some(x => x.trim().startsWith('→'))).toBe(false)
})

test('an empty reply from the API counts as an attempt', async ($, on) => {
  const clock = mock.clock(on); weather(on); passPrompts(on); session(on)
  let n = 0
  on('model.complete', () => {
    n++
    return { value: { isAnswered: false, reason: 'empty-reply', usage: USAGE } }
  })
  await $.session.start(START)
  await submit($, 'p1')
  await clock.advance(1000); await clock.advance(1000); await clock.advance(1000)
  expect(n).toBe(2)
})

test('the context sent is the assistant text before the prompt', async ($, on) => {
  const clock = mock.clock(on); weather(on); passPrompts(on)
  session(on, [{ role: 'user', text: '첫', toolUses: [] }, { role: 'assistant', text: 'B안으로 갈까요?', toolUses: [] }, { role: 'user', text: '진행해', toolUses: [] }])
  const calls = haiku(on, ['{"emoji":"✅","summary":"B안 승인"}'])
  await $.session.start(START)
  await submit($, '진행해')
  await clock.advance(1000)
  expect(calls.at(-1)!.prompt).toContain('B안으로 갈까요?')
})

test('prompts from before the mod loaded are filled in at start, once', async ($, on) => {
  mock.clock(on); weather(on); passPrompts(on)
  session(on, [{ role: 'user', text: '첫 요청', toolUses: [] }, { role: 'assistant', text: '답', toolUses: [] },
    { role: 'user', text: '<command-name>/x</command-name>', toolUses: [] }, { role: 'user', text: '둘째 요청', toolUses: [] }])
  await $.session.start(START)
  await $.session.start(START)
  const t = await texts(await mountBand($))
  expect(t.filter(x => /^⏳ \d  /.test(x))).toEqual(['⏳ 1  첫 요청', '⏳ 2  둘째 요청'])
})

test('/clear empties the box', async ($, on) => {
  weather(on); passPrompts(on); session(on)
  await submit($, 'p1')
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  expect(await texts(await mountBand($))).toEqual(['WEATHER'])
})

test('a reply arriving after /clear does not bring the entry back', async ($, on) => {
  const clock = mock.clock(on); weather(on); passPrompts(on); session(on)
  haiku(on, ['{"emoji":"🐛","summary":"늦은 답"}'], () => clock.sleep(5000))
  await $.session.start(START)
  await submit($, 'p1')
  await clock.advance(1000)
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  await clock.advance(5000)
  expect(await texts(await mountBand($))).toEqual(['WEATHER'])
})

test('after /clear the wheel goes back to the engine', async ($, on) => {
  weather(on); passPrompts(on); session(on); const passed = passScroll(on)
  for (let i = 1; i <= 6; i++) await submit($, `p${i}`)
  const ui = await mountBand($)
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  expect(await texts(ui)).toEqual(['WEATHER'])
  await wheel($, -1)
  expect(passed).toEqual([-1])
})
