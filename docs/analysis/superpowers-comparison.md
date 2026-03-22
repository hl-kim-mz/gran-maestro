# Superpowers v5.0.5 vs Gran Maestro v0.55.2 — 비교 분석 보고서

> 작성일: 2026-03-22
> 근거: PLN-331, IDN-039 (workflow-analyst, quality-strategist, dx-evaluator, critic)

---

## 목차

1. [개요](#1-개요)
2. [분석 영역 A: 흐름 제어 & 워크플로우](#2-분석-영역-a-흐름-제어--워크플로우)
   - 2.1 흐름 제어: 순서 통제 vs 의미 통제
   - 2.2 워크플로우 체이닝
   - 2.3 Subagent 관리
3. [분석 영역 B: 품질 보증](#3-분석-영역-b-품질-보증)
   - 3.1 TDD / 테스트 철학
   - 3.2 Verification: 증거 기반 완료
   - 3.3 코드 리뷰
   - 3.4 디버깅
4. [분석 영역 C: DX & 메타](#4-분석-영역-c-dx--메타)
   - 4.1 Anti-Rationalization
   - 4.2 스킬 작성 방법론 & 테스트 인프라
   - 4.3 온보딩 & 멀티 플랫폼
5. [흐름 제어 메커니즘 상세 비교](#5-흐름-제어-메커니즘-상세-비교)
6. [채택 우선순위 매트릭스](#6-채택-우선순위-매트릭스)
7. [트레이드오프 경고](#7-트레이드오프-경고)
8. [결론](#8-결론)

---

## 1. 개요

본 보고서는 Superpowers 플러그인(v5.0.5)과 Gran Maestro 플러그인(v0.55.2)을 10개 영역에서 체계적으로 비교 분석하고, Gran Maestro가 채택할 수 있는 개선점을 우선순위별로 정리한다.

**분석 방법**: IDN-039 다중 에이전트 토론(workflow-analyst, quality-strategist, dx-evaluator)의 개별 의견과 critic 반론, 그리고 종합(synthesis)을 기반으로 plan(PLN-331)에서 도출된 10개 영역별 비교 표와 개선 제안을 보고서 형식으로 정제하였다.

**두 플러그인의 근본적 차이**:

| 축 | Superpowers | Gran Maestro |
|----|-------------|--------------|
| 철학 | 엔지니어링 생산라인 (TDD + subagent) | 거버넌스 체인 (PM 오케스트레이션) |
| 제어 수준 | 프롬프트 레벨 (스킬 내부 IRON LAW) | 시스템 레벨 (hooks + continuation guard) |
| 대상 사용자 | 개발자 직접 사용 | PM이 AI 에이전트를 통제 |
| 플랫폼 | 5개 (Claude/Cursor/Codex/OpenCode/Gemini) | Claude Code 전용 |
| 스킬 수 | 14개 (composable) | 35+개 (orchestration) |

---

## 2. 분석 영역 A: 흐름 제어 & 워크플로우

### 2.1 흐름 제어: 순서 통제 vs 의미 통제

| 항목 | Superpowers | Gran Maestro |
|------|-------------|--------------|
| 메커니즘 | HARD-GATE / IRON LAW (스킬 내부에 규칙 직접 기술) | hooks + continuation guard (시스템 레벨 강제) |
| 강점 | **의미 통제** — 근본원인 확인 없이 수정 금지, 증거 없이 완료 금지 | **순서 통제** — 실행 순서 강제, 스킬 복귀 강제 |
| 약점 | 규칙이 스킬별로 분산, 긴급 대응 시 경직 | 의미 통제 약함 — "왜 이 단계를 통과해야 하는가"에 대한 강제력 부족 |
| Rationalization 방지 | 구체적 합리화 패턴 열거 ("너무 단순해서 생략", "나중에 할게") | 프로토콜 강제 규칙 (원칙 수준 선언) |

**개선 제안** (우선순위: High):
- 기존 훅 체계를 유지하면서, 핵심 스킬에 `## Gate` 섹션으로 의미 게이트를 표준화
- Anti-Rationalization Checklist: 스킬당 3개 이내 구체적 합리화 패턴 열거
- 별도 Gate Registry(YAML) 대신 스킬 마크다운 내부에 직접 기술 (Critic: 외부 레지스트리는 동기화 부채가 됨)

### 2.2 워크플로우 체이닝

| 항목 | Superpowers | Gran Maestro |
|------|-------------|--------------|
| 체인 | brainstorming → writing-plans → executing-plans | plan → request → approve → review → accept |
| 성격 | 엔지니어링 생산라인 (태스크 세분화, 구현 연속성) | 거버넌스 체인 (책임 추적, 의사결정 근거 보존) |
| 강점 | 태스크를 2-5분 단위로 세분화, 자율 실행 지속 가능 | 의사결정 트레이스, PAC Trace로 요구사항-구현 연결 |
| 약점 | 승인/거버넌스 약세 | 리드타임 증가, review fail 시 되돌림 규칙 미약 |

**개선 제안** (우선순위: Medium):
- review fail return map 명시: 구현 결함 → request 복귀, 요구/가정 결함 → plan 복귀
- 단계별 산출물 계약 표준화: 입력/출력 템플릿 고정으로 handoff 손실 최소화
- plan 2층 분리(problem-spec/execution-plan)는 Phase 1/2로 이미 사실상 존재하므로 추가 불필요 (Critic 확인)

### 2.3 Subagent 관리

| 항목 | Superpowers | Gran Maestro |
|------|-------------|--------------|
| 격리 | fresh subagent per task (콜드스타트, 컨텍스트 오염 방지) | worktree 기반 격리 (파일시스템/브랜치 충돌 회피) |
| 리뷰 | 2-stage (spec compliance → code quality) | 단일 리뷰 루프 |
| 강점 | 추론 컨텍스트 완전 격리, 병렬 가능 | 파일시스템 수준 격리, 브랜치 전략 내장 |
| 약점 | 콜드스타트 오버헤드 | 추론 컨텍스트 오염 미완전 차단 |

**개선 제안** (우선순위: Medium):
- 태스크 등급 매트릭스: 경량 변경은 공유 worktree + 단일 review, 고위험 변경은 fresh subagent + 격리 worktree + 2-stage 의무화
- 리뷰어 분리: 구현자와 reviewer를 다른 에이전트로 분리하여 자기확증 편향 축소

---

## 3. 분석 영역 B: 품질 보증

### 3.1 TDD / 테스트 철학

| 항목 | Superpowers | Gran Maestro |
|------|-------------|--------------|
| 원칙 | IRON LAW: 실패 테스트 없이 코드 금지 | AC 기반 review 루프 |
| 강제력 | RED-GREEN-REFACTOR 필수, 위반 시 코드 삭제 | 테스트 전략 Q&A (선택적) |
| 강점 | 결함 예방 (사전 품질), 코드 진입 장벽이 품질 편차를 줄임 | 요구사항 적합성 (사후 품질), 운영 유연성 |
| 약점 | 모든 변경에 일률 적용으로 저위험 변경에 과도 | 고위험 코드도 TDD 없이 통과 가능 |

**개선 제안** (우선순위: Medium):
- Risk-tiered TDD 도입:
  - Tier A (비즈니스 규칙/상태 전이/데이터 변환): TDD 필수 — 실패 테스트 증거 필수
  - Tier B (UI/문구/저위험 변경): AC 우선 허용 — 최소 회귀 테스트는 review 전 필수
- PM이 plan 단계에서 AC별 검증 타입 태깅, 구현 에이전트가 코드 복잡도 기반으로 Tier 상향 에스컬레이션 가능 (Critic: PM 오분류 보완 필수)

### 3.2 Verification: 증거 기반 완료

| 항목 | Superpowers | Gran Maestro |
|------|-------------|--------------|
| 원칙 | IRON LAW: 증거 없는 완료 선언 금지 | PAC Trace (AC 추적성) |
| 검증 방식 | 명령 실행 → 출력 확인 → 주장 검증 (5-step Gate Function) | AC 통과 여부 판단 |
| 강점 | 증명 강도 (실제 실행 증거 강제) | 요구-결과 연결성 (PAC Mapping) |
| 약점 | 검증 오버헤드 | 선언형 완료 가능 ("AC 충족"이라고 주장만 하면 통과) |

**개선 제안** (우선순위: Medium):
- PAC-Evidence Ledger 도입: PAC 항목마다 검증 명령 + 기대 신호 + 실제 증거를 1:1 연결
- accept 조건 상향: "AC 충족" → "AC 충족 + 증거 첨부"
- review 출력 템플릿에 "Claim / Evidence / Verdict" 3열 고정

### 3.3 코드 리뷰

| 항목 | Superpowers | Gran Maestro |
|------|-------------|--------------|
| 구조 | 2-Stage (spec compliance → code quality) | 단일 리뷰 루프 |
| 장점 | "잘못 만든 좋은 코드" 방지 — 결함 분류를 분리해 판단 노이즈 감소 | 속도, 단순성 |
| 단점 | 2회 리뷰 비용/지연 (토큰 + 대기시간 2배) | spec 불일치와 품질 이슈 혼재, 재작업 왕복 증가 가능 |

**개선 제안** (우선순위: Medium):
- 조건부 2-Stage: Cynefin Complex 이상에만 의무화, Simple/Complicated는 기존 단일 유지 (Critic: 전면 분리는 비용 대비 효과 의문)
- Stage-1 fail → spec/request 롤백, Stage-2 fail → 수정 루프 후 재심
- 실패 리턴 분리로 재작업 정확도 향상

### 3.4 디버깅

| 항목 | Superpowers | Gran Maestro |
|------|-------------|--------------|
| 접근 | 4-Phase (조사 → 패턴 → 가설 → 구현) | 병렬 multi-agent (mst:debug) |
| 강점 | 오진 방지, 재현성, 근본원인 추적 강제 | 탐색 속도, 관점 다양성 |
| 약점 | 단일 시각 | 무근거 패치 위험 |

**개선 제안** (우선순위: Low):
- 병렬 탐색 + 단계 강제 결합: 각 에이전트가 4-Phase 템플릿(증상/가설/실험/결과)으로 보고
- PM이 에이전트 간 공통 원인을 합성해 단일 Fix Plan으로 수렴
- 동일 이슈 3회 실패 시 architect 재검토 트랙으로 승격 (구조적 결함 의심)

---

## 4. 분석 영역 C: DX & 메타

### 4.1 Anti-Rationalization

| 항목 | Superpowers | Gran Maestro |
|------|-------------|--------------|
| 접근 | 구체적 합리화 패턴 열거 + 명시적 차단 | 프로토콜 강제 규칙 (원칙 수준) |
| 예시 패턴 | "너무 단순해서 생략", "나중에 테스트할게", "이미 확인했다", "Just this once" | "plan 스킵 금지", "직접 구현 금지" |
| 강점 | AI가 실제로 빠지는 함정을 직접 지목 — LLM에 대한 구속력이 높음 | 프로토콜 수준의 일관된 강제 |
| 약점 | 체크리스트 길어지면 메타 우회 발생 | 추상적 원칙은 구체적 상황에서 우회 용이 |

**개선 제안** (우선순위: High):
- 핵심 4개 스킬(plan/request/review/accept)에 Anti-Rationalization Checklist 삽입
- 스킬당 3개 이내, 각 항목에 확인 증거 출력 강제 (Critic: 항목 과다 시 메타 우회 → 수 제한 필수)
- 예시:
  - plan: "요구사항이 명확해 보여도 Cynefin 분류를 생략하지 마라"
  - approve: "테스트가 통과했으니 리뷰를 축약해도 된다고 판단하지 마라"
  - review: "AC가 단순해 보여도 역방향 검증을 건너뛰지 마라"

### 4.2 스킬 작성 방법론 & 테스트 인프라

| 항목 | Superpowers | Gran Maestro |
|------|-------------|--------------|
| 스킬 작성 가이드 | writing-skills (TDD for docs, CSO 원칙) | 없음 |
| 플러그인 테스트 | Integration test suite | 없음 |
| 영향 | 14개 스킬의 품질 일관성 유지 | 35+개 스킬의 품질 편차, 프로토콜 회귀를 사람 리뷰에 의존 |

**개선 제안**:
- SKILL-AUTHORING.md 신설 (우선순위: Medium)
  - 스킬 구조 템플릿: 필수 섹션(목적, 트리거 조건, 입력/출력, 흐름 제어 규칙, Anti-Rationalization 항목)
  - 검증 기준: 스킬이 의도대로 AI를 제어하는지 테스트하는 체크리스트
  - CSO 원칙 차용: 스킬 파일명, 섹션 헤더를 Claude 스킬 탐색 알고리즘에 최적화
- Workflow Contract Test (우선순위: Low)
  - 핵심 체인 정상/금지 경로 8-12개 시나리오로 시작
  - 운영: PR 경량 스모크 + nightly 확장 시나리오 2계층
  - Critic 주의: 8-12개로 "회귀 감소 효과가 크다"는 주장은 커버리지 기대치 명시 없이는 근거 부족

### 4.3 온보딩 & 멀티 플랫폼

| 항목 | Superpowers | Gran Maestro |
|------|-------------|--------------|
| 온보딩 | using-superpowers (세션 자동 주입, 사용 가능 스킬 안내) | mst:on (런타임 셋업 — hooks 복사, 세션 초기화, 마커 활성화) |
| 플랫폼 | 5개 (Claude/Cursor/Codex/OpenCode/Gemini) | Claude Code 전용 |
| 온보딩 강점 | 자연스러운 진입점 (세션 시작 시 컨텍스트 주입) | 실제 런타임 셋업 (구조적으로 우월) |
| 온보딩 약점 | "스킬 목록을 읽어라"는 수동적 안내 | 초회 사용자에게 "다음에 뭘 해야 하는지" 안내 부족 |

**개선 제안**:
- mst:on Quick Start Guide (우선순위: High)
  - mst:on 실행 후 프로젝트 상태(미완료 REQ, 진행 중 plan 등)를 감지
  - "지금 할 수 있는 액션"을 3개 이내로 제안하는 출력 추가
- 멀티 플랫폼 확장 (우선순위: Low)
  - Gran Maestro의 핵심 가치(hooks, skill push/pop, continuation guard)가 Claude Code 고유 기능에 깊이 의존
  - Superpowers가 5개 플랫폼을 지원할 수 있는 이유는 스킬이 순수 텍스트 프롬프트이기 때문
  - codex/gemini를 외부 에이전트로 활용하는 현재 방식이 더 현실적
  - Critic: 외부 에이전트의 CLI 인터페이스 변경에 대한 버전 핀/fallback 전략이 미고려 상태

---

## 5. 흐름 제어 메커니즘 상세 비교

이 섹션은 두 플러그인의 흐름 제어 방식을 별도로 심층 비교한다.

### 5.1 Superpowers: HARD-GATE / IRON LAW 방식

Superpowers는 각 스킬의 마크다운 내부에 **IRON LAW**라는 이름의 절대 규칙을 선언한다.

```
## The Iron Law
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST    (test-driven-development)
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION     (verification-before-completion)
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST     (systematic-debugging)
```

**작동 원리**:
- 규칙이 스킬 텍스트에 직접 박혀 있어 AI가 스킬을 읽는 순간 제약을 인지
- 각 IRON LAW 아래에 구체적 합리화 패턴("Just this once", "Should work now" 등)을 열거하여 우회 시도를 사전 차단
- Gate Function(5-step)으로 단계별 확인 → 검증 → 주장 순서를 강제
- **의미 제어**: "왜 이 단계가 필요한가"를 설명하고, 위반의 결과("Delete it. Start over.", "Dishonesty, not efficiency")를 명시

**장점**:
- 프롬프트 레벨에서 직접 작동하므로 시스템 인프라 불필요
- 구체적 패턴 열거가 LLM의 합리화 행동을 효과적으로 차단
- 스킬 내부에 규칙이 있으므로 스킬과 규칙의 동기화 문제 없음

**한계**:
- 규칙이 14개 스킬에 분산되어 전체 그림 파악이 어려움
- 시스템 레벨 강제가 아니므로 AI가 스킬을 읽지 않으면 무력화
- 긴급 대응 시 유연한 예외 처리가 어려움

### 5.2 Gran Maestro: hooks + continuation guard 방식

Gran Maestro는 Claude Code의 hooks 시스템과 자체 continuation guard를 통해 흐름을 제어한다.

**작동 원리**:
- **hooks**: 스킬 실행 전후에 시스템 레벨 스크립트가 실행되어 순서를 강제
- **continuation guard**: 스킬 실행 마커(`[MST skill=... step=... return_to=...]`)로 현재 위치와 복귀 지점을 추적
- **skill push/pop**: 스킬 중첩을 스택으로 관리하여 복귀 경로 보장
- **순서 제어**: plan → request → approve → review → accept 체인의 순서를 시스템적으로 강제

**장점**:
- 시스템 레벨 강제로 AI의 의지와 무관하게 순서를 통제
- 마커 기반 상태 추적으로 중단/재개 시에도 정확한 복귀
- 거버넌스 체인 전체를 일관되게 관리

**한계**:
- "순서는 맞지만 내용이 부실한" 실행을 방지하지 못함
- 의미 게이트 부재: "이 단계를 통과하려면 무엇이 충족되어야 하는가"에 대한 스킬 내부 강제 부족
- 프로토콜 우회 방지가 원칙 수준 선언에 머무름

### 5.3 결합 전략

두 접근은 상호 보완적이다. Gran Maestro에 권장하는 결합 방식:

```
[기존 유지] hooks + continuation guard → 순서 통제 (시스템 레벨)
[추가 도입] 스킬 내 ## Gate 섹션 → 의미 통제 (프롬프트 레벨)
```

**구체적 설계**:

1. **`## Gate` 섹션 표준화**: 핵심 스킬(plan, request, review, accept)의 마크다운에 Gate 섹션 추가
   - 진입 조건 (Entry): 이 스킬을 시작하기 위해 확인해야 할 것
   - 완료 조건 (Exit): 이 스킬의 산출물이 갖춰야 할 증거
   - 금지 패턴: 스킬당 3개 이내의 구체적 합리화 패턴

2. **YAML 레지스트리 불채택 사유**: Critic이 지적한 대로, 35+개 스킬의 게이트를 외부 YAML로 관리하면 동기화 부채가 된다. PM이 코드를 쓰지 않는 모델에서 게이트 YAML의 유지보수 주체가 불명확하다.

3. **이중 제어의 기대 효과**:
   - 순서 통제(hooks)가 "올바른 순서로 실행되는가"를 보장
   - 의미 통제(Gate)가 "각 단계에서 올바른 판단이 이루어졌는가"를 보장
   - 두 계층이 독립적으로 작동하므로 한쪽 실패 시 다른 쪽이 보완

---

## 6. 채택 우선순위 매트릭스

| 우선순위 | # | 항목 | 기대 효과 | 구현 난이도 | 비고 |
|---------|---|------|----------|------------|------|
| **High** | 1 | Anti-Rationalization Checklist | AI 우회 즉시 감소 | 낮음 | 핵심 4개 스킬에 삽입, 항목당 3개 이내 |
| **High** | 2 | 의미 게이트 표준화 (스킬 내 `## Gate`) | 순서+의미 이중 제어 달성 | 낮음 | YAML 레지스트리 대신 스킬 내부 |
| **High** | 3 | mst:on Quick Start Guide | 초회 사용자 경험 개선 | 낮음 | 프로젝트 상태 감지 + 액션 3개 이내 제안 |
| **Medium** | 4 | PAC-Evidence Ledger | 미검증 완료 방지 | 중간 | review/accept 스킬 수정 필요 |
| **Medium** | 5 | 조건부 2-Stage Review | 고위험 REQ 품질 향상 | 중간 | Cynefin Complex 이상에만 적용 |
| **Medium** | 6 | SKILL-AUTHORING.md | 스킬 품질 표준화 | 중간 | 템플릿 + 검증 기준 + CSO 포함 |
| **Medium** | 7 | review fail return map | 재작업 비용 감소 | 중간 | 구현결함 → request, 요구결함 → plan |
| **Medium** | 8 | Risk-tiered TDD | 고위험 코드 품질 향상 | 중간 | PM 태깅 + 에이전트 에스컬레이션 |
| **Low** | 9 | Workflow Contract Test | 프로토콜 회귀 탐지 | 높음 | 초기 8-12 시나리오, 커버리지 기대치 명시 필요 |
| **Low** | 10 | 4-Phase 디버깅 템플릿 | 무근거 패치 방지 | 중간 | mst:debug 에이전트 프롬프트 변경 |
| **Low** | 11 | 멀티 플랫폼 확장 | 사용자 풀 확대 | 높음 | 현재 외부 에이전트 방식이 더 현실적 |

---

## 7. 트레이드오프 경고

IDN-039 Critic의 비판적 검토에서 도출된 세 가지 경고. 위 개선안을 채택할 때 반드시 고려해야 한다.

### 7.1 컨텍스트 윈도우 경제학

더 많은 게이트, 체크리스트, 레지스트리는 프롬프트 토큰을 소비한다. Gran Maestro의 35+개 스킬은 이미 상당한 컨텍스트를 차지하고 있다. 추가 Gate/Anti-Rationalization 섹션은 실행 품질 향상과 컨텍스트 압박 사이의 트레이드오프를 만든다.

**올바른 질문**: "무엇을 추가할 것인가"가 아니라 **"무엇을 빼고 추가할 것인가"**이다.

대응: 신규 섹션 추가 시 기존 스킬에서 중복되거나 효과가 낮은 텍스트를 동시에 제거하는 "토큰 예산" 관리를 원칙으로 삼을 것.

### 7.2 사용자 피로도

PM에게 의사결정 횟수가 급증하면 시스템 우회 동기가 생긴다. approve → review → accept 체인에 2-Stage Review, PAC-Evidence Ledger, Risk-tiered TDD 태깅까지 추가되면 단일 REQ 처리에 필요한 의사결정 포인트가 크게 증가한다.

**거버넌스 피로**는 PM이 시스템을 우회하려는 동기를 만들고, 이는 모든 제어 메커니즘의 기반을 약화시킨다.

대응: High 우선순위 항목(자동 적용 가능한 것들)부터 도입하고, PM 의사결정을 추가로 요구하는 항목은 조건부(Cynefin Complex 이상 등)로 제한할 것.

### 7.3 외부 의존성 관리

Gran Maestro가 codex/gemini를 외부 에이전트로 활용하는 방식은 해당 에이전트들의 CLI 인터페이스 변경에 취약하다. 버전 핀, fallback 메커니즘, 인터페이스 변경 감지에 대한 전략이 부재한 상태다.

대응: 외부 에이전트 호출부에 버전 호환성 체크와 graceful fallback을 설계할 것.

---

## 8. 결론

Superpowers와 Gran Maestro는 근본적으로 다른 설계 철학(엔지니어링 생산라인 vs 거버넌스 오케스트레이션)을 가지고 있으며, 각각의 강점은 상호 보완적이다.

**Gran Maestro가 이미 앞서는 영역**:
- 시스템 레벨 흐름 제어 (hooks + continuation guard)
- 거버넌스 체인을 통한 의사결정 추적성 (PAC Trace)
- 런타임 셋업 자동화 (mst:on)
- worktree 기반 파일시스템 격리

**Superpowers에서 배울 수 있는 핵심 요소**:
- 프롬프트 레벨의 의미 제어 (IRON LAW / Gate Function)
- 구체적 합리화 패턴 열거를 통한 AI 우회 방지
- 증거 기반 완료 선언 강제
- 스킬 작성 방법론 표준화

**권장 실행 순서**: High 우선순위 3개(Anti-Rationalization Checklist, 의미 게이트 표준화, Quick Start Guide)는 구현 난이도가 낮고 즉각적 효과가 기대되므로 우선 착수하고, Medium 항목은 실제 운영 피드백을 받으며 점진적으로 도입한다.
