---
name: approve
description: "스펙을 승인하고 실행을 시작합니다. 사용자가 '승인', '진행해', 'OK 진행'을 말하거나 /mst:approve를 호출할 때 사용. Gran Maestro 워크플로우 내에서만 의미 있으며, 일반적인 확인 응답에는 사용하지 않음."
user-invocable: true
argument-hint: "[REQ-ID...] [--auto] [--stop-on-fail | --continue] [--parallel] [--priority <level>]"
---

# maestro:approve

PM이 작성한 구현 스펙을 승인하고 Phase 2 실행을 시작합니다. 단건/배치 승인 모두 지원. Phase 3 PASS 후 최종 수락은 `workflow.auto_accept_result` 설정에 따라 자동 실행.

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

### REQ ID 결정 (인자 파싱)

`$ARGUMENTS`를 파싱하여 승인 대상 REQ 리스트를 결정합니다. 아래 규칙을 위에서 아래로 순서대로 적용합니다.

#### 1. 명시적 단건 인자

`$ARGUMENTS`가 단일 REQ 패턴(`REQ-NNN`)이면 **단건 승인 프로토콜**을 직접 실행합니다. 배치 로직 미통과.

```
/mst:approve REQ-003   → [REQ-003] 단건
```

#### 2. 명시적 다건 인자

`$ARGUMENTS`에 공백 구분 REQ 패턴이 2개 이상이면 **토글 UI 없이** 직접 배치 실행합니다.

```
/mst:approve REQ-001 REQ-003 REQ-005   → [REQ-001, REQ-003, REQ-005]
```

#### 3. 콤마 구분 및 범위 지정

콤마(`,`)나 범위(`..`) 포함 인자를 파싱합니다.

```
/mst:approve REQ-001,REQ-003,REQ-005     → [REQ-001, REQ-003, REQ-005]
/mst:approve REQ-001..005                 → [REQ-001, REQ-002, REQ-003, REQ-004, REQ-005]
/mst:approve REQ-001..003,REQ-007        → [REQ-001, REQ-002, REQ-003, REQ-007]
```

범위 지정 시 **승인 가능 상태인 REQ만** 결과 리스트에 포함. 승인 불가 REQ는 무시.

#### 4. `--priority` 필터링

`--priority <level>` 플래그가 있으면 해당 우선순위의 승인 가능 REQ만 필터링합니다.

```
/mst:approve --priority high   → 승인 가능 REQ 중 priority == "high"인 것만
```

`request.json`의 `priority` 필드 기준. 필드 없는 REQ는 `normal`로 취급. `--priority`와 REQ 패턴/범위를 조합 가능.

#### 5. 인자 없이 호출 — 조건부 분기

`$ARGUMENTS`에 REQ 패턴이 없고 플래그만 있거나 완전히 비어 있는 경우:

**스크립트 우선**: `python3 {PLUGIN_ROOT}/scripts/mst.py request filter --phase 1 --format json` 실행 후 `status`가 `phase1_analysis` 또는 `pending_dependency`가 아닌 것 필터링. 실패 시 fallback.

**Fallback:**
1. `{PROJECT_ROOT}/.gran-maestro/requests/` 디렉토리의 모든 `request.json` 스캔
2. 승인 가능 상태 필터링: `current_phase == 1` 이고 `status`가 `phase1_analysis` 또는 `pending_dependency`가 아닌 것 (PM 분석 완료 상태), 또는 `status`가 `phase2_spec_review`인 것
3. `--priority` 필터 있으면 추가 적용
4. REQ 번호 오름차순 정렬
5. 결과에 따라 분기:

| 승인 대기 REQ 수 | 환경 | 동작 |
|-----------------|------|------|
| 0개 | — | "승인 대기 중인 요청이 없습니다" 메시지 후 종료 |
| 1개 | — | **기존 단건 동작 그대로** (스펙 요약 → 승인 → Phase 2) |
| 2개+ | 대화형 (TTY) | **토글 선택 UI 진입** (아래 참조) |
| 2개+ | 비대화형 | **기존 동작 유지** (첫 번째 REQ 자동 선택, 단건 실행) |

#### 토글 선택 UI

승인 대기 REQ가 2개 이상이고 대화형(TTY) 환경일 때 대기 수에 따라 분기:

##### 2~4개인 경우 (기존 multiSelect UI)

`AskUserQuestion`의 `multiSelect` 옵션 사용:
- 각 옵션의 배지 생성:
  - `dependencies.blockedBy` 배열 → `[←REQ-MMM]` 형식 (선행 필요)
  - `dependencies.blocks` 배열 → `[→REQ-PPP]` 형식 (후행 대기)
  - 복합 예시: `[←REQ-MMM →REQ-PPP]`
  - 배지 없으면 생략
- `label: "REQ-NNN — {title}  [←REQ-MMM →REQ-PPP]"` (배지 있을 때)
- `description: "Phase 1 완료, 태스크 N개 | 선행: REQ-MMM | 후행: REQ-PPP"` (의존성 있을 때)
- **기본값: 전체 선택**
- 선택 후 확인 → 배치 실행. 0개 선택 시 "선택된 요청이 없습니다" 후 종료

##### 5개 이상인 경우 (전체선택 / 직접 입력 UI)

1. **목록 텍스트 출력**:
   ```
   승인 대기 중인 요청 ({N}개):
     REQ-NNN — {title}  [←REQ-MMM →REQ-PPP]  [태스크 M개]
     ...
   ```
   배지 생성 규칙 (multiSelect UI와 동일):
   - `dependencies.blockedBy` → `[←REQ-MMM]` (선행 필요)
   - `dependencies.blocks` → `[→REQ-PPP]` (후행 대기)
   - 복합: `[←MMM →PPP]` 형식으로 하나의 배지로 합산
   - 없으면 배지 생략
   예시:
   ```
     REQ-010 — DB 스키마 설계     [→REQ-011]  [태스크 2개]
     REQ-011 — API 구현           [←REQ-010 →REQ-012]  [태스크 3개]
     REQ-012 — UI 연동            [←REQ-011]  [태스크 1개]
   ```
2. **1차 AskUserQuestion** (`multiSelect: false`):
   - "전체선택" → 전체 REQ 배치 실행
   - "직접 입력" → REQ ID 직접 입력
3. **"전체선택"**: 전체 대기 REQ 배치 실행.
4. **"직접 입력"**:
   a. 목록 재출력 (참조용)
   b. **2차 AskUserQuestion**: "전체선택으로 변경" 또는 자유 입력 (`REQ-001,REQ-003` 또는 `REQ-001..005`)
   c. 빈 입력 또는 0건 → "선택된 요청이 없습니다" 후 종료
   d. 입력값을 "콤마 구분 및 범위 지정" 파싱 로직으로 처리 → 배치 실행

---

### 단건 승인 프로토콜

**AUTO_MODE 초기화** (단건 프로토콜 진입 즉시):
`AUTO_MODE = ($ARGUMENTS에 --auto 포함) OR (request.json.auto_approve == true)`
이후 모든 Step에서 이 변수를 사용한다.

REQ 리스트가 1건이거나, 명시적 단건 인자 호출 시 이 프로토콜을 실행합니다.

1. `{PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/` 하위 spec.md 확인
   - **spec.md 없으면**: Phase 1 미완료. 사용자에게 알리고 PM Conductor 분석 재실행
2. 스펙 요약을 사용자에게 표시
2.3. **체인 자동 실행 제안** (조건: `dependencies.blocks` 비어있지 않음 AND `workflow.auto_approve_on_unblock == false`):
  - 조건 미충족 시 이 단계 skip, Step 2.5로 진행
  - `AUTO_MODE=true` 또는 `request.json.auto_approve=true`이면 AskUserQuestion 없이 기본값("아니오, 각 단계마다 수동 approve") 적용 후 즉시 Step 2.5로 진행 (현재 요청만 진행, 설정 변경 없음) (* auto_approve_on_unblock=false 전제, config 변경 없음)
  - 조건 충족 시 blocks 체인 시각화:
    ```
    이 REQ가 완료되면 아래 REQ들이 순서대로 실행 가능해집니다:
      REQ-NNN — {title} (대기 중)
      REQ-MMM — {title} (대기 중)  ← REQ-NNN 완료 후
    ```
    (blocks 배열의 직접 후속 REQ만 표시; 재귀 조회는 1단계만)
  - AskUserQuestion:
    - "예, 자동으로 연결 실행" → `config.json`의 `workflow.auto_approve_on_unblock`을 `true`로 업데이트
      알림: "✓ 이후 모든 체인에서 의존성 해소 시 자동 approve가 실행됩니다. (`/mst:settings workflow.auto_approve_on_unblock false`로 되돌릴 수 있습니다)"
    - "아니오, 각 단계마다 수동 approve" → 현재 요청만 진행, 설정 변경 없음
2.5. **Phase 2.5: Stitch 디자인 제안** (단건 + `auto_approve=false`인 경우만):
   - `config.stitch.enabled`가 false면 skip
   - spec.md §2에서 UI 관련 변경 감지 (프론트엔드 파일, "화면"/"UI"/"페이지"/"컴포넌트" 등 키워드)
   - UI 변경 감지 + `stitch_screens` 비어있으면:
     → 제안: "구현 전 Stitch로 화면을 설계할까요? [설계하기 / 건너뛰기]"
     → "설계하기": `Skill(skill: "mst:stitch", args: "--req {REQ-ID} {spec §1 요약}")` 호출 후 3으로 진행
     → "건너뛰기" 또는 UI 미감지: 3으로 진행
   - `auto_approve=true` 또는 배치 모드: skip
3. 승인 실행:
   - `request.json`의 `current_phase`를 2로, `status`를 `phase2_execution`으로 변경
   - 각 태스크에 대해 git worktree 생성
   - **Phase 2 (외주 실행) 프로토콜** 실행

---

### 실행 전 의존성 검증

REQ 리스트가 2건 이상일 때, 배치 실행 루프 진입 전 선택된 REQ 집합의 의존성 위반을 검사합니다.

```pseudo
violations = []
for req_id in selected:
  req = read_request_json(req_id)
  for dep in req.dependencies.blockedBy:
    if dep not in selected:
      violations.append({ req: req_id, missing_prereq: dep })

if violations:
  출력: "⚠️ 의존성 위반 감지:"
  for v in violations:
    출력: "  - {v.req}은 {v.missing_prereq}이 먼저 완료되어야 하나 선택 목록에 없음"

  AskUserQuestion:
    - "누락된 선행 REQ 추가하여 전체 체인 실행"  → 누락 REQ를 selected에 추가 후 재진행
    - "후행 REQ 제외하고 선택된 것만 실행"      → violations의 후행 REQ를 selected에서 제거 후 재진행
    - "취소"                                   → 종료
```

위반이 없거나 사용자 선택 후 재진행 시, 아래 배치 실행 루프로 진입합니다.

---

### 배치 실행 루프

REQ 리스트가 2건 이상일 때 실행합니다.

#### 실행 모드 결정

| 플래그 | 동작 |
|--------|------|
| (기본, 플래그 없음) | **순차 실행** — 각 REQ의 전체 라이프사이클(Phase 2 → 3 → 5) 완료 후 다음 REQ |
| `--parallel` | **병렬 실행** — `concurrency.batch_max_parallel_reqs`만큼 REQ를 동시 실행 |

#### 순차 모드

의존성 토폴로지 정렬을 수행하여 Wave 단위로 실행합니다. 의존성이 없는 REQ는 단일 Wave로 묶입니다.

**topological_sort_into_waves 알고리즘:**
```pseudo
def topological_sort_into_waves(req_ids):
  # 선택된 REQ 집합 내에서만 의존성 해소
  in_degree = {r: 0 for r in req_ids}
  for r in req_ids:
    for dep in read_request_json(r).dependencies.blockedBy:
      if dep in req_ids:       # 선택 집합 내 의존성만 고려
        in_degree[r] += 1

  waves = []
  remaining = set(req_ids)
  while remaining:
    wave = [r for r in remaining if in_degree[r] == 0]
    if not wave:               # 사이클 감지
      경고: "의존성 사이클 감지, 남은 REQ는 독립 실행"
      wave = list(remaining)
    waves.append(sorted(wave))
    for r in wave:
      remaining.remove(r)
      for s in remaining:
        if r in read_request_json(s).dependencies.blockedBy:
          in_degree[s] -= 1
  return waves
```

**Wave 캐스케이드 실행:**
```pseudo
# 토폴로지 정렬로 Wave 그룹핑
waves = topological_sort_into_waves(req_list)
# Wave 예시: [[REQ-010, REQ-015], [REQ-011], [REQ-012]]
# (REQ-010, REQ-015는 독립, REQ-011은 REQ-010 완료 후, REQ-012는 REQ-011 완료 후)
# 의존성 없는 REQ만 있으면: [[REQ-001, REQ-002, REQ-003]] (단일 Wave)

출력: "실행 계획:"
for i, wave in enumerate(waves):
  출력: "  Wave {i+1}: {wave} (순차 실행)"

all_results = []
outer: for wave_num, wave in enumerate(waves):
  출력: "── Wave {wave_num+1}/{len(waves)} 시작 ──"
  wave_results = []
  for req_id in wave:
    result = 단건 승인 프로토콜 실행(req_id)
    wave_results.append(result)
    if result == FAILED:
      오류 처리 규칙 적용 (§ 배치 오류 처리)
      if 중단 결정:
        # 현재 Wave 및 남은 모든 Wave를 skipped로 마킹
        남은 REQ (현재 Wave 미실행 + 이후 Wave 전체) → skipped
        break outer
  all_results.extend(wave_results)

  # 실패한 Wave가 있으면 후행 Wave들의 dependent REQ를 자동 Skip (실패 전파)
  failed_in_wave = [r.req_id for r in wave_results if r.status == FAILED]
  if failed_in_wave:
    이후 Wave에서 failed REQ를 blockedBy로 가진 REQ들 → 자동 Skip 마킹
    출력: "의존 REQ N개를 Skip합니다" 알림

최종 요약 출력(all_results)
```

#### 병렬 모드 (`--parallel`)

`--parallel` 플래그 사용 시에도 Wave 경계는 준수합니다. Wave 내 REQ들은 병렬 실행하고, Wave 간에는 순차 유지(선행 Wave 완료 후 후행 Wave 시작).

`config.concurrency.batch_max_parallel_reqs` 값으로 동시 실행 REQ 수를 결정합니다.

```pseudo
max_concurrent = config.concurrency.batch_max_parallel_reqs  # 기본 1
slot_guard = min(max_concurrent × avg_tasks_per_req, config.worktree.max_active)

queue = req_list.copy()
running = {}
results = []

while queue 또는 running:
  # 슬롯 여유가 있으면 큐에서 꺼내 실행
  while len(running) < max_concurrent and queue:
    req_id = queue.pop(0)

    # 의존성 체크: blockedBy에 failed REQ가 있으면 자동 Skip
    if has_failed_dependency(req_id, results):
      results.append({req_id, status: "skipped", reason: "의존 REQ 실패"})
      continue

    출력: "[진행] {req_id} — 승인 시작..."
    task = 비동기로 단건 승인 프로토콜 실행(req_id)  # run_in_background
    running[req_id] = task

  # 완료 감지 (폴링)
  for req_id, task in running:
    if task.completed:
      results.append(task.result)
      running.remove(req_id)
      출력: "[완료] {req_id} — {status}"

  sleep(backoff)

최종 요약 출력(results)
```

> **슬롯 관리**: Phase 2 내부에서 태스크 병렬 실행(Wave)이 발생. 전역 동시 태스크 수는 `min(batch_max_parallel_reqs × max_tasks_per_req, worktree.max_active)`로 제한.

#### 진행 피드백 형식

순차: `[1/3] REQ-013 "JWT 미들웨어" — 승인 중... → 실행 중... → 완료`

병렬: `[병렬 2/3] REQ-013 시작 | REQ-014 시작`

최종 요약:
```
═══ 배치 승인 완료 ═══
성공: 2  |  실패: 1  |  건너뜀: 0
REQ-015: Phase 2 사전검증 실패 (tsc error) → /mst:approve REQ-015 로 재시도
```

---

### 배치 오류 처리

#### 환경별 기본 동작

| 환경 | 기본 동작 | 세부 |
|------|-----------|------|
| **대화형 (TTY)** | **Prompt** | Continue / Skip / Retry / Abort 4지선다 제시. 기본 커서 위치: Continue |
| **비대화형 (CI)** | **Continue** | 실패 REQ는 `failed` 마킹 후 나머지 계속 진행. 최종 exit code: 실패 1건 이상이면 non-zero |

#### 의존성 기반 예외

`dependencies.blockedBy` 관계가 있는 그룹에서 선행 REQ 실패 시:
- 후속 REQ **자동 Skip** (환경 불문)
- "의존 REQ N개를 Skip합니다" 알림
- `blockedBy` 미기재 시: **독립 REQ로 취급**

#### 행동 수정자 오버라이드

`--stop-on-fail`/`--continue` 플래그가 환경 기본값을 오버라이드:
- `--stop-on-fail`: 첫 실패 시 즉시 중단 (의존성 Skip은 유지)
- `--continue`: 실패 무시 후 계속 (의존성 Skip은 유지)

#### 실패 REQ 상태 마킹

실패한 REQ의 `status`를 `failed`로 마킹. 재진입: `/mst:approve REQ-NNN` 단건 호출 또는 다음 배치 시 토글 UI 재선택.

---

### Phase 2 외주 실행 프로토콜

Phase 2에서 Claude(PM)는 **절대 코드를 직접 작성하지 않습니다**. 모든 구현은 `/mst:codex` 또는 `/mst:gemini`로 외주합니다.

#### Step 1: 전체 태스크 스펙 일괄 검증 (외주 전 필수)

모든 태스크의 spec.md를 일괄 검증합니다. 다음 항목이 명확한지 확인, 부족하면 보완:
- **수락 조건** (§3): AC가 pass/fail로 측정 가능한지
- **테스트 계획** (§5): 실행 명령어와 항목이 구체적인지
- **변경 범위** (§2): 수정 파일 목록 명시 여부

**Ideation 자동 트리거 (LLM 판단)**: 아래 상황 감지 시 `/mst:ideation` 호출하여 스펙 보완:
- 접근 방식 타당성 불확실 또는 대안이 더 나을 가능성
- 수락 조건 모호로 외주 에이전트 구현이 어려운 경우
- 아키텍처/보안/성능 설계 근거 부족
명백한 구현은 스킵.

#### Step 2: 의존성 분석 및 실행 계획 수립

1. 각 태스크의 `spec.md §7`에서 `blockedBy` 배열 읽기
2. 태스크 분류:
   - **독립 태스크**: `blockedBy` 비어있음 → 즉시 실행
   - **의존 태스크**: `blockedBy` 있음 → 선행 완료 후 실행
   - **단일 태스크**: 1개뿐 → 기존 순차 실행
3. 실행 계획 사용자 표시

```
Wave 1: {독립 태스크 목록} (병렬 실행)
Wave 2: {Wave 1 완료 후 실행 가능한 태스크} (병렬 실행)
Wave 3: {...}
```

#### Step 3: 실행 에이전트 결정

spec.md의 `Assigned Agent` 필드와 `§8 에이전트 팀 구성`을 읽어 에이전트를 결정합니다. `agents.json`의 capabilities 기준:

| 태스크 유형 | 에이전트 | capabilities |
|------------|---------|-------------|
| 백엔드, 리팩토링, 테스트 | `codex-dev` → `/mst:codex` | code, refactor, test |
| **신규 `.ts` 파일 생성, 단순 리팩토링·보일러플레이트, 독립 테스트 작성, 소규모 `.ts` 인라인 수정** | **`codex-dev` → `/mst:codex`** | **code, refactor, test** |
| **프론트엔드, 문서, 대용량 컨텍스트** | **`gemini-dev` → `/mst:gemini`** | **frontend, docs, large-context** |
| **`.md` 문서, `.json`/`.env` config, `*.config.ts`, 기존 `.ts` 인라인 수정(신규 `.ts` 생성 없음)** | **`claude-dev` → `/mst:claude`** | **code, docs, config, small-inline** |

> **경계 케이스 기본값**: 태스크 유형이 모호한 경우 → `config.resolved.json`의 `workflow.default_agent` 값 사용 (`claude-dev` 하드코딩 금지).
> **CLI guard**: Phase 2 진입 전 Codex CLI 설치 확인 필요. `codex-dev` 배정 시 `codex` 명령어 사용 가능 여부를 사전 확인할 것.

`claude`와 `claude-dev`는 동일하게 처리됩니다 (하위 호환).

spec.md에 에이전트가 지정되어 있으면 그대로 사용. 미지정 시 `config.resolved.json`의 `workflow.default_agent` 사용.

**`Assigned Agent: claude`/`claude-dev`인 경우**: Step 4 외주 디스패치를 통해 `/mst:claude` 서브에이전트에게 위임. PM은 직접 구현하지 않습니다.

#### Step 4: 병렬 디스패치 실행

**태스크가 1개인 경우**: 기존 순차 실행과 동일 처리.

**태스크가 2개 이상이고 독립 태스크가 존재하는 경우**:

##### 4a. Worktree 일괄 생성

독립 태스크들의 git worktree를 미리 생성합니다.

##### 4b. Outsource Brief 파일 작성

독립 태스크들의 브리프 파일을 **하나의 메시지에서 동시에 Write** 호출합니다.

```
Write -> {PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{NN}/prompts/phase2-impl.md
```

브리프는 `templates/impl-request.md` 템플릿 사용.
- `{{IMPL_CONTEXT}}`: PM 작성 — 3~5줄 자유 형식 (무엇을, 왜, 어떻게 + 주의사항)
  - `request.json`에 `linked_designs`가 존재하고 비어있지 않으면, `{{IMPL_CONTEXT}}` 끝에 다음 문구를 자동 추가:
    `"spec.md §10의 Stitch HTML 파일을 참조하되 기술 스택에 맞게 구현하세요."`
- `{{SPEC_PATH}}`, `{{WORKTREE_PATH}}`, `{{REQ_ID}}`, `{{TASK_ID}}`: 자동 주입
- `{{PREV_FEEDBACK_PATH}}`: 첫 실행 시 "N/A", 재실행 시 feedback 파일 경로

##### 4c. 독립 태스크 동시 실행

`run_in_background: true` 기반 Bash 실행 사용. (`Skill` 호출은 직렬이므로 병렬 실행 시 CLI 직접 호출 필요)

{task_dir} = {PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{TASK-NUM}/

> ⚠️ **gemini-dev Bash 강제 (MANDATORY)**: gemini-dev는 단건/병렬 무관하게 **항상** `Bash(run_in_background: true)`로 실행한다.
> claude-dev 단건의 `Skill()` 패턴을 gemini-dev에 유추 적용하는 것은 금지 — `Skill(mst:gemini)` 전환 불가.
> trace는 `running.log`로 대체된다 (codex-dev와 동일 패턴).

```bash
# codex-dev인 경우
Bash(
  command: 'set -o pipefail; codex exec --full-auto -m {config.models.providers.codex[default_tier]} -C {worktree_path} "$(cat {prompt_file})" 2>&1 | tee {task_dir}/running.log',
  run_in_background: true,
  timeout: {config.timeouts.cli_large_task_ms}
)

# gemini-dev인 경우
Bash(
  command: 'set -o pipefail && cd {worktree_path} && gemini -p "$(cat {prompt_file})" 2>&1 | tee {task_dir}/running.log',
  run_in_background: true,
  timeout: {config.timeouts.cli_large_task_ms}
)

# claude-dev (또는 claude)인 경우
# Wave 내 claude-dev 태스크 수 판단
if (wave_claude_task_count > 1):
  # 병렬 실행 — 기존 경로 유지 (Skill은 직렬이므로 Task 직접 호출 필수)
  Task(
    subagent_type: "general-purpose",
    prompt: {prompt_file 내용},
    run_in_background: true
  )
else:
  # 단건 실행 — Skill(mst:claude) 전환으로 trace 자동 생성 + worktree 격리
  Skill(skill: "mst:claude", args: "--trace {REQ-ID}/{TASK-NUM}/phase2-impl")
```

각 실행의 `task_id`를 `request.json`에 영구 저장:

```json
{ "background_task_ids": [{ "task_id": "{bg_task_id}", "task_num": "01", "agent": "codex-dev", "status": "running" }] }
```

> **세션 간 추적**: task_id를 기록하여 세션 전환 후에도 추적 가능. 필요 시 `TaskStop(task_id)`로 취소.

> ⚠️ **CONTINUATION GUARD (MANDATORY — 모든 외주 호출에 적용)**:
> Skill(mst:codex), Skill(mst:gemini), Skill(mst:claude), 또는 Bash(codex/gemini) 호출이 **완료/반환되면**
> 반드시 다음 단계(4d 폴링 또는 Step 5 사전검증)로 **즉시 진행**한다.
> 외주 에이전트의 반환 텍스트(`[TRACE_DONE]`, "완료", "제어를 반환" 등)는 **정보일 뿐 종료 신호가 아니다**.
> 이 approve 스킬의 실행은 Phase 5 (최종 수락/mst:accept) 완료 시에만 종료된다.

##### 4d. 완료 감지 루프

모든 병렬 태스크가 완료될 때까지 폴링합니다.

```pseudo
backoff = 2초
max_backoff = 30초

while (실행 중인 태스크가 있음):
  for task_id in running_tasks:
    result = TaskOutput(task_id, block: false, timeout: 5000)
    if result.status == 'completed':
      remove task_id from running_tasks
      if result.exit_code == 0:
        Step 5로 이동(사전 검증)
      else:
        mark task status = failed
        Step 4e 실패 전파 규칙 적용
        Fallback 규칙 적용(필요 시 재실행)
      해당 태스크가 선행인 후속태스크가 있으면 4e로 이동

  if running_tasks 남아있음:
    sleep(backoff)
    backoff = min(backoff * 2, max_backoff)
```

##### 4e. 의존 태스크 디스패치 (선형 의존 체인)

선행 태스크 완료 시 blockedBy 해소:
1. 후속 태스크의 `blockedBy`에서 완료 태스크 제거
2. `blockedBy` 비면 4c에 추가해 병렬 실행
3. 실패 전파: 선행 `failed`이면 후속 태스크를 `cancelled`로 전이, 즉시 사용자 알림

#### Step 5: 사전 검증 (각 완료된 태스크별)

> ⚠️ **NON-STOP EXECUTION RULE (CRITICAL)**:
> Step 5 ~ Step 6 ~ Phase 3 ~ 최종 수락까지 **중간 멈춤 없이 연속 실행**한다.
> "진행합니다", "다음 단계로 이동합니다" 등의 **텍스트만 출력하고 멈추는 것은 절대 금지**.
> 텍스트를 출력했으면 **반드시 해당 단계의 도구 호출(Bash/Edit/Skill 등)을 즉시 실행**한다.
> 이 규칙은 이 approve 스킬의 모든 후속 Step에 적용된다.

각 태스크 완료 즉시 사전 검증 실행:
1. spec §5의 테스트 명령어 실행
2. spec §5의 타입 체크 명령어 실행
3. 결과 분기:
   - **PASS**: `status` → `review` → **즉시 Step 5.5 실행** (PM 커밋) — 텍스트만 출력하고 멈추지 않는다
   - **FAIL**: `status` → `pre_check_failed` → **즉시 Step 5b 실행** (재외주) — 텍스트만 출력하고 멈추지 않는다

#### Step 5.5: PM 커밋 (사전검증 PASS 시)

Step 5 PASS 후 PM이 직접 커밋합니다 (외주 에이전트의 `index.lock` 문제 방지).

0. 이중 커밋 방지 체크:
   ```bash
   STATUS=$(git -C {worktree_path} status --porcelain)
   if [ -z "$STATUS" ]; then
     echo "[Step 5.5 skip] worktree가 이미 커밋된 상태 (clean). 이중 커밋 방지."
   fi
   ```
   clean이면 커밋 없이 `status` → `committed` 전환 후 Step 6 진행.

1. 전체 변경 스테이징 (worktree 격리로 인해 -A 사용 안전):
   ```bash
   git -C {worktree_path} add -A
   ```

2. staged 파일 중 `frontend/` 변경 자동 감지 후 빌드:
   ```bash
   FRONTEND_CHANGED=$(git -C {worktree_path} diff --cached --name-only | grep "^frontend/" | head -1)
   if [ -n "$FRONTEND_CHANGED" ]; then
     echo "frontend/ 변경 감지됨 → 빌드 실행 중..."
     cd {worktree_path}/frontend && npm install --prefer-offline && npm run build
     git -C {worktree_path} add dist/
   fi
   ```

3. PM이 커밋:
   ```bash
   git -C {worktree_path} commit -m "[{REQ_ID}/{TASK_ID}] {spec §1 요약}

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
   ```

4. 커밋 hash/message 저장:
   ```bash
   COMMIT_HASH=$(git -C {worktree_path} log -1 --format="%H")
   COMMIT_MSG=$(git -C {worktree_path} log -1 --format="%s")
   python3 {PLUGIN_ROOT}/scripts/mst.py task set-commit {REQ_ID}-T{TASK_ID_PAD} "$COMMIT_HASH" "$COMMIT_MSG"
   ```
   - 실패 시 경고만 출력하고 워크플로우는 계속 진행.

5. 해당 태스크 `status`를 `committed`로 변경 → Step 6 진행. `background_task_ids` 항목 status → `"completed"` 업데이트

#### Step 5b: 사전검증 실패 재외주 (Pre-check Failure Re-outsourcing)

Step 5 FAIL 시, PM이 직접 코드를 수정하지 않고 외주 에이전트에게 에러 컨텍스트와 함께 재요청합니다. 최대 재시도 소진 후 PM 직접 개입.

##### 5b-1. 에러 출력 캡처

- tsc 에러: 전체 stderr/stdout 캡처
- 테스트 실패: 실패 목록 + 에러 메시지 캡처
- 에러 출력 3000자 초과 시 앞 500자 + 뒤 2500자로 트리밍

##### 5b-2. 재시도 카운터 확인

- `pre_check_retries` 필드 확인 (없으면 0)
- `config.retry.max_cli_retries` (기본 2) 미만 → 5b-3 (재외주)
- 이상 → 5b-5 (PM 직접 개입)

##### 5b-3. 에러 수정 프롬프트 생성

outsource-brief 템플릿의 `<error_context>` 섹션을 활용하여 수정 프롬프트 구성:

`Write → {PROJECT_ROOT}/.gran-maestro/requests/{REQ-ID}/tasks/{NN}/prompts/phase2-fix-R{N}.md`

포함 내용: spec.md §3 수락 조건, 캡처된 에러 출력 전문, "에러 수정 후 검증 명령어 실행 확인" 지침, spec §5 테스트/타입체크 명령어

##### 5b-4. 동일 worktree에서 재외주 실행

동일 에이전트, 동일 worktree에서 재실행:

```md
Skill(skill: "mst:codex", args: "--prompt-file {prompt_path} --dir {worktree_path} --trace {REQ-ID}/{TASK-NUM}/phase2-fix-R{N}")
```

- `pre_check_retries` +1 증가
- `request.json`의 `tasks` 배열에서 현재 태스크 항목 찾기 (id 매칭):
  - 해당 항목의 `retry_count` 값 읽기 (없으면 0으로 취급)
  - `retry_count` = (현재 값) + 1 로 업데이트
- `request.json` 저장 (`pre_check_retries` + `retry_count` 동시 반영)
- `status` → `executing`
- 재외주 완료 후 **Step 5 복귀**

##### 5b-4.5. Codex Fallback 추가 시도 (5b-5 이전)

`max_cli_retries` 소진 후, PM 직접 개입 전 Codex 에스컬레이션 1회 시도:

1. **에러 유형 분류**: 에러 출력에서 컴파일/타입 오류 여부 판단
   - 환경·의존성 이슈(패키지 설치 실패, 네트워크 오류 등)이면 → 즉시 5b-5로 이동

2. **`codex_fallback_retries` 확인**: `request.json`의 `codex_fallback_retries` 값 읽기
   - `codex_fallback_retries >= 1`이면 → 즉시 5b-5로 이동 (최대 1회 한도)

3. **stash 후 Codex 에스컬레이션 실행**:
   ```bash
   git -C {worktree_path} stash
   ```
   에스컬레이션 프롬프트 준비 (`phase2-fix-R{N}.md` 기반에 `## 에스컬레이션 힌트` 섹션 추가):
   - 에러 패턴 요약
   - 영향 파일 목록
   - 전면 재작성 권장 여부
   ```bash
   set -o pipefail; codex exec --full-auto -m {config.models.providers.codex[default_tier]} -C {worktree_path} "$(cat {escalation_prompt_path})" 2>&1 | tee {task_dir}/running-fallback.log
   ```

4. **결과 처리**:
   - **성공 시**: `codex_fallback_retries = 1`로 `request.json` 업데이트 → Step 5 재진입
   - **실패 시**: `git -C {worktree_path} stash pop` → 5b-5(PM 직접 개입)로 이동

##### 5b-5. PM 직접 개입 (재외주 소진 시)

재외주 횟수가 `config.retry.max_cli_retries`에 도달한 경우:

0. **실행 중 백그라운드 태스크 취소**: `background_task_ids`에서 `status: "running"` 항목을 `TaskStop(task_id)`로 취소 → `"cancelled"` 업데이트. 고아 태스크 방지.
1. PM이 에러 출력 분석 후 직접 코드 수정
2. 사전검증(Step 5) 재실행
3. PASS → `status: review` / 여전히 FAIL → 사용자 개입 요청

#### Step 6: Phase 3 전환

모든 태스크가 `review` 이상 상태에 도달하면 `current_phase`를 `3`으로 변경 → Phase 3 (PM 리뷰) 진입

### Phase 3 리뷰 루프 (auto_review 활성화 시)

모든 태스크가 `committed` 상태에 도달하고 `current_phase`가 3으로 전환된 후:

1. `review.auto_review` 설정 확인 (`{PROJECT_ROOT}/.gran-maestro/config.resolved.json` 읽기):
   - `request.json.auto_approve` 값도 함께 확인하여 `AUTO_MODE = (CLI --auto 전달) OR (request.json.auto_approve == true)`로 판단
   - `false` (기본): 기존 Phase 3 → Phase 5 흐름 유지 (mst:review 미호출), "최종 수락" 섹션으로 직행
   - `true` 또는 `AUTO_MODE=true`이면 mst:review 호출 진행

2. mst:review 호출:
   ```
   AUTO_MODE=true  -> Skill(skill: "mst:review", args: "{REQ_ID} --auto")
   AUTO_MODE=false -> Skill(skill: "mst:review", args: "{REQ_ID}")
   ```
   (`AUTO_MODE=true`에서는 `review.auto_review=false`이더라도 항상 호출)

3. review 결과 처리:

   **review_issues_summary 로드**: 최신 `reviews/RV-NNN/review.json`을 Read → `review_issues_summary` 파싱 (critical/major/minor 카운트 + auto_fixed/skipped 배열)

   - **`status: "passed"`**: `review_summary.status → "passed"` → "최종 수락 (Phase 3 → Phase 5)" 섹션으로 진행
     (`workflow.auto_accept_result` 설정 동일 적용)
   - **`status: "gap_found"`**:
     `review_issues_summary`를 참조하여 이슈 등급별 분기:

     **a. CRITICAL 이슈 존재 시**: CRITICAL은 PM 직접 수정 불가, 항상 재외주. 아래 기존 재외주 경로로 진행.

     **a-2. MINOR 이슈**: `review_issues_summary.skipped`에 기록된 대로 스킵 처리, 재외주 대상에 포함하지 않음. 리포트에만 기록.

     **b. MAJOR 이슈 — PM 직접 수정 분기**:

     > **CRITICAL은 PM 직접 수정 불가, 항상 재외주**

     MAJOR 이슈 중 아래 **모든 조건**을 충족하면 PM이 worktree에서 직접 수정:

     1. **등급 조건**: MAJOR만 (CRITICAL 이슈가 동시에 존재하면 해당 CRITICAL은 반드시 재외주)
     2. **설정 조건**: `config.review.severity_auto_fix.pm_direct_fix_enabled == true`
     3. **파일 수 조건**: 변경 대상 파일 수 <= `config.review.severity_auto_fix.pm_direct_fix_max_files`
     4. **diff 크기 조건**: 예상 diff 줄 수 <= `config.review.severity_auto_fix.pm_direct_fix_max_diff_lines`
     5. **고위험 패턴 배제**: 변경 대상이 아래에 해당하지 않아야 함:
        - API 스펙 (OpenAPI/Swagger 정의)
        - DB 스키마 / 마이그레이션 파일
        - 권한(auth) 로직 / 보안 코드
        - 공통 유틸 (shared/common 모듈)

     **PM 직접 수정 조건 미충족 시** → 기존 재외주 경로(아래 c.)로 전환.

     **PM 직접 수정 절차**:

     MAJOR 이슈가 여러 개인 경우, 조건을 충족하는 이슈만 PM이 직접 수정하고 나머지는 재외주.

     1. PM이 review에서 지적된 MAJOR 이슈를 분석하고 해당 worktree에서 직접 코드 수정
     2. **검증 게이트** (PASS 필수):
        - spec §5 테스트 명령어 실행 → PASS 필수
        - spec §5 타입 체크 명령어 실행 → PASS 필수
        - **게이트 PASS**: Step 5.5와 동일한 커밋 절차 적용 (add → commit → hash 저장)
        - **게이트 FAIL**: 수정 롤백 (`git -C {worktree_path} checkout -- .`) → 해당 MAJOR 이슈에 대한 태스크를 `request.json.tasks`에 신규 생성 (`generated_by: "review"`, `status: "pending"`) → 재외주 경로(아래 c.)로 진입
     3. **메타데이터 기록**: `review-report.md`에 아래 항목 기록:
        - `pm_direct_fix: true`
        - 수정된 파일 목록
        - 수정 내용 요약 (어떤 MAJOR 이슈를 어떻게 수정했는지)

     **c. MAJOR 조건 미충족 또는 재외주 경로**:
     1. `request.json.tasks`에서 `generated_by: "review"` + `status: "pending"` 태스크만 선별
     2. **Step 4a 포함** 재실행: 신규 태스크 worktree 생성 후 4b~4e 실행
     3. 재실행 완료 후 `current_phase → 3` 재전환 → 이 루프 반복
   - **`status: "limit_reached"`**:
     - 일반 모드: AskUserQuestion → [추가 반복 허용 (+1회)] / [현재 상태로 수락] / [중단]
       - 추가 반복: review 재호출
       - 현재 수락: "최종 수락" 섹션으로 진행 (`workflow.auto_accept_result` 동일 적용)
       - 중단: `request.json.status → "cancelled"`
     - `--auto` 모드: `review_summary.status = "limit_reached"` 기록 후 "최종 수락" 섹션으로 진행

단, `--auto` 플래그 맥락: approve가 `--auto`로 실행된 경우 review 호출 시 컨텍스트로 전달됨.

#### Fallback 규칙

- 최대 깊이: 1단계 (codex → gemini, gemini → codex)
- 동일 에이전트 재시도: 최대 2회
- fallback 에이전트 재시도: 최대 2회
- 모두 실패 시: 사용자 개입 요청

### 최종 수락 (Phase 3 → Phase 5) — 자동 실행

Phase 3 리뷰 PASS 후 `workflow.auto_accept_result` 설정에 따라 동작합니다:

- **`true` (기본)**: 아래와 같이 accept 스킬을 명시적으로 호출합니다:
  ```
  Skill(skill: "mst:accept", args: "{REQ_ID}")
  ```
  > ⚠️ **MANDATORY**: in-context 실행 시 Step 6 (Plan 상태 동기화)가 생략되는 것을 방지하기 위해
  > 반드시 Skill 도구를 통해 mst:accept를 호출해야 합니다.
- **`false`**: Phase 3 리뷰 PASS 후 멈추고, 사용자에게 `/mst:accept`를 수동으로 호출하라고 안내합니다.

설정 변경: `/mst:settings workflow.auto_accept_result false`

## 예시

```
# 단건 승인
/mst:approve REQ-001

# 인자 없이 (대기 1건이면 단건, 2건+이면 토글 UI)
/mst:approve

# 명시적 다건 (토글 UI 스킵)
/mst:approve REQ-001 REQ-003 REQ-005

# 콤마 구분
/mst:approve REQ-001,REQ-003,REQ-005

# 범위 지정
/mst:approve REQ-001..005

# 우선순위 필터링
/mst:approve --priority high

# 배치 + 병렬 실행
/mst:approve --parallel

# 배치 + 실패 시 즉시 중단
/mst:approve --stop-on-fail

# 조합: 범위 + 병렬 + 실패 시 계속
/mst:approve REQ-010..020 --parallel --continue
```

## 문제 해결

- "승인할 스펙이 없음" → 해당 요청이 Phase 1(PM 분석) 완료 상태인지 확인. `/mst:inspect {REQ-ID}`로 상태 조회
- "이미 승인됨" → 해당 요청이 이미 Phase 2 이후에 있음. `/mst:inspect {REQ-ID}`로 현재 Phase 확인
- 최종 수락이 필요한 경우 → Phase 3 리뷰 PASS 후 `/mst:accept`를 수동 호출하거나, `workflow.auto_accept_result`를 `true`로 설정
- 배치 실패 재시도 → `/mst:approve REQ-NNN`으로 실패한 REQ만 단건 재승인
