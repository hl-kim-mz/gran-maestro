# OMX (oh-my-codex)

> Codex CLI를 단일 에이전트에서 팀 시스템으로 전환하는 오케스트레이션 레이어

## 왜 OMX인가?

- **역할 기반 전문 에이전트**: `/prompts:architect`, `/prompts:planner`, `/prompts:executor` 등 요청 성격에 맞는 전문 에이전트로 자동 분기해 응답 품질을 높입니다.
- **워크플로우 스킬 자동화**: `$analyze`, `$code-review`, `$ultrawork` 같은 트리거 한 단어로 반복 작업 패턴을 즉시 실행합니다.
- **팀 모드 — 병렬 멀티에이전트**: `omx team`으로 복수 워커를 동시에 돌려 대규모 리팩토링·다중 모듈 작업을 병렬 처리합니다.
- **지속 상태 관리**: `.omx/` 디렉토리에 런타임 상태·메모리를 보존해 긴 세션에서도 컨텍스트가 유지됩니다.

## Gran Maestro와 함께 쓰면

- Gran Maestro의 spec 작성 → Codex CLI 실행 → OMX의 역할 분기가 자동으로 연결되어 각 단계에서 최적 에이전트가 투입됩니다.
- `AGENTS.md` 주입으로 프로젝트별 맞춤 분기 규칙을 적용하고, 트리거 없이도 요청 의도에 맞는 모드로 자동 전환됩니다.
- `/mst:setup-omx` 한 번으로 설치·초기화·`AGENTS.md` 주입까지 자동 완료됩니다.

## 공식 링크

- **GitHub**: [Yeachan-Heo/oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) — 전체 기능·스킬 트리거·팀 모드 레퍼런스
- **npm**: [oh-my-codex](https://www.npmjs.com/package/oh-my-codex) — 설치 및 버전 정보

## Gran Maestro에서 시작하기

```
/mst:setup-omx
```
