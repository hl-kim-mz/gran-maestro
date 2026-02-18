---
name: approve
description: "스펙을 승인하고 실행을 시작합니다. 사용자가 '승인', '진행해', 'OK 진행'을 말하거나 /mst:approve를 호출할 때 사용. Gran Maestro 워크플로우 내에서만 의미 있으며, 일반적인 확인 응답에는 사용하지 않음."
user-invocable: true
argument-hint: "[REQ-ID]"
---

# maestro:approve

PM이 작성한 구현 스펙을 승인하고 Phase 2 실행을 시작합니다. Phase 3 리뷰 PASS 후 최종 수락은 기본적으로 자동 실행됩니다 (`workflow.auto_accept_result` 설정).

## 실행 프로토콜

### REQ ID 결정 (인자 없이 호출 시)

`$ARGUMENTS`에 REQ ID가 없으면, 스펙 승인 대기 중인 요청을 **REQ 번호 오름차순**으로 자동 선택합니다:

1. `.gran-maestro/requests/` 디렉토리의 모든 `request.json`을 스캔
2. 스펙 승인 가능한 상태의 요청을 필터링:
   - `current_phase == 1` 이고 `status`가 `phase1_analysis`가 아닌 것 (PM 분석 완료 상태), 또는 `status`가 `phase2_spec_review`인 것
3. REQ 번호(숫자) 오름차순으로 정렬하여 **첫 번째 요청**을 선택
4. 승인 대기 중인 요청이 없으면 사용자에게 "승인 대기 중인 요청이 없습니다"라고 알림

예시:
```
/mst:approve           # REQ-002가 Phase 1 완료 대기 → REQ-002 스펙 승인
/mst:approve REQ-003   # 명시적으로 REQ-003 승인
```

### 스펙 승인 (Phase 1 → Phase 2)

1. REQ ID 결정 (위 규칙에 따라 `$ARGUMENTS`에서 파싱하거나 자동 선택)
2. `.gran-maestro/requests/{REQ-ID}/tasks/` 하위 spec.md 파일 확인
   - **spec.md가 없는 경우**: Phase 1 분석이 미완료 상태. 사용자에게 알리고 PM Conductor 분석을 재실행하여 spec.md 작성 완료
3. 스펙 요약을 사용자에게 표시
4. 승인 시:
   - `request.json`의 `current_phase`를 2로 변경
   - `request.json`의 `status`를 `phase2_execution`으로 변경
   - 각 태스크에 대해 git worktree 생성
   - Phase 2 (외주 실행) 프로토콜 실행 (아래 참조)

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

spec.md에 에이전트가 지정되어 있으면 그대로 사용합니다. 지정되지 않은 경우 `config.json`의 `workflow.default_agent`를 사용합니다.

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

Brief에는 반드시 다음이 포함되어야 합니다.
- 구현할 내용 요약 (spec §1, §4)
- 수정 대상 파일 목록 (spec §2)
- 수락 조건 전체 (spec §3)
- 테스트 실행 명령어 (spec §5)

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
```

각 실행의 `task_id`를 기록합니다.

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

각 태스크가 완료되면 즉시 사전 검증을 실행합니다. (기존 Step 4 내용 유지)

1. spec §5의 테스트 명령어 실행
2. spec §5의 타입 체크 명령어 실행
3. 결과 분기
   - **PASS**: `status`를 `review`로 전이
   - **FAIL**: `status`를 `pre_check_failed`로 전이 → **Step 5b** (사전검증 실패 재외주 프로토콜) 진입

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
/mst:approve           # 스펙 승인 대기 중인 첫 번째 요청 자동 선택
/mst:approve REQ-001   # 명시적으로 REQ-001 스펙 승인
```

## 문제 해결

- "승인할 스펙이 없음" → 해당 요청이 Phase 1(PM 분석) 완료 상태인지 확인. `/mst:inspect {REQ-ID}`로 상태 조회
- "이미 승인됨" → 해당 요청이 이미 Phase 2 이후에 있음. `/mst:inspect {REQ-ID}`로 현재 Phase 확인
- 최종 수락이 필요한 경우 → Phase 3 리뷰 PASS 후 `/mst:accept`를 수동 호출하거나, `workflow.auto_accept_result`를 `true`로 설정
