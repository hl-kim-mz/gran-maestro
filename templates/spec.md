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
  태스크 설명(§1 요약, §2 범위, §4 컨텍스트)을 읽어
  어떤 에이전트의 도메인 목록과 가장 잘 맞는지 LLM이 판단한다.
  추론 예시:
    "API 엔드포인트 추가" → backend → codex-dev
    "버튼 컴포넌트 수정" → ui → gemini-dev
    "페이지 라우팅 추가" → frontend → gemini-dev
    "CI/CD 설정 변경" → infra → codex-dev
    "SKILL.md 로직 업데이트" → skill → codex-dev
    "README 업데이트" → docs → claude-dev
    "config.json 필드 추가" → config → claude-dev

Step 3: 에이전트 확정
  매칭된 에이전트 확정. 매칭 불가 시 DEFAULT_AGENT 사용 (fallback).
  approve 스킬은 `최종:` 이후 에이전트명을 사용합니다.

⚠️ 컨텍스트 보유를 이유로 한 claude-dev 선택은 유효하지 않다.
   외주 에이전트는 worktree를 직접 탐색하므로 컨텍스트 보유는 이점이 아님.
-->
- Worktree: {PROJECT_ROOT}/.gran-maestro/worktrees/{TASK_ID}
- Complexity: {Lite | Standard | High-Risk}

<!-- Complexity 등급 선택 기준:
  Lite        — 수정 범위 좁음, 레이어 변경 없음, 공개 인터페이스 변경 없음
  Standard    — 여러 레이어 걸침 또는 제한적 인터페이스 변경
  High-Risk   — 공개 인터페이스 변경 또는 DB 스키마/마이그레이션 포함
-->

## 1. 요약 (Summary)

{태스크의 목적을 1~2문장으로. "무엇을 달성하는가"만 기술, 방법은 기술하지 않음}

## 2. 범위 (Scope)

- **포함**: {이 태스크에서 처리하는 기능/동작}
- **제외**: {명시적으로 이 태스크 범위 밖인 것}
- **시작점 힌트**: {에이전트가 탐색을 시작할 핵심 파일/디렉토리 1~3개 — 참고용, 강제 아님}

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
  - [automatable] — CI/스크립트로 자동 검증 가능
  - [manual]      — 육안·수동 검증 필요

  필수 AC 카테고리 — 해당 조건 충족 시 반드시 포함 (생략 금지):
  ① 기능 요건: 태스크 핵심 기능 동작 확인 (1개 이상 필수)
  ② 타입 체크: .ts/.tsx/.py 등 타입 시스템 있는 언어 변경 시 [automatable]
  ③ 빌드 성공: 빌드 스크립트가 존재하는 프로젝트 변경 시 [automatable]
  ④ 린트/포맷: 린터·포맷터 설정이 있는 프로젝트 변경 시 [automatable]
  ⑤ 기존 테스트: 테스트 스위트가 존재하는 프로젝트 변경 시 [automatable]
  ⑥ 신규 테스트: 새 로직 추가 시 (해당 시) [automatable]
  ⑦ 런타임 에러 없음: UI/서버 변경 시 [manual]
  ⑧ 하위 호환성: 공개 인터페이스 변경 시 [manual]
  해당 없는 카테고리는 생략 가능.
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
When: 타입 체크 명령 실행 시
Then: 타입 에러 0건
Test: `{npx tsc --noEmit | deno check | mypy | N/A}`

#### AC-004 [MUST] [automatable]
Given: 빌드 스크립트가 존재하는 프로젝트
When: 빌드 명령 실행 시
Then: 빌드 성공, 에러 0건
Test: `{npm run build | make | N/A}`

#### AC-005 [MUST] [automatable]
Given: 테스트 스위트가 존재하는 프로젝트
When: 테스트 실행 시
Then: 전체 PASS
Test: `{테스트 실행 명령어}`

## 3.5 Constraints

<!-- 구현 방법 지시가 아닌 준수해야 할 제약만 기술. 없으면 N/A. -->

- 보안: {예: 사용자 입력은 반드시 sanitize 후 DB 저장 | N/A}
- 성능: {예: API 응답 p95 ≤ 200ms | N/A}
- 호환성: {예: Node.js 18 이상 지원 필수 | N/A}
- 운영: {예: 배포 중 다운타임 없음 | N/A}

## 4. 구현 컨텍스트 (Context)

> 에이전트가 판단에 참고할 맥락 정보입니다.
> **구현 방법 지시가 아닙니다** — 에이전트가 코드베이스를 직접 탐색하고 스스로 결정합니다.

- **따라야 할 패턴**: {기존 코드베이스의 컨벤션/패턴 — 없으면 N/A}
- **알아야 할 제약**: {특정 라이브러리 사용 금지 등 기술적 제약 — 없으면 N/A}
- **접근법 방향**: {ideation/discussion 결과 요약 — 없으면 N/A}

## 5. 의존성 (Dependencies)

- 선행 작업 (blockedBy): []
- 후행 작업 (blocks): []

## 6. 에이전트 팀 구성 (Agent Team)

- 실행: {에이전트명} ({도메인})
- 사유: {선택 이유}

## 7. 팀 판단 기반 결정 (Team-Assisted Decisions)

> ideation/discussion이 실행된 경우에만 포함합니다.

### 접근 방식 결정 (해당 시)
- 판단 유형: ideation | discussion
- 주제: {결정 주제}
- 결정 내용: {팀 결론 요약}
- 근거 파일: `discussion/req-approach-synthesis.md`

## 8. UI 설계 (Stitch)

> 이 섹션은 UI 화면 설계가 포함된 경우 작성합니다.
> `/mst:stitch --req {REQ_ID}` 실행 시, 또는 `--plan PLN-NNN`의 `linked_designs`에 DES가 연결되어 있을 때 자동으로 채워집니다.

- Stitch 프로젝트: {stitch_project_url — 미기입}
- 생성 화면:
  - {화면명}: {Stitch 화면 URL — 미기입}

## 9. 캡처 컨텍스트

> 이 섹션은 plan에서 캡처 참조가 인계된 경우에만 작성합니다.
> 에이전트는 이 정보를 구현 시 참고하여 대상 요소의 정확한 위치를 파악합니다.

| CAP ID | 요소 | CSS Path | Memo | Screenshot |
|--------|------|----------|------|------------|
| {CAP-NNN} | {selector} | {css_path} | {memo} | {screenshot_path} |

## 10. 가정 사항 (Assumptions)

> `--plan` 없이 생성된 스펙에만 포함합니다.
> 에이전트는 구현 전 이 섹션을 반드시 확인해야 합니다.

- {가정 1}: {근거}
