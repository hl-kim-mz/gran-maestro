---
name: feedback
description: "Gran Maestro 워크플로우 내에서 수동 피드백을 제공합니다 (Phase 4). 사용자가 진행 중인 요청에 대해 '피드백'을 말하거나 /mst:feedback을 호출할 때 사용. 일반적인 코드 수정 요청이나 워크플로우 외부의 '수정해줘', '변경해줘'에는 사용하지 않음."
user-invocable: true
argument-hint: "{REQ-ID} {피드백 내용}"
---

# maestro:feedback

사용자가 직접 피드백을 제공하여 Phase 4(피드백 루프)를 트리거합니다.

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

1. `$ARGUMENTS`에서 REQ ID + 피드백 내용 파싱
2. Feedback Composer 활성화 → 구조화된 피드백 문서 변환 → `tasks/NN/feedback-RN.md` 저장
3. 실패 유형 분류 및 라우팅:
   - **구현 오류 → Phase 2 재실행** (아래 외주 재실행 프로토콜 참조)
   - **스펙 불충분 → Phase 1 보완** (spec.md 보완 후 승인 대기)
   - **설계 재검토 (LLM 판단)**: 근본적 설계 방향 전환 시사 시 `/mst:ideation` 호출 → 스펙 재작성 (예: 아키텍처 변경, 기술 스택 교체, 성능/보안 구조 재설계)
4. 피드백 라운드 카운터 증가; 최대 횟수(기본 5회) 초과 시 사용자 개입 요청

### 외주 재실행 프로토콜 (구현 오류 시)

**반드시 `/mst:codex` 또는 `/mst:gemini`를 통해 외주. Claude(PM) 직접 코드 수정 금지.**

1. spec.md에서 `Assigned Agent` 확인
2. 수정 프롬프트 구성: spec.md §3 수락 조건 + feedback-RN.md 수정 요청 + §5 테스트 명령
3. 외주 실행: codex-dev → `Skill("mst:codex", "--dir {worktree_path} --trace {REQ-ID}/{TASK-NUM}/phase4-fix-RN")`; gemini-dev → `Skill("mst:gemini", "--dir {worktree_path} --files {worktree_path}/**/* --trace ...")`
4. **스크립트 우선**: `python3 {PLUGIN_ROOT}/scripts/mst.py request set-phase {REQ_ID} 2 phase2_execution`; 실패 시 fallback으로 `current_phase`=2, `status`=`phase2_execution` 직접 업데이트 → 완료 후 사전 검증 → Phase 3

## 문제 해결

- "해당 요청을 찾을 수 없음" → REQ ID 형식 확인; `/mst:list`로 조회
- "최대 피드백 횟수 초과" → `/mst:settings workflow.max_feedback_rounds` 확인; 값 증가 또는 `/mst:request`로 스펙 재작성
- "활성 태스크 없음" → `/mst:inspect {REQ-ID}`로 Phase 2~3 여부 확인
