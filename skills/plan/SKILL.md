---
name: plan
description: "요구사항 미결정 항목을 사용자와 대화로 정제하고 실행 가능한 plan.md를 작성합니다. 모호함을 줄인 결정사항, 범위, 제약을 기록해 /mst:request로 바로 이어집니다."
user-invocable: true
argument-hint: "{플래닝 주제}"
---

# maestro:plan

사용자와 Q&A로 핵심 미결 항목을 정제하고 합의 후 `templates/plan.md` 형식의 plan.md를 생성합니다.

## ⚠️ 실행 제약 (CRITICAL — 항상 준수)

이 스킬 실행 중 **Write/Edit 도구를 사용할 수 있는 경로는 아래만 해당**합니다:

- `.gran-maestro/plans/PLN-*/plan.md`
- `.gran-maestro/plans/PLN-*/plan.json`

**그 외 모든 경로(스킬 파일, 소스 코드, 설정 파일 등)에 대한 Write/Edit 사용은 절대 금지입니다.**

- **`mcp__stitch__*` 도구 직접 호출 절대 금지**: Stitch 관련 작업은 반드시
  `Skill(skill: "mst:stitch", args: "...")` 도구를 통해서만 실행합니다.
  직접 호출 감지 시 즉시 중단하고 mst:stitch 스킬로 재실행합니다.

- **plan.md 생성은 어떤 경우에도 생략 불가**: 요청이 단순해 보이더라도 Step 2 → Step 3 → Step 4를 모두 거쳐 **plan.md를 파일로 저장한 후에만** mst:request를 호출합니다. plan.md 없이 mst:request를 직접 호출하는 것은 절대 금지입니다.

허용 경로 외 수정 요청 시: 즉시 중단 → "plan.md에 기록합니다" 알림 → 의도를 plan.md 요구사항 섹션에 흡수

## 실행 프로토콜

### Step 0: 아카이브 체크

`config.archive.auto_archive_on_create`가 `true`이면:
- 스크립트 우선: `python3 {PLUGIN_ROOT}/scripts/mst.py plan count --active`
- Fallback: `plans/PLN-*` 디렉토리 수 기준으로 초과분 아카이브

### Step 0.5: 디버그 의도 감지 & 자동 실행

**`--from-debug DBG-NNN` 직접 진입:** `debug/DBG-NNN/debug-report.md` Read (미존재 시 경고 후 Step 1) → `debug_context` 활성화(`linked_debug_id`, `root_cause`, `fix_suggestions`, `affected_files`) → Step 1로 진행

**키워드 기반 감지 (`--from-debug` 없는 경우):** 버그/에러/오류/안됨/고쳐/crash/타임아웃 등 감지 시:
1. "디버그 의도 감지, /mst:debug 먼저 실행" 통지
2. `Skill(skill: "mst:debug", args: "{이슈}")` 즉시 실행 (`--focus` 있으면 전달)
3. `debug-report.md` 완료 대기 후 Read → `debug_context` 보관 (DBG ID/근본 원인/수정 제안 P0~P2/영향 파일)
4. Step 1~2로 진행 시 `debug_context` 활성 상태 유지

**미감지 시:** Step 1로 진행.

### Step 1: 초기화

1. `.gran-maestro/plans/` 디렉토리 확인, 없으면 생성
2. PLN 번호 채번:
   - **스크립트 우선**: `python3 {PLUGIN_ROOT}/scripts/mst.py counter next --type pln` → PLN-NNN ID 사용
     (최초 실행 시 자동으로 plans/PLN-* 디렉토리 스캔해 counter.json 초기화)
   - **Fallback**: `plans/PLN-*/plan.json` 스캔 → 최대 번호 `+1` (최초: `001`); 파일은 아직 작성 안 함
3. `.gran-maestro/plans/PLN-NNN/` 디렉토리 생성
4. `.gran-maestro/plans/PLN-NNN/plan.json` 먼저 작성:

   > ⏱️ **타임스탬프 취득 (MANDATORY)**:
   > `TS=$(python3 {PLUGIN_ROOT}/scripts/mst.py timestamp now)`
   > 위 명령 실패 시 폴백: `python3 -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).isoformat())"`
   > 출력값을 `created_at` 필드에 기입한다. 날짜만 기입 금지.

   ```json
   {
     "id": "PLN-NNN",
     "title": "플랜 주제",
     "status": "active",
     "created_at": "{TS — mst.py timestamp now 출력값}",
     "linked_requests": []
   }
   ```

### Step 2: 초기 분석 & 첫 질문

**`debug_context` 활성 시:** 근본 원인+수정 제안을 초기 컨텍스트로 선반영 → `[디버그 조사 결과 요약]` 블록 표시(근본 원인/수정 제안 P0~/영향 파일) → 구현 범위·우선순위·분리 실행 여부를 핵심 미결 항목으로 정리 → `AskUserQuestion` 첫 질문 (debug 제안 연계 옵션 포함)

**일반 상태:**

> ⚠️ 단순 요청이라도 건너뛰지 않습니다. **최소 1회 `AskUserQuestion`** 후에만 Step 4로 진행합니다.

PM이 핵심 미결 항목·제약·우선순위 정리 → 가장 중요한 항목 하나를 `AskUserQuestion`로 **한 번에 하나씩** 질문
(첫 질문 포함, **plan 전체 모든 `AskUserQuestion`에 보조 선택지를 PM 판단으로 상황에 맞게 포함** — Step 3 참조)

**공통:** Step 2 분석 후 자동 ideation/discussion 판단 필요 시 Step 2.5 실행

### Step 2.5: PM 자동 판단 (해석 B)

아래 조건 해당 시 첫 질문 전에 PM이 먼저 실행:
- **ideation**: 접근법 2개 이상+트레이드오프 모호, 기술 스택/아키텍처 선택, PM 확신 낮음
- **discussion**: 복잡한 트레이드오프+팀 합의 필요, 기술/비즈니스 리스크 큰 결정

트리거 시: "[이유]로 [ideation/discussion] 먼저 실행" 통지 → `Skill(skill: "mst:ideation/discussion", args: "{주제}")` → 핵심 3~5개 요약 → `AskUserQuestion` 문맥으로 선반영

동일 세션/주제/타입 완료 이력 있으면 새 세션 생성 없이 기존 결과 재사용 (동일 형식으로 재질문).

### Step 3: 반복 대화

- 사용자 답변 반영해 PM이 추가 질문 필요성 자율 판단, 핵심 결정 사항 명확해질 때까지 반복
- 모든 질문은 `AskUserQuestion`으로 **동시 1개만**; 총 선택지 최대 6개 (핵심 선택지 + 보조 선택지 합산)
- **보조 선택지 (PM이 현재 질문 맥락에 맞는 것만 골라 포함)**:
  - `"다각도 의견 모으기 (ideation)"` — 접근법이 2개 이상이고 트레이드오프가 불명확할 때 추천
  - `"팀 토론으로 합의 찾기 (discussion)"` — 복잡한 기술·비즈니스 결정으로 합의가 필요할 때 추천
  - `"코드베이스 탐색하기 (explore)"` — 현행 코드·구조 파악이 결정에 선행될 때 추천

  > PM 판단 기준: 질문의 성격상 해당 보조가 실질적으로 도움이 될 때만 포함. 불필요한 보조 선택지는 생략해 핵심 선택지에 여유를 확보. 최소 1개 이상 포함 권장.

#### Step 3.2: 사용자 선택 기반 재질문 흐름

고정 선택지 선택 **또는 사용자가 텍스트로 직접 ideation/discussion/explore 요청** 시 현재 주제로 해당 스킬 실행:

> ⚠️ **직접 요청 감지**: 사용자가 "discussion 해줘", "ideation 돌려줘", "explore 해줘", "/mst:explore" 등 텍스트로 직접 요청한 경우에도 고정 선택지 선택과 동일하게 이 흐름을 따른다. 스킬 실행 후 반드시 Step 3으로 복귀해야 한다.

**ideation/discussion 선택 시:**
- `Skill(skill: "mst:ideation/discussion", args: "{현재 질문 주제} --focus {관련 분야}")`
- 동일 세션/주제/타입 이력 있으면 재사용 (재실행 방지)
- 완료 후 `synthesis.md`/`consensus.md` Read → 핵심 3~5개를 `[AI 팀 의견 요약]`으로 표시 → **반드시 Step 3으로 복귀하여** 원 질문 동일 포맷으로 재제시 (plan 흐름 종료 금지)

**explore 선택 시:**
- `Skill(skill: "mst:explore", args: "{현재 질문과 관련된 탐색 쿼리 — 코드/파일/현황 등}")`
- 완료 후 탐색 결과 핵심을 `[코드베이스 탐색 결과]`로 요약 표시 → **반드시 Step 3으로 복귀하여** 원 질문 동일 포맷으로 재제시 (plan 흐름 종료 금지)

#### 시각적 미리보기 활용 (UI/레이아웃 선택 시)

UI 레이아웃/컴포넌트 구조/화면 흐름/정보 밀도 비교가 필요한 단일 선택(`multiSelect: false`) 시 각 옵션에 ASCII 도식 첨부:
- **`description`**: 짧은 텍스트 설명 (하단 표시)
- **`markdown`**: ASCII 도식 (우측 미리보기 패널)

ASCII 도식 작성 규칙:
```
┌─────────────┐   ← 박스로 영역 구분
│  컴포넌트    │
│  ┌────────┐ │   ← 중첩 구조 표현
│  │  내부  │ │
│  └────────┘ │
└─────────────┘
[버튼A] [버튼B]   ← 인라인 요소
─────────────────  ← 구분선
```

> ⚠️ `multiSelect: true` 질문에서는 미리보기 패널이 비활성화되므로
> 복수 선택이 필요한 경우엔 단일 선택 질문 여러 개로 분리하거나 텍스트 설명으로 대체한다.

### Step 3.5: REQ 책임 분리 & 태스크 분해 (PM 필수 검토)

#### REQ 분리 원칙

아래 중 하나라도 해당 시 분리 실행 제안 후 사용자 동의 요청:
- 레이어 혼재(백엔드+프론트), 도메인 혼재, 독립 완결 가능, 타임라인 차이, 영역 충돌 위험, 리스크 성격 차이

분리 확정 시: plan.md `## 분리 실행` 섹션에 각 책임 단위 기록.

#### 태스크 분해 원칙

아래 신호 있으면 plan.md `## 태스크 분해` 섹션에 순서와 내용 명시:
- 순서 의존성 (DB→API→UI 등), 분석/구현/테스트 명확히 구분, 전문 영역 분리로 순서 중요

### Step 3.8: Plan Review Pass (선택적)

#### 3.8.0: config 읽기 및 enabled 확인

Read(.gran-maestro/config.json) → plan_review 섹션 취득
enabled, parallel, max_iterations, roles 값을 메모리에 보관
iteration 카운터를 1로 초기화 (current_iteration = 1)

- **enabled == false**: 이 단계 전체 skip → Step 4로 진행
- **enabled == true**: 아래 3.8.1부터 실행

#### 3.8.1: PM 내부 초안 작성

Q&A 대화 내용을 바탕으로 PM이 플랜 초안 텍스트를 작성한다 (디스크 미저장, 메모리 내).
이 초안은 Step 4에서 최종 제시될 내용의 초기 버전이다.

#### 3.8.2: 역할별 프롬프트 파일 생성 (스크립트 위임)

PLAN_DRAFT 전문을 임시 파일에 저장한 뒤 스크립트를 실행한다:

```bash
# PLAN_DRAFT를 임시 파일에 기록
Write(.gran-maestro/plans/{PLN_ID}/prompts/plan-draft.tmp, {PLAN_DRAFT 전문})

# 스크립트 실행
python3 {PLUGIN_ROOT}/scripts/mst.py plan render-review \
  --pln {PLN_ID} \
  --plan-draft-file .gran-maestro/plans/{PLN_ID}/prompts/plan-draft.tmp \
  --qa-summary "{QA_SUMMARY}"
```

스크립트가 `config.plan_review.roles.{role}.enabled == true`인 역할에 대해
`templates/plan-review/{role}.md` 읽기 → 변수 치환 →
`.gran-maestro/plans/{PLN_ID}/prompts/review-{role}.md` 일괄 생성.

stdout에 생성된 파일 경로 목록이 출력된다.

⚠️ 역할별 PERSPECTIVE 텍스트는 더 이상 SKILL.md에 정의되지 않는다.
각 역할의 관점은 `templates/plan-review/{role}.md`에 고정되어 있다.

#### 3.8.3: 에이전트 dispatch

⚠️ `Skill()` 도구는 순차 실행이므로 병렬화에 사용 불가.
병렬화 시 `Skill()`을 `Task(run_in_background: true)` 래퍼로 감싼다 (discussion/debug 스킬과 동일한 패턴).

`config.plan_review.parallel == true`이면:

**[사전 단계]** agent가 `"claude"`인 활성 역할에 대해 먼저 순차적으로 파일 내용을 취득:
`Read(.gran-maestro/plans/PLN-NNN/prompts/review-{role}.md)` → 내용을 역할명과 함께 메모리에 보관

**[동시 dispatch]** 모든 활성 역할을 단일 응답 내 동시 실행:

에이전트 선택 (`config.plan_review.roles.{role}.agent` 기반):
- `"codex"` → `Task(subagent_type: "general-purpose", run_in_background: true, prompt: "Skill(skill: 'mst:codex', args: '--prompt-file .gran-maestro/plans/PLN-NNN/prompts/review-{role}.md --output .gran-maestro/plans/PLN-NNN/prompts/review-{role}.log') 실행 후 완료 보고")`
- `"gemini"` → `Task(subagent_type: "general-purpose", run_in_background: true, prompt: "Skill(skill: 'mst:gemini', args: '--prompt-file .gran-maestro/plans/PLN-NNN/prompts/review-{role}.md --sandbox > .gran-maestro/plans/PLN-NNN/prompts/review-{role}.log') 실행 후 완료 보고")`
- `"claude"` → `Task(subagent_type: "general-purpose", run_in_background: true, prompt: {사전 단계에서 보관한 파일 내용})`

각 Task 호출의 반환값에서 task_id를 추출하여 역할명과 함께 메모리에 보관 (결과 추적용).
예: `{ architect: "task-abc123", completeness: "task-def456", ... }`

`config.plan_review.parallel == false`이면 역할 순서대로 순차 실행:
- codex 역할: `Skill(skill: "mst:codex", args: "--prompt-file .gran-maestro/plans/PLN-NNN/prompts/review-{role}.md --output .gran-maestro/plans/PLN-NNN/prompts/review-{role}.log")` → 완료 후 Read(.log) → 다음 역할 진행
- gemini 역할: `Skill(skill: "mst:gemini", args: "--prompt-file .gran-maestro/plans/PLN-NNN/prompts/review-{role}.md --sandbox > .gran-maestro/plans/PLN-NNN/prompts/review-{role}.log")` → 완료 후 Read(.log) → 다음 역할 진행
- claude 역할: `Read(.gran-maestro/plans/PLN-NNN/prompts/review-{role}.md)` 후 → `Task(subagent_type: "general-purpose", prompt: {파일 내용})` (블로킹) → 반환값 직접 사용 → 다음 역할 진행
(순차 실행 시 task_id 불필요, TaskOutput 호출 없음)

#### 3.8.4: 결과 수집 및 PM 분석

**병렬 실행 시 (`parallel == true`)**:
- codex/gemini 역할: `TaskOutput(task_id, block: true)` 완료 대기 (래퍼 Task 완료 신호) → `Read(.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log)`로 실제 결과 확인
- claude 역할: `TaskOutput(task_id, block: true)` 반환값을 직접 결과로 사용

**순차 실행 시 (`parallel == false`)**:
- codex/gemini 역할: Skill 호출 자체가 블로킹 완료 → `Read(.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log)`로 결과 확인
- claude 역할: Task 반환값을 직접 결과로 사용 (TaskOutput 불필요)

모든 에이전트 결과를 수집한 후 PM이 분석:
- `NO_ISSUES` 응답: 해당 역할 이슈 없음으로 처리
- `CRITICAL:` 항목: 사용자에게 반드시 질문 필요
- `MAJOR:` 항목: PM이 자체 판단으로 초안에 반영
- `MINOR:` 항목: PM이 자체 판단으로 초안에 반영 또는 무시

#### 3.8.5: 조건부 사용자 추가 질문 & 반복 루프

**CRITICAL 이슈가 1개 이상 존재 시:**
- 중복·유사 이슈 병합 후 우선순위 정렬
- **모든** CRITICAL 이슈를 빠짐없이 `AskUserQuestion`으로 질문:
  - 각 선택지: CRITICAL 이슈를 해소할 수 있는 구체적 옵션 제시
  - 또는 직접 입력 유도
  - **보조 선택지를 PM 판단으로 상황에 맞게 포함** (ideation / discussion / explore 중 적합한 것 — Step 3 참조)
- 사용자 답변 반영하여 PM 초안 재정제
- **반복 판단**:
  - `current_iteration < max_iterations` → `current_iteration++` → **3.8.2로 돌아가 재리뷰** (정제된 초안 기준으로 프롬프트 재생성 후 에이전트 재dispatch)
  - `current_iteration >= max_iterations` → Step 4로 진행

**CRITICAL 이슈 없음 시:**
- MAJOR/MINOR 이슈만 PM이 자체 반영 → 초안 재정제 → **반복 없이** 바로 Step 4 진행

Step 4 진입 시 초안은 에이전트 피드백이 반영된 정제 버전이다.

### Step 4: plan.md 초안 제시 & 사용자 승인

#### UI 감지 (Step 4 진입 시)

plan 주제, 요청 텍스트, 결정사항 섹션을 대상으로 아래 두 가지 방식 중 하나라도 해당하면 UI로 판단한다:

**1. 키워드 매칭**: 아래 단어가 포함된 경우
`화면`, `UI`, `페이지`, `대시보드`, `컴포넌트`, `레이아웃`, `프론트엔드`, `디자인`, `화면 설계`, `목업`, `시안`

**2. 의미 판단 (LLM)**: 키워드 없어도 plan 내용상 새 화면/UI 흐름 생성이 필요하다고 판단되는 경우
- 예: "로그인 흐름 구성", "어드민 메뉴 신설", "결제 단계 추가", "온보딩 프로세스 설계" 등
- 판단 기준: 사용자가 새로운 화면이나 UI 흐름을 만들어야 하는 상황인가?

- **감지됨** → AskUserQuestion 선택지에 4번째 옵션 "스티치로 디자인 시안 보기" 추가
- **미감지** → 기존 3개 선택지만 표시 (동작 보존)

1. 대화 내용 반영한 plan 초안 텍스트 제시 (**파일은 아직 작성하지 않음**)
   - `debug_context` 활성 시 `## 디버그 조사 연계` 섹션 자동 포함 (참조 세션/근본 원인 기록)
2. `AskUserQuestion`으로 선택지 제시:
   - **"저장하고 /mst:request 실행"**: plan.md 저장 후 mst:request 호출 (직접 구현 아님 — REQ 생성+spec.md 작성으로 이동)
   - **"수정 후 진행"**: 수정 내용 입력 후 Step 4 반복
   - **"저장만 하기"**: plan.md만 저장, mst:request는 수동 실행
   - **"스티치로 디자인 시안 보기"** *(UI 키워드 감지 시에만 표시)*: Stitch로 디자인 시안을 생성하고 plan에 통합합니다
3. 저장 선택 시 `plans/PLN-NNN/plan.md` 작성; `debug_context` 활성 시 `plan.json`에 `"linked_debug"` 추가
4. **"저장하고 /mst:request 실행" 시**: ⚠️ **plan.md 디스크 기록 확인 후에만** `Skill(skill: "mst:request", args: "--plan PLN-NNN {주제}")` 단 1회 호출 (미저장 상태 호출 절대 금지); `## 분리 실행` 섹션 있으면 mst:request가 다중 REQ 자동 생성
   - ⚠️ **spec.md 작성 완료 전 plan 스킬 종료 금지**
5. **"스티치로 디자인 시안 보기" 선택 시**:
   1. `Skill(skill: "mst:stitch", args: "--pln PLN-NNN --multi {plan 주제}")` 호출
      - ⚠️ `mcp__stitch__*` 도구 직접 호출 절대 금지 — 반드시 위 Skill 도구 경유
   2. 호출 완료 후 생성된 Stitch 프로젝트/화면 정보를 plan 초안에 `## 디자인 시안` 섹션으로 추가
      - plan.md는 여전히 디스크에 저장되지 않은 초안 상태를 유지
   3. Step 4 재표시 (저장/수정 선택 가능)

## 출력 형식

`templates/plan.md`를 기본 템플릿으로 사용하여 plan.md를 작성합니다.
