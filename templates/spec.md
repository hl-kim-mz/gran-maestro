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
- Complexity: {Lite | Standard | High-Risk}

<!-- Complexity 등급 선택 기준:
  Lite        — 수정 파일 ≤ 3개, 레이어 변경 없음, 공개 인터페이스 변경 없음
  Standard    — 수정 파일 4~10개 또는 레이어 1~2개 추가, 제한적 인터페이스 변경
  High-Risk   — 수정 파일 > 10개 또는 공개 인터페이스 변경 또는 DB 스키마/마이그레이션 포함

  자동 승격 조건 (Lite → Standard):
    - 공개 export/API/config 스키마 변경 포함 시
    - 2개 이상의 레이어(예: UI + 서버 + DB)를 동시에 수정 시
  자동 승격 조건 (Standard → High-Risk):
    - 데이터베이스 마이그레이션 포함 시
    - 외부 공개 API(breaking change) 수정 시
-->

## 1. 요약 (Summary)

{태스크의 목적과 범위를 1~2문장으로}

## 2. 변경 범위 (Scope)

- 수정 파일 목록:
  - {file1}
  - {file2}
- 영향 받는 모듈: {모듈 목록}
- 변경 유형: 신규 | 수정 | 리팩토링 | 삭제

## 3. 수락 조건 (Acceptance Criteria)

<!-- AC 형식 안내:
  각 AC는 아래 형식으로 작성합니다.

  #### AC-NNN [MUST/SHOULD] [automatable/manual]
  Given: {사전조건}
  When: {행동}
  Then: {관찰 가능한 기대 결과}
  Test: {실행 명령 또는 확인 방법}

  - [MUST]        — 미충족 시 태스크 반려
  - [SHOULD]      — 미충족 시 경고, PM 재량으로 통과 가능
  - [automatable] — CI/스크립트로 자동 검증 가능 (Test Scenarios 섹션에 명령 기술 필수)
  - [manual]      — 육안·수동 검증 필요 (Test Scenarios 섹션 불필요)

  필수 AC 카테고리 — 해당 조건 충족 시 반드시 포함 (생략 금지):
  ① 기능 요건: 태스크 핵심 기능 동작 확인 (1개 이상 필수)
  ② 타입 체크: .ts/.tsx/.py 등 타입 시스템 있는 언어 변경 시 (예: `npx tsc --noEmit`) [automatable]
  ③ 빌드 성공: 빌드 스크립트가 존재하는 프로젝트 변경 시 (예: `npm run build`) [automatable]
  ④ 린트/포맷: 린터·포맷터 설정이 있는 프로젝트 변경 시 (예: `npm run lint`) [automatable]
  ⑤ 기존 테스트: 테스트 스위트가 존재하는 프로젝트 변경 시 [automatable]
  ⑥ 신규 테스트: 새 로직 추가 시 (해당 시) [automatable]
  ⑦ 런타임 에러 없음: UI/서버 변경 시 실행 후 콘솔 에러·스택 트레이스 없음 확인 [manual]
  ⑧ 하위 호환성: 공개 인터페이스(export, API, config 스키마 등) 변경 시 기존 호출자 미파괴 확인 [manual]
  ②③④는 수정 파일이 해당 도구 범위에 포함될 때 자동 적용.
  ⑦은 UI/서버 코드 변경 시 적용, ⑧은 공개 인터페이스 변경 시 적용.
  ⑨ PM 자율: 위 카테고리에 해당하지 않지만 태스크 특성상 필요한 추가 조건 (자유 기술)
  해당 없는 카테고리는 생략 가능 (예: .md만 수정 시 ②③④⑦⑧ 불필요).

  Constraints 전용 AC: 보안/성능/호환/운영 제약 조건은 [MUST] [manual] 또는 [automatable]로
  별도 AC 항목으로 기술합니다. "구현 지시"가 아닌 "준수해야 할 제약"을 서술합니다.
    예) AC-N [MUST] [manual]
        Given: 인증이 필요한 API 엔드포인트가 존재함
        When: 인증 토큰 없이 요청 시
        Then: 401 Unauthorized 반환, 내부 오류 미노출
        Test: curl로 비인증 요청 후 응답 코드 확인
-->

#### AC-001 [MUST] [automatable]
Given: {사전조건}
When: {행동}
Then: {관찰 가능한 기대 결과}
Test: {실행 명령어}

#### AC-002 [MUST] [manual]
Given: {사전조건}
When: {행동}
Then: {관찰 가능한 기대 결과}
Test: {육안 확인 방법}

#### AC-003 [MUST] [automatable]
Given: 타입 시스템 있는 언어 파일이 수정됨
When: `npx tsc --noEmit` (또는 해당 타입 체크 명령) 실행 시
Then: 타입 에러 0건
Test: `{npx tsc --noEmit | deno check | mypy | N/A}`

#### AC-004 [MUST] [automatable]
Given: 빌드 스크립트가 존재하는 프로젝트
When: `npm run build` (또는 해당 빌드 명령) 실행 시
Then: 빌드 성공, 에러 0건
Test: `{npm run build | make | N/A}`

#### AC-005 [MUST] [automatable]
Given: 테스트 스위트가 존재하는 프로젝트
When: 테스트 실행 시
Then: 전체 PASS
Test: `{테스트 실행 명령어}`

## 3.5 Constraints

<!-- Lite spec의 핵심 항목입니다. 구현 지시가 아닌 제약 조건만 명시합니다.
  보안, 성능, 호환성, 운영 요건에 해당하는 제약만 기술하세요.
  해당 없으면 "N/A (해당 없음)" 으로 표기합니다.
-->

- 보안: {예: 사용자 입력은 반드시 sanitize 후 DB 저장 | N/A}
- 성능: {예: API 응답 p95 ≤ 200ms | N/A}
- 호환성: {예: Node.js 18 이상 지원 필수 | N/A}
- 운영: {예: 배포 중 다운타임 없음 (zero-downtime deploy) | N/A}

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

## 4.5 Test Scenarios (Pre-Impl)

<!-- Dev Agent는 구현 시작 전 이 섹션을 작성해야 한다. 미작성 시 구현 착수 불가.
  preflight 검증에서 이 섹션이 비어 있으면 차단됩니다 (경고: 비워두면 차단됨).

  작성 대상: [automatable] 태그가 붙은 AC 항목마다 실행 명령 + 기대 출력을 기술합니다.
  [manual] AC 항목은 이 섹션에 기술하지 않아도 됩니다.

  복잡도별 작성 위치:
  - Lite: 이 spec.md 파일 내 인라인으로 작성 (아래 예시 형식 사용)
  - Standard 이상: `acceptance.md` 별도 파일에 작성 후 아래에 링크를 남깁니다.
    예) Standard 이상: 상세 시나리오는 [acceptance.md](.gran-maestro/requests/{REQ_ID}/tasks/{TASK_NUM}/acceptance.md) 참조

  Dev Agent 책임: 테스트 코드 작성 및 시나리오 정의는 구현의 일부입니다.
  PM이 이 섹션을 미리 채우지 않은 경우, Dev Agent가 구현 전 직접 작성해야 합니다.
-->

### AC-001 시나리오 (automatable)

```bash
# 실행 명령
{명령어 예시}

# 기대 출력
{기대 출력 예시}
```

### AC-003 시나리오 (automatable) — 타입 체크

```bash
npx tsc --noEmit
# 기대 출력: 에러 없음 (exit code 0)
```

<!-- Standard 이상인 경우 아래 링크로 대체:
상세 시나리오: [acceptance.md](.gran-maestro/requests/{REQ_ID}/tasks/{TASK_NUM}/acceptance.md)
-->

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
