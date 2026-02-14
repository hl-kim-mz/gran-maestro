---
name: maestro:resume
description: "미완료 요청을 복구하고 마지막 Phase부터 재개합니다"
user-invocable: true
argument-hint: "[<REQ-ID>] [<TASK-ID>]"
aliases: ["mr"]
---

# maestro:resume

Claude Code 세션 종료 후 진행 중이던 워크플로우를 복구합니다.
파일 기반 상태에서 자동으로 복구 가능한 태스크를 탐색합니다.

## 실행 프로토콜

### 인자 없이 호출 시 (`/mr`)

1. `.gran-maestro/requests/` 디렉토리 전체 스캔
2. 각 요청의 `request.json` 읽기
3. terminal 상태가 아닌 요청 탐색 (completed, cancelled, failed 제외)
4. 각 태스크의 `status.json` 확인
5. 복구 가능한 태스크 목록을 사용자에게 표시
6. 사용자가 선택하면 해당 Phase부터 재개

### 특정 요청 복구 (`/mr REQ-001`)

1. `.gran-maestro/requests/REQ-001/request.json` 읽기
2. 모든 태스크의 상태 확인
3. 마지막 활성 Phase 판별
4. 해당 Phase부터 재개

### 특정 태스크 복구 (`/mr REQ-001-01`)

1. `.gran-maestro/requests/REQ-001/tasks/01/status.json` 읽기
2. 태스크 상태에 따른 복구 판단:
   - `executing` → CLI 프로세스 확인 → 살아있으면 모니터링, 없으면 재실행
   - `review` → 리뷰 재개 (git diff 재확인)
   - `feedback` → 피드백 기반 재실행
   - `merging` → merge 상태 확인 후 재개
   - `queued` → 큐에 재삽입
   - `pre_check` / `pre_check_failed` → 사전 검증 재실행
3. 사용자 확인 후 실행

## 복구 판단 매트릭스

| 마지막 상태 | 복구 동작 | Phase |
|------------|----------|-------|
| `pending` | 실행 큐에 삽입 | Phase 2 |
| `queued` | 큐에 재삽입 | Phase 2 |
| `executing` | 프로세스 확인 → 재실행 | Phase 2 |
| `pre_check` | 사전 검증 재실행 | Phase 2 |
| `pre_check_failed` | 피드백 첨부 재실행 | Phase 2 |
| `review` | 리뷰 재개 | Phase 3 |
| `feedback` | 피드백 기반 재실행 | Phase 4→2 |
| `merging` | merge 상태 확인 | Phase 5 |
| `merge_conflict` | 사용자에게 옵션 제시 | Phase 5 |

## 출력 형식 (목록)

```
Gran Maestro — 복구 가능한 요청
═══════════════════════════════════════

REQ-001  "사용자 인증 기능 추가"
  마지막 Phase: 2 (외주 실행)
  복구 가능 태스크:
  ├── 01: executing → 재실행 필요 (프로세스 없음)
  └── 02: pending → 큐에 삽입

REQ-003  "설정 페이지 리팩토링"
  마지막 Phase: 3 (PM 리뷰)
  복구 가능 태스크:
  └── 01: review → 리뷰 재개

═══════════════════════════════════════
복구할 요청 ID를 입력하세요 (전체: all):
```

## 예시

```
/mr              # 모든 미완료 요청 복구 목록
/mr REQ-001      # 특정 요청 복구
/mr REQ-001-01   # 특정 태스크 복구
```

## 한국어 트리거

- "복구", "재개", "이어서", "계속해줘"
