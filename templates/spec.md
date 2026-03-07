# Implementation Spec

- Request ID: {REQ_ID}
- Task ID: {TASK_ID}
- Created: {DATE}
- Status: pending | queued | executing | pre_check | pre_check_failed | review | feedback | merging | merge_conflict | done | failed | cancelled
- Assigned Agent: [config: {DEFAULT_AGENT}] → [도메인: {추론된 도메인}] → 최종: {에이전트}
- Assigned Team: {에이전트 팀 구성 설명}

<!-- Agent Assignment — 도메인 추론 방식
Step 0: config 기본값 확인
  config.resolved.json의 `workflow.default_agent`를 Read해 DEFAULT_AGENT를 취득한다.
  이 단계 없이 에이전트를 결정하는 것은 에러다.

Step 1: agent_assignments 읽기
  config.resolved.json의 `agent_assignments`를 Read한다.
  구조: { "에이전트명": ["도메인1", "도메인2", ...], ... }

Step 2: 도메인 추론
  태스크 설명(§1 요약, §2 변경 범위, §4 기술 설계)을 읽어
  어떤 에이전트의 도메인 목록과 가장 잘 맞는지 LLM이 판단한다.
  파일 목록이 있으면 추론 힌트로 활용한다. 충돌 시 태스크 설명 기반 추론이 우선이다 (하위 호환).
  추론 예시:
    "API 엔드포인트 추가" → backend → codex-dev
    "버튼 컴포넌트 수정" → ui → gemini-dev       (개별 컴포넌트)
    "페이지 라우팅 추가" → frontend → gemini-dev  (페이지/라우팅 레벨)
    "CI/CD 설정 변경" → infra → codex-dev
    "SKILL.md 로직 업데이트" → skill → codex-dev
    "README 업데이트" → docs → claude-dev
    "config.json 필드 추가" → config → claude-dev
  도메인 참고:
    frontend: 페이지, 라우팅, 앱 수준 레이아웃
    ui: 개별 컴포넌트, 버튼, 입력 필드 등

Step 3: 에이전트 확정
  매칭된 에이전트 확정. 매칭 불가 시 DEFAULT_AGENT 사용 (fallback).
  approve 스킬은 `최종:` 이후 에이전트명을 사용합니다.

⚠️ 컨텍스트 보유를 이유로 한 claude-dev 선택은 유효하지 않다.
   외주 에이전트는 worktree를 직접 탐색하므로 컨텍스트 보유는 이점이 아님.
-->
- Worktree: {PROJECT_ROOT}/.gran-maestro/worktrees/{TASK_ID}

## 1. 요약 (Summary)

{태스크의 목적과 범위를 1~2문장으로}

## 2. 변경 범위 (Scope)

- 수정 파일 목록:
  - {file1}
  - {file2}
- 영향 받는 모듈: {모듈 목록}
- 변경 유형: 신규 | 수정 | 리팩토링 | 삭제

## 3. 수락 조건 (Acceptance Criteria)

<!-- 필수 AC 카테고리 — 해당 조건 충족 시 반드시 포함 (생략 금지):
  ① 기능 요건: 태스크 핵심 기능 동작 확인 (1개 이상 필수)
  ② 타입 체크: .ts/.tsx/.py 등 타입 시스템 있는 언어 변경 시 (예: `npx tsc --noEmit`)
  ③ 빌드 성공: 빌드 스크립트가 존재하는 프로젝트 변경 시 (예: `npm run build`)
  ④ 린트/포맷: 린터·포맷터 설정이 있는 프로젝트 변경 시 (예: `npm run lint`)
  ⑤ 기존 테스트: 테스트 스위트가 존재하는 프로젝트 변경 시
  ⑥ 신규 테스트: 새 로직 추가 시 (해당 시)
  ⑦ 런타임 에러 없음: UI/서버 변경 시 실행 후 콘솔 에러·스택 트레이스 없음 확인
  ⑧ 하위 호환성: 공개 인터페이스(export, API, config 스키마 등) 변경 시 기존 호출자 미파괴 확인
  ②③④는 수정 파일이 해당 도구 범위에 포함될 때 자동 적용.
  ⑦은 UI/서버 코드 변경 시 적용, ⑧은 공개 인터페이스 변경 시 적용.
  ⑨ PM 자율: 위 카테고리에 해당하지 않지만 태스크 특성상 필요한 추가 조건 (자유 기술)
  해당 없는 카테고리는 생략 가능 (예: .md만 수정 시 ②③④⑦⑧ 불필요).
-->

- [ ] AC-1: {기능 요건} — 검증: {확인 방법}
- [ ] AC-2: {기능 요건} — 검증: {확인 방법}
- [ ] AC-3: {비기능 요건} — 검증: {확인 방법}
- [ ] AC-N: 타입 체크 통과 — 검증: `{npx tsc --noEmit | deno check | mypy | N/A}` 전체 PASS
- [ ] AC-N: 빌드 성공 — 검증: `{npm run build | make | N/A}` 성공 (에러 0)
- [ ] AC-N: 린트 통과 — 검증: `{npm run lint | ruff check | N/A}` 전체 PASS
- [ ] AC-N: 기존 테스트 통과 — 검증: `{테스트 실행 명령어}` 전체 PASS
- [ ] AC-N: 신규 테스트 작성 (해당 시) — 검증: 테스트 파일 존재 + PASS
- [ ] AC-N: 런타임 에러 없음 — 검증: 실행 후 콘솔 에러·unhandled rejection·스택 트레이스 없음
- [ ] AC-N: 하위 호환성 유지 — 검증: 변경된 export/API/config의 기존 호출자 코드 브레이킹 없음
- [ ] AC-N: {PM 판단 추가 조건} — 검증: {확인 방법}

## 4. 기술 설계 (Technical Design)

### 접근 방식

{구현 전략 설명}

### 참고 코드 위치

> 에이전트가 구현 시작점으로 삼을 파일·함수·라인을 명시합니다. 없으면 N/A.

- {파일경로:라인번호} — {역할 설명}
- {파일경로:함수명} — {역할 설명}

### 에지케이스

> 구현 시 주의해야 할 경계 조건, 예외 입력, 비정상 흐름을 열거합니다. 없으면 N/A.

- {에지케이스 1}: {처리 방법}
- {에지케이스 2}: {처리 방법}

### AI별 의견 요약

- **Claude Code**: ...
- **Codex**: ...
- **Gemini**: ...
- **PM 종합 판단**: ... (추천순 정리)

### 설계 문서 참조 (Design Wing 산출물)

- Architecture: {{PROJECT_ROOT}/.gran-maestro/requests/REQ-XXX/design/architecture.md 또는 N/A}
- Data Model: {{PROJECT_ROOT}/.gran-maestro/requests/REQ-XXX/design/data-model.md 또는 N/A}
- UI Spec: {{PROJECT_ROOT}/.gran-maestro/requests/REQ-XXX/design/ui-spec.md 또는 N/A}

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

## 6.5 가정 사항 (Assumptions)

> `--plan` 없이 생성된 스펙에만 포함합니다. PM이 요구사항의 모호한 부분에 대해 합리적으로 가정한 내용을 기록합니다.
> 가정이 틀린 경우 구현 방향이 달라질 수 있으므로 에이전트는 이 섹션을 먼저 확인해야 합니다.

- {가정 1}: {근거 또는 확인 방법}
- {가정 2}: {근거 또는 확인 방법}

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

> 이 섹션은 UI 화면 설계가 포함된 경우 작성합니다.
> `/mst:stitch --req {REQ_ID}` 실행 시, 또는 `--plan PLN-NNN`의 `linked_designs`에 DES가 연결되어 있을 때 자동으로 채워집니다.
> ⚠️ 이미지 URL은 수 시간 후 만료될 수 있습니다.

- Stitch 프로젝트: {stitch_project_url — 미기입}
- 생성 화면:
  - {화면명}: {Stitch 화면 URL — 미기입}

## 11. 캡처 컨텍스트

> 이 섹션은 plan에서 캡처 참조가 인계된 경우에만 작성합니다.
> 에이전트는 이 정보를 구현 시 참고하여 대상 요소의 정확한 위치를 파악합니다.

| CAP ID | 요소 | CSS Path | Memo | Screenshot |
|--------|------|----------|------|------------|
| {CAP-NNN} | {selector} | {css_path} | {memo} | {screenshot_path} |
