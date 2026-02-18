# Gran Maestro

> **"I am the Maestro — I conduct, I don't code."**

Gran Maestro는 Claude Code를 PM(지휘자)으로 전환하는 플러그인입니다.
PM은 코드를 직접 작성하지 않고, AI 에이전트(Codex, Gemini)를 지휘하여 개발합니다.
요청 → 분석 → 스펙 → 구현 → 리뷰 → 완료까지 전 과정을 오케스트레이션합니다.

## Quick Start

### 1. 설치

Claude Code에서 (v1.0.33 이상 필요):

```bash
# Step 1: 마켓플레이스 등록
/plugin marketplace add myrtlepn/gran-maestro

# Step 2: 플러그인 설치
/plugin install mst@myrtlepn-gran-maestro
```

또는 `/plugin` 명령으로 UI를 열어 **Discover** 탭에서 직접 설치할 수도 있습니다.

#### 업데이트

```bash
# 마켓플레이스 카탈로그 새로고침
/plugin marketplace update myrtlepn-gran-maestro
```

#### 삭제

```bash
/plugin uninstall mst@myrtlepn-gran-maestro
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

### Ideation — 설정 가능한 AI 참여자 브레인스토밍

설정된 AI 팀원이 동시에 의견을 수집하고 PM이 종합합니다.  
`config.json`의 `participants.opinion_providers`로 참여 인원을 조정할 수 있습니다.
구현 전 다각도 분석이 필요할 때 사용합니다.

```
/mst:ideation "마이크로서비스 vs 모놀리식 아키텍처"
/mst:ideation --focus security "OAuth2 vs 자체 인증"
```

결과물은 `.gran-maestro/ideation/IDN-NNN/` 디렉토리에 저장됩니다:
- `opinion-{참여자}.md` — 참여자별 의견 파일(예: `opinion-codex.md`, `opinion-codex-2.md`)
- `synthesis.md` — PM 종합 분석 (수렴점, 발산점, 추천 방향)
예시:
```json
"participants": {
  "opinion_providers": { "codex": 1, "gemini": 1, "claude": 1 }
}
```

### Discussion — 설정 가능한 AI 참여자 합의 토론

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

### 결과 확인

| 방법 | 설명 |
|------|------|
| `/mst:list` | 터미널에서 전체 요청/태스크 현황 확인 |
| `/mst:inspect REQ-001` | 특정 요청의 상세 상태 확인 |
| `.gran-maestro/` 디렉토리 | 모든 상태 파일, 스펙, 리뷰, 토론 결과가 저장되는 루트 |
| `/mst:dashboard` | 웹 대시보드 (개발 중) |

> **참고**: 대시보드(`/mst:dashboard`)는 현재 개발 중입니다. 터미널에서 `/mst:list`와 `/mst:inspect`로 상태를 확인할 수 있습니다.

## 워크플로우

| Phase | 이름 | 설명 |
|-------|------|------|
| 1 | PM 분석 | 요구사항 분석, 스펙 작성, 사용자 승인 |
| 2 | 외주 실행 | Codex/Gemini가 Git Worktree에서 코드 구현 |
| 3 | PM 리뷰 | 수락 조건 검증, PASS/FAIL 판정 |
| 4 | 피드백 루프 | 미충족 항목 수정 반복 (최대 5회) |
| 5 | 수락/완료 | rebase + squash merge, worktree 정리 |

## 주요 명령어

| 명령어 | 설명 |
|--------|------|
| `/mst:start` | 새 요청 시작 |
| `/mst:approve` | 스펙 승인 |
| `/mst:accept` | 최종 수락 (기본 자동, 수동 가능) |
| `/mst:list` | 요청/태스크 현황 |
| `/mst:inspect` | 상세 상태 확인 |
| `/mst:feedback` | 수동 피드백 |
| `/mst:cancel` | 요청 취소 |
| `/mst:codex` | Codex CLI 직접 호출 |
| `/mst:gemini` | Gemini CLI 직접 호출 |
| `/mst:ideation` | 설정 가능한 AI 참여자 브레인스토밍 |
| `/mst:discussion` | 설정 가능한 AI 참여자 합의 토론 |
| `/mst:dashboard` | 대시보드 열기 |
| `/mst:on` / `/mst:off` | Maestro 모드 전환 |
| `/mst:recover` | 미완료 요청 복구 |
| `/mst:history` | 완료된 요청 이력 |
| `/mst:settings` | 설정 조회/변경 |

## 프로젝트 구조

```
gran-maestro/
├── .claude-plugin/     # 플러그인 매니페스트
├── agents/             # 커스텀 에이전트 (PM, Architect 등)
├── skills/             # 스킬 디렉토리 (자동 탐색)
├── src/                # TypeScript 소스 (대시보드 서버)
├── templates/          # 스펙/리뷰/피드백 템플릿
└── docs/               # 상세 문서
```

## 상세 문서

- [세계관 및 스킬 레퍼런스](docs/CLAUDE.md) — 전체 워크플로우, 에이전트 팀 구성, 듀얼 모드 운용
- [용어 사전](docs/glossary.md) — 공식 용어 및 ID 체계
- [릴리스 체크리스트](docs/RELEASE.md) — 버전 관리 및 배포 절차

## 라이선스

Source Available License — 자유롭게 사용할 수 있으나 포크 및 재배포는 금지됩니다. 자세한 내용은 [LICENSE](LICENSE)를 참조하세요.
