# prompt-trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 입력창 위 band에서 token-weather 줄 바로 위에 테두리 박스를 그리고, 이번 세션 프롬프트를 항목마다 색·이모지·원문 첫 행·Haiku 요약(최대 2행)으로 보여주며, 박스 안은 최대 10행에 휠로 스크롤되는 mod를 만든다.

**Architecture:** 훅 모듈 하나(`hooks/register.tsx`)가 엔진 이벤트(`prompt.submit`, `session.start`, `session.end`, `AbovePrompt`의 `ui.render`·`ui.scroll`)를 연결하고 화면을 그린다. 로직은 `$`를 모르는 순수 모듈 셋에 둔다: `layout.ts`(폭·자르기·줄 나누기·행·창·테두리), `summarize.ts`(Haiku 요청·응답 해석·이모지 목록), `capture.ts`(수집 규칙·세션 기록 필터·문맥). 상태는 `$.state`의 `'prompt-trail'` 아래에 두고, `session.start`에서 시작한 1초 타이머가 대기 항목을 하나씩 요약한다.

**Tech Stack:** Claude Code 2.1.294 function hooks(TypeScript/TSX, JSX는 전역 `h`), `claude-code/testing` 테스트 도구, 타입 검사는 npx의 TypeScript 5.6.3.

**Spec:** `docs/2026-10-08-prompt-trail-design.md`

## Global Constraints

- 저장소 루트 = mod 루트: `~/.claude/plugin-sources/prompt-trail` (GitHub `darkmlfa/prompt-trail`, `main`). 이번 세션은 `~/.claude/dev-mods/46ccabd9-f29b-4be9-9bf2-3af640d5ea47/prompt-trail` 링크로 로드하며, 파일 변경은 턴이 끝날 때 반영된다.
- plugin 이름 `prompt-trail`. `$.state` 키는 모두 `'prompt-trail'` 아래의 `entries`, `offset`, `follow`.
- 터미널 표면만 그린다. 다른 `e.surface`는 `next(e)`.
- 훅 환경에는 Node·DOM이 없다. plugin 파일끼리는 확장자 없이 import(`'./layout'`), `import()` 금지, `$`를 받는 도우미는 최상위 함수.
- 타입 계약(`types/index.d.ts`)은 타입만 export 한다(`export {}` 금지).
- 테스트에서 `session.messages`·`model.complete`에 답하는 훅은 `{ value: ... }`로 감싼다.
- 값: 박스 안 최대 `10`행 / 색 `#5fd7ff #ff87d7 #ffd75f #87d787 #af87ff #ffaf5f`를 `(n - 1) % 6`으로 / 테두리 색 `#6c6c6c` / 제목 `이번 세션 프롬프트 (N)` / 대기 행 `→ 요약 중…` / 대기 이모지 `⏳` / 대체 이모지 `💬` / 모델 `'haiku'`, `maxTokens: 300`, `timeoutMs: 20000` / 문맥은 직전 Claude 답변 끝 `1500`자 / 보내는 프롬프트는 `4000`자까지 / 요약은 한국어 70자 이내, 2행까지 표시 / 시도 최대 `2`번 / 이전 프롬프트 채우기 최대 `50`개 / 타이머 `1000`ms.
- 수집하는 origin은 `composer`, `bridge`. `/`로 시작하는 텍스트는 뺀다.
- 커밋 메시지는 한국어, `feat:`/`test:`/`docs:` 접두어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. 태스크마다 `git push`.

모든 태스크가 쓰는 명령:

- 검증: `claude plugin validate ~/.claude/plugin-sources/prompt-trail` → `✔ Validation passed` (경고는 괜찮음)
- 테스트: `claude plugin test ~/.claude/plugin-sources/prompt-trail` → `0 fail`
- 타입 검사: `npx -y -p typescript@5.6.3 tsc -p "$SCRATCH/tsconfig.prompt-trail.json"` → 출력 없이 종료 코드 0 (`$SCRATCH`와 파일은 Task 1에서 만든다)

## Review Focus

1. 여러 줄을 붙여 넣은 긴 프롬프트(코드, 수천 줄, 탭, ANSI 색 코드): 첫 행은 깨끗한 한 줄이어야 하고 Haiku 요청은 잘려야 한다 → Task 2 `flatten`, Task 4 `buildRequest` 테스트.
2. 좁은 터미널(`bodyColumns` 12 이하): 테두리·행이 예외를 내지 않고(음수 `repeat`는 `RangeError`) 폭을 넘지 않아야 한다 → Task 3 테스트.
3. 요약 호출 중에 `/clear`: 늦게 온 응답이 지운 항목을 되살리면 안 된다 → Task 8 테스트.
4. JSON 앞뒤에 설명이 붙은 응답, 코드 펜스, VS16 이모지(`✏️`): 읽을 수 있는 만큼 읽고 💬로 대체 → Task 4 테스트.
5. 요약보다 빨리 들어오는 프롬프트: 모델 호출은 한 번에 하나, 최신 항목부터 → Task 8 테스트.

---

### Task 1: 로드되고 band를 그대로 통과시키는 뼈대

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`, `hooks/register.tsx`, `types/index.d.ts`, `tests/helpers.tsx`, `tests/register.test.tsx`
- Create(저장소 밖): `$SCRATCH/tsconfig.prompt-trail.json`

**Interfaces:**
- Produces `types/index.d.ts`:
  ```ts
  export type EntryStatus = 'pending' | 'done' | 'failed'
  export type Entry = {
    id: string; n: number; text: string; context?: string
    status: EntryStatus; attempts: number; emoji?: string; summary?: string
  }
  declare module 'claude-code' {
    interface PluginState {
      'prompt-trail': { entries: Entry[]; offset: number; follow: boolean }
    }
  }
  ```
- Produces `tests/helpers.tsx` (Task 6–8에서 재사용):
  - `PROPS` = `{ hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 50, scroll: { offset: 0, bodyRows: 20 }, view: {} }`
  - `weather(on: On): void` — 테스트의 `ui.render`(`AbovePrompt`) 훅으로 `<Text>WEATHER</Text>`를 그린다(token-weather 대역)
  - `passPrompts(on: On): void` — 바닥 `prompt.submit` 훅, `({ text: e.text })`
  - `mountBand($: Engine, props = PROPS, surface: 'terminal' | 'desktop' = 'terminal')` — `$.ui.mount({ plugin: 'prompt-trail', surface, component: 'AbovePrompt', props, requestId: 'band' })`
  - `texts(ui): Promise<string[]>` — `ui.findAll({ type: 'Text' })`의 `.text`를 문서 순서대로
  - `submit($: Engine, text: string, kind = 'composer'): Promise<void>` — `$.prompt.submit({ text, origin: { kind } as PromptOrigin, wait: false })`

- [ ] **Step 1: 타입 검사 설정을 만든다.** `SCRATCH=/tmp/claude-1000/-mnt-d-workspace-2026-KOICA/46ccabd9-f29b-4be9-9bf2-3af640d5ea47/scratchpad` (저장소 밖이면 어디든). `$SCRATCH/tsconfig.prompt-trail.json`:
  ```json
  {
    "compilerOptions": {
      "target": "es2023", "lib": ["es2023"], "types": [],
      "module": "esnext", "moduleResolution": "bundler",
      "strict": true, "noUncheckedIndexedAccess": true,
      "noEmit": true, "skipLibCheck": true,
      "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment"
    },
    "files": ["/tmp/claude-1000/bundled-skills/2.1.293/1ccdef53fc0ef54b77a2b20ff0eb3007/plugin-authoring/types/claude-code.d.ts"],
    "include": [
      "/home/dark/.claude/plugin-sources/prompt-trail/hooks",
      "/home/dark/.claude/plugin-sources/prompt-trail/types",
      "/home/dark/.claude/plugin-sources/prompt-trail/tests"
    ]
  }
  ```
  `files`의 경로가 없으면(프로세스 재시작) plugin-authoring 스킬을 다시 불러 그 경로를 쓰거나, mod가 한 번 로드된 뒤에는 `.claude-plugin/types/claude-code/index.d.ts`를 쓴다.

- [ ] **Step 2: 실패하는 테스트를 쓴다.** `tests/helpers.tsx`(위 Interfaces 그대로)와 `tests/register.test.tsx`:
  ```tsx
  test('with no prompts the band shows only what is beneath', async ($, on) => {
    weather(on)
    const ui = await mountBand($)
    expect(await texts(ui)).toEqual(['WEATHER'])
  })
  ```

- [ ] **Step 3: 테스트를 돌려 실패를 확인한다.** 테스트 명령 → plugin(`prompt-trail`)을 찾지 못해 FAIL.

- [ ] **Step 4: manifest·계약·훅 모듈을 쓴다.**
  - `plugin.json`: `{ "name": "prompt-trail", "version": "0.1.0", "description": "이번 세션 프롬프트를 token-weather 위 박스에 원문 첫 줄과 Haiku 요약으로 보여준다", "author": { "name": "darkmlfa" }, "types": "./types/index.d.ts" }`
  - `marketplace.json`: `{ "name": "prompt-trail", "owner": { "name": "darkmlfa" }, "plugins": [{ "name": "prompt-trail", "source": "./", "description": "<plugin.json과 같은 설명>" }] }`
  - `hooks.json`: `{ "modules": ["./register.tsx"] }`
  - `register.tsx`: `export const register: Register = on => { on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => next(e)) }`

- [ ] **Step 5: 검증·테스트·타입 검사를 돌린다.** 세 명령 모두 통과.

- [ ] **Step 6: 커밋하고 push 한다.**
  ```bash
  cd ~/.claude/plugin-sources/prompt-trail && git add -A && git commit -m "feat: prompt-trail 뼈대 (manifest, 상태 계약, band 통과)" && git push
  ```

---

### Task 2: 글자 폭과 자르기 (`hooks/layout.ts` 1부)

**Files:**
- Create: `hooks/layout.ts`, `tests/layout.test.ts`

**Interfaces:**
- Produces:
  - `cellWidth(s: string): number`
  - `flatten(text: string): string`
  - `splitAtWidth(s: string, cells: number): [head: string, rest: string]`
  - `cutToWidth(s: string, cells: number): string`
  - `wrapToRows(s: string, cells: number, maxRows: number): string[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `tests/layout.test.ts`:
  ```ts
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
  ```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다.** → `layout` 모듈이 없어 FAIL.

- [ ] **Step 3: `hooks/layout.ts`에 다섯 함수를 쓴다.** 코드 포인트 단위(`for…of`)로 처리한다.
  - `cellWidth`: 0칸 = U+0300–036F, U+200B–200F, U+FE00–FE0F. 2칸 = 집합 `✨✅❌❓⚡⏪⏳` 또는 범위 U+1100–115F, U+2E80–303E, U+3041–A4CF, U+AC00–D7A3, U+F900–FAFF, U+FE30–FE4F, U+FF00–FF60, U+FFE0–FFE6, U+1F300–1F64F, U+1F680–1F6FF, U+1F900–1F9FF, U+1FA70–1FAFF. 나머지 1칸.
  - `flatten`: ANSI CSI(`/\u001b\[[0-9;?]*[ -\/]*[@-~]/g`)를 지우고, 나머지 C0 제어 문자와 DEL은 공백으로 바꾸고, 연속 공백을 한 칸으로 합친 뒤 trim.
  - `splitAtWidth`: 폭 안에 들어가는 만큼 앞에 모은다.
  - `cutToWidth`: 들어가면 그대로, `cells <= 0`이면 `''`, 아니면 `splitAtWidth(s, cells - 1)[0].trimEnd() + '…'`.
  - `wrapToRows`: 공백 단위로 욕심껏 채우고, 한 행보다 넓은 단어는 `splitAtWidth`로 쪼갠다. 행이 `maxRows`보다 많으면 앞의 `maxRows`행만 남기고, 마지막 행을 `cutToWidth(마지막 + ' ' + 나머지 행들.join(' '), cells)`로 바꾼다.

- [ ] **Step 4: 테스트·타입 검사를 돌려 통과를 확인한다.**

- [ ] **Step 5: 커밋하고 push 한다.** `feat: 글자 폭 계산과 자르기, 줄 나누기`

---

### Task 3: 항목 행, 10행 창, 테두리 (`hooks/layout.ts` 2부)

**Files:**
- Modify: `hooks/layout.ts`
- Modify: `tests/layout.test.ts`

**Interfaces:**
- Consumes: Task 2의 함수들, `Entry`(`'../types'`)
- Produces:
  - `PALETTE: readonly string[]` (Global Constraints의 6색), `BORDER_COLOR = '#6c6c6c'`, `MAX_BODY_ROWS = 10`, `PENDING_EMOJI = '⏳'`, `FALLBACK_EMOJI = '💬'`
  - `type Row = { text: string; color: string; bold: boolean }`
  - `entryRows(entry: Entry, numberWidth: number, innerCells: number): Row[]`
  - `type BodyWindow = { offset: number; rows: Row[]; above: number; below: number }`
  - `maxOffset(total: number, size: number): number`
  - `windowRows(rows: Row[], offset: number, size: number): BodyWindow`
  - `bodySize(maxRows: number, belowRows: number): number`
  - `topBorder(title: string, above: number, cells: number): string`
  - `bottomBorder(below: number, cells: number): string`

- [ ] **Step 1: 실패하는 테스트를 더한다.**
  ```ts
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
  ```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다.**

- [ ] **Step 3: 상수와 함수를 쓴다.**
  - `entryRows`: 이모지 = pending `⏳`, failed `💬`, done `entry.emoji ?? '💬'`. `prefix = `${emoji} ${String(n).padStart(numberWidth)}  ``, `indent`는 prefix 폭만큼 공백. `flat = flatten(text)`, `avail = innerCells - 폭(prefix)`. 첫 행 = `prefix + cutToWidth(flat, avail)`, `bold: true`. 요약 행 폭 = `innerCells - 폭(indent) - 2`.
    - done: `wrapToRows(flatten(summary), 요약 행 폭, 2)`. 첫 줄 `indent + '→ ' + 줄`, 둘째 줄 `indent + '  ' + 줄`.
    - pending: `indent + '→ 요약 중…'` 한 행.
    - failed: 원문이 첫 행에 다 들어가면 추가 행 없음. 아니면 `splitAtWidth(flat, avail - 1)[1].trim()`을 `wrapToRows(…, 요약 행 폭, 2)`로 나눠 `indent + '  ' + 줄`(화살표 없음).
    - 색은 모든 행이 `PALETTE[(n - 1) % 6]`. 요약 행은 `bold: false`.
  - `maxOffset = max(0, total - size)`. `windowRows`는 offset을 `[0, maxOffset]`으로 자르고, `above = offset`, `below = total - offset - 보이는 행 수`.
  - `bodySize = min(MAX_BODY_ROWS, maxRows - 2 - belowRows)`, 2보다 작으면 0.
  - `topBorder`: `cells < 2`면 `''`. tail = above > 0 ? ` ↑${above} ─╮` : `─╮`. 제목 칸 = `cells - 3 - 폭(tail) - 1`. `t = cutToWidth(title, 제목 칸)`. left = t ? `╭─ ${t} ` : `╭`. fill = `cells - 폭(left) - 폭(tail)`. fill < 0이면 `'╭' + '─'.repeat(cells - 2) + '╮'`, 아니면 `left + '─'.repeat(fill) + tail`.
  - `bottomBorder`: `cells < 2`면 `''`. tail = below > 0 ? ` ↓${below} ─╯` : `─╯`. fill = `cells - 1 - 폭(tail)`. fill < 0이면 `'╰' + '─'.repeat(cells - 2) + '╯'`, 아니면 `'╰' + '─'.repeat(fill) + tail`.

- [ ] **Step 4: 테스트·타입 검사를 돌려 통과를 확인한다.**

- [ ] **Step 5: 커밋하고 push 한다.** `feat: 항목 행, 10행 창, 테두리 계산`

---

### Task 4: Haiku 요청과 응답 해석 (`hooks/summarize.ts`)

**Files:**
- Create: `hooks/summarize.ts`, `tests/summarize.test.ts`

**Interfaces:**
- Consumes: `cellWidth`, `flatten`, `FALLBACK_EMOJI` (`./layout`)
- Produces:
  - `EMOJI: ReadonlyArray<readonly [emoji: string, meaning: string]>` — 아래 33쌍, 이 순서
  - `SUMMARY_MODEL = 'haiku'`, `MAX_PROMPT_CHARS = 4000`
  - `buildRequest(text: string, context: string): { system: string; prompt: string }`
  - `type Parsed = { emoji: string; summary: string }`
  - `parseReply(reply: string): Parsed | null`

  이모지 목록(모두 코드 포인트 하나, East Asian Width `W`로 확인함):
  🔧 수정·설정, 🐛 버그, ✨ 새 기능, 📝 문서·글, 🎨 UI·디자인, 🚀 실행·배포, 🔍 조사·검색, ❓ 질문, 📦 패키지·빌드, 🧪 테스트, 📏 크기·제한, 💡 아이디어, ✅ 승인·진행, ❌ 취소·거절, 🧹 정리·리팩터링, 📋 계획·목록, 🎯 목표·범위, 🧩 연동·구성, 🔑 인증·권한, 🌐 웹·네트워크, 📊 데이터·차트, 🔀 브랜치·병합, ⏪ 되돌리기, 🤔 검토·고민, 💬 일반 대화, 📁 파일·폴더, 🔒 보안, 🧭 방향·탐색, 🧱 구조·뼈대, 🌈 색·테마, 🔁 반복·재시도, 🔗 링크·연결, 📌 메모·기억

- [ ] **Step 1: 실패하는 테스트를 쓴다.**
  ```ts
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
  ```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다.**

- [ ] **Step 3: `hooks/summarize.ts`를 쓴다.**
  - `buildRequest`의 system(이 문구 그대로, `{목록}`은 `EMOJI`를 한 줄에 하나씩 `이모지 뜻`):
    ```
    너는 코딩 어시스턴트와 사용자의 대화에서 사용자 프롬프트 하나를 짧게 묘사한다.
    직전 어시스턴트 답변이 주어지면 그 맥락에서 사용자가 무엇을 요청하거나 결정했는지 쓴다.
    요약은 한국어 한 문장, 70자 이내로 쓴다.
    이모지는 아래 목록에서 내용에 가장 어울리는 것 하나만 고른다.
    {목록}
    출력은 JSON 한 줄만: {"emoji":"…","summary":"…"}
    ```
  - prompt: `[직전 어시스턴트 답변 끝부분]\n${context || '(없음)'}\n\n[사용자 프롬프트]\n${text.slice(0, MAX_PROMPT_CHARS)}`
  - `parseReply`: 처음 `{`부터 마지막 `}`까지를 잘라 `JSON.parse`(try). `summary`가 trim 후 빈 문자열이 아니어야 하며, `flatten`해서 돌려준다. `emoji`가 목록에 없으면 `FALLBACK_EMOJI`. 그 밖에는 `null`.

- [ ] **Step 4: 테스트·타입 검사를 돌려 통과를 확인한다.**

- [ ] **Step 5: 커밋하고 push 한다.** `feat: Haiku 요약 요청과 응답 해석, 이모지 목록`

---

### Task 5: 무엇을 프롬프트로 볼지 (`hooks/capture.ts`)

**Files:**
- Create: `hooks/capture.ts`, `tests/capture.test.ts`

**Interfaces:**
- Consumes: `SessionMessage` (`import type` from `'claude-code'`)
- Produces:
  - `CONTEXT_CHARS = 1500`, `BACKFILL_LIMIT = 50`
  - `shouldCapture(text: string, originKind: string): boolean`
  - `isMetaText(text: string): boolean`
  - `tail(s: string, n: number): string`
  - `contextBefore(messages: readonly SessionMessage[], text: string): string` (없으면 `''`)
  - `type Backfill = { text: string; context: string }`
  - `backfillFromMessages(messages: readonly SessionMessage[], limit: number): Backfill[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다.**
  ```ts
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
  ```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다.**

- [ ] **Step 3: `hooks/capture.ts`를 쓴다.**
  - `shouldCapture`: origin이 `composer`·`bridge`이고, trim한 텍스트가 비어 있지 않으며 `/`로 시작하지 않을 때.
  - `isMetaText`: trim한 텍스트가 `<`, `Base directory for this skill:`, `[Request interrupted`, `This session is being continued from a previous conversation`, `Caveat:` 중 하나로 시작할 때.
  - 프롬프트로 볼 사용자 메시지: `role === 'user'`, `toolResults`가 비어 있거나 없음, 텍스트가 비어 있지 않음, `!isMetaText`, `/`로 시작하지 않음.
  - `contextBefore`: `text.trim()`과 같은 사용자 메시지 중 마지막 것을 찾고, 그 앞에서 가장 가까운 비어 있지 않은 assistant 텍스트를 쓴다. 못 찾으면 전체에서 마지막 assistant 텍스트를 쓴다. `tail(…, CONTEXT_CHARS)`를 돌려준다.
  - `backfillFromMessages`: 앞에서부터 보며 프롬프트 메시지마다 그 앞의 가장 가까운 assistant 텍스트 끝부분을 문맥으로 붙이고, 마지막 `limit`개만 남긴다.

- [ ] **Step 4: 테스트·타입 검사를 돌려 통과를 확인한다.**

- [ ] **Step 5: 커밋하고 push 한다.** `feat: 프롬프트 수집 규칙과 세션 기록 필터, 문맥 찾기`

---

### Task 6: 프롬프트 수집과 박스 그리기 (`hooks/register.tsx`)

**Files:**
- Modify: `hooks/register.tsx`, `tests/register.test.tsx`

**Interfaces:**
- Consumes: Task 2·3의 layout, Task 5의 `shouldCapture`, Task 1의 helpers
- Produces (register.tsx 모듈 안, Task 7·8이 씀):
  - `entriesAtom = atom({ plugin: 'prompt-trail', key: 'entries' } as const, [] as Entry[])`, `offsetAtom`(초깃값 `0`), `followAtom`(초깃값 `true`)
  - 모듈 변수 `geometry: { size: number; total: number; visible: number } | undefined` — 마지막으로 그린 박스(`size` = bodySize, `total` = 전체 행 수, `visible` = 보이는 행 수)

- [ ] **Step 1: 실패하는 테스트를 더한다.**
  ```tsx
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
  ```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다.**

- [ ] **Step 3: `register.tsx`에 수집과 그리기를 쓴다.**
  - `prompt.submit`: `shouldCapture(e.text, e.origin.kind)`가 아니면 `next(e)`. 맞으면 `next` **전에** `update`로 항목을 붙이고(`id: crypto.randomUUID()`, `n` = 마지막 n + 1, `status: 'pending'`, `attempts: 0`) `followAtom`을 `true`로 둔다. `const result = await next(e)`. `result.drop`이 있으면 그 id를 지운다. 상태 쓰기는 모두 try/catch로 감싸고, 어떤 경우에도 `next(e)`의 결과를 돌려준다.
  - `ui.render`(`AbovePrompt`): 표면이 터미널이 아니거나 `hasSurvey`면 `next(e)`. `const below = await next(e)`. 항목이 없으면 `below`. `belowRows = below.type === 'engine' ? 0 : 1`, `size = bodySize(maxRows, belowRows)`. 0이면 `below`. `cells = bodyColumns`, `inner = cells - 4`, `numberWidth = String(마지막 n).length`. 모든 항목의 `entryRows`를 이어 붙인다. offset은 `follow`면 `maxOffset(total, size)`, 아니면 `offsetAtom`. `windowRows`로 창을 잡고 `geometry`를 기록한다. 트리(이 순서, 테스트가 Text 순서를 읽는다):
    ```tsx
    <Box flexDirection="column">
      <Text color={BORDER_COLOR}>{topBorder(`이번 세션 프롬프트 (${count})`, win.above, cells)}</Text>
      {win.rows.map(r => (
        <Box flexDirection="row" width={cells}>
          <Text color={BORDER_COLOR}>│ </Text>
          <Box flexGrow={1}><Text color={r.color} bold={r.bold} wrap="truncate-end">{r.text}</Text></Box>
          <Text color={BORDER_COLOR}> │</Text>
        </Box>
      ))}
      <Text color={BORDER_COLOR}>{bottomBorder(win.below, cells)}</Text>
      {below}
    </Box>
    ```

- [ ] **Step 4: 테스트·검증·타입 검사를 돌려 통과를 확인한다.**

- [ ] **Step 5: 커밋하고 push 한다.** `feat: 프롬프트 수집과 박스 그리기 (색, 10행 창, token-weather 아래 붙이기)`

---

### Task 7: 휠로 박스 스크롤

**Files:**
- Modify: `hooks/register.tsx`, `tests/register.test.tsx`

**Interfaces:**
- Consumes: `geometry`, `offsetAtom`, `followAtom`, `maxOffset`
- Produces: `ui.scroll`(`AbovePrompt`) 훅

- [ ] **Step 1: 실패하는 테스트를 더한다.** 도우미(이 파일 안):
  ```tsx
  function passScroll(on: On) { const passed: number[] = []; on('ui.scroll', ($, e) => { passed.push(e.by); return {} }); return passed }
  const wheel = ($: Engine, by: number, row: number | undefined = 1) => $.ui.scroll({
    component: 'AbovePrompt', requestId: 'band', offset: 0, by, bodyRows: 20, contentRows: 13,
    origin: { kind: 'person' }, ...(row === undefined ? {} : { pointer: { column: 5, row } }),
  })
  ```
  ```tsx
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
  ```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다.**

- [ ] **Step 3: `ui.scroll` 훅을 쓴다.** `geometry`가 없거나 `total <= size`면 `next(e)`. `e.pointer`가 있고 `row`가 `0..visible + 1`(위 테두리부터 아래 테두리까지) 밖이면 `next(e)`. 아니면 현재 offset(`follow`면 `maxOffset(total, size)`, 아니면 `offsetAtom`을 그 범위로 자른 값)에 `e.by`를 더해 `[0, maxOffset]`으로 자르고, `offsetAtom`에 쓰고, `followAtom` = (새 offset === maxOffset). 그리고 `{}`를 돌려준다(엔진 창은 움직이지 않는다).

- [ ] **Step 4: 테스트·검증·타입 검사를 돌려 통과를 확인한다.**

- [ ] **Step 5: 커밋하고 push 한다.** `feat: 휠로 박스 안 10행 창 스크롤`

---

### Task 8: 요약 타이머, 이전 프롬프트 채우기, `/clear` 초기화

**Files:**
- Modify: `hooks/register.tsx`, `tests/register.test.tsx`

**Interfaces:**
- Consumes: `buildRequest`, `parseReply`, `SUMMARY_MODEL` (summarize), `contextBefore`, `backfillFromMessages`, `BACKFILL_LIMIT` (capture), Task 6의 atom들
- Produces: `session.start`, `session.end` 훅, 최상위 함수 `tick($)`, 모듈 변수 `inFlight`, 상수 `TICK_MS = 1000`, `MAX_ATTEMPTS = 2`

- [ ] **Step 1: 실패하는 테스트를 더한다.** 도우미(이 파일 안):
  ```tsx
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
  ```
  ```tsx
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
    on('model.complete', () => { n++; return { value: { isAnswered: false, reason: 'empty-reply', usage: USAGE } } })
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
  ```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다.**

- [ ] **Step 3: 훅과 `tick`을 쓴다.**
  - `session.start`: `const result = await next(e)`. 항목이 비어 있으면 `$.session.messages()`를 `backfillFromMessages(…, BACKFILL_LIMIT)`로 걸러 `pending` 항목으로 채운다. 이때 `update` 안에서 목록이 여전히 비어 있을 때만 채워서 두 번 채우지 않는다. `n`은 1부터, `context`는 채운 값. 그다음 `$.clock.every(TICK_MS, () => void tick($))`. 채우기는 try/catch로 감싸고 `result`를 돌려준다.
  - `session.end`: `reason`이 `clear` 또는 `resume`이면 `entries = []`, `offset = 0`, `follow = true`(try/catch). 그리고 `next(e)`.
  - `tick($)`(최상위 함수): `inFlight`면 끝. 마지막 `pending` 항목(최신)을 고른다. 없으면 끝. `inFlight = true`. 문맥 = `entry.context ?? contextBefore(await $.session.messages(), entry.text)`. `$.model.complete({ model: SUMMARY_MODEL, ...buildRequest(entry.text, 문맥), maxTokens: 300, timeoutMs: 20000 })`. `isAnswered`면 `parseReply(text)`. 결과는 `update`의 `map`으로 **id가 같은 항목에만** 쓴다(목록에 없으면 아무것도 안 함). 성공이면 `status: 'done'`, `emoji`, `summary`, `context`. 실패나 예외면 `attempts + 1`, `attempts + 1 >= MAX_ATTEMPTS`면 `'failed'`, 아니면 `'pending'`. `finally`에서 `inFlight = false`.

- [ ] **Step 4: 테스트·검증·타입 검사를 돌려 통과를 확인한다.**

- [ ] **Step 5: 커밋하고 push 한다.** `feat: Haiku 요약 타이머, 이전 프롬프트 채우기, /clear 초기화`

---

### Task 9: README와 실제 세션 확인

**Files:**
- Create: `README.md`
- Modify(필요할 때만): `hooks/capture.ts`의 필터, `.gitignore`

- [ ] **Step 1: `README.md`를 쓴다.** 다음 내용이 들어간다.
  - 무엇을 보여주는지: 스펙 3장의 화면 예시
  - 설치: `/plugin install prompt-trail --marketplace darkmlfa/prompt-trail` (코드 블록), 이어서 `y`, 그다음 범위 선택
  - 요구사항: Claude Code 2.1.294 이상, 터미널(fullscreen 권장. 휠 스크롤은 fullscreen에서 동작)
  - 동작과 비용: 프롬프트마다 Haiku 호출 1번. 프롬프트 원문과 직전 Claude 답변 끝 1,500자를 세션의 모델 클라이언트로 보낸다
  - 한계: 터미널만 지원. token-weather와 같은 band를 쓴다(이 mod가 바깥에 있어야 둘 다 보인다). 작업 중에 보낸 메시지는 이전 프롬프트 채우기에서 빠질 수 있다

- [ ] **Step 2: 검증·테스트·타입 검사를 돌린 뒤 커밋하고 push 한다.** `docs: README (설치, 동작, 한계)`

- [ ] **Step 3: 턴을 끝내고 사용자에게 확인을 부탁한다.** mod는 턴이 끝날 때 로드된다. 다음 턴 시작에 오는 로드 알림(성공, 또는 실패한 mod 이름)을 확인한다. 사용자에게 다음을 봐 달라고 한다.
  - 박스와 token-weather 줄이 위아래로 같이 보이는지
  - 항목 색과 이모지가 나오는지
  - 몇 초 안에 요약이 오는지
  - 박스 위에서 휠을 굴리면 스크롤되는지
  - 이 세션의 이전 프롬프트가 채워졌는지

- [ ] **Step 4: 결과에 따라 처리한다.**
  - 로드 알림이 없거나 실패: 링크를 엔진이 따라가지 않는 경우다. 사용자에게 알리고, `claude --plugin-dir ~/.claude/plugin-sources/prompt-trail`로 새 세션에서 확인하는 방법을 제안한다.
  - 박스는 안 보이고 token-weather만 보임: 실행 순서가 반대다. 스펙 5장의 대안 B로 바꿀지 사용자에게 먼저 묻는다.
  - 이전 프롬프트에 메타 행이 섞였거나 빠졌음: 실제 행 앞부분을 보고 `isMetaText`를 고친다. 테스트를 먼저 추가한다.
  - 로드 뒤 루트에 엔진이 만든 `tsconfig.json`이 생겼으면 `.gitignore`에 더한다(로드할 때마다 다시 쓴다).
  - 고친 것이 있으면 검증·테스트·타입 검사 후 커밋하고 push 한다.

- [ ] **Step 5: 다른 세션에서 쓰는 방법을 안내한다.** 개발용 링크와 설치본이 함께 있으면 중복 로드되니, 설치는 이 세션이 끝난 뒤 다음 둘 중 하나로 하라고 알린다.
  - `/plugin install prompt-trail --marketplace darkmlfa/prompt-trail`
  - 로컬 폴더를 marketplace로 추가해 설치: `claude plugin marketplace add ~/.claude/plugin-sources/prompt-trail` 다음 `claude plugin install prompt-trail@prompt-trail --scope user`. 이렇게 하면 폴더 내용을 그대로 읽어서 수정 후 `/reload-plugins`로 반영된다.
