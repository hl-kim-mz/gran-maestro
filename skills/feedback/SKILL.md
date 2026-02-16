---
name: feedback
description: "Gran Maestro 워크플로우 내에서 수동 피드백을 제공합니다 (Phase 4). 사용자가 진행 중인 요청에 대해 '피드백'을 말하거나 /mst:feedback을 호출할 때 사용. 일반적인 코드 수정 요청이나 워크플로우 외부의 '수정해줘', '변경해줘'에는 사용하지 않음."
user-invocable: true
argument-hint: "{REQ-ID} {피드백 내용}"
---

# maestro:feedback

사용자가 직접 피드백을 제공하여 Phase 4 (피드백 루프)를 트리거합니다.
자동 리뷰와 별개로 사용자의 수동 관찰/요구사항을 전달할 때 사용합니다.

## 실행 프로토콜

1. `$ARGUMENTS`에서 REQ ID와 피드백 내용 파싱
2. Feedback Composer 에이전트 활성화 (`gran-maestro:feedback-composer`)
3. 사용자 피드백을 구조화된 피드백 문서로 변환
4. `.gran-maestro/requests/{REQ-ID}/tasks/NN/feedback-RN.md` 저장
5. 실패 유형 분류 및 라우팅:
   - **구현 오류 → Phase 2 재실행** (아래 외주 재실행 프로토콜 참조)
   - **스펙 불충분 → Phase 1 보완** (PM Conductor가 spec.md 보완 후 다시 승인 대기)
   - **설계 재검토 필요 (LLM 판단)**: 피드백이 단순 구현 오류가 아니라 근본적인 설계 방향 전환을 시사하는 경우, `/mst:ideation`을 호출하여 대안 분석 후 스펙을 재작성합니다. 예: 아키텍처 변경 요구, 다른 기술 스택 제안, 성능/보안 구조 재설계 등
6. 피드백 라운드 카운터 증가
7. 최대 피드백 횟수(기본 5회) 초과 시 사용자 개입 요청

### 외주 재실행 프로토콜 (구현 오류 시)

피드백으로 인해 Phase 2를 재실행할 때도 **반드시 `/mst:codex` 또는 `/mst:gemini`를 통해 외주**합니다. Claude(PM)가 직접 코드를 수정하지 않습니다.

1. 해당 태스크의 spec.md에서 `Assigned Agent` 확인
2. feedback-RN.md의 피드백 내용을 포함한 수정 프롬프트 구성:
   - 원본 spec.md의 수락 조건 (§3)
   - 피드백 문서의 수정 요청 사항
   - 테스트 실행 명령어 (§5) — 수정 후 에이전트가 직접 검증할 수 있도록
3. 동일 worktree에서 외주 실행:
   ```
   # codex-dev인 경우
   Skill(skill: "mst:codex", args: "{수정 프롬프트} --dir {worktree_path} --trace {REQ-ID}/{TASK-NUM}/phase4-fix-RN")

   # gemini-dev인 경우
   Skill(skill: "mst:gemini", args: "{수정 프롬프트} --files {worktree_path}/**/* --trace {REQ-ID}/{TASK-NUM}/phase4-fix-RN")
   ```
4. `request.json`의 `current_phase`를 2로, `status`를 `phase2_execution`으로 변경
5. 실행 완료 후 사전 검증 (테스트 + 타입 체크) → Phase 3 리뷰로 전환

## 예시

```
/mst:feedback REQ-001 "JWT 토큰 만료 시간이 너무 짧아요, 24시간으로 변경해주세요"
/mst:feedback REQ-002 "로그인 버튼 위치를 오른쪽 상단으로 이동해주세요"
```

## 문제 해결

- "해당 요청을 찾을 수 없음" → REQ ID 형식 확인. `/mst:list`로 활성 요청 목록 조회
- "최대 피드백 횟수 초과" → `/mst:settings workflow.max_feedback_rounds`로 현재 설정 확인. 필요 시 값 증가 또는 스펙 재작성(`/mst:start`)
- "활성 태스크 없음" → 해당 요청이 Phase 2~3 사이에 있는지 `/mst:inspect {REQ-ID}`로 확인
