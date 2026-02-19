# Gran Maestro

> **"I am the Maestro — I conduct, I don't code."**

Claude, Gemini, Codex를 모두 구독하고 있다면 — 이미 당신만의 AI 개발팀이 갖춰져 있습니다.

Gran Maestro는 Claude Code를 **PM(지휘자)**으로 전환하는 플러그인입니다. PM은 코드를 직접 작성하지 않고, Codex CLI와 Gemini CLI를 지휘하여 구현/리뷰/디버깅을 수행합니다. 요청 하나로 분석부터 머지까지 전 과정이 자동으로 오케스트레이션됩니다.

Claude의 토큰을 적게 쓰는 것이 목적은 아닙니다. 대신, 3개 AI가 각자의 강점을 발휘하여 혼자서는 불가능한 **다각도 분석과 교차 검증**을 해냅니다.

## Why Gran Maestro?

- **3 AI 시너지** — Ideation(브레인스토밍), Discussion(합의 토론), Debug(병렬 디버깅)에서 Codex, Gemini, Claude가 동시에 의견을 제시하고 PM이 종합합니다. 하나의 AI가 놓치는 것을 다른 AI가 잡아냅니다.
- **자리를 비워도 일은 계속됩니다** — 스펙을 승인하고 자리를 비우세요. 돌아오면 구현, 리뷰, 피드백까지 끝나 있습니다. 대시보드에서 진행 상황을 확인하기만 하면 됩니다.
- **실시간 대시보드** — 웹 기반 대시보드에서 워크플로우 그래프, 에이전트 스트림, 문서, 의존성 관계를 한눈에 파악합니다. 여러 프로젝트를 동시에 모니터링하는 허브 모드도 지원합니다.
- **구독료의 가치를 극대화합니다** — 이미 결제한 Claude, Gemini, Codex를 놀리지 않고, 각각에게 가장 잘하는 역할을 맡겨 팀처럼 운영합니다.

## 탄생 배경

Claude를 쓰다가 어느 날 충동적으로 Gemini와 Codex를 결제해버렸습니다. 카드 내역서에 세 줄이 나란히 찍힌 걸 보고 생각했습니다 — "이왕 결제한 거, 셋 다 부려먹자." 그렇게 Claude에게 지휘봉을 쥐어주고, Gemini와 Codex에게 실무를 맡기는 오케스트레이션 도구가 탄생했습니다.

## 기본 사용 흐름

Gran Maestro에서 당신이 직접 하는 일은 딱 세 가지입니다. 나머지는 AI 팀이 알아서 처리합니다.

### 1. 요청 전달

만들고 싶은 것을 자연어로 알려줍니다. PM(Claude)이 요구사항을 분석하고, 필요하면 3 AI의 의견을 수집한 뒤, 구현 스펙을 작성합니다.

```
/mst:start "JWT 기반 사용자 인증 기능을 추가해줘"
```

### 2. 스펙 확인 & 승인

PM이 작성한 스펙(변경 범위, 수락 조건, 기술 설계)을 검토합니다. 마음에 들면 승인 한 마디로 실행이 시작됩니다.

```
/mst:approve
```

### 3. 결과 확인

승인 후에는 Codex/Gemini가 구현하고, PM이 리뷰하고, 피드백 루프를 돌고, 최종 머지까지 자동으로 진행됩니다. 터미널이나 대시보드에서 진행 상황을 확인할 수 있습니다.

```
/mst:list                # 터미널에서 현황 확인
/mst:dashboard           # 웹 대시보드로 시각적 확인
```

> **자리를 비워도 괜찮습니다.** 승인 후에는 터미널을 지켜볼 필요가 없습니다. 미리 분석을 마치고 `/mst:approve`까지 해두세요. 커피 한 잔 마시고 돌아오면, 대시보드에 완료된 결과물이 기다리고 있습니다.

내부적으로는 [5단계 워크플로우](#워크플로우)(PM 분석 → 외주 실행 → PM 리뷰 → 피드백 루프 → 수락/완료)가 돌아가지만, 사용자가 신경 쓸 것은 위의 세 단계뿐입니다.

더 복잡한 작업이 필요하다면? [Ideation](#ideation--ai-참여자-브레인스토밍)으로 다각도 분석을, [Discussion](#discussion--ai-참여자-합의-토론)으로 합의 도출을, [Debug](#debug--3-ai-병렬-디버깅)로 병렬 버그 조사를 활용해보세요.

## Quick Start

### 1. 설치

Claude Code에서 (v1.0.33 이상 필요):

```bash
# Step 1: 마켓플레이스 등록
/plugin marketplace add myrtlepn/gran-maestro

# Step 2: 플러그인 설치
/plugin install mst@gran-maestro
```

또는 `/plugin` 명령으로 UI를 열어 **Discover** 탭에서 직접 설치할 수도 있습니다.

#### 업데이트

```bash
# 마켓플레이스 카탈로그 새로고침
/plugin marketplace update gran-maestro
```

#### 삭제

```bash
/plugin uninstall mst@gran-maestro
```

### 2. 요청 시작

```
/mst:start "JWT 기반 사용자 인증 기능을 추가해줘"
```

### 3. 스펙 확인 후 승인

PM이 분석한 스펙을 확인하고:

```
/mst:approve
```

### 4. 자동 완료

Phase 2~5가 자동으로 진행됩니다 (구현 → 리뷰 → 피드백 → 머지)

## 핵심 기능

### Ideation — AI 참여자 브레인스토밍

설정된 AI 팀원이 동시에 의견을 수집하고 PM이 종합합니다.
`config.json`의 `participants.opinion_providers`로 참여 인원을 조정할 수 있습니다.
구현 전 다각도 분석이 필요할 때 사용합니다.

```
/mst:ideation "마이크로서비스 vs 모놀리식 아키텍처"
/mst:ideation --focus security "OAuth2 vs 자체 인증"
```

결과물은 `.gran-maestro/ideation/IDN-NNN/` 디렉토리에 저장됩니다:
- `opinion-{참여자}.md` — 참여자별 의견 파일 (예: `opinion-codex.md`, `opinion-codex-2.md`)
- `synthesis.md` — PM 종합 분석 (수렴점, 발산점, 추천 방향)

### Discussion — AI 참여자 합의 토론

Ideation이 1회성 의견 수집이라면, Discussion은 **합의에 도달할 때까지 반복 토론**합니다.
PM이 사회자 역할로 발산점을 식별하고 수렴을 유도합니다.

```
/mst:discussion "JWT vs 세션 기반 인증"
/mst:discussion IDN-001              # 기존 ideation 결과로 토론 시작
/mst:discussion --max-rounds 3 "캐시 전략"
```

결과물은 `.gran-maestro/discussion/DSC-NNN/` 디렉토리에 저장됩니다:
- `rounds/NN/` — 라운드별 각 AI 응답 및 종합
- `consensus.md` — 최종 합의 문서

### Debug — 3 AI 병렬 디버깅

3 AI(Codex/Gemini/Claude)가 **병렬로 버그를 조사**하고 종합 리포트를 생성합니다.
PM(Claude)이 자체 조사를 동시 수행한 뒤, 모든 결과를 합쳐 교차 검증합니다.
Maestro 모드 활성 여부에 관계없이 사용 가능합니다.

```
/mst:debug "로그인 시 간헐적으로 401 에러가 발생합니다"
/mst:debug --focus src/api/**/*.ts "API 응답이 비정상적으로 느립니다"
```

| | Ideation | Discussion | **Debug** |
|---|---|---|---|
| 목적 | 다양한 관점 수집 (발산) | 합의 도달 (수렴) | **버그 탐지 (조사)** |
| Claude 역할 | 종합자 (PM) | 사회자 (PM) | **능동적 조사자 + 종합자** |
| 라운드 | 1회 | N회 반복 | **1회 (병렬 조사 후 합류)** |
| 출력 | `synthesis.md` | `consensus.md` | **`debug-report.md`** |

결과물은 `.gran-maestro/debug/DBG-NNN/` 디렉토리에 저장됩니다:
- `finding-{조사자}.md` — 조사자별 발견 사항
- `finding-claude.md` — Claude 자체 조사 결과
- `debug-report.md` — 종합 리포트 (교차 검증, 확신도, 수정 제안)

> `/mst:start`에서 디버깅 의도가 감지되면 자동으로 `/mst:debug`가 트리거됩니다 (`collaborative_debug.auto_trigger_from_start` 설정).

### 결과 확인

| 방법 | 설명 |
|------|------|
| `/mst:list` | 터미널에서 전체 요청/태스크 현황 확인 |
| `/mst:inspect REQ-001` | 특정 요청의 상세 상태 확인 |
| `/mst:dashboard` | 웹 대시보드에서 시각적으로 확인 |
| `.gran-maestro/` 디렉토리 | 모든 상태 파일, 스펙, 리뷰, 토론 결과가 저장되는 루트 |

## 대시보드

로컬 웹 서버 기반 대시보드로, 워크플로우를 시각적으로 모니터링합니다. Deno 런타임이 필요합니다.

```
/mst:dashboard              # 대시보드 시작 + 현재 프로젝트 등록
/mst:dashboard --stop       # 대시보드 중지
/mst:dashboard --port 8080  # 커스텀 포트로 시작
```

### 허브 구조

하나의 서버 인스턴스에서 **여러 프로젝트를 동시 관리**하는 허브 모드로 동작합니다.
각 프로젝트는 `/mst:dashboard` 실행 시 자동으로 허브에 등록됩니다.

서버 데이터는 `~/.gran-maestro-hub/`에 저장됩니다:

| 항목 | 경로 |
|------|------|
| PID 파일 | `~/.gran-maestro-hub/hub.pid` |
| 인증 토큰 | `~/.gran-maestro-hub/hub.token` |
| 프로젝트 레지스트리 | `~/.gran-maestro-hub/registry.json` |
| 로그 | `/tmp/gran-maestro-hub.log` |

### 대시보드 뷰

| 뷰 | 설명 |
|---|------|
| Workflow Graph | Phase 간 전환 노드-엣지 그래프, 실행 중 노드 애니메이션 |
| Agent Stream | 에이전트 프롬프트/결과 실시간 SSE 스트리밍 |
| Documents | `.gran-maestro/` 하위 MD/JSON 마크다운 렌더링 |
| Dependency Graph | 요청 간 blockedBy/blocks 관계 시각화 |
| Settings | `config.json` 웹 UI 편집 (섹션별 폼, 기본값 리셋) |

### 인증

Bearer 토큰 인증으로 보호됩니다. 서버 시작 시 랜덤 UUID 토큰이 생성되어 `~/.gran-maestro-hub/hub.token`에 저장됩니다.
브라우저 URL에 토큰이 자동으로 포함되며, `server.auth_enabled` 설정으로 비활성화할 수 있습니다.

### API 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /` | SPA 대시보드 렌더링 |
| `GET /events` | SSE 실시간 이벤트 스트림 |
| `POST /api/projects` | 프로젝트 등록 |
| `DELETE /api/projects/:id` | 프로젝트 해제 |
| `GET\|PUT /api/projects/:id/config` | 설정 조회/변경 |
| `GET /api/projects/:id/config/defaults` | 기본 설정 템플릿 |
| `GET /api/projects/:id/mode` | 모드 상태 |
| `GET /api/projects/:id/requests` | 요청 목록 |
| `GET /api/projects/:id/requests/:id/tasks` | 태스크 목록 |
| `GET /api/projects/:id/ideation` | Ideation 세션 |
| `GET /api/projects/:id/discussion` | Discussion 세션 |

## 설정 관리

`.gran-maestro/config.json`으로 모든 동작을 제어합니다.
`/mst:start` 또는 `/mst:on` 첫 실행 시 기본 설정으로 자동 생성됩니다.

```
/mst:settings                                    # 전체 설정 표시
/mst:settings workflow.max_feedback_rounds        # 특정 설정 조회
/mst:settings workflow.max_feedback_rounds 3      # 설정 변경
```

대시보드의 **Settings** 탭에서도 웹 UI로 변경할 수 있습니다.

### workflow

| 키 | 기본값 | 설명 |
|----|--------|------|
| `workflow.max_feedback_rounds` | `5` | 최대 피드백 반복 횟수 (Phase 4) |
| `workflow.auto_approve_spec` | `false` | 스펙 자동 승인 여부 |
| `workflow.auto_accept_result` | `true` | Phase 3 리뷰 PASS 후 자동 수락 |
| `workflow.default_agent` | `codex-dev` | 기본 실행 에이전트 |

### server

| 키 | 기본값 | 설명 |
|----|--------|------|
| `server.port` | `3847` | 대시보드 포트 |
| `server.host` | `127.0.0.1` | 대시보드 호스트 |
| `server.auth_enabled` | `true` | 대시보드 Bearer 토큰 인증 |

### concurrency

| 키 | 기본값 | 설명 |
|----|--------|------|
| `concurrency.max_parallel_tasks` | `5` | 최대 병렬 태스크 수 |
| `concurrency.max_parallel_reviews` | `3` | 최대 병렬 리뷰 수 |
| `concurrency.queue_strategy` | `fifo` | 큐 전략 |

### timeouts

| 키 | 기본값 | 설명 |
|----|--------|------|
| `timeouts.cli_default_ms` | `300000` | CLI 기본 타임아웃 (5분) |
| `timeouts.cli_large_task_ms` | `1800000` | 대규모 태스크 타임아웃 (30분) |
| `timeouts.pre_check_ms` | `120000` | 사전 검증 타임아웃 (2분) |
| `timeouts.merge_ms` | `60000` | Merge 타임아웃 (1분) |
| `timeouts.dashboard_health_check_ms` | `10000` | 대시보드 헬스체크 (10초) |

### worktree

| 키 | 기본값 | 설명 |
|----|--------|------|
| `worktree.root_directory` | `.gran-maestro/worktrees` | worktree 루트 경로 |
| `worktree.max_active` | `10` | 최대 활성 worktree 수 |
| `worktree.base_branch` | `main` | worktree 기준 브랜치 |
| `worktree.stale_timeout_hours` | `24` | stale 판정 시간 |
| `worktree.auto_cleanup_on_cancel` | `true` | 취소 시 자동 정리 |

### retry

| 키 | 기본값 | 설명 |
|----|--------|------|
| `retry.max_cli_retries` | `2` | CLI 최대 재시도 횟수 |
| `retry.max_fallback_depth` | `1` | 최대 fallback 깊이 |
| `retry.backoff_base_ms` | `1000` | 재시도 백오프 기준 (ms) |

### history / archive

| 키 | 기본값 | 설명 |
|----|--------|------|
| `history.retention_days` | `30` | 이력 보존 기간 (일) |
| `history.auto_archive` | `true` | 자동 아카이브 |
| `archive.max_active_sessions` | `20` | 최대 활성 세션 수 |
| `archive.archive_retention_days` | `null` | 아카이브 보존 기간 (null=무기한) |
| `archive.auto_archive_on_create` | `true` | 세션 생성 시 초과분 자동 아카이브 |
| `archive.auto_archive_on_complete` | `true` | 완료 시 자동 아카이브 |
| `archive.archive_directory` | `.gran-maestro/archive` | 아카이브 저장 경로 |

### discussion / ideation

| 키 | 기본값 | 설명 |
|----|--------|------|
| `discussion.response_char_limit` | `2000` | Discussion 응답 글자 제한 |
| `discussion.critique_char_limit` | `2000` | Discussion Critic 글자 제한 |
| `discussion.default_max_rounds` | `5` | 기본 최대 라운드 수 |
| `discussion.max_rounds_upper_limit` | `10` | 최대 라운드 상한 |
| `ideation.opinion_char_limit` | `2000` | Ideation 의견 글자 제한 |
| `ideation.critique_char_limit` | `2000` | Ideation Critic 글자 제한 |

### collaborative_debug

| 키 | 기본값 | 설명 |
|----|--------|------|
| `collaborative_debug.finding_char_limit` | `3000` | 조사 결과 글자 제한 |
| `collaborative_debug.merge_wait_ms` | `60000` | 에이전트 합류 대기 시간 (60초) |
| `collaborative_debug.auto_trigger_from_start` | `true` | `/mst:start`에서 디버그 의도 시 자동 트리거 |

### participants

| 키 | 기본값 | 설명 |
|----|--------|------|
| `participants.opinion_providers.codex` | `1` | Codex 참여 인원 (0=제외) |
| `participants.opinion_providers.gemini` | `1` | Gemini 참여 인원 (0=제외) |
| `participants.opinion_providers.claude` | `1` | Claude 참여 인원 (0=제외) |

참여자 규칙:
- 총합: 2명 이상 7명 이하
- Critic: Claude 우선, Claude 0명이면 Codex가 대체
- Ideation, Discussion, Debug 모두 동일한 참여자 설정을 공유

### models

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

### notifications / realtime / debug / cleanup

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

## 워크플로우

| Phase | 이름 | 설명 |
|-------|------|------|
| 1 | PM 분석 | 요구사항 분석, 스펙 작성, 사용자 승인 |
| 2 | 외주 실행 | Codex/Gemini가 Git Worktree에서 코드 구현 |
| 3 | PM 리뷰 | 수락 조건 검증, PASS/FAIL 판정 |
| 4 | 피드백 루프 | 미충족 항목 수정 반복 (최대 5회) |
| 5 | 수락/완료 | rebase + squash merge, worktree 정리 |

## 주요 명령어

### 워크플로우

| 명령어 | 설명 |
|--------|------|
| `/mst:start` | 새 요청 시작 (PM 분석 Phase 진입) |
| `/mst:approve` | 스펙 승인 후 실행 시작 |
| `/mst:accept` | 최종 수락 (기본 자동, `workflow.auto_accept_result`로 제어) |
| `/mst:feedback` | 수동 피드백 제공 (Phase 4) |
| `/mst:cancel` | 요청 취소 + worktree 정리 |
| `/mst:recover` | 미완료 요청 복구 (마지막 Phase부터 재개) |
| `/mst:priority` | 태스크 우선순위/실행 순서 변경 |

### 모니터링

| 명령어 | 설명 |
|--------|------|
| `/mst:list` | 전체 요청/태스크 현황 |
| `/mst:inspect` | 특정 요청 상세 상태 |
| `/mst:history` | 완료된 요청 이력 |
| `/mst:dashboard` | 웹 대시보드 열기 |

### 분석 도구

| 명령어 | 설명 |
|--------|------|
| `/mst:ideation` | AI 참여자 브레인스토밍 (1회 발산) |
| `/mst:discussion` | AI 참여자 합의 토론 (N회 수렴) |
| `/mst:debug` | 3 AI 병렬 디버깅 (조사 + 종합 리포트) |

### CLI 직접 호출

| 명령어 | 설명 |
|--------|------|
| `/mst:codex` | Codex CLI 직접 호출 |
| `/mst:gemini` | Gemini CLI 직접 호출 |

### 관리

| 명령어 | 설명 |
|--------|------|
| `/mst:settings` | 설정 조회/변경 (dot notation) |
| `/mst:on` / `/mst:off` | Maestro 모드 전환 |
| `/mst:cleanup` | 세션 일괄 정리 (ideation/discussion/debug/requests) |
| `/mst:archive` | 세션 아카이브 관리 (보관/복원/삭제) |

## 프로젝트 구조

```
gran-maestro/
├── .claude-plugin/     # 플러그인 매니페스트 (plugin.json, marketplace.json)
├── agents/             # 커스텀 에이전트 (PM Conductor, Architect 등 6개)
├── skills/             # 스킬 디렉토리 (24개 스킬, 자동 탐색)
├── src/                # TypeScript 소스 (Deno + Hono 대시보드 서버)
│   ├── server.ts       # 메인 서버 (허브 모드, SSE, Bearer 인증)
│   ├── spa.ts          # SPA 대시보드 UI
│   ├── config.ts       # 설정 로딩 및 레지스트리 관리
│   ├── middleware.ts   # 인증 미들웨어
│   ├── sse.ts          # Server-Sent Events 실시간 업데이트
│   ├── types.ts        # TypeScript 타입 정의
│   └── routes/         # API 라우트 (config, projects, requests, ideation, discussion, tree)
├── templates/          # 스펙/리뷰/피드백/디버그 템플릿
│   └── defaults/       # 기본 설정 (config.json, agents.json, mode.json)
└── docs/               # 상세 문서
```

### 런타임 데이터 구조

```
.gran-maestro/              # 프로젝트별 (gitignore됨)
├── config.json             # 프로젝트 설정
├── mode.json               # Maestro 모드 상태
├── agents.json             # 에이전트 설정
├── requests/               # 활성 요청 (REQ-NNN/)
├── worktrees/              # Git Worktree
├── ideation/               # Ideation 세션 (IDN-NNN/)
├── discussion/             # Discussion 세션 (DSC-NNN/)
├── debug/                  # Debug 세션 (DBG-NNN/)
└── archive/                # 아카이브 (.tar.gz)

~/.gran-maestro-hub/        # 글로벌 (허브 서버)
├── hub.pid                 # 서버 PID
├── hub.token               # 인증 토큰
└── registry.json           # 등록된 프로젝트 목록
```

## 상세 문서

- [세계관 및 스킬 레퍼런스](docs/CLAUDE.md) — 전체 워크플로우, 에이전트 팀 구성, 듀얼 모드 운용
- [용어 사전](docs/glossary.md) — 공식 용어 및 ID 체계
- [릴리스 체크리스트](docs/RELEASE.md) — 버전 관리 및 배포 절차

## 라이선스

Source Available License — 자유롭게 사용할 수 있으나 포크 및 재배포는 금지됩니다. 자세한 내용은 [LICENSE](LICENSE)를 참조하세요.
