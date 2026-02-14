---
name: maestro:config
description: "Gran Maestro 설정을 조회하거나 변경합니다"
user-invocable: true
argument-hint: "[<key> [<value>]]"
aliases: ["mcf"]
---

# maestro:config

Gran Maestro의 설정을 조회하거나 변경합니다.
`.gran-maestro/config.json` 파일을 관리합니다.

## 실행 프로토콜

1. 인자 없이 호출 시: 전체 설정 표시
2. key만 지정 시: 해당 설정값 표시
3. key와 value 모두 지정 시: 설정 변경

## 설정 항목

| 키 | 설명 | 기본값 | 타입 |
|----|------|--------|------|
| `workflow.max_feedback_rounds` | 최대 피드백 반복 횟수 | `5` | number |
| `workflow.auto_approve_spec` | 스펙 자동 승인 여부 | `false` | boolean |
| `workflow.default_agent` | 기본 실행 에이전트 | `codex-dev` | string |
| `server.port` | 대시보드 포트 | `3847` | number |
| `server.host` | 대시보드 호스트 | `127.0.0.1` | string |
| `server.auth_enabled` | 대시보드 인증 활성화 | `true` | boolean |
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
| `notifications.terminal` | 터미널 알림 활성화 | `true` | boolean |
| `notifications.dashboard` | 대시보드 알림 활성화 | `true` | boolean |
| `debug.enabled` | 디버그 모드 | `false` | boolean |
| `debug.log_level` | 로그 레벨 | `info` | string |
| `debug.log_prompts` | 프롬프트 로깅 | `false` | boolean |

## 예시

```
/mcf                                        # 전체 설정 표시
/mcf workflow.max_feedback_rounds            # 특정 설정 조회
/mcf workflow.max_feedback_rounds 3          # 최대 피드백 3회로 변경
/mcf workflow.auto_approve_spec true         # 스펙 자동 승인 활성화
/mcf workflow.default_agent gemini-dev       # 기본 에이전트를 Gemini로 변경
```

## 한국어 트리거

- "설정", "설정 변경", "환경 설정"
