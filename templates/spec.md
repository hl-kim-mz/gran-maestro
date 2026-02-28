# Implementation Spec

- Request ID: {REQ_ID}
- Task ID: {TASK_ID}
- Created: {DATE}
- Status: pending | queued | executing | pre_check | pre_check_failed | review | feedback | merging | merge_conflict | done | failed | cancelled
- Assigned Agent: codex | gemini | claude-dev
- Assigned Team: {에이전트 팀 구성 설명}

<!-- Decision Tree — 에이전트 선택 기준
0단계: 기본값 결정 (항상 먼저 실행)
  .gran-maestro/config.json의 workflow.default_agent 값을 읽어 Assigned Agent 기본값으로 설정.
  이후 1~3단계는 이 기본값의 override 조건이다. 기본값 없이 claude-dev를 선택하는 것은 금지.

1단계: 변경 파일 유형
  .md 스킬/문서, .json config, .env, .yaml    → claude-dev 허용
  .tsx, .jsx, React hooks/context/page        → gemini-dev 우선
  .ts 백엔드 로직, API, DB, 신규 .ts 파일 생성 → codex-dev 우선
  *.config.ts (vite, tailwind 등 설정성 TS)  → claude-dev 허용

2단계: 혼합 작업 게이트
  .tsx/.jsx 또는 신규 .ts 파일 생성이 1개라도 포함 → claude-dev 금지
  변경 파일이 모두 기존 .ts 인라인 수정만      → claude-dev 허용 가능 (3단계 확인)

3단계: 예외 — 코어 로직 변경 여부
  YES (새 SKILL.md, 오케스트레이션 변경 등)   → claude-dev 허용
  NO + 레이어 기준 금지                       → [EXCEPTION] 태그 + 사유 필수

⚠️  컨텍스트 보유를 이유로 한 claude-dev 선택은 유효하지 않다.
    외주 에이전트는 worktree를 직접 탐색하므로 컨텍스트 보유는 실질적 이점이 아님.
-->
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

- [ ] AC-1: {기능 요건} — 검증: {확인 방법}
- [ ] AC-2: {기능 요건} — 검증: {확인 방법}
- [ ] AC-3: {비기능 요건} — 검증: {확인 방법}
- [ ] AC-4: 기존 테스트 통과 — 검증: `{테스트 실행 명령어}` 전체 PASS
- [ ] AC-5: 신규 테스트 작성 (해당 시) — 검증: 테스트 파일 존재 + PASS

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

### 실행 명령어
- 테스트: {npm test | npx vitest run | pytest | ...}
- 타입 체크: {npx tsc --noEmit | deno check | N/A}

### 테스트 항목
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

## 9. 팀 판단 기반 결정 (Team-Assisted Decisions)

> 이 섹션은 PM이 AI 팀 판단을 활용한 경우에만 포함됩니다.

### 요구사항 명확화 (해당 시)
- 판단 유형: ideation | discussion
- 주제: {모호했던 요구사항 주제}
- 결정 내용: {팀 결론 요약}
- 근거 파일: `discussion/req-ambiguity-{synthesis|consensus}.md`

### 접근 방식 결정 (해당 시)
- 판단 유형: ideation
- 주제: {접근법 결정 주제}
- 결정 내용: {팀 추천 방향 요약}
- 근거 파일: `discussion/req-approach-synthesis.md`

## 10. UI 설계 (Stitch)

> 이 섹션은 UI 화면 설계가 포함된 경우 작성합니다. `/mst:stitch --req {REQ_ID}` 실행 시 자동으로 채워집니다.

- [ ] {화면명}: {Stitch URL — 미기입}
