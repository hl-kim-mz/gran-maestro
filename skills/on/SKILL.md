---
name: on
description: "Maestro 모드를 활성화합니다. 사용자가 '마에스트로 켜', '마에스트로 시작', '지휘자 모드'를 말하거나 /mst:on을 호출할 때 사용. 새 요청 시작은 /mst:request를 사용 (자동 부트스트래핑 포함)."
user-invocable: true
argument-hint: ""
---

# maestro:on

Gran Maestro 모드를 활성화합니다. Maestro 오케스트레이션 스킬이 활성화됩니다.

## 모드 전환 규칙

### 활성화 시 차단되는 스킬
- `/autopilot`, `/ralph`, `/ultrawork`, `/team`, `/pipeline`, `/ultrapilot`, `/swarm`, `/ecomode`

### Maestro 모드에서 사용 가능한 스킬
- Maestro 오케스트레이션: `/mst:request`, `/mst:list`, `/mst:inspect`, `/mst:approve`, `/mst:accept`, `/mst:feedback`, `/mst:cancel`, `/mst:dashboard`, `/mst:priority`, `/mst:history`, `/mst:settings`
- CLI 직접 호출: `/mst:codex`, `/mst:gemini` (모드 무관)
- 단발 분석/리뷰: `/analyze`, `/deepsearch`, `/code-review`, `/security-review` (모드 무관)
- 유틸리티: `/note`, `/plan`, `/trace`, `/doctor` (모드 무관)

## 실행 프로토콜

1. `.gran-maestro/` 디렉토리 존재 확인, 없으면 생성
2. `.gitignore`에 `.gran-maestro/` 등록:
   - 프로젝트 루트의 `.gitignore` 파일 읽기 (없으면 생성)
   - `.gran-maestro/` 패턴이 이미 존재하는지 확인 (정확히 `.gran-maestro/` 또는 `/.gran-maestro/`)
   - 없으면 파일 끝에 `.gran-maestro/` 한 줄 추가
3. 플러그인 루트 경로 확인 (이 스킬의 Base directory에서 2단계 상위)
4. `.gran-maestro/config.json` 존재 확인
   - 없으면: 플러그인 루트의 `templates/defaults/config.json` 내용을 읽어서 `.gran-maestro/config.json`에 저장
5. `.gran-maestro/agents.json` 존재 확인
   - 없으면: 플러그인 루트의 `templates/defaults/agents.json` 내용을 읽어서 `.gran-maestro/agents.json`에 저장
6. `.gran-maestro/mode.json` 작성 (always overwrite):

   > ⏱️ **타임스탬프 취득 (MANDATORY)**:
   > `TS=$(python3 {PLUGIN_ROOT}/scripts/mst.py timestamp now)`
   > 위 명령 실패 시 폴백: `python3 -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).isoformat())"`
   > 출력값을 `activated_at` 필드에 기입한다. 날짜만 기입 금지.

   ```json
   {
     "active": true,
     "activated_at": "{TS — mst.py timestamp now 출력값}",
     "auto_deactivate": true,
   }
   ```
7. `.gran-maestro/requests/` 디렉토리 존재 확인, 없으면 생성
8. `.gran-maestro/worktrees/` 디렉토리 존재 확인, 없으면 생성
9. 스크립트 설치:
   - OS 감지: Python으로 `import platform; platform.system()` 실행
   - **macOS/Linux**: 플러그인 루트의 `scripts/maestro-guard.sh`를 `~/.claude/scripts/maestro-guard.sh`에 복사 (이미 존재하면 덮어쓰기)
   - **macOS/Linux**: 플러그인 루트의 `scripts/maestro-status.sh`를 `~/.claude/scripts/maestro-status.sh`에 복사 (이미 존재하면 덮어쓰기)
   - **macOS/Linux**: `~/.claude/settings.json`의 `hooks.PreToolUse` 배열에 아래 3개 항목이 없으면 추가:
     ```json
     { "matcher": "mcp__plugin_oh-my-claudecode_x__ask_codex", "hooks": [{ "type": "command", "command": "~/.claude/scripts/maestro-guard.sh" }] },
     { "matcher": "mcp__plugin_oh-my-claudecode_g__ask_gemini", "hooks": [{ "type": "command", "command": "~/.claude/scripts/maestro-guard.sh" }] },
     { "matcher": "Task", "hooks": [{ "type": "command", "command": "~/.claude/scripts/maestro-guard.sh" }] }
     ```
   - **Windows**: 플러그인 루트의 `scripts/maestro-guard.py`를 `~/.claude/scripts/maestro-guard.py`에 복사 (이미 존재하면 덮어쓰기)
   - **Windows**: 플러그인 루트의 `scripts/maestro-status.py`를 `~/.claude/scripts/maestro-status.py`에 복사 (이미 존재하면 덮어쓰기)
   - **Windows**: `~/.claude/settings.json`의 `hooks.PreToolUse` 배열에 아래 3개 항목이 없으면 추가:
     ```json
     { "matcher": "mcp__plugin_oh-my-claudecode_x__ask_codex", "hooks": [{ "type": "command", "command": "python3 ~/.claude/scripts/maestro-guard.py" }] },
     { "matcher": "mcp__plugin_oh-my-claudecode_g__ask_gemini", "hooks": [{ "type": "command", "command": "python3 ~/.claude/scripts/maestro-guard.py" }] },
     { "matcher": "Task", "hooks": [{ "type": "command", "command": "python3 ~/.claude/scripts/maestro-guard.py" }] }
     ```
   - hook은 Maestro 모드 활성 시 MCP 직접 호출(ask_codex, ask_gemini)과 Task 기반 구현 에이전트 소환(예: executor/deep-executor/verifier/build-fixer) 차단 시 exit 2로 블록하며, Skill 도구 사용을 안내함
   - Maestro 모드 비활성 시에는 exit 0으로 통과 (hook 설치 후 제거 불필요)
10. 사용자에게 모드 전환 알림 출력

## 출력

```
Gran Maestro 모드 활성화

역할 전환: Claude Code → PM (지휘자)
- 코드 작성: 금지 (Codex/Gemini에 위임)
- 분석/스펙/리뷰: 활성

Maestro 오케스트레이션 스킬이 활성화되었습니다.
/mst:request 로 새 요청을 시작하세요.
```

## 쉘에서 상태 확인

`~/.claude/scripts/maestro-status.sh`가 함께 설치됩니다.

```bash
# 간단 조회
~/.claude/scripts/maestro-status.sh        # "on (requests: 2)" 또는 "off"

# JSON 전체 출력
~/.claude/scripts/maestro-status.sh --json

# exit code만 (스크립팅용)
~/.claude/scripts/maestro-status.sh -q && echo "active" || echo "inactive"

# 특정 필드 조회
~/.claude/scripts/maestro-status.sh --field active
```

## 부트스트래핑 참조

기본 설정 템플릿 위치 (플러그인 내):
- `templates/defaults/config.json` — 전체 기본 설정
- `templates/defaults/agents.json` — 실행/리뷰/분석 에이전트 정의
- `templates/defaults/mode.json` — 모드 상태 초기값

## 문제 해결

- "이미 Maestro 모드가 활성화됨" → `.gran-maestro/mode.json`의 `active: true` 확인. 이미 활성 상태이면 추가 작업 불필요
- "config.json 생성 실패" → 현재 디렉토리의 쓰기 권한 확인. git 저장소 루트에서 실행 중인지 확인
- "모드 전환이 반영되지 않음" → 세션을 재시작하면 모드 전환이 적용됨. `/mst:off` 후 `/mst:on`으로 재활성화 시도
