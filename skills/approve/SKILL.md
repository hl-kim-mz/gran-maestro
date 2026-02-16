---
name: approve
description: "스펙을 승인하거나 최종 결과물을 수락합니다. 사용자가 '승인', '진행해', 'OK 진행'을 말하거나 /mst:approve를 호출할 때 사용. Gran Maestro 워크플로우 내에서만 의미 있으며, 일반적인 확인 응답에는 사용하지 않음."
user-invocable: true
argument-hint: "[REQ-ID] [--final]"
---

# maestro:approve

PM이 작성한 구현 스펙을 승인하거나, 완료된 결과물을 최종 수락합니다.

## 실행 프로토콜

### REQ ID 결정 (인자 없이 호출 시)

`$ARGUMENTS`에 REQ ID가 없으면, 승인 대기 중인 요청을 **REQ 번호 오름차순**으로 자동 선택합니다:

1. `.gran-maestro/requests/` 디렉토리의 모든 `request.json`을 스캔
2. 승인 가능한 상태의 요청을 필터링:
   - **스펙 승인 대기**: `current_phase == 1` 이고 `status`가 `phase1_analysis`가 아닌 것 (PM 분석 완료 상태), 또는 `status`가 `phase2_spec_review`인 것
   - **최종 수락 대기** (`--final` 옵션 시): `current_phase == 3` 이고 `status`가 `phase3_review` 또는 리뷰 PASS 상태
3. REQ 번호(숫자) 오름차순으로 정렬하여 **첫 번째 요청**을 선택
4. 승인 대기 중인 요청이 없으면 사용자에게 "승인 대기 중인 요청이 없습니다"라고 알림

예시:
```
/mst:approve           # REQ-002가 Phase 1 완료 대기 → REQ-002 스펙 승인
/mst:approve --final   # REQ-001이 Phase 3 리뷰 PASS → REQ-001 최종 수락
/mst:approve REQ-003   # 명시적으로 REQ-003 승인 (기존 동작 유지)
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

각 태스크에 대해 다음 순서로 실행합니다:

#### Step 1: 스펙 검증 (외주 전 필수)

spec.md에서 다음 항목이 명확한지 확인합니다. 부족하면 보완 후 진행:
- **수락 조건** (§3): 모든 AC가 pass/fail로 측정 가능한지
- **테스트 계획** (§5): 테스트 실행 명령어와 항목이 구체적인지
- **변경 범위** (§2): 수정 파일 목록이 명시되어 있는지

**Ideation 자동 트리거 (LLM 판단)**: 스펙 검증 과정에서 아래 상황이 감지되면 `/mst:ideation`을 호출하여 다각도 분석 후 스펙을 보완합니다:
- 접근 방식의 타당성이 불확실하거나 대안이 더 나을 수 있는 경우
- 수락 조건이 모호하여 외주 에이전트가 올바르게 구현하기 어려운 경우
- 아키텍처/보안/성능 관련 설계 결정의 근거가 부족한 경우
LLM이 종합적으로 판단하여 ideation 필요 여부를 결정합니다. 명백한 구현의 경우 스킵합니다.

#### Step 2: 실행 에이전트 결정

spec.md의 `Assigned Agent` 필드와 `§8 에이전트 팀 구성`을 읽어 에이전트를 결정합니다.
`agents.json`의 capabilities 기준:

| 태스크 유형 | 에이전트 | capabilities |
|------------|---------|-------------|
| 백엔드, 리팩토링, 테스트 | `codex-dev` → `/mst:codex` | code, refactor, test |
| **프론트엔드, 문서, 대용량 컨텍스트** | **`gemini-dev` → `/mst:gemini`** | **frontend, docs, large-context** |

spec.md에 에이전트가 지정되어 있으면 그대로 사용합니다. 지정되지 않은 경우 `config.json`의 `workflow.default_agent`를 사용합니다.

#### Step 3: Outsource Brief 작성 및 외주 실행

spec.md의 내용을 기반으로 Outsource Brief(프롬프트)를 구성하여 외주합니다.
Brief에는 반드시 다음을 포함합니다:
- 구현할 내용 요약 (spec §1, §4)
- 수정 대상 파일 목록 (spec §2)
- 수락 조건 전체 (spec §3) — 에이전트가 스스로 검증할 수 있도록
- 테스트 실행 명령어 (spec §5)

호출 방법 (반드시 `Skill` 도구 사용, OMC MCP 직접 호출 금지):

```
# codex-dev인 경우
Skill(skill: "mst:codex", args: "{outsource_brief} --dir {worktree_path} --trace {REQ-ID}/{TASK-NUM}/phase2-impl")

# gemini-dev인 경우
Skill(skill: "mst:gemini", args: "{outsource_brief} --files {worktree_path}/**/* --trace {REQ-ID}/{TASK-NUM}/phase2-impl")
```

#### Step 4: 실행 결과 확인 및 Phase 3 전환

1. Trace 파일 경로 확인 (`.gran-maestro/requests/{REQ-ID}/tasks/{NN}/traces/`)
2. `status.json`을 `executing` → `pre_check`로 변경
3. 사전 검증 실행:
   - spec §5의 테스트 명령어 실행 (Bash 진단 전용)
   - spec §5의 타입 체크 명령어 실행 (Bash 진단 전용)
4. 사전 검증 결과:
   - **PASS**: `status.json`을 `review`로 변경, `request.json`의 `current_phase`를 3으로 변경, Phase 3 (PM 리뷰) 진입
   - **FAIL**: `status.json`을 `pre_check_failed`로 변경, 실패 내용을 포함하여 동일 에이전트로 재실행 (최대 2회). 재실행 실패 시 fallback 에이전트로 전환 (`agents.json`의 `fallback` 필드 참조)

#### Fallback 규칙

- 최대 깊이: 1단계 (codex → gemini, gemini → codex)
- 동일 에이전트 재시도: 최대 2회
- fallback 에이전트 재시도: 최대 2회
- 모두 실패 시: 사용자 개입 요청

### 최종 수락 (Phase 3 → Phase 5)

`--final` 옵션 사용 시:

1. 리뷰 리포트가 PASS인지 확인
2. 최종 요약 리포트 생성
3. Worktree → main 브랜치 rebase + squash merge
4. Worktree 삭제 + 브랜치 정리
5. Phase 5 완료 처리

## 옵션

- `--final`: 최종 결과물 수락 (Phase 5 진입)

## 예시

```
/mst:approve                  # 승인 대기 중인 첫 번째 요청 자동 선택 → Phase 2 진입
/mst:approve --final          # 최종 수락 대기 중인 첫 번째 요청 자동 선택 → Phase 5 완료
/mst:approve REQ-001          # 명시적으로 REQ-001 스펙 승인 → Phase 2 진입
/mst:approve REQ-001 --final  # 명시적으로 REQ-001 최종 수락 → Phase 5 완료
```

## 문제 해결

- "승인할 스펙이 없음" → 해당 요청이 Phase 1(PM 분석) 완료 상태인지 확인. `/mst:inspect {REQ-ID}`로 상태 조회
- "이미 승인됨" → 해당 요청이 이미 Phase 2 이후에 있음. `/mst:inspect {REQ-ID}`로 현재 Phase 확인
- "리뷰가 PASS가 아님" (--final 사용 시) → 리뷰 리포트에서 미충족 수락조건 확인. 피드백 루프를 먼저 완료
