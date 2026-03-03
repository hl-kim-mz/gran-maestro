---
name: inspect
description: "특정 요청의 상세 상태를 표시합니다. 사용자가 '상세 상태', '자세히 보여줘', '상태 확인'을 말하거나 /mst:inspect를 호출할 때 사용. 전체 목록은 /mst:list를 사용."
user-invocable: true
argument-hint: "{REQ-ID}"
---

# maestro:inspect

특정 요청의 Phase 진행 상황, 태스크 상태, 에이전트 활동, 피드백 라운드 이력을 터미널에 표시합니다.

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

**스크립트 우선 실행**: `python3 {PLUGIN_ROOT}/scripts/mst.py request inspect {REQ-ID}` 실행. 성공 시 출력 그대로 사용. 실패 시 fallback.

**Fallback:** `$ARGUMENTS`에서 REQ ID 파싱 → `request.json` 읽기 → 각 태스크 `status.json` 읽기 → 포맷팅 후 출력

## 출력 형식

```
Gran Maestro — REQ-001 상세 상태
═══════════════════════════════════════

요청: "사용자 인증 기능 추가"
Phase: 2 (외주 실행)
생성: 2026-02-14 10:00
경과: 2h 30m

Phase 진행:
  [1] PM 분석    ████████████ 완료 (45m)
  [2] 외주 실행  ████████░░░░ 진행중
  [3] PM 리뷰    ░░░░░░░░░░░░ 대기
  [5] 수락/완료  ░░░░░░░░░░░░ 대기

태스크:
  01: JWT 미들웨어 구현
      Agent: codex-dev | Status: executing (45m)
      Worktree: {PROJECT_ROOT}/.gran-maestro/worktrees/REQ-001-01
  02: 로그인 UI 구현
      Agent: gemini-dev | Status: pending
      blockedBy: REQ-001-01
  03: 유저 모델 테스트
      Agent: codex-dev | Status: completed (38s)

종속성:
  blockedBy: []
  blocks: [REQ-002]
```

## 문제 해결

- "REQ-ID를 찾을 수 없음" → `REQ-NNN` 형식 확인; `/mst:list`로 목록 조회
- `request.json` 읽기 실패 → 파일 손상 가능; `.gran-maestro/requests/{REQ-ID}/` 확인
