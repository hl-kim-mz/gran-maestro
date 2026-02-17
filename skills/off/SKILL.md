---
name: off
description: "Maestro 모드를 비활성화하고 OMC로 복귀합니다. 사용자가 '마에스트로 꺼', 'OMC로 돌아가', '지휘자 모드 끝'을 말하거나 /mst:off를 호출할 때 사용. 요청 취소에는 /mst:cancel을 사용."
user-invocable: true
argument-hint: "[--force]"
---

# maestro:off

Gran Maestro 모드를 비활성화하고 OMC 모드로 복귀합니다.

## 실행 프로토콜

1. 플러그인 루트 경로 확인 (이 스킬의 Base directory에서 2단계 상위)
2. `.gran-maestro/mode.json` 확인 (`active: false`이면 "이미 비활성 상태" 알림 후 종료)
3. 활성 요청 존재 여부 확인 (`.gran-maestro/requests/*/request.json`을 스캔하여 terminal 상태(`done`, `completed`, `cancelled`, `failed`)가 아닌 요청 확인)
4. 활성 요청이 있으면:
   - `--force` 없이: 경고 표시, 계속할지 확인
   - `--force`: 각 활성 요청의 `.gran-maestro/requests/REQ-NNN/request.json`에서 `status`를 `"paused"`로 업데이트
5. `.gran-maestro/mode.json` 업데이트:
   ```json
   {
     "active": false,
     "activated_at": "{기존 값 유지}",
     "deactivated_at": "{현재 ISO timestamp}",
     "auto_deactivate": true,
     "previous_mode": "omc"
   }
   ```
6. OMC 오케스트레이션 스킬 복원

**참고**: Guard hook(`maestro-guard.sh`)은 `mode.json`의 `active` 필드를 실시간 체크하므로, `active: false`로 전환 즉시 OMC MCP/Task 차단이 해제됩니다. Hook 제거는 불필요합니다.

## 자동 비활성화

`auto_deactivate: true`이고 `.gran-maestro/requests/*/request.json`을 스캔하여 모든 요청이 terminal 상태(`done`, `completed`, `cancelled`, `failed`)이면
자동으로 OMC 모드로 복귀합니다. 이 경우 `/mst:off`를 수동으로 호출할 필요가 없습니다.

## 옵션

- `--force`: 활성 요청이 있어도 강제로 비활성화

## 출력

```
OMC 모드 복귀

Gran Maestro 모드가 비활성화되었습니다.
OMC 오케스트레이션 스킬이 복원되었습니다.
Claude Code가 직접 구현 + 오케스트레이션 역할로 돌아갑니다.
```

## 경고 (활성 요청 존재 시)

```
활성 요청이 남아있습니다:
  - REQ-001: Phase 2 (외주 실행 중)
  - REQ-003: Phase 1 (분석 중)

계속하시겠습니까? 활성 요청은 일시정지됩니다.
/mst:off --force 로 강제 전환하거나, 요청을 먼저 완료해주세요.
```

## 쉘에서 상태 확인

`mst:on` 실행 시 `~/.claude/scripts/maestro-status.sh`가 설치됩니다.

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

## 문제 해결

- "Maestro 모드가 활성화되지 않음" → 이미 OMC 모드입니다. `.gran-maestro/mode.json`의 `active` 상태 확인
- "활성 요청이 남아있음" → `--force` 옵션으로 강제 비활성화하거나, 먼저 `/mst:cancel`로 요청을 취소 또는 `/mst:approve`로 완료
- "OMC 스킬이 복원되지 않음" → 세션 재시작으로 해결. mode.json이 `active: false`인지 확인
