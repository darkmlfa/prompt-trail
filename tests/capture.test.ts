import type { SessionMessage } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { backfillFromMessages, contextBefore, isMetaText, shouldCapture } from '../hooks/capture'

const user = (text: string, extra: Partial<SessionMessage> = {}): SessionMessage => ({ role: 'user', text, toolUses: [], ...extra })
const bot = (text: string): SessionMessage => ({ role: 'assistant', text, toolUses: [] })
const RESULT = { tool_use_id: 't1', text: 'ok', isError: false, result: null } as unknown as NonNullable<SessionMessage['toolResults']>[number]

test('only typed prompts are captured', () => {
  expect(shouldCapture('로그인 고쳐줘', 'composer')).toBe(true)
  expect(shouldCapture('폰에서 보냄', 'bridge')).toBe(true)
  expect(shouldCapture('작업 끝남', 'task-notification')).toBe(false)
  expect(shouldCapture('hi', 'peer')).toBe(false)
  expect(shouldCapture('/clear', 'composer')).toBe(false)
  expect(shouldCapture('   ', 'composer')).toBe(false)
})

test('meta rows are recognised', () => {
  for (const t of ['<command-name>/clear</command-name>', '<local-command-caveat>x', 'Base directory for this skill: /tmp/x',
    '[Request interrupted by user]', 'This session is being continued from a previous conversation that ran out of context.',
    'Caveat: The messages below were generated']) expect(isMetaText(t)).toBe(true)
  expect(isMetaText('나 모드를 하나 만들고 싶은데')).toBe(false)
})

test('context is the tail of the assistant text before the prompt', () => {
  const ctx = contextBefore([user('첫 질문'), bot('A'.repeat(2000) + '끝'), user('진행해')], '진행해')
  expect(ctx.length).toBe(1500)
  expect(ctx.endsWith('끝')).toBe(true)
})

test('context skips tool rows with no text', () => {
  expect(contextBefore([bot('설명'), bot(''), user('', { toolResults: [RESULT] }), user('좋아')], '좋아')).toBe('설명')
})

test('a prompt not in the transcript takes the latest assistant text', () => {
  expect(contextBefore([bot('앞'), bot('마지막')], '작업 중 보낸 메시지')).toBe('마지막')
  expect(contextBefore([], 'x')).toBe('')
})

test('backfill keeps typed prompts with their context', () => {
  const msgs = [user('<command-name>/clear</command-name>'), user('첫 요청'), bot('답 1'),
    user('Base directory for this skill: /x'), user('', { toolResults: [RESULT] }), bot('답 2'), user('둘째 요청')]
  expect(backfillFromMessages(msgs, 50)).toEqual([{ text: '첫 요청', context: '' }, { text: '둘째 요청', context: '답 2' }])
})

test('backfill keeps the newest prompts up to the limit', () => {
  const kept = backfillFromMessages(Array.from({ length: 60 }, (_, i) => user(`p${i}`)), 50)
  expect(kept.length).toBe(50)
  expect(kept[0]!.text).toBe('p10')
})
