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
   - `review_iterations` 배열에 `{ "rv_id": "RV-NNN", "created_at": "<ISO8601>", "status": "completed" }` 항목 추가 (status는 Step 5 완료 후 갱신).
   - `review_summary` = `{ "iteration": N, "status": "reviewing" }` 업데이트.

### Step 2: 컨텍스트 로드

1. **AC 목록 수집**: 모든 `tasks/NN/spec.md` Read → `## 3. 수락 조건` 섹션에서 AC 항목 추출.
2. **변경 파일 목록 수집**: `git log --name-only` 또는 `git diff <base>..HEAD --name-only` 기반으로 REQ 관련 변경 파일 목록 작성.
3. **AC별 파일 매핑 준비**: 각 AC 항목과 관련 변경 파일 연결.
4. **config 로드**: `config.resolved.json`에서 아래 값을 확인.
   - `review.roles.*` 에이전트 키
   - `review.max_iterations` 키 경로: `config.review.max_iterations` (미정의 시 기본값 3 사용)
   - `auto_mode.review` 키 경로: `config.auto_mode.review` (true이면 `AUTO_MODE=true`, `--auto` 플래그와 동일 동작)
   - `auto_mode.max_review_iterations` 키 경로: `config.auto_mode.max_review_iterations`
     - `AUTO_MODE=true` 이고 값이 설정되어 있으며 `> 0`이면 `max_iterations`를 이 값으로 override
     - `0` 이하이면 무시하고 `config.review.max_iterations` 값을 사용
   - 우선순위:
     - `AUTO_MODE`: CLI `--auto` 플래그 > `config.auto_mode.review` > 기본값(false)
     - `max_iterations`: (`AUTO_MODE=true`일 때) `config.auto_mode.max_review_iterations` > `config.review.max_iterations` > 기본값(3)
   - 이후 문서의 "**`--auto` 모드**" 분기는 `AUTO_MODE=true`일 때 동일하게 적용.

### Step 3: 병렬 실행 시작

Claude(인컨텍스트)와 background 에이전트 3개를 동시 시작합니다.

```
Claude (인컨텍스트):   spec §3 AC 체크리스트 순차 검증  ─┐
code-reviewer (bg):   구현 레벨 리뷰                  ─┤─→ Step 4에서 PM 취합 → review-report.md
arch-reviewer (bg):   설계/계획 레벨 리뷰              ─┤
ui-reviewer (bg):     UI 설계 검토 (조건부)            ─┘
```

#### Claude 인컨텍스트: AC 검증

- 각 AC 항목별로 관련 코드/설정 파일 Read.
- PASS / FAIL / UNKNOWN 판정 후 근거 기록.
- 결과를 `reviews/RV-NNN/ac-results.md`에 저장.
  ```markdown
  # AC 검증 결과 — RV-NNN

  | AC | 판정 | 근거 |
  |----|------|------|
  | AC-1 | ✅ PASS | ... |
  | AC-2 | ❌ FAIL | ... |
  ```

#### Background 에이전트 dispatch

background 에이전트는 `run_in_background: true` 옵션으로 dispatch합니다 (approve SKILL.md Step 4d 완료 감지 패턴 동일 적용).

| 역할 키 | 검토 관점 | config 키 | 모델 resolve |
|---------|-----------|-----------|-------------|
| `code_reviewer` | 누락 로직, 버그, 엣지케이스, 테스트 누락 | `review.roles.code_reviewer.agent` | `providers[agent][review.roles.code_reviewer.tier \|\| default_tier]`로 resolve |
| `arch_reviewer` | spec 의도 vs 구현 방향 차이, 통합 일관성 | `review.roles.arch_reviewer.agent` | `providers[agent][review.roles.arch_reviewer.tier \|\| default_tier]`로 resolve |
| `ui_reviewer` | Stitch 시안 vs 실제 UI, UX 흐름 일관성 | `review.roles.ui_reviewer.agent` | `providers[agent][review.roles.ui_reviewer.tier \|\| default_tier]`로 resolve |

각 리뷰어(code_reviewer, arch_reviewer, ui_reviewer)는 발견한 이슈에 반드시 `[CRITICAL]`, `[MAJOR]`, `[MINOR]` 등급을 태깅해야 한다 (`templates/review-request.md`의 등급 판별 가이드 및 보안 오버라이드 규칙 적용).

각 에이전트 프롬프트에 출력 파일 경로를 명시하여 전달합니다:
- code_reviewer → `reviews/RV-NNN/review-code.md`
- arch_reviewer → `reviews/RV-NNN/review-arch.md`
- ui_reviewer → `reviews/RV-NNN/review-ui.md`

**ui_reviewer 스킵 조건**: `request.json.stitch_screens` 배열이 비어있고 `frontend/` 디렉토리 변경 파일이 없으면 auto-skip. 취합 시 "UI 리뷰 skip (변경 없음)" 표시.

### Step 4: 완료 대기 및 취합

1. **완료 폴링**: background 에이전트 3개(또는 skip된 에이전트 제외) 완료 대기. approve SKILL.md Step 4d 완료 감지 패턴 동일 적용.
   - 에이전트 실패 시: 해당 역할 리뷰 "에이전트 실패" 표시 후 나머지 취합 계속 진행.
2. **취합 파일**: `ac-results.md` + `review-code.md` + `review-arch.md` + `review-ui.md` (skip 시 미생성).
3. **review-report.md 작성**: `reviews/RV-NNN/review-report.md`
   ```markdown
   # 리뷰 리포트 — RV-NNN (REQ-NNN 반복 N)

   ## AC 검증 결과
   - ✅ 충족 AC N개
   - ❌ 미충족/갭 N개
     - AC-X: <설명>

   ## 코드 리뷰 주요 발견 사항
   <review-code.md 핵심 항목>

   ## 아키텍처 리뷰 주요 발견 사항
   <review-arch.md 핵심 항목>

   ## UI 리뷰 주요 발견 사항
   <review-ui.md 핵심 항목 또는 "UI 리뷰 skip (변경 없음)">
   ```

### Step 5: 갭 처리 분기

AC 미충족(갭) 여부와 코드리뷰 이슈 여부에 따라 4개 분기로 처리합니다.

#### (a) 갭 없음 + 코드리뷰 이슈 없음

- `review.json.status = "passed"`
- `request.json.review_summary = { "iteration": N, "status": "passed" }` 업데이트
- Phase 3 PASS 반환 → approve 루프에서 Phase 5(accept) 진행.

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
- Phase 3 PASS 반환 → approve 루프에서 Phase 5(accept) 진행.

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
4. `review.json` 업데이트: `{ "status": "gap_found", "gaps_found": M, "tasks_created": ["NN", "NN+1", ...] }`.
5. approve 스킬에 갭 목록 + 새 태스크 ID 반환 → approve가 Phase 2 재실행 제어.

#### (d) 갭 있음 + iteration > max_iterations

- **`--auto` 모드**: `review.json.status = "limit_reached"`, `review_summary.status = "limit_reached"` 기록 후 종료.
- **일반 모드**: `AskUserQuestion` → 선택지:
  - `[추가 반복 허용 (+1회)]`: `max_iterations` 임시 +1 후 (c) 경로 실행.
  - `[현재 상태로 수락]`: Phase 5 진행. `review.json.status = "passed"` (강제 수락).
  - `[중단]`: 워크플로우 중단.

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
  }
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
| `status` | 항상 `"completed"` (회차 실행 완료 의미). 갭 여부는 `gaps_found > 0`으로 구분. |
| `review_issues_summary` | (선택) 등급별 코드리뷰 이슈 요약. 이슈가 존재하면 `review.json.review_issues_summary`와 동일 구조로 기록. |

### review_summary 객체

현재 진행 중인 review 상태를 담습니다.

| 필드 | 설명 |
|------|------|
| `iteration` | 현재(마지막) 회차 번호. |
| `status` | 현재 상태: `reviewing` \| `gap_fixing` \| `passed` \| `limit_reached` |

**status 규칙**:
- `reviewing`: Step 1~4 진행 중.
- `gap_fixing`: 갭 발견, 태스크 추가됨 (Phase 2 재실행 대기).
- `passed`: 갭 없음, 리뷰 통과.
- `limit_reached`: `--auto` 모드에서 `max_iterations` 초과 + 갭 있음.

### review.json

`reviews/RV-NNN/review.json` 구조:

```json
{
  "id": "RV-NNN",
  "req_id": "REQ-NNN",
  "iteration": N,
  "status": "passed | gap_found | reviewing",
  "created_at": "<ISO8601>",
  "gaps_found": 0,
  "tasks_created": [],
  "gap_source": "ac_gap | code_review_issues | null",
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
| `null` | 갭 없음 (`status: "passed"`일 때). |

### approve → review_issues_summary 데이터 전달 경로

approve SKILL.md Phase 3 결과 처리 시 최신 `reviews/RV-NNN/review.json`을 Read하여 `review_issues_summary`를 참조합니다. approve는 이 데이터를 통해 CRITICAL/MAJOR/MINOR 카운트 및 auto_fixed/skipped 내역을 확인하고, 등급별 후속 분기(재외주/PM 직접 수정/스킵)를 결정합니다.
