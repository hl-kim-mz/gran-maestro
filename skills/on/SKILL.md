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

1. `.gran-maestro/` 디렉토리 생성, `.gitignore`에 `.gran-maestro/` 등록 (미존재 시)
2. 플러그인 루트 경로 확인 (스킬 베이스 디렉토리 2단계 상위)
3. `config.json` / `agents.json` 없으면 `templates/defaults/`에서 복사
4. `.gran-maestro/mode.json` 작성 (always overwrite):

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
5. `requests/`, `worktrees/` 디렉토리 생성
6. 버전 알림 스크립트 설치:
   - **버전 알림 스크립트**: `check-version.sh`를 `~/.claude/scripts/`에 복사; `settings.json`의 `hooks.UserPromptSubmit`에 아래 hook 추가(미존재 시):
     ```json
     { "type": "command", "command": "~/.claude/scripts/check-version.sh" }
     ```
     동일 `command`가 이미 등록되어 있으면 건너뜁니다.
     `hooks.UserPromptSubmit` 배열은 기존 항목을 보존한 상태로 병합해야 합니다.
     설정 파일 파싱은 `python3` 또는 `jq`로 수행할 수 있으며, 동일 `command`가 이미 존재하면 추가하지 마세요.
7. 사용자에게 모드 전환 알림 출력

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

`maestro-status.sh` (macOS/Linux) 또는 `maestro-status.py` (Windows) 함께 설치:
```bash
~/.claude/scripts/maestro-status.sh           # "on (requests: 2)" 또는 "off"
~/.claude/scripts/maestro-status.sh --json    # JSON 전체 출력
~/.claude/scripts/maestro-status.sh -q        # exit code만 (스크립팅용)
~/.claude/scripts/maestro-status.sh --field active
```

## 문제 해결

- "이미 활성화됨" → `mode.json`의 `active: true` 확인; 추가 작업 불필요
- "config.json 생성 실패" → 쓰기 권한 및 git 저장소 루트 여부 확인
