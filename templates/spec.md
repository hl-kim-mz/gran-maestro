# Implementation Spec

- Request ID: {REQ_ID}
- Task ID: {TASK_ID}
- Created: {DATE}
- Status: pending | queued | executing | pre_check | pre_check_failed | review | feedback | merging | merge_conflict | done | failed | cancelled
- Assigned Agent: codex | gemini
- Assigned Team: {에이전트 팀 구성 설명}
- Worktree: .gran-maestro/worktrees/{TASK_ID}

## 1. 요약 (Summary)

{태스크의 목적과 범위를 1~2문장으로}

## 2. 변경 범위 (Scope)

- 수정 파일 목록:
  - {file1}
  - {file2}
- 영향 받는 모듈: {모듈 목록}
- 변경 유형: 신규 | 수정 | 리팩토링 | 삭제

## 3. 수락 조건 (Acceptance Criteria)

- [ ] AC-1: {기능 요건 - MUST}
- [ ] AC-2: {기능 요건 - MUST}
- [ ] AC-3: {비기능 요건 - 성능/보안 등}
- [ ] AC-4: 기존 테스트 통과
- [ ] AC-5: 신규 테스트 작성 (해당 시)

## 4. 기술 설계 (Technical Design)

### 접근 방식

{구현 전략 설명}

### AI별 의견 요약

- **Claude Code**: ...
- **Codex**: ...
- **Gemini**: ...
- **PM 종합 판단**: ... (추천순 정리)

### 설계 문서 참조 (Design Wing 산출물)

- Architecture: {.gran-maestro/requests/REQ-XXX/design/architecture.md 또는 N/A}
- Data Model: {.gran-maestro/requests/REQ-XXX/design/data-model.md 또는 N/A}
- UI Spec: {.gran-maestro/requests/REQ-XXX/design/ui-spec.md 또는 N/A}

> **검증**: Design Wing 에이전트가 소환된 경우, 해당 설계 문서 참조가 반드시 채워져야 합니다.
> PM Conductor는 스펙 승인 전에 design_refs 필드의 완전성을 검증합니다.

## 5. 테스트 계획 (Test Plan)

- 단위 테스트: ...
- 통합 테스트: ...
- 수동 검증 항목: ...

## 6. 리스크 및 제약사항

- {리스크 1}
- {리스크 2}

## 7. 의존성 (Dependencies)

- 선행 작업 (blockedBy): []
- 후행 작업 (blocks): []

## 8. 에이전트 팀 구성 (Agent Team)

- 실행: {codex-dev | gemini-dev} ({작업 유형}) — fallback: {대안 에이전트}
- 리뷰: {gemini-reviewer | codex-reviewer} ({리뷰 유형})
- 사유: {PM이 이 팀을 선택한 이유}
