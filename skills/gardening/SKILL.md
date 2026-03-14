---
name: gardening
description: ".gran-maestro/ 내 stale 상태의 plan, request, intent를 자동 스캔하여 리포트를 출력합니다. 사용자가 '가드닝', 'stale 점검', '건강 체크'를 말하거나 /mst:gardening을 호출할 때 사용."
user-invocable: true
argument-hint: "[--dry-run]"
---

# maestro:gardening

`.gran-maestro/` 디렉토리 내 stale 상태의 plan, request, intent를 자동 스캔하여 리포트를 출력합니다. 리포트만 출력하며 자동 삭제나 아카이브는 수행하지 않습니다.

## stale 판정 기준

| 대상 | 조건 |
|------|------|
| **Plan** (PLN-*) | `plan.json`의 `status`=`active` **AND** `created_at`이 90일 이상 경과 **AND** (`linked_requests`가 빈 배열이거나, 모든 linked REQ의 status가 `done`/`completed`/`cancelled`) |
| **Request** (REQ-*) | `request.json`의 `status`가 활성 상태(`done`/`completed`/`cancelled`가 **아닌** 모든 상태) **AND** `created_at`이 90일 이상 경과 |
| **Intent** (INTENT-*) | `status`=`active` **AND** `created_at`이 90일 이상 경과 **AND** (`linked_req`가 없거나(`null`/`""`), linked_req의 REQ status가 `done`/`completed`/`cancelled`) |

> **90일 기준**: 현재 날짜 - `created_at` >= 90일

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

### 인자 없음 또는 `--dry-run`: Stale 리포트 출력

두 호출 모두 동일한 리포트를 출력합니다. 변경 작업은 수행하지 않습니다.

#### Step 1: Plans 스캔

[MST skill=gardening step=1/4 return_to=null]

1. `{PROJECT_ROOT}/.gran-maestro/plans/` 디렉토리 존재 확인
2. `PLN-*/plan.json` 파일을 순회하며 읽기
3. 각 plan에 대해 stale 판정:
   - `plan.json`의 `status` === `active` 확인
   - `created_at`이 현재 날짜 기준 90일 이상 경과 확인
   - `linked_requests` 배열 확인:
     - 빈 배열(`[]`)이면 stale 후보
     - 배열이 있으면 각 REQ ID로 `{PROJECT_ROOT}/.gran-maestro/requests/{REQ_ID}/request.json` 읽기
     - 모든 linked REQ의 status가 `done`/`completed`/`cancelled`이면 stale 후보
     - 하나라도 활성 상태(`done`/`completed`/`cancelled`가 아닌)이면 stale 아님
4. stale 항목 수집: PLN ID, title, created_at, 경과일

#### Step 2: Requests 스캔

[MST skill=gardening step=2/4 return_to=null]

1. `{PROJECT_ROOT}/.gran-maestro/requests/` 디렉토리 존재 확인
2. `REQ-*/request.json` 파일을 순회하며 읽기
3. 각 request에 대해 stale 판정:
   - `request.json`의 `status`가 `done`/`completed`/`cancelled`가 **아닌** 활성 상태 확인
   - `created_at`이 현재 날짜 기준 90일 이상 경과 확인
   - 두 조건 모두 충족 시 stale
4. stale 항목 수집: REQ ID, title, status, created_at, 경과일

#### Step 3: Intents 스캔

[MST skill=gardening step=3/4 return_to=null]

1. `python3 {PLUGIN_ROOT}/scripts/mst.py intent list --json` 실행
2. 명령 실패 시 경고 출력 후 intent 섹션 스킵
3. 각 intent에 대해 stale 판정:
   - `status` === `active` 확인
   - `created_at`이 현재 날짜 기준 90일 이상 경과 확인
   - `linked_req` 확인:
     - `null`, `""`, 또는 필드 없음이면 stale 후보
     - 값이 있으면 `{PROJECT_ROOT}/.gran-maestro/requests/{linked_req}/request.json` 읽기
     - linked REQ의 status가 `done`/`completed`/`cancelled`이면 stale 후보
     - linked REQ가 활성 상태이면 stale 아님
4. stale 항목 수집: INTENT ID, feature, created_at, 경과일

#### Step 4: 리포트 출력

[MST skill=gardening step=4/4 return_to=null]

**stale 항목이 있는 경우:**

```
Gran Maestro -- Gardening Report
=======================================

[Plans] 2개 stale 항목
  PLN-028: 검색 기능 개선 (생성: 2025-11-15, 121일 경과)
    linked_requests: [] (없음)
  PLN-054: 캐시 레이어 도입 (생성: 2025-12-01, 105일 경과)
    linked_requests: [REQ-087(done), REQ-088(completed)]

[Requests] 1개 stale 항목
  REQ-212: OAuth 연동 (상태: phase1_analysis, 생성: 2025-10-20, 147일 경과)

[Intents] 1개 stale 항목
  INTENT-005: 알림 기능 (생성: 2025-09-10, 187일 경과)
    linked_req: 없음

=======================================
총 4개 stale 항목 발견

정리가 필요합니다:
  Plans/Requests -> /mst:archive --run 또는 /mst:cleanup --run
  Intents -> /mst:intent delete INTENT-NNN
```

**stale 항목이 없는 경우:**

```
Gran Maestro -- Gardening Report
=======================================

[Plans] stale 항목 없음
[Requests] stale 항목 없음
[Intents] stale 항목 없음

=======================================
stale 항목이 없습니다. 프로젝트가 건강합니다.
```

## 스킬 실행 마커 (MANDATORY)

- 모든 응답의 첫 줄 또는 각 Step 시작 줄에 아래 마커를 출력한다.
- 기본 마커 포맷: `[MST skill={name} step={N}/{M} return_to={parent_skill/step | null}]`
- 필드 규칙:
  - `skill`: 현재 실행 중인 스킬 이름
  - `step`: 현재 단계(`N/M`) 또는 서브스킬 종료 시 `done`
  - `return_to`: 최상위 스킬이면 `null`, 서브스킬이면 `{parent_skill}/{step_number}`
- 서브스킬 종료 마커: `[MST skill={subskill} step=done return_to={parent/step}]`
- C/D 분리 마커 규칙을 추가로 사용하지 않는다. 반드시 단일 MST 마커만 사용한다.
- 예시:
  - `[MST skill=gardening step=1/4 return_to=null]`
  - `[MST skill=gardening step=4/4 return_to=null]`

## 에러 처리

| 상황 | 대응 |
|------|------|
| `.gran-maestro/` 디렉토리 없음 | "Maestro가 초기화되지 않았습니다. `/mst:on`으로 시작하세요." 출력 후 종료 |
| `.gran-maestro/plans/` 디렉토리 없음 | Plans 섹션에 "plans 디렉토리가 없습니다 (스킵)" 표시, 다음 섹션 계속 |
| `.gran-maestro/requests/` 디렉토리 없음 | Requests 섹션에 "requests 디렉토리가 없습니다 (스킵)" 표시, 다음 섹션 계속 |
| `plan.json` / `request.json` JSON 파싱 실패 | 해당 항목 건너뛰고 경고 표시: "[경고] {파일경로} 파싱 실패 (스킵)" |
| `intent list --json` 명령 실패 | Intents 섹션에 "intent 조회 실패 (스킵)" 표시, 리포트 계속 |
| `linked_requests`의 REQ 디렉토리/파일 없음 | 해당 REQ를 비활성(done)으로 간주 (존재하지 않는 REQ는 완료된 것으로 취급) |

## 예시

```
/mst:gardening              # stale 리포트 출력
/mst:gardening --dry-run    # 동일 리포트 출력 (명시적 모의 실행)
```

## 문제 해결

- "stale 항목이 없습니다" -> 모든 plan/request/intent가 건강한 상태이거나, 90일 미만
- "plans 디렉토리가 없습니다" -> `.gran-maestro/plans/`가 존재하지 않음 (정상 가능)
- "intent 조회 실패" -> `python3 {PLUGIN_ROOT}/scripts/mst.py` 스크립트 경로 또는 의존성 확인
- 정리 실행 -> 이 스킬은 리포트만 출력, 실제 정리는 `/mst:cleanup --run` 또는 `/mst:archive --run` 사용
