# Gran Maestro

[한국어](README.md) | [English](README.en.md)

> **"I am the Maestro — I conduct, I don't code."**

**당신이 결정하면, AI 팀이 실행합니다.**

아이디어가 생기면 Claude와 대화를 시작하세요.
의논하고, 탐색하고, 계획을 완성하세요.
계획이 쌓이면 한 번에 approve — Codex·Gemini가 실행합니다.

## Why Gran Maestro?

- **Claude = PM, Codex·Gemini = 개발팀** — Claude는 스펙을 쓰고 리뷰합니다. Codex와 Gemini가 Git Worktree에서 실제 구현을 담당합니다.
- **자리를 비워도 일은 계속됩니다** — 스펙을 승인하고 자리를 비우세요. 돌아오면 구현, 리뷰, 피드백까지 끝나 있습니다.
- **실시간 대시보드** — 워크플로우 그래프, 에이전트 스트림, 의존성 관계를 한눈에 파악합니다.
- **구독료의 가치를 극대화합니다** — 이미 결제한 Claude, Gemini, Codex를 각자 가장 잘하는 역할로 팀처럼 운영합니다.

![Gran Maestro 대시보드 — Ideation 뷰](docs/assets/dashboard-ideation.png)

## 기본 사용 흐름

### 단건 모드

만들고 싶은 것을 자연어로 전달하고, 스펙을 확인한 뒤 승인합니다.

```
/mst:request "JWT 기반 사용자 인증 기능을 추가해줘"
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

## 핵심 기능

| 스킬 | 설명 |
|------|------|
| `/mst:plan` | Claude PM이 핵심 결정을 하나씩 물으며 함께 완성하는 인터랙티브 스펙 작성 |
| `/mst:ideation` | Codex·Gemini·Claude가 동시에 의견을 내고 PM이 종합하는 다각도 브레인스토밍 |
| `/mst:discussion` | 합의에 도달할 때까지 AI 팀이 반복 토론 — 복잡한 기술 결정을 빠르게 수렴 |
| `/mst:debug` | 3 AI(Codex·Gemini·Claude)가 병렬로 버그를 조사하고 종합 리포트 생성 |
| `/mst:stitch` | Google Stitch MCP로 UI 목업·시안을 즉석에서 생성 — 계획 중에 바로 눈으로 확인 |
| `/mst:explore` | 코드베이스를 자율 탐색해 파일·함수·의존성을 자동 분석, 스펙 작성의 근거 확보 |

전체 스킬 목록: [docs/skills-reference.md](docs/skills-reference.md)

## 설치

Claude Code에서 (v1.0.33 이상):

```bash
/plugin marketplace add myrtlepn/gran-maestro
/plugin install mst@gran-maestro
```

상세 설치 가이드: [docs/quick-start.md](docs/quick-start.md) ←

## 상세 문서

- [빠른 시작 가이드](docs/quick-start.md) — 사전 요구사항, 설치, Stitch MCP 설정, 인증 방법
- [설정 관리](docs/configuration.md) — config.json 전체 옵션 레퍼런스
- [스킬 레퍼런스](docs/skills-reference.md) — 30개 스킬 상세 사용법
- [대시보드](docs/dashboard.md) — 허브 구조, 뷰, API 엔드포인트
- [베스트 프랙티스](docs/best-practices.md) — 효율적인 워크플로우 패턴
- [용어 사전](docs/glossary.md) — 공식 용어 및 ID 체계
- [OMX 가이드](docs/omx-guide.md) — oh-my-codex 설치, AGENTS.md 커스터마이징, 트리거 레퍼런스
- [변경 이력](CHANGELOG.md) — 버전별 변경사항

## 라이선스

Source Available License — 자유롭게 사용할 수 있으나 포크 및 재배포는 금지됩니다. 자세한 내용은 [LICENSE](LICENSE)를 참조하세요.
