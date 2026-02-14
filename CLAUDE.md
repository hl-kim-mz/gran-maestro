# Gran Maestro — Project Instructions

> 플러그인 세계관 및 스킬 레퍼런스: [docs/CLAUDE.md](docs/CLAUDE.md)
> 릴리스 체크리스트: [docs/RELEASE.md](docs/RELEASE.md)

## 프로젝트 구조

```
.claude-plugin/
  plugin.json        # 플러그인 매니페스트 (버전, agents, skills)
  marketplace.json   # 마켓플레이스 메타데이터 (버전)
package.json         # npm 패키지 (버전)
agents/              # 커스텀 에이전트 정의 (.md)
skills/              # 스킬 디렉토리 (자동 탐색)
src/                 # TypeScript 소스
docs/                # 문서
```

## 버전 관리 (3파일 동기화 필수)

버전은 아래 3개 파일에서 **반드시 동일하게** 유지해야 합니다:

| 파일 | 필드 |
|------|------|
| `.claude-plugin/plugin.json` | `version` |
| `package.json` | `version` |
| `.claude-plugin/marketplace.json` | `plugins[0].version` |

## 커밋 & 푸시 체크리스트

커밋/푸시 요청 시 아래를 반드시 확인합니다:

1. **버전 동기화**: 3개 파일의 버전이 일치하는지 확인
2. **agents 배열**: `plugin.json`의 `agents`가 `agents/` 디렉토리 내 모든 `.md` 파일을 나열하는지 확인
3. **신규 파일 누락**: 새로 추가된 agent/skill 파일이 매니페스트에 반영되었는지 확인
4. **TypeScript (core)**: `npx tsc --noEmit`으로 타입 오류 없는지 확인 (src/ 변경 시)
5. **TypeScript (dashboard)**: `deno check src/server.ts`로 대시보드 서버 타입 확인 (server.ts 변경 시, tsconfig에서 제외되므로 별도 검증 필요)

## plugin.json 규칙

- `skills`: 디렉토리 경로 허용 (`"./skills/"`)
- `agents`: **파일 경로 배열만 허용** (디렉토리 경로 불가)
  ```json
  "agents": [
    "./agents/pm-conductor.md",
    "./agents/architect.md"
  ]
  ```

## 커밋 메시지 컨벤션

```
<요약> (<버전>)

<상세 설명 (선택)>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
