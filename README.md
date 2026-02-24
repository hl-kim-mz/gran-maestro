# Gran Maestro

> **"I am the Maestro — I conduct, I don't code."**

**Claude를 PM으로, Codex와 Gemini를 외주 개발팀으로 운영하는** Claude Code 플러그인입니다.

## 배경

각 AI는 특성이 다릅니다.

- **Claude** — 느리지만 세심하고 문맥을 잘 잡는다. 스펙 작성과 리뷰에 최적이다.
- **Codex** — 빠르지만 지시가 애매하거나 범위가 넓으면 환각이 심하다. 명확한 스펙이 있을 때 위력을 발휘한다.
- **Gemini** — 1M 토큰 컨텍스트, 대규모 코드 분석에 강하다.

"Claude한테 PM 역할을 맡기고, 코딩은 Codex·Gemini에게 외주를 주면 어떨까?" — 그게 Gran Maestro의 출발점입니다.

## Why Gran Maestro?

- **Claude = PM, Codex/Gemini = 외주 개발자** — Claude는 스펙을 쓰고 리뷰합니다. 코드는 직접 작성하지 않습니다. Codex와 Gemini가 Git Worktree에서 실제 구현을 담당합니다.
- **자리를 비워도 일은 계속됩니다** — 스펙을 승인하고 자리를 비우세요. 돌아오면 구현, 리뷰, 피드백까지 끝나 있습니다.
- **실시간 대시보드** — 워크플로우 그래프, 에이전트 스트림, 의존성 관계를 한눈에 파악합니다. 여러 프로젝트를 동시에 모니터링하는 허브 모드도 지원합니다.
- **구독료의 가치를 극대화합니다** — 이미 결제한 Claude, Gemini, Codex를 각각에게 가장 잘하는 역할을 맡겨 팀처럼 운영합니다.

![Gran Maestro 대시보드 — Ideation 뷰](docs/assets/dashboard-ideation.png)

## 기본 사용 흐름

### 단건 모드

만들고 싶은 것을 자연어로 전달하고, 스펙을 확인한 뒤 승인합니다.

```
/mst:start "JWT 기반 사용자 인증 기능을 추가해줘"
# PM이 스펙을 작성합니다. 확인 후:
/mst:approve
# 승인 후 구현 → 리뷰 → 피드백 → 머지가 자동으로 진행됩니다.
/mst:list                # 터미널에서 현황 확인
/mst:dashboard           # 웹 대시보드로 시각적 확인
```

### 베스트 프랙티스: plan 적립 후 일괄 approve

```
# 1. 여러 요청을 plan으로 상세화
/mst:plan 로그인 화면 개선
/mst:plan API 엔드포인트 추가
/mst:plan 대시보드 오류 수정

# 2. 스펙 확인 후 일괄 시작
/mst:list
/mst:approve PLN-001 PLN-002 PLN-003
```

## Quick Start

### 0. 사전 요구사항

Gran Maestro는 Codex CLI와 Gemini CLI를 외부 실행 에이전트로 사용합니다. 플러그인 설치 전에 두 CLI를 먼저 설치해 주세요.

```bash
# Codex CLI
npm install -g @openai/codex

# Gemini CLI
npm install -g @google/gemini-cli
```

**Gran Maestro는 각 CLI를 직접 호출합니다.** 별도 서버를 경유하거나 API를 중간에서 가로채지 않으며, 여러분이 직접 터미널에서 실행하는 것과 완전히 동일하게 동작합니다. 인증 정보와 데이터는 각 CLI와 해당 서비스 사이에서만 오가므로 Gran Maestro를 신뢰할 필요 없이 Codex/Gemini를 신뢰하는 것으로 충분합니다.

#### 각 CLI 설정이 그대로 적용됩니다

Gran Maestro는 CLI의 기능을 그대로 활용하기 때문에, 각 에이전트에 맞게 설정한 내용이 Gran Maestro 실행 중에도 동일하게 적용됩니다.

- **Codex**: 프로젝트 루트의 `AGENTS.md`, `CODEX.md` 등 에이전트 지시 파일이 Codex 호출 시 그대로 반영됩니다.
- **Gemini**: `GEMINI.md` 또는 `.gemini/` 하위 설정 파일이 Gemini 호출 시 그대로 반영됩니다.

각 CLI의 개성(모델 설정, 시스템 프롬프트, 금지 동작 등)을 잘 조율해 두면 Gran Maestro 내에서도 동일한 품질과 일관성이 유지됩니다.

#### 설치 후 반드시 한 번 직접 실행하세요

설치 후 **각 CLI를 직접 한 번 실행해 보세요.** 첫 실행 시 인증 플로우(로그인, API 키 등록 등)가 대화형으로 진행되며, 이 과정을 완료하지 않으면 Gran Maestro가 내부에서 CLI를 비대화형으로 호출할 때 인증 오류가 발생합니다.

```bash
codex   # 첫 실행 — 인증 플로우 완료
gemini  # 첫 실행 — Google 계정 로그인 완료
```

인증 방법:

- Codex: 첫 실행 시 대화형 로그인 또는 `OPENAI_API_KEY` 환경변수 설정
- Gemini: 첫 실행 시 Google 계정 OAuth 로그인 또는 `GEMINI_API_KEY` 환경변수 설정

> **Tip.** 설치 후 `which codex`, `which gemini` 명령으로 PATH에 정상 등록되었는지도 확인하세요.

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
/plugin marketplace update gran-maestro
```

#### 삭제

```bash
/plugin uninstall mst@gran-maestro
```

### 2. 시작

```
/mst:start "JWT 기반 사용자 인증 기능을 추가해줘"
```

## 핵심 기능

### Ideation — AI 참여자 브레인스토밍

설정된 AI 팀원이 동시에 의견을 수집하고 PM이 종합합니다. 구현 전 다각도 분석이 필요할 때 사용합니다.

```
/mst:ideation "마이크로서비스 vs 모놀리식 아키텍처"
```

### Discussion — AI 참여자 합의 토론

합의에 도달할 때까지 반복 토론합니다. PM이 사회자 역할로 발산점을 식별하고 수렴을 유도합니다.

```
/mst:discussion "JWT vs 세션 기반 인증"
```

### Debug — 3 AI 병렬 디버깅

3 AI(Codex/Gemini/Claude)가 병렬로 버그를 조사하고 종합 리포트를 생성합니다. Maestro 모드 활성 여부에 관계없이 사용 가능합니다.

```
/mst:debug "로그인 시 간헐적으로 401 에러가 발생합니다"
```

자세한 내용: [docs/skills-reference.md](docs/skills-reference.md)

## 스킬 목록

27개 스킬을 카테고리별로 제공합니다.

| 카테고리 | 스킬 | 설명 |
|----------|------|------|
| 오케스트레이션 | `/mst:start` | 새 요청 시작 (PM 분석 Phase 진입) |
| | `/mst:plan` | 요청을 plan으로 상세화 (일괄 approve 대비) |
| | `/mst:approve` | 스펙 승인 후 실행 시작 |
| | `/mst:accept` | 최종 수락 (기본 자동, 설정으로 제어) |
| | `/mst:feedback` | 수동 피드백 제공 (Phase 4) |
| | `/mst:cancel` | 요청 취소 + worktree 정리 |
| | `/mst:recover` | 미완료 요청 복구 (마지막 Phase부터 재개) |
| | `/mst:priority` | 태스크 우선순위/실행 순서 변경 |
| 모니터링 | `/mst:list` | 전체 요청/태스크 현황 |
| | `/mst:inspect` | 특정 요청 상세 상태 |
| | `/mst:history` | 완료된 요청 이력 |
| | `/mst:dashboard` | 웹 대시보드 열기 |
| 분석 | `/mst:ideation` | AI 참여자 브레인스토밍 (1회 발산) |
| | `/mst:discussion` | AI 참여자 합의 토론 (N회 수렴) |
| | `/mst:debug` | 3 AI 병렬 디버깅 (조사 + 종합 리포트) |
| CLI | `/mst:codex` | Codex CLI 직접 호출 |
| | `/mst:gemini` | Gemini CLI 직접 호출 |
| | `/mst:claude` | Claude CLI 직접 호출 |
| 설계 | `/mst:stitch` | UI 목업 생성 (Stitch 연동) |
| | `/mst:ui-designer` | UI 설계 에이전트 호출 |
| | `/mst:schema-designer` | 데이터 스키마 설계 에이전트 호출 |
| | `/mst:feedback-composer` | 피드백 문서 작성 에이전트 호출 |
| 관리 | `/mst:settings` | 설정 조회/변경 (dot notation) |
| | `/mst:on` | Maestro 모드 활성화 |
| | `/mst:off` | Maestro 모드 비활성화 |
| | `/mst:cleanup` | 세션 일괄 정리 |
| | `/mst:archive` | 세션 아카이브 관리 |

## 워크플로우

| Phase | 이름 | 설명 |
|-------|------|------|
| 1 | PM 분석 | 요구사항 분석, 스펙 작성, 사용자 승인 |
| 2 | 외주 실행 | Codex/Gemini가 Git Worktree에서 코드 구현 |
| 3 | PM 리뷰 | 수락 조건 검증, PASS/FAIL 판정 |
| 4 | 피드백 루프 | 미충족 항목 수정 반복 (최대 5회) |
| 5 | 수락/완료 | rebase + squash merge, worktree 정리 |

## 프로젝트 구조

```
gran-maestro/
├── .claude-plugin/     # 플러그인 매니페스트 (plugin.json, marketplace.json)
├── agents/             # 커스텀 에이전트 (PM Conductor, Architect 등 6개)
├── skills/             # 스킬 디렉토리 (27개 스킬, 자동 탐색)
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

## 상세 문서

- [설정 관리](docs/configuration.md) — config.json 전체 옵션 레퍼런스
- [스킬 레퍼런스](docs/skills-reference.md) — 27개 스킬 상세 사용법
- [대시보드](docs/dashboard.md) — 허브 구조, 뷰, API 엔드포인트
- [베스트 프랙티스](docs/best-practices.md) — 효율적인 워크플로우 패턴
- [세계관 및 에이전트 팀](docs/CLAUDE.md) — 전체 워크플로우, 에이전트 팀 구성, 듀얼 모드 운용
- [용어 사전](docs/glossary.md) — 공식 용어 및 ID 체계
- [릴리스 체크리스트](docs/RELEASE.md) — 버전 관리 및 배포 절차

## 라이선스

Source Available License — 자유롭게 사용할 수 있으나 포크 및 재배포는 금지됩니다. 자세한 내용은 [LICENSE](LICENSE)를 참조하세요.
