---
name: approve
description: "스펙을 승인하고 실행을 시작합니다. 사용자가 '승인', '진행해', 'OK 진행'을 말하거나 /mst:approve를 호출할 때 사용. Gran Maestro 워크플로우 내에서만 의미 있으며, 일반적인 확인 응답에는 사용하지 않음."
user-invocable: true
argument-hint: "[REQ-ID...] [--stop-on-fail | --continue] [--parallel] [--priority <level>]"
---

# maestro:approve

PM이 작성한 구현 스펙을 승인하고 Phase 2 실행을 시작합니다. 단건/배치 승인을 모두 지원합니다. Phase 3 리뷰 PASS 후 최종 수락은 기본적으로 자동 실행됩니다 (`workflow.auto_accept_result` 설정).

## 실행 프로토콜

### REQ ID 결정 (인자 파싱)

`$ARGUMENTS`를 파싱하여 승인 대상 REQ 리스트를 결정합니다. 아래 규칙을 **위에서 아래로 우선순위 순서대로** 적용합니다.

#### 1. 명시적 단건 인자

`$ARGUMENTS`가 단일 REQ 패턴(`REQ-NNN`)이면 **단건 승인 프로토콜**을 직접 실행합니다. 배치 로직을 일절 통과하지 않습니다.

```
/mst:approve REQ-003   → [REQ-003] 단건
```

#### 2. 명시적 다건 인자

`$ARGUMENTS`에 공백으로 구분된 REQ 패턴이 2개 이상이면, 해당 REQ들을 **토글 UI 없이** 직접 배치 실행합니다.

```
/mst:approve REQ-001 REQ-003 REQ-005   → [REQ-001, REQ-003, REQ-005]
```

#### 3. 콤마 구분 및 범위 지정

콤마(`,`)나 범위(`..`)가 포함된 인자를 파싱합니다.

```
/mst:approve REQ-001,REQ-003,REQ-005     → [REQ-001, REQ-003, REQ-005]
/mst:approve REQ-001..005                 → [REQ-001, REQ-002, REQ-003, REQ-004, REQ-005]
/mst:approve REQ-001..003,REQ-007        → [REQ-001, REQ-002, REQ-003, REQ-007]
```

범위 지정 시 **승인 가능 상태인 REQ만** 결과 리스트에 포함합니다. 범위 내에 승인 불가 REQ가 있으면 무시합니다.

#### 4. `--priority` 필터링

`--priority <level>` 플래그가 있으면, 승인 가능 REQ 중 해당 우선순위를 가진 것만 필터링합니다.

```
/mst:approve --priority high   → 승인 가능 REQ 중 priority == "high"인 것만
```

`request.json`의 `priority` 필드를 읽습니다. 필드가 없는 REQ는 `normal`로 취급합니다. `--priority`와 다른 인자(REQ 패턴, 범위)를 조합할 수 있습니다.

#### 5. 인자 없이 호출 — 조건부 분기

`$ARGUMENTS`에 REQ 패턴이 없고 플래그만 있거나 완전히 비어 있는 경우:

**스크립트 우선**: `python3 {PLUGIN_ROOT}/scripts/mst.py request filter --phase 1 --format json` 실행 후 `status`가 `phase1_analysis`가 아닌 것 필터링. 실패 시 fallback.

**Fallback:**
1. `.gran-maestro/requests/` 디렉토리의 모든 `request.json`을 스캔
2. 스펙 승인 가능한 상태의 요청을 필터링:
   - `current_phase == 1` 이고 `status`가 `phase1_analysis`가 아닌 것 (PM 분석 완료 상태), 또는 `status`가 `phase2_spec_review`인 것
3. `--priority` 필터가 있으면 추가 필터링 적용
4. REQ 번호(숫자) 오름차순으로 정렬
5. 결과에 따라 분기:

| 승인 대기 REQ 수 | 환경 | 동작 |
|-----------------|------|------|
| 0개 | — | "승인 대기 중인 요청이 없습니다" 메시지 후 종료 |
| 1개 | — | **기존 단건 동작 그대로** (스펙 요약 → 승인 → Phase 2) |
| 2개+ | 대화형 (TTY) | **토글 선택 UI 진입** (아래 참조) |
| 2개+ | 비대화형 | **기존 동작 유지** (첫 번째 REQ 자동 선택, 단건 실행) |

#### 토글 선택 UI

승인 대기 REQ가 2개 이상이고 대화형(TTY) 환경일 때 `AskUserQuestion`의 `multiSelect` 옵션을 사용합니다:

- 각 옵션: `label: "REQ-NNN — {title}"`, `description: "Phase 1 완료, 태스크 N개"`
- **기본값: 전체 선택** (모든 옵션이 선택된 상태)
- 사용자가 선택/해제 후 확인하면 선택된 REQ 리스트를 배치 실행
- 선택된 REQ가 0개이면 "선택된 요청이 없습니다" 메시지 후 종료 (no-op)

---

### 단건 승인 프로토콜

REQ 리스트가 1건이거나, 명시적 단건 인자 호출 시 이 프로토콜을 실행합니다.

1. `.gran-maestro/requests/{REQ-ID}/tasks/` 하위 spec.md 파일 확인
   - **spec.md가 없는 경우**: Phase 1 분석이 미완료 상태. 사용자에게 알리고 PM Conductor 분석을 재실행하여 spec.md 작성 완료
2. 스펙 요약을 사용자에게 표시
2.5. **Phase 2.5: Stitch 디자인 제안** (단건 승인이고 `auto_approve=false`인 경우에만 실행):
   - `config.stitch.enabled`가 false이면 skip
   - spec.md §2 변경 범위에서 UI 관련 변경 감지:
     - 신호: 프론트엔드 파일(`.tsx`, `.vue`, `.svelte`, `page.`, `view.` 등) 추가/수정, "화면", "UI", "페이지", "컴포넌트" 등 키워드 포함
   - UI 관련 변경이 감지되고 `request.json`의 `stitch_screens`가 비어 있으면:
     → 사용자에게 제안: `"이 요청에 UI 화면이 포함됩니다. 구현 전 Stitch로 화면을 설계할까요? [설계하기 / 건너뛰기]"`
     → "설계하기" 선택: `Skill(skill: "mst:stitch", args: "--req {REQ-ID} {spec §1 요약}")` 호출 후 완료 대기, 이후 3으로 진행
     → "건너뛰기" 선택 또는 UI 미감지: 3으로 진행
   - `auto_approve=true` 또는 배치 모드(REQ 2건+): 이 단계 skip
3. 승인 실행:
   - `request.json`의 `current_phase`를 2로 변경
   - `request.json`의 `status`를 `phase2_execution`으로 변경
   - 각 태스크에 대해 git worktree 생성
   - **Phase 2 (외주 실행) 프로토콜** 실행 (아래 참조)

---

### 배치 실행 루프

REQ 리스트가 2건 이상일 때 이 루프를 실행합니다.

#### 실행 모드 결정

| 플래그 | 동작 |
|--------|------|
| (기본, 플래그 없음) | **순차 실행** — 각 REQ의 전체 라이프사이클(Phase 2 → 3 → 5) 완료 후 다음 REQ |
| `--parallel` | **병렬 실행** — `concurrency.batch_max_parallel_reqs`만큼 REQ를 동시 실행 |

#### 순차 모드

```pseudo
results = []
for i, req_id in enumerate(req_list):
  출력: "[{i+1}/{total}] {req_id} "{title}" — 승인 중..."
  result = 단건 승인 프로토콜 실행(req_id)
  results.append(result)

  if result == FAILED:
    오류 처리 규칙 적용 (§ 배치 오류 처리)
    if 중단 결정:
      남은 REQ를 skipped로 마킹
      break

최종 요약 출력(results)
```

#### 병렬 모드 (`--parallel`)

`config.concurrency.batch_max_parallel_reqs` 값을 읽어 동시 실행 REQ 수를 결정합니다.

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

> **슬롯 관리**: 각 REQ의 Phase 2 내부에서도 태스크 병렬 실행(Wave)이 발생합니다. 전역 동시 태스크 수는 `min(batch_max_parallel_reqs × max_tasks_per_req, worktree.max_active)`로 제한됩니다.

#### 진행 피드백

순차 모드:
```
[1/3] REQ-013 "JWT 미들웨어" — 승인 중...
[1/3] REQ-013 "JWT 미들웨어" — Phase 2 실행 중...
[1/3] REQ-013 "JWT 미들웨어" — 완료
[2/3] REQ-014 "로그인 UI" — 승인 중...
```

병렬 모드:
```
[병렬 2/3] REQ-013 시작 | REQ-014 시작
[병렬 2/3] REQ-013 완료 | REQ-014 실행 중
[병렬 3/3] REQ-015 시작 | REQ-014 실행 중
```

#### 최종 요약

```
═══ 배치 승인 완료 ═══
성공: 2  |  실패: 1  |  건너뜀: 0
─── 실패 상세 ───
REQ-015: Phase 2 사전검증 실패 (tsc error)
  → /mst:approve REQ-015 로 재시도 가능
```

---

### 배치 오류 처리

#### 환경별 기본 동작

| 환경 | 기본 동작 | 세부 |
|------|-----------|------|
| **대화형 (TTY)** | **Prompt** | Continue / Skip / Retry / Abort 4지선다 제시. 기본 커서 위치: Continue |
| **비대화형 (CI)** | **Continue** | 실패 REQ는 `failed` 마킹 후 나머지 계속 진행. 최종 exit code: 실패 1건 이상이면 non-zero |

#### 의존성 기반 예외

`request.json`의 `dependencies.blockedBy` 관계가 존재하는 REQ 그룹에서 선행 REQ 실패 시:
- 후속 REQ는 **자동 Skip** (환경 불문)
- 사용자에게 "의존 REQ N개를 Skip합니다" 알림
- `blockedBy` 미기재 시 폴백: **독립 REQ로 취급** (환경 기본 동작 적용)

#### 행동 수정자 오버라이드

`--stop-on-fail` 또는 `--continue` 플래그가 명시되면 환경 기본값을 오버라이드합니다:
- `--stop-on-fail`: 어느 환경이든 첫 실패 시 즉시 중단 (의존성 Skip은 유지)
- `--continue`: 어느 환경이든 실패 무시 후 계속 (의존성 Skip은 유지)

#### 실패 REQ 상태 마킹

실패한 REQ는 `request.json`의 `status`를 `failed`로 마킹합니다. 재진입은:
- `/mst:approve REQ-NNN` 단건 호출
- 다음 배치 실행 시 토글 UI에서 재선택

---

### Phase 2 외주 실행 프로토콜

Phase 2에서 Claude(PM)는 **절대 코드를 직접 작성하지 않습니다**. 모든 구현은 `/mst:codex` 또는 `/mst:gemini` 스킬을 통해 외주합니다.

#### Step 1: 전체 태스크 스펙 일괄 검증 (외주 전 필수)

모든 태스크에 대해 한 번에 spec.md를 검증합니다.

spec.md에서 다음 항목이 명확한지 확인합니다. 부족하면 보완 후 진행:
- **수락 조건** (§3): 모든 AC가 pass/fail로 측정 가능한지
- **테스트 계획** (§5): 테스트 실행 명령어와 항목이 구체적인지
- **변경 범위** (§2): 수정 파일 목록이 명시되어 있는지

**Ideation 자동 트리거 (LLM 판단)**: 스펙 검증 과정에서 아래 상황이 감지되면 `/mst:ideation`을 호출하여 다각도 분석 후 스펙을 보완합니다:
- 접근 방식의 타당성이 불확실하거나 대안이 더 나을 수 있는 경우
- 수락 조건이 모호하여 외주 에이전트가 올바르게 구현하기 어려운 경우
- 아키텍처/보안/성능 관련 설계 결정의 근거가 부족한 경우
LLM이 종합적으로 판단하여 ideation 필요 여부를 결정합니다. 명백한 구현의 경우 스킵합니다.

#### Step 2: 의존성 분석 및 실행 계획 수립

1. 각 태스크의 `spec.md §7`에서 `blockedBy` 배열을 읽습니다.
2. 태스크를 분류합니다.
   - **독립 태스크**: `blockedBy`가 비어 있음 → 즉시 실행 가능
   - **의존 태스크**: `blockedBy`가 비어있지 않음 → 선행 완료 후 실행
   - **단일 태스크**: 태스크가 1개뿐 → 기존 순차 실행과 동일 처리
3. 실행 계획을 사용자에게 요약 표시합니다.

```
Wave 1: {독립 태스크 목록} (병렬 실행)
Wave 2: {Wave 1 완료 후 실행 가능한 태스크} (병렬 실행)
Wave 3: {...}
```

#### Step 3: 실행 에이전트 결정

spec.md의 `Assigned Agent` 필드와 `§8 에이전트 팀 구성`을 읽어 에이전트를 결정합니다.
`agents.json`의 capabilities 기준:

| 태스크 유형 | 에이전트 | capabilities |
|------------|---------|-------------|
| 백엔드, 리팩토링, 테스트 | `codex-dev` → `/mst:codex` | code, refactor, test |
| **프론트엔드, 문서, 대용량 컨텍스트** | **`gemini-dev` → `/mst:gemini`** | **frontend, docs, large-context** |
| **범용 구현 (문서, 설정, 소규모 코드)** | **`claude-dev` → `/mst:claude`** | **code, docs, config, small-inline** |

`claude`와 `claude-dev`는 동일하게 처리됩니다 (하위 호환).

spec.md에 에이전트가 지정되어 있으면 그대로 사용합니다. 지정되지 않은 경우 `config.json`의 `workflow.default_agent`를 사용합니다.

**`Assigned Agent: claude` 또는 `claude-dev`인 경우**: Step 4 외주 디스패치를 통해 `/mst:claude` 서브에이전트에게 구현을 위임합니다. PM은 직접 구현하지 않습니다.

#### Step 4: 병렬 디스패치 실행

**태스크가 1개인 경우**: 기존 순차 실행과 동일하게 처리합니다.

**태스크가 2개 이상이고 독립 태스크가 존재하는 경우**:

##### 4a. Worktree 일괄 생성

독립 태스크들의 git worktree를 미리 생성합니다.

##### 4b. Outsource Brief 파일 작성

독립 태스크들의 브리프 파일을 **하나의 메시지에서 동시에 Write** 호출합니다.

```
Write -> .gran-maestro/requests/{REQ-ID}/tasks/{NN}/prompts/phase2-impl.md
```

브리프는 `templates/impl-request.md` 템플릿을 사용합니다.
PM이 작성하는 항목:
- `{{IMPL_CONTEXT}}`: 3~5줄 자유 형식 — 무엇을, 왜, 어떻게 + 주의사항

자동 채움 항목:
- `{{SPEC_PATH}}`: spec.md 파일 경로 (에이전트가 직접 읽음)
- `{{WORKTREE_PATH}}`, `{{REQ_ID}}`, `{{TASK_ID}}`: 자동 주입
- `{{PREV_FEEDBACK_PATH}}`: 첫 실행 시 "N/A", 재실행 시 feedback 파일 경로

##### 4c. 독립 태스크 동시 실행

`run_in_background: true` 기반 Bash 실행을 사용합니다.
(`Skill` 호출은 직렬이므로 병렬 실행이 필요할 때는 CLI를 직접 호출해야 함)

```bash
# codex-dev인 경우
Bash(
  command: 'codex exec --full-auto -C {worktree_path} "$(cat {prompt_file})"',
  run_in_background: true,
  timeout: {config.timeouts.cli_large_task_ms}
)

# gemini-dev인 경우
Bash(
  command: 'gemini -p "$(cat {prompt_file})" --sandbox',
  run_in_background: true,
  timeout: {config.timeouts.cli_large_task_ms}
)

# claude-dev (또는 claude)인 경우
Task(
  subagent_type: "general-purpose",
  prompt: {prompt_file 내용},
  run_in_background: true
)
```

각 실행의 `task_id`를 기록하고, `request.json`에 영구 저장합니다:

```json
// request.json에 추가
{
  "background_task_ids": [
    { "task_id": "{bg_task_id}", "task_num": "01", "agent": "codex-dev", "status": "running" }
  ]
}
```

> **세션 간 추적**: background task_id를 request.json에 기록하여, 세션이 바뀌더라도 실행 중인 백그라운드 태스크를 추적하고 필요 시 `TaskStop(task_id)`로 취소할 수 있습니다.

##### 4d. 완료 감지 루프

모든 병렬 태스크가 완료될 때까지 다음 규칙으로 폴링합니다.

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

선행 태스크가 완료되면 blockedBy를 해소합니다.

1. 후속 태스크의 `blockedBy`에서 완료된 태스크를 제거합니다.
2. `blockedBy`가 비어 있으면 4c에 추가해 병렬 실행합니다.
3. 실패 전파:
   - 선행 태스크 상태가 `failed`이면, 해당 태스크를 `blockedBy`로 참조하는 모든 후속 태스크를 `cancelled`로 전이
   - 사용자에게 실패 전파 사실을 즉시 알림

#### Step 5: 사전 검증 (각 완료된 태스크별)

각 태스크가 완료되면 즉시 사전 검증을 실행합니다.

1. spec §5의 테스트 명령어 실행
2. spec §5의 타입 체크 명령어 실행
3. 결과 분기
   - **PASS**: `status`를 `review`로 전이 → **Step 5.5** (PM 커밋) 진입
   - **FAIL**: `status`를 `pre_check_failed`로 전이 → **Step 5b** (사전검증 실패 재외주 프로토콜) 진입

#### Step 5.5: PM 커밋 (사전검증 PASS 시)

Step 5에서 PASS 판정 후 PM이 직접 커밋합니다 (외주 에이전트의 `index.lock` 문제 방지).

1. spec §2 변경 파일 기반 git add:
   ```bash
   git -C {worktree_path} add {spec §2에 명시된 파일 목록}
   ```

2. `frontend/` 파일이 변경 범위(spec §2)에 포함된 경우 빌드 후 추가 add:
   ```bash
   cd {worktree_path}/frontend && npm install --prefer-offline && npm run build
   git -C {worktree_path} add dist/
   ```

3. PM이 커밋:
   ```bash
   git -C {worktree_path} commit -m "[{REQ_ID}/{TASK_ID}] {spec §1 요약}

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
   ```

4. 해당 태스크 `status`를 `committed`로 변경 → Step 6 진행

#### Step 5b: 사전검증 실패 재외주 (Pre-check Failure Re-outsourcing)

Step 5에서 FAIL 판정 시, PM이 직접 코드를 수정하지 않고 외주 에이전트에게 에러 컨텍스트와 함께 재요청합니다. 최대 재시도 횟수 소진 후에는 PM이 직접 개입합니다.

##### 5b-1. 에러 출력 캡처

- tsc 에러: 전체 stderr/stdout 캡처
- 테스트 실패: 실패한 테스트 목록 + 에러 메시지 캡처
- 에러 출력이 3000자를 초과하면 앞부분 500자 + 뒷부분 2500자로 트리밍

##### 5b-2. 재시도 카운터 확인

- `request.json`의 해당 태스크 `pre_check_retries` 필드 확인 (없으면 0)
- `config.retry.max_cli_retries` (기본 2) 미만이면 → 5b-3으로 진행 (재외주)
- 이상이면 → 5b-5로 진행 (PM 직접 개입)

##### 5b-3. 에러 수정 프롬프트 생성

outsource-brief 템플릿의 `<error_context>` 섹션을 활용하여 수정 프롬프트를 구성합니다:

```md
Write → .gran-maestro/requests/{REQ-ID}/tasks/{NN}/prompts/phase2-fix-R{N}.md
```

프롬프트에 포함할 내용:
- 원본 spec.md의 수락 조건 (§3)
- 캡처된 에러 출력 전문
- 수정 지침: "이 에러를 수정하고, 수정 후 검증 명령어를 실행하여 통과를 확인하세요"
- spec §5의 테스트/타입체크 명령어

##### 5b-4. 동일 worktree에서 재외주 실행

동일 에이전트, 동일 worktree에서 재실행합니다:

```md
Skill(skill: "mst:codex", args: "--prompt-file {prompt_path} --dir {worktree_path} --trace {REQ-ID}/{TASK-NUM}/phase2-fix-R{N}")
```

- `pre_check_retries` 값을 +1 증가시키고 `request.json`에 저장
- `status`를 `executing`으로 전이
- 재외주 완료 후 **Step 5로 복귀** (사전검증 재실행)

##### 5b-5. PM 직접 개입 (재외주 소진 시)

재외주 횟수가 `config.retry.max_cli_retries`에 도달한 경우:

0. **실행 중 백그라운드 태스크 취소**: `request.json`의 `background_task_ids`에서 `status: "running"`인 항목을 찾아 `TaskStop(task_id)`로 취소하고, 해당 항목의 `status`를 `"cancelled"`로 업데이트합니다. 이를 통해 고아 백그라운드 태스크 발생을 방지합니다.
1. PM이 에러 출력을 분석하고 직접 코드를 수정합니다
2. 수정 후 사전검증(Step 5)을 재실행합니다
3. `status`를 `review`로 전이 (PASS 시) 또는 사용자 개입 요청 (여전히 FAIL 시)

> **주의**: PM 직접 개입은 예외적인 경우에만 발생합니다. 이 경로에 진입했다는 것은 외주 에이전트가 2회 연속 동일 에러를 해결하지 못했음을 의미합니다.

#### Step 6: Phase 3 전환

모든 태스크가 `review` 이상 상태에 도달하면:
- `request.json`의 `current_phase`를 `3`으로 변경
- Phase 3 (PM 리뷰) 진입

#### Fallback 규칙

- 최대 깊이: 1단계 (codex → gemini, gemini → codex)
- 동일 에이전트 재시도: 최대 2회
- fallback 에이전트 재시도: 최대 2회
- 모두 실패 시: 사용자 개입 요청

### 최종 수락 (Phase 3 → Phase 5) — 자동 실행

Phase 3 리뷰가 PASS로 완료되면, `workflow.auto_accept_result` 설정에 따라 동작합니다:

- **`true` (기본)**: `/mst:accept` 프로토콜을 자동으로 실행합니다. 사용자 개입 없이 머지 → 정리 → 완료까지 진행됩니다.
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
- 병렬 실행 제한 변경 → `/mst:settings concurrency.batch_max_parallel_reqs 3` (기본 1, 최대 5)
