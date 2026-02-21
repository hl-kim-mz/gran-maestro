---
name: accept
description: "완료된 결과물을 최종 수락합니다 (Phase 3 → Phase 5). Worktree를 main에 머지하고 정리합니다. 사용자가 '수락', '머지', '최종 수락'을 말하거나 /mst:accept를 호출할 때 사용. 기본적으로 /mst:approve에서 자동 호출되며, workflow.auto_accept_result=false 시 수동 사용."
user-invocable: true
argument-hint: "[REQ-ID]"
---

# maestro:accept

Phase 3 리뷰를 통과한 결과물을 최종 수락하여 main 브랜치에 머지하고 정리합니다.

## 호출 방식

- **자동 호출 (기본)**: `/mst:approve`에서 Phase 2 실행 → Phase 3 리뷰 PASS 후 자동으로 이 프로토콜을 실행합니다. `workflow.auto_accept_result`가 `true`(기본값)이면 별도 호출이 필요 없습니다.
- **수동 호출**: `workflow.auto_accept_result`를 `false`로 설정하면 `/mst:approve`가 Phase 3 리뷰 PASS 후 멈추고, 사용자가 `/mst:accept`를 명시적으로 호출해야 합니다.

## 실행 프로토콜

### REQ ID 결정 (인자 없이 호출 시)

`$ARGUMENTS`에 REQ ID가 없으면, 최종 수락 대기 중인 요청을 **REQ 번호 오름차순**으로 자동 선택합니다:

1. `.gran-maestro/requests/` 디렉토리의 모든 `request.json`을 스캔
2. 최종 수락 가능한 상태의 요청을 필터링:
   - `current_phase == 3` 이고 `status`가 `phase3_review` 또는 리뷰 PASS 상태
3. REQ 번호(숫자) 오름차순으로 정렬하여 **첫 번째 요청**을 선택
4. 수락 대기 중인 요청이 없으면 사용자에게 "최종 수락 대기 중인 요청이 없습니다"라고 알림

### 최종 수락 실행 (Phase 3 → Phase 5)

1. **리뷰 PASS 확인**: 리뷰 리포트가 PASS인지 확인
   - PASS가 아닌 경우: 사용자에게 알리고 중단. 피드백 루프(`/mst:feedback`)를 먼저 완료해야 함
2. **최종 요약 리포트 생성**: 모든 태스크의 완료 결과를 종합하여 `summary.md` 작성
3. **Worktree → main 머지**:
   - 각 태스크 worktree에서 main 브랜치로 rebase
   - squash merge 실행
   - 커밋 메시지에 REQ ID와 태스크 요약 포함
4. **정리**:
   - Worktree 삭제
   - 임시 브랜치 정리
5. **Phase 5 완료 처리**:
   - `request.json`의 `stitch_screens` 배열을 확인하여 `status: "active"` 항목이 있으면 모두 `"archived"`로 일괄 변경
   - `request.json`의 `current_phase`를 5로 변경
   - `request.json`의 `status`를 `done`으로 변경
   - 사용자에게 완료 알림
6. **아카이브 체크 (완료 시, 자동)**:
   config.json의 `archive.auto_archive_on_complete`가 true이면:
   - `.gran-maestro/requests/` 하위의 REQ-* 디렉토리 수 확인
   - `archive.max_active_sessions` 초과 시:
     - 완료된(done/cancelled) 요청만 아카이브 대상
     - 오래된 순 정렬 → 초과분을 `.gran-maestro/requests/archived/`에 tar.gz 압축
     - 원본 디렉토리 삭제
     - `[Archive] requests {N}개 세션 아카이브됨` 알림
   - 아카이브 대상이 없거나 초과하지 않으면 스킵
   - 상세 아카이브 로직은 `/mst:archive` 스킬의 "자동 아카이브 프로토콜" 참조

## 예시

```
/mst:accept              # 최종 수락 대기 중인 첫 번째 요청 자동 선택
/mst:accept REQ-001      # 명시적으로 REQ-001 최종 수락
```

## 설정

| 키 | 설명 | 기본값 |
|----|------|--------|
| `workflow.auto_accept_result` | Phase 3 리뷰 PASS 후 자동 수락 여부 | `true` |

- `true` (기본): `/mst:approve` 실행 시 Phase 3 리뷰 PASS 후 자동으로 최종 수락까지 진행
- `false`: Phase 3 리뷰 PASS 후 멈추고, `/mst:accept`를 수동으로 호출해야 함

설정 변경:
```
/mst:settings workflow.auto_accept_result false   # 수동 수락 모드로 전환
/mst:settings workflow.auto_accept_result true    # 자동 수락 모드로 복귀
```

## 문제 해결

- "수락할 요청이 없음" → Phase 3 리뷰가 PASS된 요청이 있는지 확인. `/mst:inspect {REQ-ID}`로 상태 조회
- "리뷰가 PASS가 아님" → 리뷰 리포트에서 미충족 수락조건 확인. `/mst:feedback`으로 피드백 루프를 먼저 완료
- "머지 충돌" → worktree에서 수동으로 충돌 해결 후 `/mst:accept`를 다시 실행
- "이미 완료됨" → 해당 요청이 이미 Phase 5에 있음. `/mst:inspect {REQ-ID}`로 확인
