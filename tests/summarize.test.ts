import { expect, test } from 'claude-code/testing'

import { cellWidth } from '../hooks/layout'
import { buildRequest, EMOJI, parseReply } from '../hooks/summarize'

test('every allowed emoji is one wide code point', () => {
  expect(EMOJI.length).toBe(33)
  for (const [emoji] of EMOJI) {
    expect([...emoji].length).toBe(1)
    expect(cellWidth(emoji)).toBe(2)
  }
  expect(EMOJI.map(([e]) => e)).not.toContain('⏳')
})

test('the request carries the prompt, the context and the emoji list', () => {
  const { system, prompt } = buildRequest('진행해', '…B안으로 갈까요?')
  expect(prompt).toContain('진행해')
  expect(prompt).toContain('B안으로 갈까요?')
  expect(system).toContain('70자')
  for (const [emoji] of EMOJI) expect(system).toContain(emoji)
})

test('the request caps a long prompt', () => {
  expect(buildRequest('x'.repeat(10000), '').prompt.length).toBeLessThan(4200)
})

test('parseReply reads plain, fenced and wrapped JSON', () => {
  expect(parseReply('{"emoji":"🐛","summary":"로그인 버그 수정 요청"}')).toEqual({ emoji: '🐛', summary: '로그인 버그 수정 요청' })
  expect(parseReply('```json\n{"emoji":"🎨","summary":"색 변경"}\n```')).toEqual({ emoji: '🎨', summary: '색 변경' })
  expect(parseReply('알겠습니다. {"emoji":"📋","summary":"계획 승인"} 입니다')).toEqual({ emoji: '📋', summary: '계획 승인' })
})

test('parseReply falls back to the speech balloon for an emoji outside the list', () => {
  expect(parseReply('{"emoji":"✏️","summary":"문서 수정"}')).toEqual({ emoji: '💬', summary: '문서 수정' })
  expect(parseReply('{"emoji":"🐛🐛","summary":"버그"}')).toEqual({ emoji: '💬', summary: '버그' })
})

test('parseReply refuses what is not a summary', () => {
  expect(parseReply('요약할 수 없습니다')).toBeNull()
  expect(parseReply('{"emoji":"🐛"}')).toBeNull()
  expect(parseReply('{"emoji":"🐛","summary":"   "}')).toBeNull()
  expect(parseReply('{broken')).toBeNull()
})
