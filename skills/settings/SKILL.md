---
name: settings
description: "Gran Maestro 설정을 조회하거나 변경합니다. 사용자가 '설정', '설정 변경', '환경 설정'을 말하거나 /mst:settings를 호출할 때 사용. 모드 전환에는 /mst:on 또는 /mst:off를 사용."
user-invocable: true
argument-hint: "[{key} [{value}]]"
---

# maestro:config

`{PROJECT_ROOT}/.gran-maestro/config.json`의 설정을 조회하거나 변경합니다.

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

1. 인자 없이 호출 시: 전체 설정 표시
2. key만 지정 시: 해당 설정값 표시
3. key와 value 모두 지정 시: 설정 변경

## 설정 항목

| 키 | 설명 | 기본값 | 타입 |
|----|------|--------|------|
| `workflow.max_feedback_rounds` | 최대 피드백 반복 횟수 | `5` | number |
| `workflow.auto_approve_spec` | 스펙 자동 승인 여부 | `false` | boolean |
| `workflow.auto_accept_result` | Phase 3 리뷰 PASS 후 자동 수락 여부 | `true` | boolean |
| `workflow.auto_approve_on_unblock` | 의존성 해소 후 자동 approve 실행 여부 | `false` | boolean |
| `discussion.response_char_limit` | Discussion 라운드 응답 글자 제한 | `2000` | number |
| `discussion.critique_char_limit` | Discussion Critic 평가 글자 제한 | `2000` | number |
| `discussion.default_max_rounds` | Discussion 기본 최대 라운드 수 | `5` | number |
| `discussion.max_rounds_upper_limit` | Discussion 최대 라운드 상한 | `10` | number |
| `ideation.opinion_char_limit` | Ideation 의견 글자 제한 | `2000` | number |
| `ideation.critique_char_limit` | Ideation Critic 평가 글자 제한 | `2000` | number |
| `workflow.default_agent` | 기본 실행 에이전트 | `codex-dev` | string |
| `server.port` | 대시보드 포트 | `3847` | number |
| `server.host` | 대시보드 호스트 | `127.0.0.1` | string |
| `concurrency.max_parallel_tasks` | 최대 병렬 태스크 수 | `5` | number |
| `concurrency.max_parallel_reviews` | 최대 병렬 리뷰 수 | `3` | number |
| `concurrency.queue_strategy` | 큐 전략 | `fifo` | string |
| `timeouts.cli_default_ms` | CLI 기본 타임아웃 (ms) | `300000` | number |
| `timeouts.cli_large_task_ms` | 대규모 태스크 타임아웃 (ms) | `1800000` | number |
| `timeouts.pre_check_ms` | 사전 검증 타임아웃 (ms) | `120000` | number |
| `timeouts.merge_ms` | Merge 타임아웃 (ms) | `60000` | number |
| `worktree.root_directory` | worktree 루트 경로 | `.gran-maestro/worktrees` | string |
| `worktree.max_active` | 최대 활성 worktree 수 | `10` | number |
| `worktree.base_branch` | worktree 기준 브랜치 | `main` | string |
| `worktree.stale_timeout_hours` | stale 판정 시간 (시) | `24` | number |
| `retry.max_cli_retries` | 최대 CLI 재시도 횟수 | `2` | number |
| `retry.max_fallback_depth` | 최대 fallback 깊이 | `1` | number |
| `retry.backoff_base_ms` | 재시도 백오프 기준 (ms) | `1000` | number |
| `history.retention_days` | 이력 보존 기간 (일) | `30` | number |
| `history.auto_archive` | 자동 아카이브 | `true` | boolean |
| `ideation.agents.codex` | 1 | Ideation Codex 참여 인원수 (0=제외) | number |
| `ideation.agents.gemini` | 1 | Ideation Gemini 참여 인원수 (0=제외) | number |
| `ideation.agents.claude` | 1 | Ideation Claude 참여 인원수 (0=제외) | number |
| `discussion.agents.codex` | 1 | Discussion Codex 참여 인원수 (0=제외) | number |
| `discussion.agents.gemini` | 1 | Discussion Gemini 참여 인원수 (0=제외) | number |
| `discussion.agents.claude` | 1 | Discussion Claude 참여 인원수 (0=제외) | number |
| `notifications.terminal` | 터미널 알림 활성화 | `true` | boolean |
| `notifications.dashboard` | 대시보드 알림 활성화 | `true` | boolean |
| `debug.enabled` | 디버그 모드 | `false` | boolean |
| `debug.log_level` | 로그 레벨 | `info` | string |
| `debug.log_prompts` | 프롬프트 로깅 | `false` | boolean |
| `explore.agents.codex` | `1` | Explore Codex 탐색 에이전트 수 (0=제외) | number |
| `explore.agents.gemini` | `1` | Explore Gemini 탐색 에이전트 수 (0=제외) | number |
| `explore.agents.claude` | `0` | Explore Claude 탐색 에이전트 수 (0=제외, Claude는 PM 종합자로만 사용) | number |

### debug.agents
| 키 | 기본값 | 설명 |
|---|---|---|
| `debug.agents.codex` | 1 | Debug 조사에 참여하는 Codex 에이전트 수 (0=제외) |
| `debug.agents.gemini` | 1 | Debug 조사에 참여하는 Gemini 에이전트 수 (0=제외) |
| `debug.agents.claude` | 0 | Debug 조사에 참여하는 Claude 에이전트 수 (0=제외) |

- 총합: 1명 이상 6명 이하
- 프로바이더별 상한 없음
- 누락 시 기본값: `codex: 1`, `gemini: 1`, `claude: 0`

## 예시

```
/mst:settings                                        # 전체 설정 표시
/mst:settings workflow.max_feedback_rounds            # 특정 설정 조회
/mst:settings workflow.max_feedback_rounds 3          # 최대 피드백 3회로 변경
/mst:settings workflow.auto_approve_spec true         # 스펙 자동 승인 활성화
/mst:settings workflow.auto_accept_result false       # 최종 수락 수동 모드로 전환
/mst:settings workflow.auto_approve_on_unblock true  # 의존 체인 자동 실행 활성화
/mst:settings workflow.default_agent gemini-dev       # 기본 에이전트를 Gemini로 변경
```

## 문제 해결

- "config.json 없음" → `/mst:on` 또는 `/mst:request`로 자동 생성
- "잘못된 키" → 점(`.`) 구분자로 중첩 접근 (예: `workflow.max_feedback_rounds`)
- "타입 불일치" → boolean은 `true`/`false`, number는 숫자만, string은 따옴표 없이
