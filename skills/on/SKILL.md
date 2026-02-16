---
name: on
description: "Maestro 모드를 활성화합니다 (OMC 오케스트레이션 비활성화). 사용자가 '마에스트로 켜', '마에스트로 시작', '지휘자 모드'를 말하거나 /mst:on을 호출할 때 사용. 새 요청 시작은 /mst:start를 사용 (자동 부트스트래핑 포함)."
user-invocable: true
argument-hint: ""
---

# maestro:on

Gran Maestro 모드를 활성화합니다. OMC 오케스트레이션 스킬이 비활성화되고,
Maestro 오케스트레이션 스킬이 활성화됩니다.

## 모드 전환 규칙

### 활성화 시 차단되는 OMC 스킬
- `/autopilot`, `/ralph`, `/ultrawork`, `/team`, `/pipeline`, `/ultrapilot`, `/swarm`, `/ecomode`

### Maestro 모드에서 사용 가능한 스킬
- Maestro 오케스트레이션: `/mst:start`, `/mst:list`, `/mst:inspect`, `/mst:approve`, `/mst:feedback`, `/mst:cancel`, `/mst:dashboard`, `/mst:priority`, `/mst:history`, `/mst:settings`
- CLI 직접 호출: `/mst:codex`, `/mst:gemini` (모드 무관)
- 단발 분석/리뷰: `/analyze`, `/deepsearch`, `/code-review`, `/security-review` (모드 무관)
- 유틸리티: `/note`, `/plan`, `/trace`, `/doctor` (모드 무관)

## 실행 프로토콜

1. `.gran-maestro/` 디렉토리 존재 확인, 없으면 생성
2. 플러그인 루트 경로 확인 (이 스킬의 Base directory에서 2단계 상위)
3. `.gran-maestro/config.json` 존재 확인
   - 없으면: 플러그인 루트의 `templates/defaults/config.json` 내용을 읽어서 `.gran-maestro/config.json`에 저장
4. `.gran-maestro/agents.json` 존재 확인
   - 없으면: 플러그인 루트의 `templates/defaults/agents.json` 내용을 읽어서 `.gran-maestro/agents.json`에 저장
5. `.gran-maestro/mode.json` 작성 (always overwrite):
   ```json
   {
     "active": true,
     "activated_at": "{현재 ISO timestamp}",
     "active_requests": [],
     "auto_deactivate": true,
     "previous_mode": "omc"
   }
   ```
6. `.gran-maestro/requests/` 디렉토리 존재 확인, 없으면 생성
7. `.gran-maestro/worktrees/` 디렉토리 존재 확인, 없으면 생성
8. MCP 가드 hook 설정:
   - 플러그인 루트의 `scripts/maestro-guard.sh`를 `~/.claude/scripts/maestro-guard.sh`에 복사 (이미 존재하면 덮어쓰기)
   - `~/.claude/settings.json`의 `hooks.PreToolUse` 배열에 아래 3개 항목이 없으면 추가:
     ```json
     { "matcher": "mcp__plugin_oh-my-claudecode_x__ask_codex", "hooks": [{ "type": "command", "command": "~/.claude/scripts/maestro-guard.sh" }] },
     { "matcher": "mcp__plugin_oh-my-claudecode_g__ask_gemini", "hooks": [{ "type": "command", "command": "~/.claude/scripts/maestro-guard.sh" }] },
     { "matcher": "Task", "hooks": [{ "type": "command", "command": "~/.claude/scripts/maestro-guard.sh" }] }
     ```
   - hook은 Maestro 모드 활성 시 OMC MCP 직접 호출(ask_codex, ask_gemini)과 Task 기반 OMC 구현 에이전트 소환(예: executor/deep-executor/verifier/build-fixer) 차단 시 exit 2로 블록하며, Skill 도구 사용을 안내함
   - Maestro 모드 비활성 시에는 exit 0으로 통과 (hook 설치 후 제거 불필요)
9. 사용자에게 모드 전환 알림 출력

## 출력

```
Gran Maestro 모드 활성화

역할 전환: Claude Code → PM (지휘자)
- 코드 작성: 금지 (Codex/Gemini에 위임)
- 분석/스펙/리뷰: 활성

OMC 오케스트레이션 스킬이 비활성화되었습니다.
/mst:start 로 새 요청을 시작하세요.
```

## 부트스트래핑 참조

기본 설정 템플릿 위치 (플러그인 내):
- `templates/defaults/config.json` — 전체 기본 설정
- `templates/defaults/agents.json` — 실행/리뷰/분석 에이전트 정의
- `templates/defaults/mode.json` — 모드 상태 초기값

## 문제 해결

- "이미 Maestro 모드가 활성화됨" → `.gran-maestro/mode.json`의 `active: true` 확인. 이미 활성 상태이면 추가 작업 불필요
- "config.json 생성 실패" → 현재 디렉토리의 쓰기 권한 확인. git 저장소 루트에서 실행 중인지 확인
- "OMC 스킬이 여전히 활성" → 세션을 재시작하면 모드 전환이 적용됨. `/mst:off` 후 `/mst:on`으로 재활성화 시도
