# Code Review Request — Self-Exploration Mode

- Request: {{REQ_ID}} / Task: {{TASK_ID}}
- Worktree: {{WORKTREE_PATH}}
- Base branch: {{BASE_BRANCH}}

## 변경 의도 (PM 작성 — 1~3줄 자유 형식)

{{INTENT}}

## 리뷰 관점

{{PERSPECTIVE}}

## 자기탐색 지시

아래 순서로 변경사항을 직접 탐색하라. PM이 제공한 diff나 요약에 의존하지 말고 직접 확인하라.

1. `git -C {{WORKTREE_PATH}} diff --name-only {{BASE_BRANCH}}...HEAD` — 변경된 파일 목록 파악
2. `git -C {{WORKTREE_PATH}} diff {{BASE_BRANCH}}...HEAD` — 전체 변경 내용 확인
3. 변경된 파일만 탐색할 것. 변경되지 않은 파일은 검토 범위 밖이다
4. 필요 시 관련 파일을 직접 읽어 문맥 파악

## 수락 조건 (검토 기준)

{{ACCEPTANCE_CRITERIA}}

## 포커스 힌트

{{FOCUS_HINTS}}

## 출력 형식

- **결과**: PASS / FAIL / PARTIAL
- **이슈 목록**: `파일:라인 | 심각도(critical/high/medium/low) | 설명`
- **개선 제안**: 필수 수정 사항 외 선택적 개선 (있는 경우만)
