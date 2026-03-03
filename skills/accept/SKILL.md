---
name: accept
description: "완료된 결과물을 최종 수락합니다 (Phase 3 → Phase 5). Worktree를 main에 머지하고 정리합니다. 사용자가 '수락', '머지', '최종 수락'을 말하거나 /mst:accept를 호출할 때 사용. 기본적으로 /mst:approve에서 자동 호출되며, workflow.auto_accept_result=false 시 수동 사용."
user-invocable: true
argument-hint: "[REQ-ID]"
---

# maestro:accept

Phase 3 리뷰를 통과한 결과물을 최종 수락하여 main 브랜치에 머지하고 정리합니다.

## 호출 방식

- **자동**: `auto_accept_result=true`(기본) 시 `/mst:approve`에서 Phase 3 PASS 후 자동 실행
- **수동**: `auto_accept_result=false` 시 `/mst:approve`가 Phase 3 PASS 후 멈추고 사용자가 명시적 호출

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

### REQ ID 결정 (인자 없이 호출 시)

`requests/`의 모든 `request.json` 스캔 → `current_phase==3` + `phase3_review`/PASS 상태 필터링 → REQ 번호 오름차순 첫 번째 선택 (없으면 "대기 중 요청 없음" 알림)

### 최종 수락 실행 (Phase 3 → Phase 5)

1. **리뷰 PASS 확인**: PASS 아니면 사용자 알림 후 중단 (먼저 `/mst:feedback` 완료 필요)
2. **요약 리포트 생성**: 모든 태스크 완료 결과 → `summary.md` 작성
3. **Worktree → main 머지**: 각 태스크 worktree에서 main으로 rebase → squash merge (커밋 메시지에 REQ ID+요약 포함)
4. **정리**: 각 태스크의 worktree 및 임시 브랜치 정리
   > ⚠️ **squash merge 후 브랜치 삭제 규칙**: squash merge는 git 이력에 merge ancestor를 생성하지
   > 않으므로 `git branch -d`(soft delete)가 "not fully merged" 오류로 항상 실패합니다.
   > 반드시 아래 패턴을 사용하세요:
   - `git worktree remove --force "{worktree_path}" || true` — 이미 제거된 경우 오류 무시
   - `git branch -D "{branch_name}" || true` — squash merge 후 강제 삭제 필수 (`-d` 사용 금지)
   - 각 태스크를 **독립적으로** 실행 (`&&` 연결 금지 — 하나 실패 시 나머지 미실행됨)
   - 순서: worktree 제거 먼저, 브랜치 삭제 나중
4.5. **Pending Stitch 화면 재확인**:
   - `request.json`의 `stitch_screens` 배열에서 `status: "pending"` 항목 확인
   - 없으면 이 단계 스킵
   - 있으면: `mcp__stitch__list_screens(projectId)` 호출 (projectId는 `config.stitch.project_id`)
     - **`baseline_screen_ids` 있는 경우**:
       - 현재 screen IDs = `screens[].name`에서 마지막 `/` 이후 값 추출
       - 차집합 = 현재 screen IDs - pending 항목의 `baseline_screen_ids`
       - 차집합 비어있지 않으면: 첫 번째 ID로 `get_screen` 호출 → URL 확보 → 발견 처리
       - 차집합 비어있으면: 미발견 처리
     - **`baseline_screen_ids` 없는 경우** (구버전 pending 호환):
       - 타임스탬프 비교 불가 → 미발견 처리
     - **발견 시**: `get_screen`으로 URL 확보 →
       `stitch_screens`의 pending 항목을 아래 필드로 업데이트:
       `stitch_screen_id`, `url` (`https://stitch.withgoogle.com/projects/{project_id}`),
       `image_url` (`screenshot.downloadUrl` 또는 null), `status: "active"`
       → "[Stitch] 화면 확인 완료 — {screen title}" 출력
     - **미발견 시**: pending 유지 →
       "[Stitch] 화면 미확인 — /mst:stitch --list로 수동 확인 가능합니다." 출력

5. **Phase 5 완료 처리**: `stitch_screens`의 `active` 항목 → `archived`로 변경; `current_phase=5`, `status="done"` 업데이트; 완료 알림
5.5. **후속 REQ 활성화 (Dependency Unblock)**:
  - `request.json`의 `dependencies.blocks` 배열 확인
  - 배열이 비어있으면 이 단계 스킵
  - 비어있지 않으면 각 후속 REQ-ID에 대해:
    a. `{PROJECT_ROOT}/.gran-maestro/requests/{BLOCKED-REQ-ID}/request.json` Read
    b. `status`가 `pending_dependency`인지 확인 (아니면 스킵)
    c. `dependencies.blockedBy` 배열에서 현재 완료된 REQ-ID를 제거
    d. `blockedBy` 배열이 비어지면:
       - `request.json`의 `status`를 `"phase1_analysis"`로 변경
       - 사용자에게 알림: `[활성화] {BLOCKED-REQ-ID} 의존성 해소 — Phase 1 분석 시작`
       - PM Conductor로 해당 REQ의 Phase 1 분석 즉시 실행 (spec.md 자동 작성)
       - Phase 1 분석 완료 (`status == "spec_ready"`) 후:
         * `workflow.auto_approve_on_unblock == true`이면:
           - 알림: `[자동 실행] {BLOCKED-REQ-ID} 의존성 해소 완료 → approve 자동 실행 중...`
           - `Skill(skill: "mst:approve", args: "{BLOCKED-REQ-ID}")` 호출
         * `false`이면: 기존과 동일하게 `/mst:approve {BLOCKED-REQ-ID}` 안내
    e. `blockedBy`가 아직 남아있으면 현재 REQ-ID만 제거하고 `pending_dependency` 유지
> ⚠️ **CRITICAL — 절대 건너뛰기 금지**: Step 6은 Plan 상태 동기화 단계입니다.
> source_plan 유무와 관계없이 반드시 이 단계를 확인하고 실행해야 합니다.

6. **Plan 상태 동기화**:
   - `source_plan`(예: `PLN-NNN`) 있으면: `plans/PLN-NNN/plan.json` Read → `linked_requests` 내 모든 REQ 상태 확인
   - 전체 `done`/`completed`/아카이브 시: **스크립트 우선** `python3 {PLUGIN_ROOT}/scripts/mst.py plan sync {source_plan}`; 실패 시 fallback으로 `plan.json`의 `status="completed"` + `completed_at` 직접 업데이트
   - 미완료 REQ 존재 시: 스킵; `source_plan` 없으면 스킵
7. **전체 세션 자동 정리**: `archive.auto_archive_on_complete=true` 시:
   ```bash
   python3 {PLUGIN_ROOT}/scripts/mst.py archive run-all
   ```
   - 결과 1줄 표시 (`[Archive] 전체 정리 완료 — idn:2, dsc:0, dbg:1, ...` 또는 `[Archive] 정리 대상 없음`)
   - `auto_archive_on_complete=false`이면 이 단계 스킵

## 예시

```
/mst:accept              # 최종 수락 대기 중인 첫 번째 요청 자동 선택
/mst:accept REQ-001      # 명시적으로 REQ-001 최종 수락
```

## 설정

`workflow.auto_accept_result` (기본: `true`): `true` → 자동 수락; `false` → 수동 호출 필요
```
/mst:settings workflow.auto_accept_result false
```

## 문제 해결

- "수락 요청 없음" → `/mst:inspect {REQ-ID}`로 Phase 3 PASS 상태 확인
- "리뷰 PASS 아님" → `/mst:feedback`으로 피드백 루프 먼저 완료
- "머지 충돌" → worktree에서 수동 충돌 해결 후 재실행
- "이미 완료됨" → `/mst:inspect {REQ-ID}` 확인
