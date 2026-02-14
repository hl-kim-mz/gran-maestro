---
name: maestro:off
description: "Maestro 모드를 비활성화하고 OMC로 복귀합니다"
user-invocable: true
argument-hint: "[--force]"
aliases: ["moff"]
---

# maestro:off

Gran Maestro 모드를 비활성화하고 OMC 모드로 복귀합니다.

## 실행 프로토콜

1. `.gran-maestro/mode.json` 확인
2. 활성 요청 존재 여부 확인
3. 활성 요청이 있으면:
   - `--force` 없이: 경고 표시, 계속할지 확인
   - `--force`: 강제 비활성화 (활성 요청은 일시정지 상태로 전환)
4. `.gran-maestro/mode.json` 업데이트:
   ```json
   {
     "active": false,
     "deactivated_at": "ISO-timestamp",
     "active_requests": [],
     "auto_deactivate": true,
     "previous_mode": "omc"
   }
   ```
5. OMC 오케스트레이션 스킬 복원

## 자동 비활성화

`auto_deactivate: true`이고 모든 `active_requests`가 완료(Phase 5)되면
자동으로 OMC 모드로 복귀합니다. 이 경우 `/moff`를 수동으로 호출할 필요가 없습니다.

## 옵션

- `--force`: 활성 요청이 있어도 강제로 비활성화

## 출력

```
🎵 OMC 모드 복귀

Gran Maestro 모드가 비활성화되었습니다.
OMC 오케스트레이션 스킬이 복원되었습니다.
Claude Code가 직접 구현 + 오케스트레이션 역할로 돌아갑니다.
```

## 경고 (활성 요청 존재 시)

```
⚠️ 활성 요청이 남아있습니다:
  - REQ-001: Phase 2 (외주 실행 중)
  - REQ-003: Phase 1 (분석 중)

계속하시겠습니까? 활성 요청은 일시정지됩니다.
/moff --force 로 강제 전환하거나, 요청을 먼저 완료해주세요.
```

## 한국어 트리거

- "마에스트로 꺼", "OMC로 돌아가", "지휘자 모드 끝"
