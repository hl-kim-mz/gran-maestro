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

## 실행 프로토콜

1. 대시보드 서버 프로세스 확인 (포트 3847)
2. 미실행 시:
   - `.gran-maestro/` 디렉토리 존재 확인
   - Deno + Hono 서버 시작 (백그라운드)
   - SSE 엔드포인트 활성화
3. 실행 중이면:
   - 브라우저에서 `http://localhost:3847` 열기

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
