# Implementation Request — Self-Exploration Mode

- Request: {{REQ_ID}} / Task: {{TASK_ID}}
- Worktree: {{WORKTREE_PATH}}
- Spec: {{SPEC_PATH}}

## 구현 컨텍스트 (PM 작성 — 3~5줄 자유 형식)

{{IMPL_CONTEXT}}

## 자기탐색 지시

아래 순서로 스펙을 직접 탐색하라. PM이 제공한 요약에 의존하지 말고 원본 파일을 직접 읽어라.

1. 스펙 직접 읽기: `cat {{SPEC_PATH}}` (또는 Read 도구)
2. §2 변경 범위의 파일 목록 파악
3. §3 수락 조건을 기준으로 구현
4. §5 테스트 명령어를 실행하고 출력 전체를 응답에 포함하세요 (커밋은 PM이 처리)

## 이전 피드백 (Phase 4 → 재실행 시)

{{PREV_FEEDBACK_PATH}}

(첫 실행 시: N/A — 이 섹션을 무시하라)

## 규칙

- spec §2의 변경 범위 외 파일 수정 금지
- 추가 기능, 리팩토링, 스타일 변경 금지
- git commit은 하지 마세요 — PM이 직접 커밋합니다
- 완료 전 §5 테스트 명령어를 실행하고 출력 전체를 응답에 포함하세요
