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

- `{PROJECT_ROOT}/.gran-maestro/plans/PLN-*/plan.md`
- `{PROJECT_ROOT}/.gran-maestro/plans/PLN-*/plan.json`
- `{PROJECT_ROOT}/.gran-maestro/captures/CAP-*/capture.json` (status/consumed_at/linked_plan 업데이트용)

**그 외 모든 경로(스킬 파일, 소스 코드, 설정 파일 등)에 대한 Write/Edit 사용은 절대 금지입니다.**

- **`mcp__stitch__*` 도구 직접 호출 절대 금지**: Stitch 관련 작업은 반드시
  `Skill(skill: "mst:stitch", args: "...")` 도구를 통해서만 실행합니다.
  직접 호출 감지 시 즉시 중단하고 mst:stitch 스킬로 재실행합니다.

- **plan.md 생성은 어떤 경우에도 생략 불가**: 요청이 단순해 보이더라도 Step 2 → Step 3 → Step 4를 모두 거쳐 **plan.md를 파일로 저장한 후에만** mst:request를 호출합니다. plan.md 없이 mst:request를 직접 호출하는 것은 절대 금지입니다.

허용 경로 외 수정 요청 시: 즉시 중단 → "plan.md에 기록합니다" 알림 → 의도를 plan.md 요구사항 섹션에 흡수

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

### Step 0.5: 디버그 의도 감지 & 자동 실행

**`--from-debug DBG-NNN` 직접 진입:** `debug/DBG-NNN/debug-report.md` Read (미존재 시 경고 후 Step 1) → `debug_context` 활성화(`linked_debug_id`, `root_cause`, `fix_suggestions`, `affected_files`) → Step 1로 진행

**키워드 기반 감지 (`--from-debug` 없는 경우):** 버그/에러/오류/안됨/고쳐/crash/타임아웃 등 감지 시:
1. "디버그 의도 감지, /mst:debug 먼저 실행" 통지
2. `Skill(skill: "mst:debug", args: "{이슈}")` 즉시 실행 (`--focus` 있으면 전달)
3. `debug-report.md` 완료 대기 후 Read → `debug_context` 보관 (DBG ID/근본 원인/수정 제안 P0~P2/영향 파일)
4. Step 1~2로 진행 시 `debug_context` 활성 상태 유지

**미감지 시:** Step 1로 진행.

**`--from-picks` 감지 (--from-debug 처리 후 실행):**

`--from-picks [CAP-001] [CAP-003] "요청 텍스트"` 형태 파싱:
1. args에서 `--from-picks` 키워드 감지
2. `--from-picks` 뒤의 `[CAP-NNN]` 패턴을 모두 추출 → `capture_ids` 배열 보관
3. 각 `capture_ids`에 대해 `{PROJECT_ROOT}/.gran-maestro/captures/CAP-NNN/capture.json` Read
   - 미존재 시: "[CAP-NNN] 캡처를 찾을 수 없습니다" 경고 출력 후 해당 ID 건너뜀
   - 이미 `consumed` 상태: "CAP-NNN은 이미 consumed 상태입니다" 경고 표시 후 재사용 허용
4. 성공적으로 Read한 캡처 데이터를 `capture_context` 배열에 보관 (ID, url, selector, memo, screenshot 등)
5. `--from-debug`와 동시 입력 시: `--from-debug` 우선 처리(debug_context) → `capture_context`는 보조 컨텍스트로 유지
6. `--from-picks` 미사용 시: `capture_context`는 빈 배열 → 이후 로직 영향 없음 (하위 호환)

### Step 0.75: [CAP-NNN] 자동 감지 (Step 0.5 직후)

Step 0.5 처리 완료 후, `--from-picks` 유무와 무관하게 사용자 입력 텍스트 전체에서 `/\[?CAP-\d{3,}\]?/gi` 패턴 매칭 수행:
1. 매칭된 각 ID에 대해: Step 0.5에서 이미 `capture_context`에 보관된 ID는 중복 Read 하지 않음
2. 신규 매칭 ID만 `{PROJECT_ROOT}/.gran-maestro/captures/CAP-NNN/capture.json` Read
   - 미존재 시: "[CAP-NNN] 캡처를 찾을 수 없습니다" 경고 출력 후 해당 ID 건너뜀
   - 이미 `consumed` 상태: 경고 표시 후 재사용 허용
3. `capture_context`에 합집합 처리 (ID 기준 중복 제거)
4. 캡처가 5개 초과 시 요약 모드 적용: ID + memo + screenshot_path만 보관 (html_snapshot 생략)
5. 매칭 결과 없으면 `capture_context`는 Step 0.5 상태 유지 → 이후 로직 영향 없음

### Step 1: 초기화

1. `{PROJECT_ROOT}/.gran-maestro/plans/` 디렉토리 확인, 없으면 생성
2. PLN 번호 채번:
   - **스크립트 우선**: `python3 {PLUGIN_ROOT}/scripts/mst.py counter next --type pln` → PLN-NNN ID 사용
     (최초 실행 시 자동으로 plans/PLN-* 디렉토리 스캔해 counter.json 초기화)
   - **Fallback**: `plans/PLN-*/plan.json` 스캔 → 최대 번호 `+1` (최초: `001`); 파일은 아직 작성 안 함
3. `{PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/` 디렉토리 생성
4. `{PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/plan.json` 먼저 작성:

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

**`capture_context` 활성 시 (비어있지 않을 때):** 캡처 데이터를 초기 컨텍스트로 선반영 → `[캡처 참조 요약]` 블록 표시:

```
[캡처 참조 요약]
| ID | URL | Selector | Memo |
|----|-----|----------|------|
| CAP-001 | https://... | .btn-primary | 색상 변경 필요 |

> 스크린샷: `.gran-maestro/captures/CAP-001/screenshot.webp`
```

캡처 컨텍스트를 활용하여 요청의 구체적 맥락(대상 요소, 현재 상태, 사용자 메모)을 초기 분석에 반영한다.
`debug_context`와 `capture_context` 모두 활성이면 둘 다 표시 (debug가 상위, capture가 보조).

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

#### 선택지 장단점 description 포맷

트레이드오프가 있는 기술/접근법 선택 질문에서, 각 선택지의 `description`을 아래 3줄형 포맷으로 작성한다.
단순 확인, 예/아니오, 범위 지정 등 트레이드오프가 없는 질문에는 적용하지 않고 기존처럼 간결하게 유지한다.
적용 여부는 PM이 질문 성격에 따라 자율 판단한다.

**포맷 정의:**
```
[장점] 콤마 구분 키워드 나열
[단점] 콤마 구분 키워드 나열
[적합] 콤마 구분 키워드 나열
```

- 이모티콘 사용 금지 — 반드시 `[장점]`, `[단점]`, `[적합]` 대괄호 텍스트 태그를 사용한다.
- `[적합]`은 선택적이다. 적합 상황이 불명확하면 `[장점]`/`[단점]` 2줄만으로 충분하다.
- 각 줄은 콤마로 구분된 키워드 나열로 간결하게 작성한다. 장문 서술은 지양한다.

**예시 — 적용 대상 (트레이드오프 있는 기술 선택):**
```
description: |
  [장점] 타입 안전성, 리팩토링 용이, IDE 지원 우수
  [단점] 초기 설정 비용, 빌드 단계 필요
  [적합] 중대형 프로젝트, 장기 유지보수
```

**예시 — 미적용 대상 (단순 확인 질문):**
```
description: "기존 설정을 유지합니다"
```

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

Read({PROJECT_ROOT}/.gran-maestro/config.resolved.json) → plan_review 섹션 취득
plan_review 섹션이 없으면 → Read(templates/defaults/config.json) → plan_review 섹션으로 fallback
enabled, parallel, max_iterations, roles 값을 메모리에 보관
escalation_trigger = config.plan_review.escalation_trigger (미설정 시 기본 "major")
minor_escalation_threshold = config.plan_review.minor_escalation_threshold (미설정 시 defaults fallback, defaults에도 없으면 null — 기능 비활성)
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
Write({PROJECT_ROOT}/.gran-maestro/plans/{PLN_ID}/prompts/plan-draft.tmp, {PLAN_DRAFT 전문})

# 스크립트 실행
python3 {PLUGIN_ROOT}/scripts/mst.py plan render-review \
  --pln {PLN_ID} \
  --plan-draft-file {PROJECT_ROOT}/.gran-maestro/plans/{PLN_ID}/prompts/plan-draft.tmp \
  --qa-summary "{QA_SUMMARY}"
```

스크립트가 `config.plan_review.roles.{role}.enabled == true`인 역할에 대해
`templates/plan-review/{role}.md` 읽기 → 변수 치환 →
`{PROJECT_ROOT}/.gran-maestro/plans/{PLN_ID}/prompts/review-{role}.md` 일괄 생성.

stdout에 생성된 파일 경로 목록이 출력된다.

⚠️ 역할별 PERSPECTIVE 텍스트는 더 이상 SKILL.md에 정의되지 않는다.
각 역할의 관점은 `templates/plan-review/{role}.md`에 고정되어 있다.

#### 3.8.3: 에이전트 dispatch

⚠️ `Skill()` 도구는 순차 실행이므로 병렬화에 사용 불가.
병렬화 시 `Skill()`을 `Task(run_in_background: true)` 래퍼로 감싼다 (discussion/debug 스킬과 동일한 패턴).

`config.plan_review.parallel == true`이면:

**[사전 단계]** agent가 `"claude"`인 활성 역할에 대해 먼저 순차적으로 파일 내용을 취득:
`Read({PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.md)` → 내용을 역할명과 함께 메모리에 보관

**[동시 dispatch]** 모든 활성 역할을 단일 응답 내 동시 실행:

에이전트 선택 (`config.plan_review.roles.{role}.agent` 기반):
- `"codex"` → `Bash(run_in_background: true, command: "codex exec --full-auto -m {config.models.codex.default} -C $(pwd) \"$(cat {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.md)\" > {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log 2>&1; EC=$?; echo \"EXIT_CODE:$EC\" >> {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log; exit $EC")`
- `"gemini"` → `Bash(run_in_background: true, command: "gemini -p \"$(cat {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.md)\" --model {config.models.gemini.default} --approval-mode yolo > {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log 2>&1; EC=$?; echo \"EXIT_CODE:$EC\" >> {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log; exit $EC")`
- `"claude"` → `Task(subagent_type: "general-purpose", run_in_background: true, prompt: {사전 단계에서 보관한 파일 내용})`

각 Task 호출의 반환값에서 task_id를 추출하여 역할명과 함께 메모리에 보관 (결과 추적용).
예: `{ architect: "task-abc123", completeness: "task-def456", ... }`

`config.plan_review.parallel == false`이면 역할 순서대로 순차 실행:
- codex 역할: `Bash(command: "codex exec --full-auto -m {config.models.codex.default} -C $(pwd) \"$(cat {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.md)\" > {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log 2>&1; EC=$?; echo \"EXIT_CODE:$EC\" >> {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log; exit $EC")` → 완료 후 Read(.log) → 다음 역할 진행
- gemini 역할: `Bash(command: "gemini -p \"$(cat {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.md)\" --model {config.models.gemini.default} --approval-mode yolo > {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log 2>&1; EC=$?; echo \"EXIT_CODE:$EC\" >> {PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log; exit $EC")` → 완료 후 Read(.log) → 다음 역할 진행
- claude 역할: `Read({PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.md)` 후 → `Task(subagent_type: "general-purpose", prompt: {파일 내용})` (블로킹) → 반환값 직접 사용 → 다음 역할 진행
(순차 실행 시 task_id 불필요, TaskOutput 호출 없음)

#### 3.8.4: 결과 수집 및 PM 분석

**병렬 실행 시 (`parallel == true`)**:
- codex/gemini 역할: `TaskOutput(task_id, block: true)` 완료 대기 (Bash background 완료 신호) → `Read({PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log)`로 실제 결과 확인
- claude 역할: `TaskOutput(task_id, block: true)` 반환값을 직접 결과로 사용

**순차 실행 시 (`parallel == false`)**:
- codex/gemini 역할: Skill 호출 자체가 블로킹 완료 → `Read({PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/prompts/review-{role}.log)`로 결과 확인
- claude 역할: Task 반환값을 직접 결과로 사용 (TaskOutput 불필요)

모든 에이전트 결과를 수집한 후 PM이 분석:
- `NO_ISSUES` 응답: 해당 역할 이슈 없음으로 처리
- `CRITICAL:` 항목: 사용자에게 반드시 질문 필요
- `MAJOR:` 항목: PM이 자체 판단으로 초안에 반영
- `MINOR:` 항목: PM이 자체 판단으로 초안에 반영 또는 무시

#### 3.8.5: 조건부 사용자 추가 질문 & 반복 루프

**escalate 판단** (escalation_trigger 기반):
- `escalation_trigger = "critical"`: CRITICAL 이슈 1개 이상 → escalate
- `escalation_trigger = "major"`: CRITICAL 또는 MAJOR 이슈 1개 이상 → escalate  ← 기본값
- `escalation_trigger = "minor"`: CRITICAL/MAJOR/MINOR 이슈 1개 이상 → escalate

**escalate 조건 충족 시:**
- 중복·유사 이슈 병합 후 우선순위 정렬 (CRITICAL 우선)
- 모든 escalate 이슈를 `AskUserQuestion`으로 질문:
  - 각 선택지: 이슈를 해소할 수 있는 구체적 옵션 또는 직접 입력 유도
  - **"반영 없이 진행"** 옵션 추가: 이슈를 무시하고 Step 4로 바로 이동
  - **보조 선택지를 PM 판단으로 상황에 맞게 포함** (ideation / discussion / explore 중 적합한 것 — Step 3 참조)
- 사용자 답변 반영하여 PM 초안 재정제
- **반복 판단**:
  - **"반영 없이 진행" 선택 시**: 즉시 Step 4로 진행 (반복 없음)
  - `current_iteration < max_iterations` → `current_iteration++` → **3.8.2로 돌아가 재리뷰** (정제된 초안 기준으로 프롬프트 재생성 후 에이전트 재dispatch)
  - `current_iteration >= max_iterations` → Step 4로 진행

**escalate 조건 미충족 시** (escalation_trigger 미만 이슈만 또는 전체 NO_ISSUES):

**MINOR 임계값 에스컬레이션 체크** (minor_escalation_threshold != null인 경우):
- threshold 정규화: threshold <= 0이면 threshold = 1로 치환
- 전체 MINOR 이슈 갯수 합산 (MINOR_COUNT)
- MINOR_COUNT > 0 AND MINOR_COUNT >= minor_escalation_threshold → CRITICAL로 취급:
  ⚠️ 이 로직은 escalate=false 분기 내부에서 별도로 처리한다
     (escalate=true 분기로 점프하지 않음 — 구조 복잡도 방지).
  - "[MINOR 임계값 초과] N개 MINOR 이슈가 임계값({threshold})을 초과하여 확인이 필요합니다" 안내 표시
  - 모든 MINOR 이슈를 `AskUserQuestion`으로 질문:
    - 각 선택지: 이슈를 해소할 수 있는 구체적 옵션 또는 직접 입력 유도
    - **"반영 없이 진행"** 옵션 포함 (기존 escalate 흐름과 동일)
    - **보조 선택지를 PM 판단으로 상황에 맞게 포함** (ideation / discussion / explore 중 적합한 것 — Step 3 참조)
  - "반영 없이 진행" 선택 시: 즉시 Step 4 진행 (반복 없음)
  - 그 외: 사용자 답변 반영하여 PM 초안 재정제
  - 반복 판단: current_iteration < max_iterations → 3.8.2 재리뷰 / >= → Step 4 진행
- MINOR_COUNT < minor_escalation_threshold 또는 threshold == null → 기존 동작:
  - escalation_trigger 미만 이슈(예: "major" 기준 시 MINOR만): PM이 자체 반영 → 초안 재정제 → **반복 없이** Step 4 진행

- 전체 NO_ISSUES: PM이 자체 반영 없이 바로 Step 4 진행

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
   - `capture_context` 활성 시 `## 캡처 참조` 섹션 자동 포함:
     ```markdown
     ## 캡처 참조

     | ID | URL | Selector | Memo |
     |----|-----|----------|------|
     | CAP-001 | https://... | .btn-primary | 색상 변경 필요 |

     > 스크린샷: `.gran-maestro/captures/CAP-001/screenshot.webp`
     ```
     각 캡처의 url, selector, memo, screenshot 경로를 테이블로 정리. 캡처 5개 초과 시 요약 모드 (ID + memo + screenshot_path만 표시, html_snapshot 생략).
2. `AskUserQuestion`으로 선택지 제시:
   - **"저장하고 /mst:request 실행"**: plan.md 저장 후 mst:request 호출 (직접 구현 아님 — REQ 생성+spec.md 작성으로 이동)
   - **"수정 후 진행"**: 수정 내용 입력 후 Step 4 반복
   - **"저장만 하기"**: plan.md만 저장, mst:request는 수동 실행
   - **"스티치로 디자인 시안 보기"** *(UI 키워드 감지 시에만 표시)*: Stitch로 디자인 시안을 생성하고 plan에 통합합니다
3. 저장 선택 시 `plans/PLN-NNN/plan.md` 작성; `debug_context` 활성 시 `plan.json`에 `"linked_debug"` 추가
   - `capture_context` 활성 시 **plan.md 저장 시점에 일괄 처리 (atomic)**:
     - 참조된 각 캡처의 `{PROJECT_ROOT}/.gran-maestro/captures/CAP-NNN/capture.json`을 Edit:
       - `status` → `"consumed"`
       - `consumed_at` → 현재 시각 (mst.py timestamp now 또는 fallback)
       - `linked_plan` → `"PLN-NNN"` (생성된 plan ID)
     - 세 필드를 동일 시점(plan.md 저장)에 일괄 업데이트
     - `plan.json`에 `"linked_captures": ["CAP-001", "CAP-003"]` 추가
4. **"저장하고 /mst:request 실행" 시**: ⚠️ **plan.md 디스크 기록 확인 후에만** `Skill(skill: "mst:request", args: "--plan PLN-NNN {주제}")` 단 1회 호출 (미저장 상태 호출 절대 금지); `## 분리 실행` 섹션 있으면 mst:request가 다중 REQ 자동 생성
   - ⚠️ **spec.md 작성 완료 전 plan 스킬 종료 금지**
5. **"스티치로 디자인 시안 보기" 선택 시**:
   1. `Skill(skill: "mst:stitch", args: "--pln PLN-NNN --multi {plan 주제}")` 호출
      - ⚠️ `mcp__stitch__*` 도구 직접 호출 절대 금지 — 반드시 위 Skill 도구 경유
   2. 호출 완료 후 생성된 Stitch 프로젝트/화면 정보를 plan 초안에 `## 디자인 시안` 섹션으로 추가:
      - DES-NNN ID + 프로젝트 URL
      - 각 화면: 화면명 + Stitch URL + **html_file 경로** (`{PROJECT_ROOT}/.gran-maestro/designs/DES-NNN/screen-NNN.html`)
      - html_file이 null(미추출)인 경우 해당 행 생략
      - plan.md는 여전히 디스크에 저장되지 않은 초안 상태를 유지
   3. Step 4 재표시 (저장/수정 선택 가능)

## 출력 형식

`templates/plan.md`를 기본 템플릿으로 사용하여 plan.md를 작성합니다.
