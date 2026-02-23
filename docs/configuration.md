# 설정 관리 (Configuration Reference)

[← README](../README.md)

`.gran-maestro/config.json`으로 모든 동작을 제어합니다.
`/mst:start` 또는 `/mst:on` 첫 실행 시 기본 설정으로 자동 생성됩니다.

```
/mst:settings                                    # 전체 설정 표시
/mst:settings workflow.max_feedback_rounds        # 특정 설정 조회
/mst:settings workflow.max_feedback_rounds 3      # 설정 변경
```

대시보드의 **Settings** 탭에서도 웹 UI로 변경할 수 있습니다.

---

## 목차

- [workflow](#workflow)
- [server](#server)
- [concurrency](#concurrency)
- [timeouts](#timeouts)
- [worktree](#worktree)
- [retry](#retry)
- [history / archive](#history--archive)
- [discussion / ideation](#discussion--ideation)
- [collaborative_debug](#collaborative_debug)
- [participants](#participants)
- [models](#models)
- [notifications / realtime / debug / cleanup](#notifications--realtime--debug--cleanup)
- [예시 설정 조합](#예시-설정-조합)

---

## workflow

워크플로우 전체 흐름을 제어하는 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `workflow.max_feedback_rounds` | `5` | 최대 피드백 반복 횟수 (Phase 4) |
| `workflow.auto_approve_spec` | `false` | 스펙 자동 승인 여부 |
| `workflow.auto_accept_result` | `true` | Phase 3 리뷰 PASS 후 자동 수락 |
| `workflow.default_agent` | `codex-dev` | 기본 실행 에이전트 |

---

## server

대시보드 서버 접근 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `server.port` | `3847` | 대시보드 포트 |
| `server.host` | `127.0.0.1` | 대시보드 호스트 |
| `server.auth_enabled` | `true` | 대시보드 Bearer 토큰 인증 |

---

## concurrency

병렬 실행 수준을 제어하는 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `concurrency.max_parallel_tasks` | `5` | 최대 병렬 태스크 수 |
| `concurrency.max_parallel_reviews` | `3` | 최대 병렬 리뷰 수 |
| `concurrency.queue_strategy` | `fifo` | 큐 전략 |

---

## timeouts

각 단계별 타임아웃(ms) 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `timeouts.cli_default_ms` | `300000` | CLI 기본 타임아웃 (5분) |
| `timeouts.cli_large_task_ms` | `1800000` | 대규모 태스크 타임아웃 (30분) |
| `timeouts.pre_check_ms` | `120000` | 사전 검증 타임아웃 (2분) |
| `timeouts.merge_ms` | `60000` | Merge 타임아웃 (1분) |
| `timeouts.dashboard_health_check_ms` | `10000` | 대시보드 헬스체크 (10초) |

---

## worktree

Git worktree 생성 및 관리 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `worktree.root_directory` | `.gran-maestro/worktrees` | worktree 루트 경로 |
| `worktree.max_active` | `10` | 최대 활성 worktree 수 |
| `worktree.base_branch` | `main` | worktree 기준 브랜치 |
| `worktree.stale_timeout_hours` | `24` | stale 판정 시간 |
| `worktree.auto_cleanup_on_cancel` | `true` | 취소 시 자동 정리 |

---

## retry

실패 시 재시도 동작을 제어하는 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `retry.max_cli_retries` | `2` | CLI 최대 재시도 횟수 |
| `retry.max_fallback_depth` | `1` | 최대 fallback 깊이 |
| `retry.backoff_base_ms` | `1000` | 재시도 백오프 기준 (ms) |

---

## history / archive

요청 이력 보존 및 세션 아카이브 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `history.retention_days` | `30` | 이력 보존 기간 (일) |
| `history.auto_archive` | `true` | 자동 아카이브 |
| `archive.max_active_sessions` | `20` | 최대 활성 세션 수 |
| `archive.archive_retention_days` | `null` | 아카이브 보존 기간 (null=무기한) |
| `archive.auto_archive_on_create` | `true` | 세션 생성 시 초과분 자동 아카이브 |
| `archive.auto_archive_on_complete` | `true` | 완료 시 자동 아카이브 |
| `archive.archive_directory` | `.gran-maestro/archive` | 아카이브 저장 경로 |

---

## discussion / ideation

토론 및 아이디에이션 라운드 제어 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `discussion.response_char_limit` | `2000` | Discussion 응답 글자 제한 |
| `discussion.critique_char_limit` | `2000` | Discussion Critic 글자 제한 |
| `discussion.default_max_rounds` | `5` | 기본 최대 라운드 수 |
| `discussion.max_rounds_upper_limit` | `10` | 최대 라운드 상한 |
| `ideation.opinion_char_limit` | `2000` | Ideation 의견 글자 제한 |
| `ideation.critique_char_limit` | `2000` | Ideation Critic 글자 제한 |

---

## collaborative_debug

협업 디버그 모드 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `collaborative_debug.finding_char_limit` | `3000` | 조사 결과 글자 제한 |
| `collaborative_debug.merge_wait_ms` | `60000` | 에이전트 합류 대기 시간 (60초) |
| `collaborative_debug.auto_trigger_from_start` | `true` | `/mst:start`에서 디버그 의도 시 자동 트리거 |

---

## participants

토론·아이디에이션·디버그에 참여하는 에이전트 인원 수 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `participants.opinion_providers.codex` | `1` | Codex 참여 인원 (0=제외) |
| `participants.opinion_providers.gemini` | `1` | Gemini 참여 인원 (0=제외) |
| `participants.opinion_providers.claude` | `1` | Claude 참여 인원 (0=제외) |

참여자 규칙:
- 총합: 2명 이상 7명 이하
- Critic: Claude 우선, Claude 0명이면 Codex가 대체
- Ideation, Discussion, Debug 모두 동일한 참여자 설정을 공유

---

## models

각 역할별로 사용할 모델을 지정하는 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `models.claude.pm_conductor` | `sonnet` | PM 지휘자 (Phase 1, 3) |
| `models.claude.architect` | `sonnet` | 아키텍트 (Design Wing) |
| `models.claude.ideation` | `sonnet` | Ideation 참여자 |
| `models.claude.discussion` | `sonnet` | Discussion 참여자 |
| `models.claude.debug` | `sonnet` | Debug 참여자 |
| `models.developer.primary` | `codex / gpt-5.3-codex` | 주 개발자 (provider/model) |
| `models.developer.fallback` | `gemini / gemini-3-pro-preview` | 보조 개발자 |
| `models.reviewer.primary` | `codex / gpt-5.3-codex` | 주 리뷰어 |
| `models.reviewer.fallback` | `gemini / gemini-3-pro-preview` | 보조 리뷰어 |

설정 예시:
```json
"models": {
  "claude": {
    "pm_conductor": "sonnet",
    "architect": "sonnet",
    "ideation": "sonnet",
    "discussion": "sonnet",
    "debug": "sonnet"
  },
  "developer": {
    "primary": { "provider": "codex", "model": "gpt-5.3-codex" },
    "fallback": { "provider": "gemini", "model": "gemini-3-pro-preview" }
  },
  "reviewer": {
    "primary": { "provider": "codex", "model": "gpt-5.3-codex" },
    "fallback": { "provider": "gemini", "model": "gemini-3-pro-preview" }
  }
}
```

---

## notifications / realtime / debug / cleanup

알림, 실시간 업데이트, 디버그 로깅, 세션 정리 설정입니다.

| 키 | 기본값 | 설명 |
|----|--------|------|
| `notifications.terminal` | `true` | 터미널 알림 |
| `notifications.dashboard` | `true` | 대시보드 알림 |
| `realtime.protocol` | `sse` | 실시간 프로토콜 (SSE) |
| `realtime.debounce_ms` | `100` | 이벤트 디바운스 (ms) |
| `debug.enabled` | `false` | 디버그 모드 |
| `debug.log_level` | `info` | 로그 레벨 |
| `debug.log_prompts` | `false` | 프롬프트 로깅 |
| `cleanup.ideation_keep_count` | `10` | Ideation 세션 유지 수 |
| `cleanup.discussion_keep_count` | `10` | Discussion 세션 유지 수 |
| `cleanup.debug_keep_count` | `10` | Debug 세션 유지 수 |
| `cleanup.old_request_threshold_hours` | `24` | 오래된 요청 판단 기준 (시간) |

---

## 예시 설정 조합

아래는 대표적인 사용 시나리오별 권장 설정 조합입니다.
`.gran-maestro/config.json`에 해당 값을 적용하거나 `/mst:settings <key> <value>` 명령어로 개별 변경할 수 있습니다.

### 예시 1: 병렬 실행 최적화

많은 태스크를 동시에 처리해야 하는 팀 환경에서 처리량을 극대화하는 설정입니다.
리소스가 충분한 머신에서 사용하는 것을 권장합니다.

```json
{
  "concurrency": {
    "max_parallel_tasks": 10,
    "max_parallel_reviews": 6,
    "queue_strategy": "fifo"
  },
  "worktree": {
    "max_active": 20,
    "stale_timeout_hours": 48,
    "auto_cleanup_on_cancel": true
  },
  "timeouts": {
    "cli_default_ms": 600000,
    "cli_large_task_ms": 3600000
  },
  "archive": {
    "max_active_sessions": 50,
    "auto_archive_on_create": true,
    "auto_archive_on_complete": true
  }
}
```

### 예시 2: 비용 절감 모드

API 호출 비용을 최소화하기 위해 참여 에이전트 수와 토론 라운드를 제한하는 설정입니다.
소규모 프로젝트나 개인 개발 환경에 적합합니다.

```json
{
  "participants": {
    "opinion_providers": {
      "codex": 1,
      "gemini": 0,
      "claude": 1
    }
  },
  "discussion": {
    "response_char_limit": 1000,
    "critique_char_limit": 1000,
    "default_max_rounds": 2,
    "max_rounds_upper_limit": 3
  },
  "ideation": {
    "opinion_char_limit": 1000,
    "critique_char_limit": 1000
  },
  "workflow": {
    "max_feedback_rounds": 2,
    "auto_accept_result": true
  },
  "concurrency": {
    "max_parallel_tasks": 3,
    "max_parallel_reviews": 2
  }
}
```

### 예시 3: 오프라인 / 자동 승인 모드

인터랙션 없이 완전 자동으로 워크플로우를 실행하는 설정입니다.
CI/CD 파이프라인이나 야간 배치 작업에 적합합니다.

```json
{
  "workflow": {
    "auto_approve_spec": true,
    "auto_accept_result": true,
    "max_feedback_rounds": 1,
    "default_agent": "codex-dev"
  },
  "notifications": {
    "terminal": false,
    "dashboard": true
  },
  "debug": {
    "enabled": false,
    "log_level": "warn",
    "log_prompts": false
  },
  "collaborative_debug": {
    "auto_trigger_from_start": false
  },
  "retry": {
    "max_cli_retries": 3,
    "max_fallback_depth": 2,
    "backoff_base_ms": 2000
  }
}
```
