import { FALLBACK_EMOJI, flatten } from './layout'

export const SUMMARY_MODEL = 'haiku'
export const MAX_PROMPT_CHARS = 4000

// The emoji Haiku may pick from, each one code point two cells wide, so the
// box's right border stays put. The hourglass is kept for "waiting".
export const EMOJI: ReadonlyArray<readonly [emoji: string, meaning: string]> = [
  ['🔧', '수정·설정'], ['🐛', '버그'], ['✨', '새 기능'], ['📝', '문서·글'], ['🎨', 'UI·디자인'],
  ['🚀', '실행·배포'], ['🔍', '조사·검색'], ['❓', '질문'], ['📦', '패키지·빌드'], ['🧪', '테스트'],
  ['📏', '크기·제한'], ['💡', '아이디어'], ['✅', '승인·진행'], ['❌', '취소·거절'], ['🧹', '정리·리팩터링'],
  ['📋', '계획·목록'], ['🎯', '목표·범위'], ['🧩', '연동·구성'], ['🔑', '인증·권한'], ['🌐', '웹·네트워크'],
  ['📊', '데이터·차트'], ['🔀', '브랜치·병합'], ['⏪', '되돌리기'], ['🤔', '검토·고민'], ['💬', '일반 대화'],
  ['📁', '파일·폴더'], ['🔒', '보안'], ['🧭', '방향·탐색'], ['🧱', '구조·뼈대'], ['🌈', '색·테마'],
  ['🔁', '반복·재시도'], ['🔗', '링크·연결'], ['📌', '메모·기억'],
]

const ALLOWED = new Set(EMOJI.map(([emoji]) => emoji))

const SYSTEM = [
  '너는 코딩 어시스턴트와 사용자의 대화에서 사용자 프롬프트 하나를 짧게 묘사한다.',
  '직전 어시스턴트 답변이 주어지면 그 맥락에서 사용자가 무엇을 요청하거나 결정했는지 쓴다.',
  '요약은 한국어 한 문장, 70자 이내로 쓴다.',
  '이모지는 아래 목록에서 내용에 가장 어울리는 것 하나만 고른다.',
  ...EMOJI.map(([emoji, meaning]) => `${emoji} ${meaning}`),
  '출력은 JSON 한 줄만: {"emoji":"…","summary":"…"}',
].join('\n')

export type Parsed = { emoji: string; summary: string }

export function buildRequest(text: string, context: string): { system: string; prompt: string } {
  const capped = Array.from(text).slice(0, MAX_PROMPT_CHARS).join('')
  return {
    system: SYSTEM,
    prompt: `[직전 어시스턴트 답변 끝부분]\n${context || '(없음)'}\n\n[사용자 프롬프트]\n${capped}`,
  }
}

// Reads the first {...} in the reply, so a fence or a sentence around the JSON
// does not matter; an emoji outside the list becomes the speech balloon.
export function parseReply(reply: string): Parsed | null {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let data: unknown
  try {
    data = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const { emoji, summary } = data as { emoji?: unknown; summary?: unknown }
  if (typeof summary !== 'string' || !summary.trim()) return null
  return {
    emoji: typeof emoji === 'string' && ALLOWED.has(emoji) ? emoji : FALLBACK_EMOJI,
    summary: flatten(summary),
  }
}
