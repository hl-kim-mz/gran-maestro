[← README](../README.md)

# Gran Maestro 대시보드

로컬 웹 서버 기반 대시보드로, 워크플로우를 시각적으로 모니터링합니다.

## 시작하기

```
/mst:dashboard              # 대시보드 시작 + 현재 프로젝트 허브에 등록
/mst:dashboard --stop       # 대시보드 중지
/mst:dashboard --port 8080  # 커스텀 포트로 시작
/mst:dashboard --restart    # 대시보드 재시작
```

| 옵션 | 설명 |
|------|------|
| (없음) | 기본 포트(`server.port`)로 서버를 시작하고 현재 프로젝트를 허브에 등록합니다 |
| `--stop` | 실행 중인 대시보드 서버를 중지합니다 |
| `--port <번호>` | 지정한 포트 번호로 서버를 시작합니다 |
| `--restart` | 서버를 중지한 후 다시 시작합니다 |

시작 후 브라우저가 자동으로 열리며, URL에 Bearer 토큰이 포함됩니다.

## 요구사항

대시보드 서버는 **Deno 런타임**이 필요합니다. Deno가 설치되어 있지 않으면 서버가 시작되지 않습니다.

### Deno 설치

```bash
# macOS / Linux (공식 설치 스크립트)
curl -fsSL https://deno.land/install.sh | sh

# macOS (Homebrew)
brew install deno

# Windows (PowerShell)
irm https://deno.land/install.ps1 | iex
```

설치 후 `deno --version`으로 정상 설치를 확인하세요.

## 허브 구조

하나의 서버 인스턴스에서 **여러 프로젝트를 동시 관리**하는 허브 모드로 동작합니다. 각 프로젝트는 `/mst:dashboard` 실행 시 자동으로 허브에 등록되며, 대시보드 좌측 사이드바에서 프로젝트를 전환할 수 있습니다.

서버 데이터는 `~/.gran-maestro-hub/`에 저장됩니다:

| 항목 | 경로 |
|------|------|
| PID 파일 | `~/.gran-maestro-hub/hub.pid` |
| 인증 토큰 | `~/.gran-maestro-hub/hub.token` |
| 프로젝트 레지스트리 | `~/.gran-maestro-hub/registry.json` |
| 로그 | `/tmp/gran-maestro-hub.log` |

## 대시보드 뷰

| 뷰 | 설명 |
|---|------|
| Workflow Graph | Phase 간 전환 노드-엣지 그래프, 실행 중 노드 애니메이션 |
| Agent Stream | 에이전트 프롬프트/결과 실시간 SSE 스트리밍 |
| Documents | `.gran-maestro/` 하위 MD/JSON 마크다운 렌더링 |
| Dependency Graph | 요청 간 blockedBy/blocks 관계 시각화 |
| Settings | `config.json` 웹 UI 편집 (섹션별 폼, 기본값 리셋) |

## 인증

Bearer 토큰 인증으로 보호됩니다. 서버 시작 시 랜덤 UUID 토큰이 생성되어 `~/.gran-maestro-hub/hub.token`에 저장됩니다. 브라우저 URL에 토큰이 자동으로 포함되므로 별도 로그인 없이 접속할 수 있습니다.

인증을 비활성화하려면 `config.json`에서 `server.auth_enabled`를 `false`로 설정합니다:

```json
"server": {
  "auth_enabled": false
}
```

> 주의: 인증 비활성화 시 로컬 네트워크에 노출될 수 있습니다. 개인 개발 환경에서만 사용하세요.

## API 엔드포인트

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

## 포트 설정

기본 포트는 `3847`이며, 두 가지 방법으로 변경할 수 있습니다.

### 방법 1: 실행 시 옵션으로 지정

```
/mst:dashboard --port 8080
```

이 방법은 일회성으로 적용되며 `config.json`을 수정하지 않습니다.

### 방법 2: 설정 파일에서 영구 변경

`config.json`의 `server` 섹션을 수정합니다:

```json
"server": {
  "port": 8080,
  "host": "127.0.0.1",
  "auth_enabled": true
}
```

또는 `/mst:settings` 명령으로 변경할 수 있습니다:

```
/mst:settings server.port 8080
/mst:settings server.host 127.0.0.1
```

| 키 | 기본값 | 설명 |
|----|--------|------|
| `server.port` | `3847` | 대시보드 포트 번호 |
| `server.host` | `127.0.0.1` | 바인딩 호스트 (로컬호스트 고정 권장) |
| `server.auth_enabled` | `true` | Bearer 토큰 인증 활성화 여부 |

설정 변경 후에는 `/mst:dashboard --restart`로 서버를 재시작해야 적용됩니다.
