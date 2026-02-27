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

**공통:** Step 2 분석 후 자동 ideation/discussion 판단 필요 시 Step 2.5 실행

### Step 2.5: PM 자동 판단 (해석 B)

아래 조건 해당 시 첫 질문 전에 PM이 먼저 실행:
- **ideation**: 접근법 2개 이상+트레이드오프 모호, 기술 스택/아키텍처 선택, PM 확신 낮음
- **discussion**: 복잡한 트레이드오프+팀 합의 필요, 기술/비즈니스 리스크 큰 결정

트리거 시: "[이유]로 [ideation/discussion] 먼저 실행" 통지 → `Skill(skill: "mst:ideation/discussion", args: "{주제}")` → 핵심 3~5개 요약 → `AskUserQuestion` 문맥으로 선반영

동일 세션/주제/타입 완료 이력 있으면 새 세션 생성 없이 기존 결과 재사용 (동일 형식으로 재질문).

### Step 3: 반복 대화

- 사용자 답변 반영해 PM이 추가 질문 필요성 자율 판단, 핵심 결정 사항 명확해질 때까지 반복
- 모든 질문은 `AskUserQuestion`으로 **동시 1개만**; 총 선택지 최대 6개 (핵심 4개 이하 권장)
- 고정 보조 선택지(항상 포함): "다각도 의견 모으기 (ideation)", "팀 토론으로 합의 찾기 (discussion)"

#### Step 3.2: 사용자 선택 기반 재질문 흐름

고정 선택지 선택 시 현재 주제로 해당 스킬 실행:
- `Skill(skill: "mst:ideation/discussion", args: "{현재 질문 주제} --focus {관련 분야}")`
- 동일 세션/주제/타입 이력 있으면 재사용 (재실행 방지)
- 완료 후 `synthesis.md`/`consensus.md` Read → 핵심 3~5개를 `[AI 팀 의견 요약]`으로 표시 → 원 질문 동일 포맷으로 재제시

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

### Step 4: plan.md 초안 제시 & 사용자 승인

1. 대화 내용 반영한 plan 초안 텍스트 제시 (**파일은 아직 작성하지 않음**)
   - `debug_context` 활성 시 `## 디버그 조사 연계` 섹션 자동 포함 (참조 세션/근본 원인 기록)
2. `AskUserQuestion`으로 선택지 제시:
   - **"저장하고 /mst:request 실행"**: plan.md 저장 후 mst:request 호출 (직접 구현 아님 — REQ 생성+spec.md 작성으로 이동)
   - **"수정 후 진행"**: 수정 내용 입력 후 Step 4 반복
   - **"저장만 하기"**: plan.md만 저장, mst:request는 수동 실행
3. 저장 선택 시 `plans/PLN-NNN/plan.md` 작성; `debug_context` 활성 시 `plan.json`에 `"linked_debug"` 추가
4. **"저장하고 /mst:request 실행" 시**: ⚠️ **plan.md 디스크 기록 확인 후에만** `Skill(skill: "mst:request", args: "--plan PLN-NNN {주제}")` 단 1회 호출 (미저장 상태 호출 절대 금지); `## 분리 실행` 섹션 있으면 mst:request가 다중 REQ 자동 생성
   - ⚠️ **spec.md 작성 완료 전 plan 스킬 종료 금지**

## 출력 형식

`templates/plan.md`를 기본 템플릿으로 사용하여 plan.md를 작성합니다.
