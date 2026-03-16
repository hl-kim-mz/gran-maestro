---
name: review
description: "구현 완성도를 반복 검토합니다. AC 충족 여부 검증 + 병렬 코드/아키텍처/UI 리뷰 수행. 갭 발견 시 태스크 자동 추가 후 재실행. approve 루프 내에서 자동 호출되거나 /mst:review REQ-NNN으로 직접 실행 가능."
user-invocable: true
argument-hint: "[REQ-ID] [--auto]"
---

# maestro:review

구현 완성도를 반복 검토합니다. spec §3 AC 체크리스트 검증(인컨텍스트)과 코드/아키텍처/UI 리뷰(background 에이전트 병렬)를 동시 수행하여 갭을 탐지하고, 발견 시 태스크를 자동 생성합니다.

## 전제조건 가드 (수동 호출 시)

`/mst:review REQ-NNN` 직접 호출 시 실행 전 아래를 검증합니다.

1. **REQ-ID 필수**: `$ARGUMENTS`에 `REQ-NNN` 패턴이 없으면 "REQ-ID를 지정하세요 (예: /mst:review REQ-001)" 안내 후 종료.
2. **committed 태스크 존재**: `request.json.tasks` 배열에서 `status == "committed"` 태스크가 1개 이상이어야 실행. 미충족 시 "Phase 2 완료(commit) 후 실행하세요" 안내 후 종료.
   - 이 조건은 approve 루프 내 호출 시에는 적용하지 않음 (approve가 사전 검증).

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

### Step 1: 초기화

> 이 Step의 목적: 리뷰 반복 회차 메타데이터를 초기화한다 / 핵심 출력물: `RV-NNN` 디렉토리, `review.json`, `request.json.review_iterations` 갱신

1. **RV 채번**: `request.json.review_iterations.length + 1` → 3자리 0패딩 → `RV-001`, `RV-002`, ...
   - `review_iterations` 배열이 비어있으면 `length = 0` → `RV-001` 정상 채번.
2. **디렉토리 생성**: `{PROJECT_ROOT}/.gran-maestro/requests/REQ-NNN/reviews/RV-NNN/`
3. **review.json 생성**:
   ```json
   {
     "id": "RV-NNN",
     "req_id": "REQ-NNN",
     "iteration": N,
     "status": "reviewing",
     "created_at": "<ISO8601>"
   }
   ```
4. **request.json 업데이트**:
   - `review_iterations` 배열에 `{ "rv_id": "RV-NNN", "created_at": "<ISO8601>", "status": "in_progress" }` 항목 추가 (Step 5 완료 후 `"completed"`로 갱신).
   - `review_summary` = `{ "iteration": N, "status": "reviewing" }` 업데이트.

### Step 2: 컨텍스트 로드

> 이 Step의 목적: AC 검증/리뷰에 필요한 입력 컨텍스트를 수집한다 / 핵심 출력물: AC 목록, 변경 파일 목록, config 기반 실행 파라미터

1. **Spec AC 목록 수집**: 모든 `tasks/NN/spec.md` Read → `## 3. 수락 조건` 섹션에서 AC 항목 추출.
1-b. **Plan AC 수집 (source_plan 존재 시)**: `request.json.source_plan` 필드 확인 → 값이 있으면 `{PROJECT_ROOT}/.gran-maestro/plans/{source_plan}/plan.md` Read → `## 인수 기준 초안` 섹션 추출 → 각 항목을 `PLAN-AC-N` ID로 태깅하여 AC 목록에 추가.
   - Plan AC는 사용자가 plan 단계에서 합의한 최종 목표이므로 **MUST 등급**으로 처리한다.
   - `source_plan` 미존재 또는 `## 인수 기준 초안` 섹션이 없으면 이 단계 skip (경고 없이 무시).
   - 수집된 Plan AC는 Spec AC와 **분리하여 관리** (Pass A에서 별도 섹션으로 검증).
1-c. **Spec AC 타입 태그 파싱**: 각 AC 헤더의 타입 태그(`[automatable]`, `[manual]`, `[browser-test]`)를 파싱하여 `ac_type`으로 보관한다.
   - 태그 누락 시 기본값은 `manual`.
   - `[browser-test]`는 Pass A에서 실제 브라우저 실행 분기 대상으로 표시한다.
2. **변경 파일 목록 수집**: `git log --name-only` 또는 `git diff <base>..HEAD --name-only` 기반으로 REQ 관련 변경 파일 목록 작성.
3. **AC별 파일 매핑 준비**: 각 AC 항목과 관련 변경 파일 연결.
4. **Intent lookup (비차단)**: 변경 파일 목록을 기반으로 관련 Intent를 조회한다.
   - 실행:
     ```bash
     python3 {PLUGIN_ROOT}/scripts/mst.py intent lookup --files {changed_files}
     # {changed_files}: 공백 구분 파일 경로 목록 (예: --files file1.ts file2.md)
     # git diff 출력 변환: $(git diff master..HEAD --name-only | tr '\n' ' ')
     # 주의: 경로에 공백 포함 시 개별 인자로 전달 필요; 파일 수 과다(100개+) 시 상위 20개만 사용
     ```
   - 조회된 INTENT가 존재하면 해당 내용(feature, situation, motivation, goal)을 각 리뷰어 프롬프트에 **의도 위반 체크** 컨텍스트로 주입:
     ```
     [Intent 컨텍스트]
     - When I: {situation}
     - I want to: {feature}
     - So I can: {goal}
     - Motivation: {motivation}
     → 구현이 위 의도에 부합하는지 "의도 위반 체크" 관점에서 검토하세요.
     ```
   - INTENT 조회 결과 없으면 skip (비차단); 명령 실패 시 warn만 출력, 워크플로우 차단 금지
4-b. **Intent Trace 컨텍스트 수집 (intent_fidelity 전용)**: 현재 태스크 `spec.md`에서 `## 3.2 Intent Trace` 섹션 추출.
   - 섹션 존재 시: 섹션 원문을 `{INTENT_TRACE_SECTION}`으로 보관하고, `intent_fidelity` 프롬프트에 포함한다.
   - `request.json.source_plan` 존재 시: `{PROJECT_ROOT}/.gran-maestro/plans/{source_plan}/plan.md`에서 `## 요청 (Refined)` + `## Intent (JTBD)`를 추출하여 `{PLAN_INTENT_CONTEXT}`로 보관한다.
   - docs 컨텍스트: `Intent Trace`의 `근거 출처`에 포함된 `docs/` 경로 + `intent_snapshot`(존재 시)의 docs 경로를 dedup 후 Read하여 `{INTENT_DOCS_CONTEXT}`로 보관한다. docs가 없으면 skip.
   - 섹션 미존재 시: `intent_fidelity_skip_reason = "Intent Fidelity 리뷰 skip (Intent Trace 없음)"`를 설정하고 intent_fidelity dispatch를 auto-skip 처리한다.
5. **config 로드**: `config.resolved.json`에서 아래 값을 확인.
   - `review.roles.*` 에이전트 키
   - `review.roles.intent_fidelity.agent` / `review.roles.intent_fidelity.tier`
   - `intent_fidelity.enabled` (기본값: `true`)
   - `intent_fidelity.mode` (기본값: `"advisory"`)
   - `review.max_iterations` 키 경로: `config.review.max_iterations` (미정의 시 기본값 10 사용)
   - `auto_mode.review` 키 경로: `config.auto_mode.review` (true이면 `AUTO_MODE=true`, `--auto` 플래그와 동일 동작)
   - `auto_mode.max_review_iterations` 키 경로: `config.auto_mode.max_review_iterations`
     - `AUTO_MODE=true` 이고 값이 설정되어 있으며 `> 0`이면 `max_iterations`를 이 값으로 override
     - `0` 이하이면 무시하고 `config.review.max_iterations` 값을 사용
   - 우선순위:
     - `AUTO_MODE`: CLI `--auto` 플래그 > `config.auto_mode.review` > 기본값(false)
     - `max_iterations`: (`AUTO_MODE=true`일 때) `config.auto_mode.max_review_iterations` > `config.review.max_iterations` > 기본값(10)
   - 이후 문서의 "**`--auto` 모드**" 분기는 `AUTO_MODE=true`일 때 동일하게 적용.

### Step 3: Pass A — 인수 판정 (AC 충족성 검증)

> 이 Step의 목적: AC 충족 여부를 확정해 Pass B 진입 가능성을 결정한다 / 핵심 출력물: `pass_a_result`, `failed_ac_ids`, `failure_class`, `evidence`
> ⚠️ CRITICAL: MUST AC가 1개라도 FAIL이면 `pass_a_failed`로 즉시 전환하고 Pass B로 진행하지 않는다.

#### browser-test AC 실행 분기 (Pass A 내부, MANDATORY)

- 대상: Step 2에서 `ac_type == browser-test`로 파싱된 Spec AC.
- 저장 경로(요청 단위):
  - 디렉토리: `{PROJECT_ROOT}/.gran-maestro/requests/{REQ_ID}/browser-tests/BT-{RV-NNN}/`
  - 결과 JSON: `results.json`
  - 스크린샷: `screenshots/*.webp`
- 실행 순서:
  1. `browser-tests/BT-{RV-NNN}/screenshots` 디렉토리를 생성한다.
  2. 도구 가용성을 아래 우선순위로 감지한다.
     - 1순위: Playwright 스킬 (`Skill(skill: "playwright", ...)`)
     - 2순위: Claude in Chrome 실행 경로
  3. 가용 도구가 있으면 각 browser-test AC를 실제 브라우저에서 실행하고 PASS/FAIL을 판정한다.
     - AC의 `Given/When/Then/Test` 문장을 그대로 실행 시나리오 입력으로 사용한다.
     - 가능하면 AC별 스크린샷(`screenshots/{AC-ID}.webp`)을 남긴다.
  4. 가용 도구가 없으면 워크플로우를 중단하지 않고 해당 AC를 `SKIP(tool_unavailable)`으로 기록한다.
     - 이 경우 MUST AC라도 `pass_a_failed`로 강등하지 않는다.
     - 사용자 보고에는 "브라우저 도구 미가용으로 browser-test AC를 SKIP"을 명시한다.
- `results.json` 최소 스키마:
  ```json
  {
    "id": "BT-RV-NNN",
    "rv_id": "RV-NNN",
    "created_at": "<ISO8601>",
    "tool": "playwright | claude-in-chrome | unavailable",
    "summary": { "pass": 0, "fail": 0, "skip": 0 },
    "results": [
      {
        "ac_id": "AC-001",
        "status": "PASS | FAIL | SKIP",
        "reason": "tool_unavailable | assertion_failed | ...",
        "screenshot": "screenshots/AC-001.webp"
      }
    ]
  }
  ```
- browser-test AC 실행 결과는 `ac-results.md` 근거란에도 반영한다.

자세한 절차: `templates/protocols/pass-a-protocol.md` 참조

---

### Step 4: Pass B — 코드 품질 검증

> 이 Step의 목적: Pass A 통과 산출물을 기반으로 코드/설계/UI/의도 충실도 갭을 찾는다 / 핵심 출력물: `ac-results.md`, `review-code.md`, `review-arch.md`, `review-ui.md`, `review-intent-fidelity.md`
**조건**: Pass A 전체 통과 후에만 진행 (MUST AC 실패 시 이 단계 건너뜀)

Pass B는 Claude(인컨텍스트)와 background 에이전트 4개를 동시 시작합니다.

```
Claude (인컨텍스트):   spec §3 AC 체크리스트 순차 검증  ─┐
code-reviewer (bg):   구현 레벨 리뷰                  ─┤─→ Step 5에서 PM 취합 → review-report.md
arch-reviewer (bg):   설계/계획 레벨 리뷰              ─┤
ui-reviewer (bg):     UI 설계 검토 (조건부)            ─┤
intent-fidelity (bg): 원본 의도 대비 구현 일치 검증     ─┘
```

#### Claude 인컨텍스트: AC 검증

- 각 AC 항목별로 관련 코드/설정 파일 Read.
- PASS / FAIL / UNKNOWN 판정 후 근거 기록.
- **Plan AC(PLAN-AC-N)가 있으면 Spec AC와 별도 섹션으로 검증**한다.
  - Plan AC는 구현 상세보다 **관찰 가능한 결과/동작** 기준으로 판정한다 (예: "X 버튼 클릭 시 Y 결과 표시").
  - Plan AC 미충족은 MUST 등급 실패로 처리하고, spec AC 실패와 동일하게 Pass A 실패 트리거 대상이 된다.
- 결과를 `reviews/RV-NNN/ac-results.md`에 저장.
  ```markdown
  # AC 검증 결과 — RV-NNN

  ## Spec AC
  | AC | 등급 | 판정 | 근거 |
  |----|------|------|------|
  | AC-1 | MUST | ✅ PASS | ... |
  | AC-2 | SHOULD | ❌ FAIL | ... |

  ## Plan AC (PLN-NNN)
  | AC | 판정 | 근거 |
  |----|------|------|
  | PLAN-AC-1 | ✅ PASS | ... |
  | PLAN-AC-2 | ❌ FAIL | ... |
  ```
  Plan AC 섹션이 없으면 (source_plan 미존재 시) 생략한다.

**MUST AC 실패 감지 트리거**: AC 검증 완료 후, 판정=FAIL이고 등급=[MUST]인 항목이 1개 이상이면
(Spec MUST AC 또는 Plan AC 포함)
→ **Step 5(e) Pass A 실패 분기로 즉시 진입**. SHOULD AC 실패는 경고만 기록하며 Pass B 진입 허용.

#### Background 에이전트 dispatch

background 에이전트는 `run_in_background: true` 옵션으로 dispatch합니다 (approve SKILL.md Step 4d 완료 감지 패턴 동일 적용).

| 역할 키 | 검토 관점 | config 키 | 모델 resolve |
|---------|-----------|-----------|-------------|
| `code_reviewer` | 누락 로직, 버그, 엣지케이스, 테스트 누락 | `review.roles.code_reviewer.agent` | `providers[agent][review.roles.code_reviewer.tier \|\| default_tier]`로 resolve |
| `arch_reviewer` | spec 의도 vs 구현 방향 차이, 통합 일관성 + Scope Audit(필수): `SCOPE_CREEP`(spec.md에 없는 구현), `OMISSION`(spec.md에는 있으나 구현 누락) 점검. plan.md가 있는 경우 상위 목표·방향 대비 구현 적합성도 반드시 확인. 불필요한 파일 변경(범위 외 수정) 여부 점검. 미발견 시에도 `"확인 완료 — 해당 없음"` 명시 | `review.roles.arch_reviewer.agent` | `providers[agent][review.roles.arch_reviewer.tier \|\| default_tier]`로 resolve |
| `ui_reviewer` | Stitch 시안 vs 실제 UI, UX 흐름 일관성 | `review.roles.ui_reviewer.agent` | `providers[agent][review.roles.ui_reviewer.tier \|\| default_tier]`로 resolve |
| `intent_fidelity` | 원본 의도(plan 요청 + docs) 대비 구현 일치 검증. spec §3.2 Intent Trace의 각 항목을 구현 증거와 대조. Missing/Partial/Verified 분류. advisory 모드: 기존 pass/fail에 영향 없음 | `review.roles.intent_fidelity.agent` | `providers[agent][review.roles.intent_fidelity.tier \|\| default_tier]`로 resolve |

각 리뷰어(code_reviewer, arch_reviewer, ui_reviewer)는 발견한 이슈에 반드시 `[CRITICAL]`, `[MAJOR]`, `[MINOR]` 등급을 태깅해야 한다 (`templates/review-request.md`의 등급 판별 가이드 및 보안 오버라이드 규칙 적용).
intent_fidelity는 등급 대신 `Verified/Partial/Missing` + `INTENT-GAP` 카운트를 출력한다.

arch_reviewer dispatch 시 `templates/review-request.md`의 `{{PERSPECTIVE}}`에는 위 Scope Audit 지시(`SCOPE_CREEP`, `OMISSION`, 미발견 시 `"확인 완료 — 해당 없음"` 명시)를 반드시 포함해 전달한다.

각 에이전트 프롬프트에 출력 파일 경로를 명시하여 전달합니다:
- code_reviewer → `reviews/RV-NNN/review-code.md`
- arch_reviewer → `reviews/RV-NNN/review-arch.md`
- ui_reviewer → `reviews/RV-NNN/review-ui.md`
- intent_fidelity → `reviews/RV-NNN/review-intent-fidelity.md`

- `{{SPEC_PATH}}`: 해당 태스크의 `{PROJECT_ROOT}/.gran-maestro/requests/{REQ_ID}/tasks/{NN}/spec.md` 절대 경로
- `{{PLAN_PATH}}`: `request.json.source_plan` 존재 시 `{PROJECT_ROOT}/.gran-maestro/plans/{source_plan}/plan.md`, 미존재 시 `"N/A"`

#### intent_fidelity dispatch 입력 규칙

- `intent_fidelity.enabled != true`이면 skip.
- `spec.md`에 `## 3.2 Intent Trace`가 없으면 auto-skip하고 취합 시 `"Intent Fidelity 리뷰 skip (Intent Trace 없음)"`를 표시한다.
- 실행 시 아래 컨텍스트를 함께 전달한다.
  - `spec.md` 원문
  - 구현 diff (`git diff <base>..HEAD`)
  - plan 원본 요청 (`plan.md`의 `## 요청 (Refined)` + `## Intent (JTBD)`)
  - spec `§3.2 Intent Trace` 원문
  - docs 컨텍스트 (`Intent Trace` 근거 출처 및 `intent_snapshot`에서 식별된 관련 docs)
- 출력 파일은 반드시 `reviews/RV-NNN/review-intent-fidelity.md`로 저장한다.
- 리포트 형식은 아래 템플릿을 따른다.
  ```markdown
  # Intent Fidelity 리포트 — RV-NNN

  ## 검증 요약
  - ✅ Verified: N개
  - ⚠️ Partial: N개
  - ❌ Missing: N개
  - ℹ️ INTENT-GAP (근거 없는 AC): N개

  ## 상세

  | AC-ID | 의도 근거 | 구현 증거 | 판정 | 비고 |
  |-------|-----------|-----------|------|------|
  | AC-001 | {의도 문장} | {코드/테스트 위치} | Verified/Partial/Missing | {차이점} |
  ```

#### 프롬프트 파일 사전 저장 (MANDATORY)

> ⚠️ **파이프 방식 금지**: `echo "$PROMPT" | codex exec ... "$(cat)"` 패턴을 사용하면
> shell command substitution이 파이프 연결 전에 평가되어 프롬프트가 빈 문자열로 전달됩니다.
> 반드시 아래 파일 저장 → 파일에서 읽기 방식을 사용하세요.

dispatch 전 각 리뷰어 프롬프트를 반드시 파일로 먼저 저장한다:
```
Write → {PROJECT_ROOT}/.gran-maestro/requests/{REQ_ID}/reviews/{RV_ID}/{role}-prompt.md
```
이 경로를 `{PROMPT_FILE}`로 참조한다. 저장 완료 확인 후 dispatch한다.

#### 에이전트 유형별 dispatch 패턴

**`codex` 에이전트**:
```bash
Bash(
  MODEL=$(python3 {PLUGIN_ROOT}/scripts/mst.py resolve-model codex {tier} 2>/dev/null || echo "gpt-5.3-codex");
  command: 'set -o pipefail; codex exec --full-auto -m "$MODEL" -C {PROJECT_ROOT} "$(cat {PROMPT_FILE})" 2>&1 | tee {PROJECT_ROOT}/.gran-maestro/requests/{REQ_ID}/reviews/{RV_ID}/{role}-running.log',
  run_in_background: true,
  timeout: {config.timeouts.cli_large_task_ms}
)
```

**`gemini` 에이전트**:
```bash
Bash(
  MODEL=$(python3 {PLUGIN_ROOT}/scripts/mst.py resolve-model gemini {tier} 2>/dev/null);
  command: 'set -o pipefail && cd {PROJECT_ROOT} && gemini -p "$(cat {PROMPT_FILE})"${MODEL:+ --model "$MODEL"} --approval-mode yolo 2>&1 | tee {PROJECT_ROOT}/.gran-maestro/requests/{REQ_ID}/reviews/{RV_ID}/{role}-running.log',
  run_in_background: true,
  timeout: {config.timeouts.cli_large_task_ms}
)
```

**`claude`/`claude-dev` 에이전트**:
```
Agent(
  subagent_type: "general-purpose",
  prompt: {PROMPT_FILE 파일 내용 — Read 후 전달},
  run_in_background: true,
  mode: "acceptEdits"
)
```
플랜 B: `acceptEdits`에서 Write가 차단될 경우 `mode: "auto"`로 전환.

**ui_reviewer 스킵 조건**: `request.json.stitch_screens` 배열이 비어있고 `frontend/` 디렉토리 변경 파일이 없으면 auto-skip. 취합 시 "UI 리뷰 skip (변경 없음)" 표시.
**intent_fidelity 스킵 조건**: `intent_fidelity.enabled=false` 또는 `## 3.2 Intent Trace` 미존재 시 auto-skip. 취합 시 각각 "Intent Fidelity 리뷰 skip (비활성화)" 또는 "Intent Fidelity 리뷰 skip (Intent Trace 없음)" 표시.

### Step 5: 완료 대기 및 취합

> 이 Step의 목적: Pass B 산출물을 수집·요약해 리뷰 결과를 단일 리포트로 정리한다 / 핵심 출력물: `review-report.md`

1. **완료 폴링**: background 에이전트 4개(또는 skip된 에이전트 제외) 완료 대기. approve SKILL.md Step 4d 완료 감지 패턴 동일 적용.
   - 에이전트 실패 시: 해당 역할 리뷰 "에이전트 실패" 표시 후 나머지 취합 계속 진행.
   - fallback (FILE_NOT_FOUND 처리): 각 `review-*.md` 파일이 FILE_NOT_FOUND이면 해당 background Agent 반환값(`TaskOutput`)에서 전체 텍스트를 추출한다.
     - 추출 텍스트가 빈 문자열이 아니고 `# ` 또는 `## ` 마크다운 헤더를 1개 이상 포함하면 유효한 리뷰 결과로 간주하고 PM이 해당 `review-*.md` 경로에 Write한다.
     - 추출 텍스트가 비어있거나 헤더가 없으면 해당 역할을 "에이전트 실패"로 표시하고 나머지 취합을 계속 진행한다.
2. **취합 파일**: `ac-results.md` + `review-code.md` + `review-arch.md` + `review-ui.md` + `review-intent-fidelity.md` (skip 시 미생성).
3. **review-report.md 작성**: `reviews/RV-NNN/review-report.md`
   ```markdown
   # 리뷰 리포트 — RV-NNN (REQ-NNN 반복 N)

   ## Spec AC 검증 결과
   - ✅ 충족 AC N개
   - ❌ 미충족/갭 N개
     - AC-X: <설명>

   ## Plan AC 검증 결과 (PLN-NNN)
   <!-- source_plan 없으면 이 섹션 생략 -->
   - ✅ 충족 PLAN-AC N개
   - ❌ 미충족 PLAN-AC N개
     - PLAN-AC-X: <설명>

   ## 코드 리뷰 주요 발견 사항
   <review-code.md 핵심 항목>

   ## 아키텍처 리뷰 주요 발견 사항
   <review-arch.md 핵심 항목>

   ## UI 리뷰 주요 발견 사항
   <review-ui.md 핵심 항목 또는 "UI 리뷰 skip (변경 없음)">

   ## Intent Fidelity 검증 결과
   - 모드: advisory | blocking
   - advisory 모드면 `(advisory — pass/fail 미반영)` 라벨 표기
   - ✅ Verified N개 / ⚠️ Partial N개 / ❌ Missing N개 / ℹ️ INTENT-GAP N개
   - 상세: `review-intent-fidelity.md` 또는 skip 사유
   ```

### Step 6: 갭 처리 분기

> 이 Step의 목적: AC 갭/코드리뷰 이슈 상태에 따라 후속 경로를 확정한다 / 핵심 출력물: `review.json.status` 및 재실행/수락 분기 결정

AC 미충족(갭) 여부와 코드리뷰 이슈 여부에 따라 5개 분기로 처리합니다.

> **Step 5 완료 시 공통 절차**: 분기 처리가 완료되면 `request.json.review_iterations` 배열에서 현재 회차 항목의 `status`를 `"in_progress"` → `"completed"`로 갱신합니다.

#### Intent Fidelity 결과 반영 규칙 (Step 6 공통)

1. `review-intent-fidelity.md`가 존재하면 `Verified/Partial/Missing/INTENT-GAP` 카운트를 파싱한다.
2. 파싱 결과를 `request.json`의 현재 태스크에 기록한다.
   - 경로: `tasks[현재 태스크].self_check.intent_fidelity_result`
   - 스키마: `{ "verified": N, "partial": N, "missing": N, "intent_gaps": N, "report_path": "reviews/RV-NNN/review-intent-fidelity.md" }`
3. `intent_fidelity.mode == "advisory"`이면 리포트만 출력하고 기존 review pass/fail 판정에는 영향을 주지 않는다.
4. `intent_fidelity.mode == "blocking"`이면 기존 review 판정과 AND 조건으로 결합한다.
   - `partial_count + missing_count > 0`이면 `review.json.status = "gap_found"`로 처리하고 `(c)` 경로를 따른다.
   - `partial_count == 0` 그리고 `missing_count == 0`일 때만 intent_fidelity 통과로 간주한다.

#### (a) 갭 없음 + 코드리뷰 이슈 없음 (+ blocking 모드면 intent_fidelity 통과)

- `review.json.status = "passed"`
- `request.json.review_summary = { "iteration": N, "status": "passed" }` 업데이트
- Phase 3 PASS 반환. approve가 Phase 5(mst:accept)를 호출 — review는 mst:accept를 직접 호출하지 않는다.

#### (b) 갭 없음 + 코드리뷰 이슈만 있음 (AC는 통과, 설계/품질 이슈)

코드리뷰 이슈를 등급별로 분류한 뒤 자동 처리 분기를 수행합니다.

##### (b) enabled 가드

`config.review.severity_auto_fix.enabled` 확인:
- `false`: 기존 (b) 동작으로 fallback
  - **`--auto` 모드**: 이슈를 report에만 기록하고 Phase 5 자동 진행. `review.json.status = "passed"`.
  - **일반 모드**: `AskUserQuestion` → 선택지:
    - `[이슈 무시하고 수락]`: Phase 5 진행. `review.json.status = "passed"`.
    - `[이슈를 태스크로 추가]`: **(c)와 동일 경로** (갭별 새 태스크 spec.md 자동 작성 + 재외주).
- `true`: 아래 등급별 분기 진행 (사전 처리 → b-1/b-2/b-3).

##### (b) 사전 처리: 이슈 파싱 및 등급 분류

1. **리뷰어 태깅 파싱**: `review-report.md`의 코드/아키텍처/UI 리뷰 발견 사항에서 `[CRITICAL]`, `[MAJOR]`, `[MINOR]` 접두사를 파싱하여 등급별 배열로 분리합니다.
   - 태깅 형식 예시: `[CRITICAL] SQL injection 취약점 발견`, `[MAJOR] 에러 핸들링 누락`, `[MINOR] 변수명 컨벤션 불일치`
   - **태깅 없는 이슈**: 리뷰어가 등급 접두사를 붙이지 않은 이슈는 **MAJOR로 기본 분류**합니다.

2. **PM 재조정 (보안 오버라이드)**: `config.review.severity_auto_fix.security_override_keywords` 배열의 키워드와 각 이슈 내용을 매칭합니다.
   - 키워드가 이슈 텍스트에 포함되면 해당 이슈의 등급을 **무조건 CRITICAL로 승격**합니다 (원래 MAJOR/MINOR였더라도).
   - 키워드 매칭은 대소문자 무시(case-insensitive).
   - 예시 키워드: `인증`, `인가`, `인젝션`, `XSS`, `CSRF`, `SQL injection`, `권한 우회`, `authentication`, `authorization`, `injection`, `secret`, `token`

3. **등급별 카운트 산출**: 재조정 완료 후 `critical_count`, `major_count`, `minor_count`를 산출합니다.

4. **`review_issues_summary` 기록**: `review.json`과 `request.json`의 해당 review iteration에 등급별 카운트 및 자동 처리 내역을 기록합니다 (스키마는 하단 "review_issues_summary 스키마" 섹션 참조).

##### (b-1) CRITICAL 또는 MAJOR가 1건 이상 존재

- `critical_count + major_count > 0` 인 경우.
- **`--auto` 모드**:
  - CRITICAL/MAJOR 이슈에 대해 **(c)와 동일 경로** (갭별 새 태스크 spec.md 자동 작성 + 재외주). `gap_source: "code_review_issues"` 메타 기록.
  - MINOR 이슈는 `review_issues_summary.skipped` 배열에 기록하고 **무조건 스킵** (threshold 무시). `review-report.md`에만 기록.
- **일반 모드**: `AskUserQuestion` → 선택지:
  - `[CRITICAL/MAJOR N건 태스크로 추가]`: **(c)와 동일 경로** (갭별 새 태스크 spec.md 자동 작성 + 재외주). MINOR는 `config.review.severity_auto_fix.minor_skip_threshold` 검사 적용 (b-2/b-3 규칙 동일). `review.json.status = "gap_found"`. `gap_source: "code_review_issues"` 메타 기록.
  - `[전체 이슈 무시하고 수락]`: Phase 5 진행. `review.json.status = "passed"`.

##### (b-2) MINOR만 존재 + 개수 <= threshold (스킵+리포트)

- `critical_count == 0 AND major_count == 0 AND minor_count > 0 AND minor_count <= config.review.severity_auto_fix.minor_skip_threshold` 인 경우.
- MINOR 이슈를 `review-report.md`에 기록하고 `review_issues_summary.skipped` 배열에 기록.
- `review.json.status = "passed"`.
- `request.json.review_summary = { "iteration": N, "status": "passed" }` 업데이트.
- Phase 3 PASS 반환. approve가 Phase 5(mst:accept)를 호출 — review는 mst:accept를 직접 호출하지 않는다.

##### (b-3) MINOR만 존재 + 개수 > threshold (자동 태스크 생성)

- `critical_count == 0 AND major_count == 0 AND minor_count > 0 AND minor_count > config.review.severity_auto_fix.minor_skip_threshold` 인 경우.
- **(c)와 동일 경로** (갭별 새 태스크 spec.md 자동 작성 + 재외주). `gap_source: "code_review_issues"` 메타 기록.
- `review.json.status = "gap_found"`.
- **참고**: `minor_skip_threshold`가 `0`이면 모든 MINOR도 자동 처리 대상.

##### (b) `--auto` 모드 동작 요약

`--auto` 플래그 실행 시 코드리뷰 이슈 등급별 동작:

| 등급 | 동작 |
|------|------|
| CRITICAL | 자동 태스크 생성 + 재외주 (c 경로) |
| MAJOR | 자동 태스크 생성 + 재외주 (c 경로) |
| MINOR | `minor_skip_threshold` **무시**, 무조건 스킵+리포트. `review.json.status`는 CRITICAL/MAJOR 유무에 따라 결정. |

- CRITICAL/MAJOR 없이 MINOR만 있는 경우: `review.json.status = "passed"`. Phase 5 자동 진행.
- CRITICAL/MAJOR와 MINOR 혼재: CRITICAL/MAJOR만 태스크 생성, MINOR 스킵. `review.json.status = "gap_found"`.

#### (c) 갭 있음 + iteration ≤ max_iterations

1. 갭별 새 태스크 spec.md 자동 작성:
   - 경로: `tasks/NN+1/spec.md` (기존 최대 태스크 번호 +1)
   - `request.json.tasks` 항목 필드: `{ "id": "NN", "title": "<갭 설명>", "status": "pending", "agent": null, "spec": "tasks/NN/spec.md", "generated_by": "review" }`
2. `request.json.tasks` 배열 업데이트 (신규 태스크 추가).
3. `request.json.review_summary = { "iteration": N, "status": "gap_fixing" }` 업데이트.
4. `review.json` 업데이트: `{ "status": "gap_found", "gaps_found": M, "tasks_created": ["NN", "NN+1", ...], "gap_source": "ac_gap | code_review_issues | intent_fidelity" }`.
5. approve 스킬에 갭 목록 + 새 태스크 ID 반환 → approve가 Phase 2 재실행 제어.

#### (d) 갭 있음 + iteration > max_iterations

- **`--auto` 모드**: `review.json.status = "limit_reached"`, `review_summary.status = "limit_reached"` 기록 후 종료.
- **일반 모드**: `AskUserQuestion` → 선택지:
  - `[추가 반복 허용 (+1회)]`: `max_iterations` 임시 +1 후 (c) 경로 실행.
  - `[현재 상태로 수락]`: Phase 5 진행. `review.json.status = "passed"` (강제 수락).
  - `[중단]`: 워크플로우 중단.

#### (e) Pass A 실패 (MUST AC 실패 감지)

Step 3 AC 검증에서 MUST 등급 AC가 1개 이상 FAIL 판정된 경우 진입합니다.

1. `review.json.status = "pass_a_failed"` 기록.
2. `request.json.review_summary = { "iteration": N, "status": "pass_a_failed" }` 업데이트.
3. **스키마 Read (필수)**: `templates/schemas/pass-a-result.md`를 Read하여 필수 필드/형식을 확인한 후 작성한다.
4. **pass-a-result.md 저장**: `reviews/RV-NNN/pass-a-result.md`에 아래 스키마로 저장.
5. review는 `mst:feedback`을 직접 호출하지 않고 **종료**합니다.
6. approve에 `pass_a_failed` 상태 반환 → approve가 재외주 대상 태스크를 선별하여 Phase 2 재실행.

##### pass-a-result.md 스키마

저장 경로: `reviews/RV-NNN/pass-a-result.md`

```yaml
pass_a_result: fail
failed_ac_ids:
  - AC-XX
  - AC-YY
failure_class: ac_unclear | interpretation | implementation
evidence:
  - ac_id: AC-XX
    type: log | screenshot | metric | manual
    ref: "실패 증거 경로 또는 설명"
    summary: "실패 내용 요약"
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `pass_a_result` | string | 항상 `"fail"` (Pass A 실패를 나타냄). |
| `failed_ac_ids` | string[] | FAIL 판정된 MUST 등급 AC ID 목록. |
| `failure_class` | string | 실패 원인 분류: `ac_unclear`(AC 기준 불명확) \| `interpretation`(해석 차이) \| `implementation`(구현 누락/오류). |
| `evidence` | array | 각 실패 AC의 증거 목록. 각 항목: `{ ac_id, type, ref, summary }`. |

approve는 이 파일에서 `failed_ac_ids`와 `failure_class`를 파싱하여 재외주 대상 태스크를 선별한다.


## 스킬 실행 마커 (MANDATORY)

- 모든 응답의 첫 줄 또는 각 Step 시작 줄에 아래 마커를 출력한다.
- 기본 마커 포맷: `[MST skill={name} step={N}/{M} return_to={parent_skill/step | null}]`
- 필드 규칙:
  - `skill`: 현재 실행 중인 스킬 이름
  - `step`: 현재 단계(`N/M`) 또는 서브스킬 종료 시 `returned`
  - `return_to`: 최상위 스킬이면 `null`, 서브스킬이면 `{parent_skill}/{step_number}`
- 서브스킬 종료 마커: `[MST skill={subskill} step=returned return_to={parent/step}]`
- C/D 분리 마커 규칙을 추가로 사용하지 않는다. 반드시 단일 MST 마커만 사용한다.
- 예시:
  - `[MST skill={name} step=1/3 return_to=null]`
  - `[MST skill={subskill} step=returned return_to={parent_skill}/{step_number}]`

## 수동 호출 모드 (/mst:review REQ-NNN)

approve 루프 밖에서 직접 호출 시 Step 1~4 동일 실행 후 Step 5 결과를 사용자에게 직접 보고합니다.

### 전제조건

"전제조건 가드" 섹션 참조. `committed` 상태 태스크가 1개 이상이어야 실행.

### 결과별 동작

| 결과 | 동작 |
|------|------|
| PASS (갭 없음, 이슈 없음) | "리뷰 통과. 갭 없음" 보고 후 종료. REQ 미accept 시 `/mst:accept REQ-NNN` 안내. |
| 갭 발견 | 태스크 자동 추가 + `review_summary` 업데이트 후 종료. "갭 N개 발견, T0N 태스크 추가됨. `/mst:approve REQ-NNN` 으로 재실행하세요" 안내. |
| 코드리뷰 이슈만 | report 출력 후 사용자 선택 → [태스크 추가] 또는 [무시]. 태스크 추가 시 `/mst:approve REQ-NNN` 안내. |

**`--auto` 플래그**: approve `--auto` 실행 시 내부 컨텍스트로 전달됨. `/mst:review REQ-NNN --auto` 직접 호출도 가능.

## request.json 스키마 변경

`mst:review` 실행 시 `request.json`에 아래 필드가 추가/갱신됩니다.

```json
{
  "review_iterations": [
    {
      "rv_id": "RV-001",
      "created_at": "2026-03-01T00:00:00Z",
      "gaps_found": 2,
      "tasks_created": ["03", "04"],
      "status": "completed"
    }
  ],
  "review_summary": {
    "iteration": 1,
    "status": "gap_fixing"
  },
  "tasks": [
    {
      "id": "02",
      "self_check": {
        "intent_fidelity_result": {
          "verified": 3,
          "partial": 1,
          "missing": 0,
          "intent_gaps": 1,
          "report_path": "reviews/RV-001/review-intent-fidelity.md"
        }
      }
    }
  ]
}
```

### review_iterations 배열

각 회차 실행 결과를 순서대로 기록합니다.

| 필드 | 설명 |
|------|------|
| `rv_id` | RV 채번 (`RV-NNN`). `review_iterations.length + 1` 기반. |
| `created_at` | 회차 시작 시각 (ISO8601). |
| `gaps_found` | 발견된 갭 수. 0이면 갭 없음. |
| `tasks_created` | 갭으로 생성된 태스크 ID 배열. 갭 없으면 `[]`. |
| `status` | Step 1에서 `"in_progress"`로 초기화, Step 5 완료 후 `"completed"`로 갱신. 갭 여부는 `gaps_found > 0`으로 구분. |
| `review_issues_summary` | (선택) 등급별 코드리뷰 이슈 요약. 이슈가 존재하면 `review.json.review_issues_summary`와 동일 구조로 기록. |

### tasks[].self_check.intent_fidelity_result

intent_fidelity 리뷰 결과를 현재 태스크 단위로 기록한다.

| 필드 | 타입 | 설명 |
|------|------|------|
| `verified` | number | Intent Trace 대비 구현 증거가 충분한 항목 수 |
| `partial` | number | 의도 근거 대비 구현 증거가 불충분한 항목 수 |
| `missing` | number | 의도 근거 대비 구현 누락 항목 수 |
| `intent_gaps` | number | 의도 근거가 없는 AC(`[INTENT-GAP]`) 수 |
| `report_path` | string | intent-fidelity 리포트 경로 (`reviews/RV-NNN/review-intent-fidelity.md`) |

### review_summary 객체

현재 진행 중인 review 상태를 담습니다.

| 필드 | 설명 |
|------|------|
| `iteration` | 현재(마지막) 회차 번호. |
| `status` | 현재 상태: `reviewing` \| `gap_fixing` \| `passed` \| `limit_reached` \| `pass_a_failed` |

**status 규칙**:
- `reviewing`: Step 1~4 진행 중.
- `gap_fixing`: 갭 발견, 태스크 추가됨 (Phase 2 재실행 대기).
- `passed`: 갭 없음, 리뷰 통과.
- `limit_reached`: `--auto` 모드에서 `max_iterations` 초과 + 갭 있음.
- `pass_a_failed`: Pass A MUST AC 실패로 인해 재작업이 필요한 상태. approve가 이 상태를 수신하면 해당 태스크를 re-outsource 트리거.

### review.json

`reviews/RV-NNN/review.json` 구조:

```json
{
  "id": "RV-NNN",
  "req_id": "REQ-NNN",
  "iteration": N,
  "status": "passed | gap_found | reviewing | pass_a_failed",
  "created_at": "<ISO8601>",
  "gaps_found": 0,
  "tasks_created": [],
  "gap_source": "ac_gap | code_review_issues | intent_fidelity | null",
  "review_issues_summary": {
    "critical": 0,
    "major": 0,
    "minor": 0,
    "auto_fixed": [],
    "skipped": []
  }
}
```

### review_issues_summary 스키마

Step 5(b) 등급별 분류 결과를 기록합니다. `review.json`과 `request.json`의 해당 `review_iterations` 항목 양쪽에 동일 구조로 기록됩니다.

```json
{
  "review_issues_summary": {
    "critical": 2,
    "major": 1,
    "minor": 3,
    "auto_fixed": [
      { "severity": "CRITICAL", "description": "SQL injection 취약점", "task_id": "05" },
      { "severity": "MAJOR", "description": "에러 핸들링 누락", "task_id": "06" }
    ],
    "skipped": [
      { "severity": "MINOR", "description": "변수명 컨벤션 불일치" },
      { "severity": "MINOR", "description": "주석 누락" }
    ]
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `critical` | number | CRITICAL 등급 이슈 수 (보안 오버라이드 승격 반영 후). |
| `major` | number | MAJOR 등급 이슈 수. |
| `minor` | number | MINOR 등급 이슈 수. |
| `auto_fixed` | array | 자동 태스크 생성되어 재외주된 이슈 목록. 각 항목: `{ "severity": string, "description": string, "task_id": string }`. |
| `skipped` | array | 스킵 처리된 이슈 목록 (threshold 이하 MINOR 또는 `--auto` 모드 MINOR). 각 항목: `{ "severity": string, "description": string }`. |

### gap_source 필드

`review.json`의 `gap_source`는 갭 발생 원인을 구분합니다.

| 값 | 의미 |
|------|------|
| `"ac_gap"` | AC 미충족으로 인한 갭 (Step 5 (c)/(d) 분기). |
| `"code_review_issues"` | 코드리뷰 이슈로 인한 갭 (Step 5 (b) 분기). |
| `"intent_fidelity"` | blocking 모드 intent-fidelity 실패로 인한 갭 (Step 6 공통 규칙). |
| `null` | 갭 없음 (`status: "passed"`일 때). |

### approve → review_issues_summary 데이터 전달 경로

approve SKILL.md Phase 3 결과 처리 시 최신 `reviews/RV-NNN/review.json`을 Read하여 `review_issues_summary`를 참조합니다. approve는 이 데이터를 통해 CRITICAL/MAJOR/MINOR 카운트 및 auto_fixed/skipped 내역을 확인하고, 등급별 후속 분기(재외주/PM 직접 수정/스킵)를 결정합니다.
