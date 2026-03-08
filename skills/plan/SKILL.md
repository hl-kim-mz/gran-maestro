---
name: plan
description: "요구사항 미결정 항목을 사용자와 대화(또는 -a 자율 모드)로 정제하고 실행 가능한 plan.md를 작성합니다. 모호함을 줄인 결정사항, 범위, 제약을 기록해 /mst:request로 바로 이어집니다."
user-invocable: true
argument-hint: "{플래닝 주제}"
---

# maestro:plan

사용자와 Q&A로 핵심 미결 항목을 정제하고 합의 후 `templates/plan.md` 형식의 plan.md를 생성합니다.

## ⚠️ 실행 제약 (CRITICAL — 항상 준수)

이 스킬 실행 중 **Write/Edit 도구를 사용할 수 있는 경로는 아래만 해당**합니다:

- `{PROJECT_ROOT}/.gran-maestro/plans/PLN-*/plan.md`
- `{PROJECT_ROOT}/.gran-maestro/plans/PLN-*/plan.json`
- `{PROJECT_ROOT}/.gran-maestro/plans/PLN-*/auto-decisions.md` (자율 모드 결정 로그용)
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

### Step 0.1: 자율 모드 감지

1. args 전체 토큰에서 `-a` 또는 `--auto` 존재 여부를 검사:
   - 하나라도 존재하면 `AUTO_MODE=true` (args 어느 위치든 허용)
   - 없으면 `AUTO_MODE=false`
2. `AUTO_MODE=false`인 경우 config를 읽어 `config.auto_mode.plan` 확인:
   - `Read({PROJECT_ROOT}/.gran-maestro/config.resolved.json)` 우선
   - 키가 없으면 `Read(templates/defaults/config.json)` fallback
   - `config.auto_mode.plan == true`면 `AUTO_MODE=true`
3. `config.auto_mode.confidence_threshold`를 읽어 `CONFIDENCE_THRESHOLD`에 저장:
   - 미설정 시 기본값 `0.7`
   - CLI 플래그(`-a`/`--auto`)가 config보다 우선한다
4. `AUTO_MODE=true`이면 아래 초기값을 메모리에 보관:
   - `AUTO_DECISION_TOTAL=0`
   - `AUTO_PM_COUNT=0`
   - `AUTO_DISCUSSION_COUNT=0`
   - `AUTO_EXPLORE_DISCUSSION_COUNT=0`
   - `[자율 모드 활성화] confidence threshold: {CONFIDENCE_THRESHOLD}` 출력

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

5. `AUTO_MODE=true`이면 `{PROJECT_ROOT}/.gran-maestro/plans/PLN-NNN/auto-decisions.md`를 즉시 초기화:

   ```markdown
   # 자율 결정 로그 — PLN-NNN

   > 자율 모드(-a)로 실행됨. 아래 항목들이 PM에 의해 자율 결정되었습니다.

   | 항목 | 결정값 | Confidence | 판단 방식 |
   |------|--------|-----------|-----------|
   ```

### Step 2: 초기 분석 & 첫 미결 항목 처리

**`debug_context` 활성 시:** 근본 원인+수정 제안을 초기 컨텍스트로 선반영 → `[디버그 조사 결과 요약]` 블록 표시(근본 원인/수정 제안 P0~/영향 파일) → 구현 범위·우선순위·분리 실행 여부를 핵심 미결 항목으로 정리

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

**실행 분기:**

- `AUTO_MODE=false`:
  - PM이 요청의 명확도를 평가한다:
    - **의도가 단순·명확한 경우** (범위·우선순위·방향이 모두 자명, 미결 항목 없음):
      → **Fast-track**: `AskUserQuestion` 없이 PM이 결정사항을 정리하여 Step 4로 직행.
      단, plan.md에는 결정사항·범위·인수 기준을 명시해야 한다 (step 4 생략 불가).
    - **미결 항목이 있는 경우**: **최소 1회 `AskUserQuestion`** 후 Step 4로 진행
- `AUTO_MODE=true`: Step 2~3에서 `AskUserQuestion` 호출 금지. Step 2에서 우선순위가 가장 높은 미결 항목 1건을 먼저 처리한 뒤 Step 3 반복으로 이어간다

#### [AUTO_MODE 판단 패턴] (Step 2~3, Step 3.8 공통)

`AUTO_MODE=true`일 때 각 미결 항목을 아래 순서로 처리:
1. PM이 해당 항목의 confidence score(0.0~1.0)를 자체 산정
2. `confidence >= CONFIDENCE_THRESHOLD`:
   - PM 자율 결정 수행
   - `auto-decisions.md`에 즉시 행 추가:
     - `| {항목명} | {결정값} | {confidence:.2f} | PM 자율 판단 |`
   - 카운터 업데이트: `AUTO_DECISION_TOTAL++`, `AUTO_PM_COUNT++`
3. `CONFIDENCE_THRESHOLD > confidence >= 0.4`:
   - `Skill(skill: "mst:discussion", args: "{현재 미결 항목} --from-plan --auto")`
   - `consensus.md` 핵심 3~5개 추출 후 결정에 반영
   - `auto-decisions.md`에 즉시 행 추가:
     - `| {항목명} | {결정값} | {confidence:.2f} | discussion 결과 |`
   - 카운터 업데이트: `AUTO_DECISION_TOTAL++`, `AUTO_DISCUSSION_COUNT++`
4. `confidence < 0.4`:
   - `WebSearch(query: "{관련 업계 표준/유사 사례 검색어}")` 선행 (필요 시 복수 실행)
   - 검색 결과 반영 후 confidence 재산정
   - 재산정 confidence `>= 0.4`이면 discussion 실행 후 반영
   - 재산정 confidence `< 0.4`이면 PM이 **가장 안전한 선택**으로 자율 결정
   - `auto-decisions.md`에 즉시 행 추가:
     - `| {항목명} | {결정값} | {confidence:.2f} | web-search→discussion 결과 |`
   - 카운터 업데이트: `AUTO_DECISION_TOTAL++`, `AUTO_EXPLORE_DISCUSSION_COUNT++`
5. 로그 기록은 plan.md 저장 시 일괄 처리하지 않고, **각 항목 결정 직후 Edit로 즉시 append**한다

**공통:** Step 2 분석 후 자동 ideation/discussion 판단 필요 시 Step 2.5 실행

### Step 2.5: PM 자동 판단 (해석 B)

> ⚠️ **기술 스택·아키텍처·코드 수준 접근법 결정은 plan 단계에서 수행하지 않습니다.**
> 코드베이스 탐색이 필요한 기술적 결정은 /mst:request 단계에서 코드 탐색 결과를 바탕으로 수행됩니다.
> plan에서 다루는 결정은 **비즈니스 방향·사용자 경험·범위·우선순위** 수준에 한정합니다.

아래 조건 해당 시 첫 질문 전에 PM이 먼저 실행:
- **ideation**: 접근법 2개 이상+트레이드오프 모호, 사용자 경험/비즈니스 방향 결정, PM 확신 낮음
- **discussion**: 복잡한 트레이드오프+팀 합의 필요, 비즈니스 리스크 큰 결정

트리거 시: "[이유]로 [ideation/discussion] 먼저 실행" 통지 → `Skill(skill: "mst:ideation/discussion", args: "{주제}")` → 핵심 3~5개 요약 → 후속 결정 문맥으로 선반영 (`AUTO_MODE=false`면 질문, `AUTO_MODE=true`면 자율 판단 패턴)

동일 세션/주제/타입 완료 이력 있으면 새 세션 생성 없이 기존 결과 재사용 (동일 형식으로 재질문).

### Step 3: 반복 정제

- `AUTO_MODE=false`: 사용자 답변 반영해 PM이 추가 질문 필요성 자율 판단, 핵심 결정 사항이 명확해질 때까지 반복
- `AUTO_MODE=true`: 사용자 질문 없이 PM이 미결 항목을 순차 처리하고, 각 항목마다 `[AUTO_MODE 판단 패턴]`을 적용해 결정/로그 기록을 완료할 때까지 반복
- `AUTO_MODE=false`에서만 모든 질문은 `AskUserQuestion`으로 **동시 1개만**; 총 선택지 최대 6개 (핵심 선택지 + 보조 선택지 합산)
- **보조 선택지 (`AUTO_MODE=false`, PM이 현재 질문 맥락에 맞는 것만 골라 포함)**:
  - `"다각도 의견 모으기 (ideation)"` — 접근법이 2개 이상이고 트레이드오프가 불명확할 때 추천
  - `"팀 토론으로 합의 찾기 (discussion)"` — 복잡한 비즈니스 결정으로 합의가 필요할 때 추천
  - `"웹으로 사례 검색하기 (web search)"` — 업계 표준·유사 사례·대안 솔루션 파악이 필요할 때 추천

  > PM 판단 기준: 질문의 성격상 해당 보조가 실질적으로 도움이 될 때만 포함. 불필요한 보조 선택지는 생략해 핵심 선택지에 여유를 확보. 최소 1개 이상 포함 권장.

#### Step 3.2: 사용자 선택 기반 재질문 흐름 (`AUTO_MODE=false`)

고정 선택지 선택 **또는 사용자가 텍스트로 직접 ideation/discussion/explore 요청** 시 현재 주제로 해당 스킬 실행:

> ⚠️ **직접 요청 감지**: 사용자가 "discussion 해줘", "ideation 돌려줘", "웹 검색해줘", "사례 찾아줘" 등 텍스트로 직접 요청한 경우에도 고정 선택지 선택과 동일하게 이 흐름을 따른다. 스킬 실행 후 반드시 Step 3으로 복귀해야 한다.
>
> `AUTO_MODE=true`에서는 본 절의 재질문 흐름 대신 `[AUTO_MODE 판단 패턴]`을 사용한다.

**ideation/discussion 선택 시:**
- `Skill(skill: "mst:ideation/discussion", args: "{현재 질문 주제} --focus {관련 분야}")`
- 동일 세션/주제/타입 이력 있으면 재사용 (재실행 방지)
- 완료 후 `synthesis.md`/`consensus.md` Read → 핵심 3~5개를 `[AI 팀 의견 요약]`으로 표시 → **반드시 Step 3으로 복귀하여** 원 질문 동일 포맷으로 재제시 (plan 흐름 종료 금지)

**웹 검색 선택 시:**
- `WebSearch(query: "{현재 질문과 관련된 업계 표준/유사 사례/대안 검색어}")` (필요 시 복수 실행)
- 검색 결과 핵심을 `[외부 리서치 결과]`로 요약 표시 → **반드시 Step 3으로 복귀하여** 원 질문 동일 포맷으로 재제시 (plan 흐름 종료 금지)

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

### Step 3.8: Strategic Review Pass (선택적)

> ℹ️ 이 단계는 코드베이스 탐색이 아닌 **전략적 의사결정 지원**에 초점을 맞춥니다.
> 기술 구현 수준의 검토는 /mst:request 단계의 Spec Pre-review Pass에서 수행됩니다.

#### 3.8.0: config 읽기 및 enabled 확인

Read({PROJECT_ROOT}/.gran-maestro/config.resolved.json) → plan_review 섹션 취득
plan_review 섹션이 없으면 → Read(templates/defaults/config.json) → plan_review 섹션으로 fallback
`enabled` 값을 메모리에 보관

- **enabled == false**: 이 단계 전체 skip → Step 4로 진행
- **enabled == true**: 아래 3.8.1부터 실행

#### 3.8.1: PM 내부 초안 작성

Q&A 대화 내용을 바탕으로 PM이 플랜 초안 텍스트를 작성한다 (디스크 미저장, 메모리 내).
이 초안은 Step 4에서 최종 제시될 내용의 초기 버전이다.

#### 3.8.2: 전략적 분석 수행

PM이 plan 초안을 바탕으로 아래 세 관점에서 직접 분석을 수행한다:

**관점 A — 의도 검증 (Intent Validation)**:
- 사용자가 요청한 것(what)과 실제로 필요한 것(why)의 갭 분석
- "X를 원한다고 했지만, 진짜 문제는 Y일 수 있다" 패턴 탐지
- 근본 문제(root problem)가 plan.md의 범위에서 해결되는지 확인

**관점 B — 외부 리서치 (Industry Research)**:
필요하다고 판단되는 항목에 한해 `WebSearch` 도구로 검색 (전체 실행 강제 아님):
- 업계 표준·권장 패턴: `WebSearch(query: "{plan 주제} best practices")`
- 대안 솔루션: `WebSearch(query: "{plan 주제} alternatives comparison")`
- 흔한 함정: `WebSearch(query: "{plan 주제} common pitfalls problems")`

**관점 C — 범위 위험 감지 (Scope Risk Detection)**:
- 범위 크립(scope creep) 징후 탐지: 요구사항이 점진적으로 확장될 조짐
- "이 범위로 가면 나중에 Y 문제가 생길 수 있다" 전략적 경고
- plan 외부로 번지는 영향 범위 예측

#### 3.8.3: 이슈 분류 및 처리

PM이 분석 결과를 이슈로 분류:
- `CRITICAL:` 방향이 근본적으로 잘못됨 (의도 오해, 심각한 범위/전략 문제)
- `MAJOR:` 중요한 대안·리스크가 고려되지 않음
- `MINOR:` 참고할 만한 외부 사례·패턴
- `NO_ISSUES`: 전략적 문제 없음

이슈 처리:

**`AUTO_MODE=false`**:
- CRITICAL/MAJOR 이슈 존재 시: `AskUserQuestion`으로 이슈 제시 + 선택지:
  - 각 이슈를 해소하는 구체적 옵션
  - **"반영 없이 진행"**: 이슈를 무시하고 Step 4로 바로 이동
  - **보조 선택지를 PM 판단으로 상황에 맞게 포함** (ideation / discussion 중 적합한 것 — Step 3 참조)
  - 사용자 답변 반영하여 PM 초안 재정제
- MINOR 이슈만: PM이 자체 판단으로 plan 초안에 참고 메모로 반영 → Step 4 진행
- NO_ISSUES: 바로 Step 4 진행

**`AUTO_MODE=true`**:
- 모든 이슈를 `[AUTO_MODE 판단 패턴]`으로 처리
- 각 결정은 즉시 `auto-decisions.md`에 기록하고 PM 초안에 반영
- NO_ISSUES: 바로 Step 4 진행

Step 4 진입 시 초안은 전략적 검토가 반영된 정제 버전이다.

### Step 4: plan.md 초안 제시, 저장, 요청 연계

#### UI 감지 (Step 4 진입 시)

plan 주제, 요청 텍스트, 결정사항 섹션을 대상으로 아래 두 가지 방식 중 하나라도 해당하면 UI로 판단한다:

**1. 키워드 매칭**: 아래 단어가 포함된 경우
`화면`, `UI`, `페이지`, `대시보드`, `컴포넌트`, `레이아웃`, `프론트엔드`, `디자인`, `화면 설계`, `목업`, `시안`

**2. 의미 판단 (LLM)**: 키워드 없어도 plan 내용상 새 화면/UI 흐름 생성이 필요하다고 판단되는 경우
- 예: "로그인 흐름 구성", "어드민 메뉴 신설", "결제 단계 추가", "온보딩 프로세스 설계" 등
- 판단 기준: 사용자가 새로운 화면이나 UI 흐름을 만들어야 하는 상황인가?

- **감지됨 + `AUTO_MODE=false`** → AskUserQuestion 선택지에 4번째 옵션 "스티치로 디자인 시안 보기" 추가
- **감지됨 + `AUTO_MODE=true`** → AskUserQuestion 없이 PM이 `mst:stitch`를 자동 호출해 시안을 초안에 반영
- **미감지** → Stitch 단계 없이 진행

1. 대화 내용 반영한 plan 초안 텍스트 제시 (**파일은 아직 작성하지 않음**)
   - **`## 인수 기준 초안` 섹션을 반드시 포함한다**: "이 plan이 완료됐다는 것은:" 프리픽스로 시작하는 불릿 리스트 형식으로 작성한다.
     - 내용은 구현 방법(코드/기술 상세)이 아닌 **관찰 가능한 결과/동작** 중심으로 기술한다.
     - 예시: `이 plan의 구현이 완료됐다는 것은:\n- 사용자가 X 화면에서 Y 버튼을 누르면 Z 결과가 표시된다\n- PM이 직접 브라우저에서 확인 가능한 동작이 존재한다`
     - 이 섹션은 `mst:request --plan PLN-NNN` 실행 시 spec.md의 AC(Given-When-Then) 초안으로 자동 변환된다. 비어있어도 저장은 허용하나 가능한 한 채워서 작성한다.
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
2. 저장 액션 결정:
   - `AUTO_MODE=false`: `AskUserQuestion`으로 선택지 제시
     - **"저장하고 /mst:request 실행"**: plan.md 저장 후 mst:request 호출 (직접 구현 아님 — REQ 생성+spec.md 작성으로 이동)
     - **"수정 후 진행"**: 수정 내용 입력 후 Step 4 반복
     - **"저장만 하기"**: plan.md만 저장, mst:request는 수동 실행
       → 저장 완료 후 출력: `{PLN-NNN}으로 저장됨. /mst:request --plan {PLN-NNN}으로 구현 사양(spec.md)을 작성하세요.` (**절대 /mst:approve를 안내하지 않음**)
     - **"스티치로 디자인 시안 보기"** *(UI 키워드 감지 시에만 표시)*: Stitch로 디자인 시안을 생성하고 plan에 통합
   - `AUTO_MODE=true`: `AskUserQuestion` 없이 **"저장하고 /mst:request 실행"** 경로를 기본값으로 즉시 진행
3. 저장 선택 시 `plans/PLN-NNN/plan.md` 작성; `debug_context` 활성 시 `plan.json`에 `"linked_debug"` 추가
   - `capture_context` 활성 시 **plan.md 저장 시점에 일괄 처리 (atomic)**:
     - 참조된 각 캡처의 `{PROJECT_ROOT}/.gran-maestro/captures/CAP-NNN/capture.json`을 Edit:
       - `status` → `"consumed"`
       - `consumed_at` → 현재 시각 (mst.py timestamp now 또는 fallback)
       - `linked_plan` → `"PLN-NNN"` (생성된 plan ID)
     - 세 필드를 동일 시점(plan.md 저장)에 일괄 업데이트
     - `plan.json`에 `"linked_captures": ["CAP-001", "CAP-003"]` 추가
4. **"저장하고 /mst:request 실행" 경로**: ⚠️ **plan.md 디스크 기록 확인 후에만** 단 1회 호출 (미저장 상태 호출 절대 금지)
   - `AUTO_MODE=true`: `Skill(skill: "mst:request", args: "--plan PLN-NNN -a {주제}")`
   - `AUTO_MODE=false`: `Skill(skill: "mst:request", args: "--plan PLN-NNN {주제}")`
   - `## 분리 실행` 섹션이 있으면 mst:request가 다중 REQ 자동 생성
   - ⚠️ **spec.md 작성 완료 전 plan 스킬 종료 금지**
5. Stitch 연계 (`AUTO_MODE=false`에서 선택했거나, `AUTO_MODE=true`에서 UI 감지된 경우):
   1. `Skill(skill: "mst:stitch", args: "--pln PLN-NNN --multi {plan 주제}")` 호출
      - ⚠️ `mcp__stitch__*` 도구 직접 호출 절대 금지 — 반드시 위 Skill 도구 경유
   2. 호출 완료 후 생성된 Stitch 프로젝트/화면 정보를 plan 초안에 `## 디자인 시안` 섹션으로 추가:
      - DES-NNN ID + 프로젝트 URL
      - 각 화면: 화면명 + Stitch URL + **html_file 경로** (`{PROJECT_ROOT}/.gran-maestro/designs/DES-NNN/screen-NNN.html`)
      - html_file이 null(미추출)인 경우 해당 행 생략
      - plan.md는 여전히 디스크에 저장되지 않은 초안 상태를 유지
   3. `AUTO_MODE=false`면 Step 4 재표시 (저장/수정 선택 가능), `AUTO_MODE=true`면 저장 경로로 계속 진행
6. `AUTO_MODE=true`이고 plan.md 저장 완료 후 아래 요약을 반드시 출력:

   ```text
   [자율 실행 완료]
   PLN-NNN 플랜이 자율 모드로 완성되었습니다.
   - 총 자율 결정: {AUTO_DECISION_TOTAL}건
   - PM 자율 판단: {AUTO_PM_COUNT}건
   - discussion 사용: {AUTO_DISCUSSION_COUNT}건
   - web-search→discussion 사용: {AUTO_EXPLORE_DISCUSSION_COUNT}건

   자세한 결정 내역: .gran-maestro/plans/PLN-NNN/auto-decisions.md
   ```

## 출력 형식

`templates/plan.md`를 기본 템플릿으로 사용하여 plan.md를 작성합니다.
