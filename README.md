# prompt-trail

Claude Code mod입니다. 입력창 바로 위 band에, 이번 세션에 입력한 프롬프트를 테두리 박스로 보여줍니다. 프롬프트마다 색과 이모지, 원문 첫 줄, Haiku 요약(최대 2줄)을 표시합니다. 박스 안은 최대 10줄이고, 넘치면 휠로 스크롤합니다.

```
╭─ 이번 세션 프롬프트 (12) ───────────────── ↑4 ─╮
│ 📏  9  높이도 제한을 둬서 텍스트 10줄이 최대…  │
│        → 박스 최대 10줄, 넘치면 스크롤         │
│ 🎨 10  프롬프트마다 색상 다르게 하고 앞에 이…  │
│        → 항목별 색상과 내용에 맞는 이모지 추가 │
╰────────────────────────────────────────────────╯
```

## 설치

터미널 세션의 프롬프트에서:

```
/plugin install prompt-trail --marketplace darkmlfa/prompt-trail
```

`Add marketplace?`에 `y`를 누르고, 이어서 범위(보통 user)를 고릅니다.

로컬 폴더에서 설치할 수도 있습니다. 이 방식은 폴더 내용을 그대로 읽으므로, 수정한 뒤 `/reload-plugins`만 하면 반영됩니다.

```bash
claude plugin marketplace add ~/.claude/plugin-sources/prompt-trail
claude plugin install prompt-trail@prompt-trail --scope user
```

## 요구사항

- Claude Code 2.1.294 이상
- 터미널. fullscreen(`tui: fullscreen`)을 권장합니다. 박스 위 휠 스크롤은 fullscreen에서 동작합니다.

## 동작

- **수집**: 직접 입력한 프롬프트(작업 중 보낸 메시지 포함)와 Remote Control로 보낸 프롬프트를 담습니다. 슬래시 명령, 알림, 다른 세션이나 plugin이 보낸 프롬프트는 뺍니다.
- **표시**: 6가지 색을 돌아가며 써서 항목마다 글자 색 전체를 다르게 칠합니다. 원문 첫 줄은 굵게 씁니다. 이모지는 33개 목록에서 Haiku가 고릅니다. 요약을 기다리는 동안은 ⏳, 요약에 실패하면 💬와 원문의 나머지를 보여줍니다.
- **높이와 스크롤**: 박스 안은 평소 최대 10줄이고, 가려진 줄 수를 테두리에 ↑/↓로 표시합니다. 새 프롬프트가 들어오면 맨 아래로 이동합니다. 엔진은 band 안에 다 들어가는 박스에는 휠을 보내지 않으므로, 이 상태에서 휠은 대화창을 스크롤합니다. 아래 테두리의 `[펼치기 ▾]`를 누르면 목록 전체를 펼치고, 그때는 마우스가 박스 위에 있으면 휠로 박스가 스크롤됩니다. `[접기 ▴]`로 다시 10줄로 돌아갑니다. band가 낮으면 줄 수를 줄이고, 박스 아래에 다른 plugin이 그린 줄이 있으면 그 줄이 밀려나지 않게 합니다.
- **요약**: 프롬프트마다 Haiku(`haiku`)를 1번 호출하고(최대 2번 시도), 1~2천 토큰 정도 듭니다. 프롬프트 원문(최대 4,000자)과 직전 Claude 답변 끝 1,500자를 세션의 모델 클라이언트로 보냅니다.
- **수명**: 목록은 세션 상태에 있어서 mod를 다시 로드해도 남습니다. `/clear`를 하거나 다른 세션으로 resume하면 비웁니다. mod가 켜지기 전에 입력한 프롬프트는 로드될 때 세션 기록에서 최근 50개까지 채웁니다.

## 한계

- 터미널만 지원합니다. 데스크톱이나 VS Code 표면에서는 그리지 않습니다.
- [token-weather](https://github.com/anthropics/claude-code-playground)와 함께 켜면 박스가 보이지 않습니다. 같은 band를 쓰는데, token-weather가 먼저 실행되면서 band를 혼자 그리기 때문입니다. 둘 중 하나만 켜 두세요(`claude plugin disable token-weather@claude-code-playground-mods`).
- 작업 중에 보낸 메시지는 세션 기록에 따로 저장되어서, 이전 프롬프트 채우기에서 빠질 수 있습니다.
- 색은 어두운 테마를 기준으로 골랐습니다.

## 개발

```bash
claude plugin validate .
claude plugin test .
```

설계는 `docs/2026-10-08-prompt-trail-design.md`, 구현 계획은 `docs/2026-10-08-prompt-trail-plan.md`에 있습니다.
