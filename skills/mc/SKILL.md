---
name: maestro:cancel
description: "요청 또는 태스크를 취소하고 worktree를 정리합니다"
user-invocable: true
argument-hint: "<REQ-ID> [--force]"
aliases: ["mc"]
---

# maestro:cancel

진행 중인 요청 또는 태스크를 취소하고 관련 리소스를 정리합니다.

## 실행 프로토콜

1. `$ARGUMENTS`에서 REQ ID 파싱
2. 해당 요청의 활성 태스크 확인
3. 취소 확인 프롬프트 (--force가 아닌 경우)
4. 취소 처리:
   - 실행 중인 에이전트/CLI 프로세스 종료
   - Git worktree 삭제
   - 임시 브랜치 정리
   - `request.json` 상태를 `cancelled`로 변경
5. `.gran-maestro/mode.json`의 `active_requests`에서 제거
6. 모든 요청이 취소/완료되고 `auto_deactivate: true`이면 → OMC 모드 복귀

## 옵션

- `--force`: 확인 없이 즉시 취소

## 예시

```
/mc REQ-001         # REQ-001 취소 (확인 요청)
/mc REQ-001 --force # REQ-001 즉시 취소
/mc REQ-002-01      # 특정 태스크만 취소
```

## 한국어 트리거

- "취소", "중단", "그만"
