# Gran Maestro

[한국어](README.md) | [English](README.en.md)

> **"I am the Maestro — I conduct, I don't code."**

AI에게 모호한 요청을 던지면 빠르게 엉뚱한 결과가 나옵니다.
필요한 건 코드를 짜기 전, AI와 함께 계획을 세우는 단계입니다.
Gran Maestro는 그 계획 수립 단계에서 AI를 사고 파트너로 만듭니다.

```bash
/plugin marketplace add myrtlepn/gran-maestro
```

![계획이 토론되고 검증되는 실제 화면](docs/assets/dashboard-ideation.png)

[Q&A 계획 수립](#기능-요약) | [다각도 브레인스토밍](#기능-요약) | [팀 토론](#기능-요약) | [UI 시각화](#기능-요약) | [코드 탐색](docs/skills-reference.md)

---

기존 스펙 문서나 PRD는 작성과 구현 사이에 단절을 만듭니다. 문맥이 끊긴 채 구현에 들어가면, 시간과 집중과 신뢰를 함께 잃습니다. 계획과 실행이 하나의 흐름으로 이어지는 방식이 필요합니다.

`/mst:plan`은 코드를 짜는 대신 핵심 결정을 질문으로 꺼냅니다. 답변이 돌아올 때마다 다음 질문이 구체화되어, 모호했던 요청이 실행 가능한 플랜으로 정제됩니다. 막히면 AI 팀이 다각도로 의견을 모으고(ideation), 합의에 도달할 때까지 토론합니다(discussion).

```
> /mst:plan "로그인 화면 개선해줘"

[PM] 두 가지 결정이 필요합니다:
  1. 소셜 로그인을 추가할까요, 기존 폼을 개선할까요?
  2. 세션 유지는 JWT로 바꿀까요?

> 막히면 ideation으로 AI 팀의 의견을 모을 수 있습니다.
```

텍스트만으로 합의하면 빈칸이 남습니다 — 화면은 Stitch로 즉석 시각화하고, 완성된 플랜은 다중 AI가 역할별로 검토합니다(Plan Review). 검증된 플랜은 Codex와 Gemini 개발팀에 전달되어 자동으로 구현됩니다. 대시보드에서 진행 상태와 근거를 실시간으로 확인할 수 있습니다. 아래 Quick Start에서 바로 시작하세요.

## Quick Start

Claude Code(v1.0.33 이상)에서:

```bash
/plugin marketplace add myrtlepn/gran-maestro
/plugin install mst@gran-maestro
```

```
# 1. 여러 요청을 plan으로 상세화
/mst:plan 로그인 화면 개선
/mst:plan API 엔드포인트 추가
/mst:plan 대시보드 오류 수정

# 2. 스펙 확인 후 일괄 시작
/mst:list
/mst:approve PLN-001 PLN-002 PLN-003
```

단건 실행도 가능합니다: `/mst:request`

상세 설치 가이드: [docs/quick-start.md](docs/quick-start.md)

## 기능 요약

| 기능 | 명령 | 용도 |
|------|------|------|
| Q&A 계획 수립 | `/mst:plan` | 질문으로 요구사항 정제, 검증된 플랜 생성 |
| 다각도 브레인스토밍 | `/mst:ideation` | AI 팀이 병렬로 의견 수집, PM이 종합 |
| 팀 토론 | `/mst:discussion` | 합의에 도달할 때까지 반복 토론 |
| 버그 조사 | `/mst:debug` | 3 AI가 병렬로 버그 조사, 종합 리포트 |
| UI 시각화 | `/mst:stitch` | Stitch로 UI 목업 즉석 생성 |
| 코드 탐색 | `/mst:explore` | 코드베이스 자율 탐색, 스펙 근거 확보 |

전체 스킬 목록: [docs/skills-reference.md](docs/skills-reference.md)

## 문서

**시작하기**
- [빠른 시작 가이드](docs/quick-start.md) — 사전 요구사항, 설치, Stitch MCP 설정, 인증 방법
- [설정 관리](docs/configuration.md) — config.json 전체 옵션 레퍼런스

**심화**
- [스킬 레퍼런스](docs/skills-reference.md) — 30개 스킬 상세 사용법
- [대시보드](docs/dashboard.md) — 허브 구조, 뷰, API 엔드포인트
- [베스트 프랙티스](docs/best-practices.md) — 효율적인 워크플로우 패턴
- [OMX 가이드](docs/omx-guide.md) — oh-my-codex 설치, AGENTS.md 커스터마이징, 트리거 레퍼런스

**레퍼런스**
- [용어 사전](docs/glossary.md) — 공식 용어 및 ID 체계
- [변경 이력](CHANGELOG.md) — 버전별 변경사항

## 라이선스

Source Available License — 자유롭게 사용할 수 있으나 포크 및 재배포는 금지됩니다. 자세한 내용은 [LICENSE](LICENSE)를 참조하세요.
