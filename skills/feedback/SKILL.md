---
name: feedback
description: "Gran Maestro 워크플로우 내에서 수동 피드백을 제공합니다 (Phase 4). 사용자가 진행 중인 요청에 대해 '피드백'을 말하거나 /mst:feedback을 호출할 때 사용. 일반적인 코드 수정 요청이나 워크플로우 외부의 '수정해줘', '변경해줘'에는 사용하지 않음."
user-invocable: true
argument-hint: "{REQ-ID} {피드백 내용}"
---

# maestro:feedback

사용자가 직접 피드백을 제공하여 Phase 4(피드백 루프)를 트리거합니다.

## 필수 입력 스키마

mst:feedback 실행 시 아래 정보를 반드시 제공해야 합니다:

- `failure_class`: `ac_unclear | interpretation | implementation` 중 하나 (필수)
  - `ac_unclear`: AC/spec 자체가 모호하거나 불완전한 경우
  - `interpretation`: 구현 의도와 실제 결과가 불일치한 경우
  - `implementation`: 올바른 의도로 구현했으나 실행 오류가 발생한 경우
- `evidence`: AC-ID 매핑 배열 (최소 1개 필수). 각 항목은 아래 필드를 포함해야 함:
  - `ac_id`: 관련 AC ID (예: `AC-01`). `spec.md`의 AC-ID와 일치해야 함. 불일치 시 경고를 표시하고 PM이 확인하도록 안내함 (차단은 아님). `ac_id`가 누락된 경우 경고를 표시하며 차단 여부는 PM이 판단함.
  - `type`: `log | screenshot | metric | manual`
  - `ref`: 증거 경로 또는 설명
  - `summary`: 실패 내용 요약
- `next_action`: 재작업 지시 내용 (구현 방법을 지시하지 않고, 어느 AC/기준을 복구해야 하는지만 명시)

**스키마 검증 규칙 (차단):**
- `failure_class`가 제공되지 않았거나 허용값(`ac_unclear | interpretation | implementation`) 외의 값이면 → 오류를 반환하고 피드백 저장 및 전파를 차단함
- `evidence` 배열이 비어 있거나 제공되지 않았으면 → "evidence가 없으면 판정 불가" 오류를 반환하고 차단함

## 실패 분류별 자동 라우팅

`failure_class` 값에 따라 아래 라우팅을 자동으로 수행합니다:

| failure_class | 라우팅 동작 |
|---|---|
| `ac_unclear` | AC/spec 자체가 모호함 → **PM이 spec 재정의 태스크를 생성**하여 AC를 명확화한다. Dev Agent 재작업 지시 전에 spec을 먼저 수정함. |
| `interpretation` | 구현 의도 불일치 → **Dev Agent 재작업 지시**. 의도 보강 설명(어느 AC를 충족해야 하는지)을 포함하여 외주를 실행함. |
| `implementation` | 실행 오류 → **Dev Agent 버그 수정 지시**. 실패 로그(`evidence`)를 첨부하여 외주를 실행함. |

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

1. `$ARGUMENTS`에서 REQ ID + 피드백 내용 파싱
2. Feedback Composer 활성화 → 구조화된 피드백 문서 변환 → `tasks/NN/feedback-RN.md` 저장
3. 실패 유형 분류 및 라우팅:

   **failure_class 3종 판단 기준**:
   - `ac_unclear` (스펙 불충분): AC 자체가 모호한 경우 → **Phase 1 보완** (spec.md 보완 후 승인 대기)
     - 판단 예: Given/When/Then 중 하나라도 비어있거나 "빠르게", "충분히"처럼 측정 불가한 표현 포함
     - 판단 예: PM도 테스트 통과 여부를 판단할 수 없을 때
   - `interpretation` (구현 오류 - 의도 불일치): 구현 의도 불일치 → **Phase 2 재실행** (아래 외주 재실행 프로토콜 참조)
     - 판단 예: 코드는 에러 없이 실행되나 AC Then 조건과 다른 동작
     - 판단 예: "사용자 이름이 표시돼야 함" → "이메일이 표시됨"
   - `implementation` (구현 오류 - 실행 오류): 실행 오류 → **Phase 2 재실행** (아래 외주 재실행 프로토콜 참조)
     - 판단 예: 예외(Exception), TypeError, 빌드 실패, tsc 에러 발생
     - 판단 예: 테스트 코드 실행 시 assertion 실패

   - **설계 재검토 (PM 판단)**: failure_class 3종 중 어느 것도 아닌 경우에만 해당. PM이 명시적으로 판단하여 `/mst:ideation` 호출 → 스펙 재작성. 이 분기는 자동 라우팅되지 않으며, 반드시 PM의 명시적 판단에 의해서만 트리거됨.
     - 해당 사례: 요구사항 자체가 변경됨 (failure_class 3종으로 분류 불가)
     - 해당 사례: 동일 태스크 재작업을 반복해도 AC를 충족할 수 없는 구조적 한계
     - 해당 사례: 기술 스택 변경 또는 아키텍처 전면 재설계가 필요한 경우 (예: 아키텍처 변경, 기술 스택 교체, 성능/보안 구조 재설계)
4. 피드백 라운드 카운터 증가; 최대 횟수(기본 5회) 초과 시 사용자 개입 요청

### 외주 재실행 프로토콜 (구현 오류 시)

**반드시 `/mst:codex` 또는 `/mst:gemini`를 통해 외주. Claude(PM) 직접 코드 수정 금지.**

1. spec.md에서 `Assigned Agent` 확인
2. 수정 프롬프트 구성: spec.md §3 수락 조건 + feedback-RN.md 수정 요청 + §5 테스트 명령
3. 외주 실행:
   - codex-dev → `Skill("mst:codex", "--dir {worktree_path} --trace {REQ-ID}/{TASK-NUM}/phase4-fix-R{N}")`
   - gemini-dev → `Skill("mst:gemini", "--dir {worktree_path} --files {worktree_path}/**/* --trace {REQ-ID}/{TASK-NUM}/phase4-fix-R{N}")`
   - claude-dev → `Skill("mst:claude", "--prompt-file {prompt_path} --dir {worktree_path} --trace {REQ-ID}/{TASK-NUM}/phase4-fix-R{N}")`
4. **스크립트 우선**: `python3 {PLUGIN_ROOT}/scripts/mst.py request set-phase {REQ_ID} 2 phase2_execution`; 실패 시 fallback으로 `current_phase`=2, `status`=`phase2_execution` 직접 업데이트 → 완료 후 사전 검증 → Phase 3
5. **외주 재실행 완료 후 Phase 3 복귀**:
   - **자동 실행 경로**: approve 스킬이 활성 상태(approve 루프)인 경우, Phase 3(mst:review)은 approve 루프에서 자동으로 재트리거됨
   - **수동 실행 경로**: feedback이 독립 호출된 경우, 재작업 완료 후 `/mst:approve REQ-NNN`을 수동으로 호출해 Phase 3을 재시작해야 함

## 문제 해결

- "해당 요청을 찾을 수 없음" → REQ ID 형식 확인; `/mst:list`로 조회
- "최대 피드백 횟수 초과" → `/mst:settings workflow.max_feedback_rounds` 확인; 값 증가 또는 `/mst:request`로 스펙 재작성
- "활성 태스크 없음" → `/mst:inspect {REQ-ID}`로 Phase 2~3 여부 확인
