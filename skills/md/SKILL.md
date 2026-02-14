---
name: maestro:dashboard
description: "로컬 대시보드 서버를 시작하거나 엽니다"
user-invocable: true
argument-hint: "[--port <포트>] [--stop]"
aliases: ["md"]
---

# maestro:dashboard

Gran Maestro 로컬 대시보드 서버를 시작하고 브라우저에서 엽니다.
워크플로우 그래프, 에이전트 활동 스트림, 문서 브라우저를 제공합니다.

## 요구사항

- **Deno**: 런타임 필수. 미설치 시 https://deno.land 에서 설치 안내

## 실행 프로토콜

### 1. 플러그인 루트 경로 확인
스킬의 베이스 디렉토리는 컨텍스트에 "Base directory for this skill"로 제공됩니다.
플러그인 루트는 스킬 베이스 디렉토리에서 2단계 상위 디렉토리입니다.
패턴: 베이스 디렉토리가 `{X}/skills/md`이면 플러그인 루트는 `{X}`입니다.

### 2. 워크트리 `.gran-maestro/` 디렉토리 확인
```bash
mkdir -p .gran-maestro
```

### 3. Deno 설치 확인
```bash
deno --version
```
실패 시: 사용자에게 https://deno.land 설치 안내 후 종료

### 4. 인자 파싱
- `--stop`: 서버 중지 플래그
- `--port <N>`: 포트 번호 (기본값: 3847)

### 5. `--stop` 처리
```bash
lsof -ti :<port> | xargs kill
```
성공 시 사용자에게 중지 확인 메시지 출력 후 종료

### 6. 포트 사용 중 확인
```bash
lsof -i :<port>
```
이미 실행 중이면 9단계(토큰 URL 파싱)로 건너뛰고 브라우저 열기

### 7. 서버 시작 (백그라운드)
```bash
deno run --allow-net --allow-read --allow-write --allow-env "{plugin_root}/src/server.ts" > /tmp/gran-maestro-dashboard.log 2>&1 &
```
PID를 기록하고 `.gran-maestro/dashboard.pid` 파일에 저장

### 8. 서버 시작 대기 및 검증
2초 대기 후:
```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:<port>/favicon.ico
```
HTTP 200 응답 확인. 실패 시 로그(`/tmp/gran-maestro-dashboard.log`) 출력 후 에러 보고

### 9. 토큰 URL 파싱
서버 stdout에서 토큰 URL 추출 (로그 파일에서 읽기):
패턴: `Dashboard: http://localhost:<PORT>?token=<TOKEN>`

### 10. 브라우저 실행
- macOS: `open "http://localhost:<port>?token=<token>"`
- Linux: `xdg-open "http://localhost:<port>?token=<token>"`

### 11. 사용자 안내
```
✓ Gran Maestro Dashboard running at http://localhost:<port>
✓ Browser opened with authentication token
✓ PID: <pid> (saved to .gran-maestro/dashboard.pid)
```

## 대시보드 뷰

| 뷰 | 설명 |
|---|------|
| Workflow Graph | Phase 간 전환 노드-엣지 그래프, 실행 중 노드 애니메이션 |
| Agent Stream | 에이전트 프롬프트/결과 실시간 스트리밍 |
| Documents | .gran-maestro/ 하위 MD/JSON 마크다운 렌더링 |
| Dependency Graph | 요청 간 blockedBy/blocks 관계 시각화 |
| Settings | config.json 웹 수정 |

## 옵션

- `--port <N>`: 포트 변경 (기본: 3847)
- `--stop`: 실행 중인 대시보드 서버 중지

## 예시

```
/md              # 대시보드 시작/열기
/md --stop       # 대시보드 중지
/md --port 8080  # 커스텀 포트
```

## 한국어 트리거

- "대시보드", "대시보드 열어", "모니터링"
