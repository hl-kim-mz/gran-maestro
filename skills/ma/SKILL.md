---
name: maestro:approve
description: "스펙을 승인하거나 최종 결과물을 수락합니다"
user-invocable: true
argument-hint: "<REQ-ID> [--final]"
aliases: ["ma"]
---

# maestro:approve

PM이 작성한 구현 스펙을 승인하거나, 완료된 결과물을 최종 수락합니다.

## 실행 프로토콜

### 스펙 승인 (Phase 1 → Phase 2)

1. `$ARGUMENTS`에서 REQ ID 파싱
2. `.gran-maestro/requests/{REQ-ID}/` 하위 spec.md 파일 확인
3. 스펙 요약을 사용자에게 표시
4. 승인 시:
   - `request.json`의 `current_phase`를 2로 변경
   - 각 태스크에 대해 git worktree 생성
   - Phase 2 (외주 실행) 진입

### 최종 수락 (Phase 3 → Phase 5)

`--final` 옵션 사용 시:

1. 리뷰 리포트가 PASS인지 확인
2. 최종 요약 리포트 생성
3. Worktree → main 브랜치 rebase + squash merge
4. Worktree 삭제 + 브랜치 정리
5. Phase 5 완료 처리

## 옵션

- `--final`: 최종 결과물 수락 (Phase 5 진입)

## 예시

```
/ma REQ-001        # 스펙 승인 → Phase 2 진입
/ma REQ-001 --final  # 최종 수락 → Phase 5 완료
```

## 한국어 트리거

- "승인", "진행해", "좋아 진행", "OK 진행"
