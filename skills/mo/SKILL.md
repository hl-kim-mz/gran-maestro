---
name: maestro:on
description: "Maestro 모드를 활성화합니다 (OMC 오케스트레이션 비활성화)"
user-invocable: true
argument-hint: ""
aliases: ["mo"]
---

# maestro:on

Gran Maestro 모드를 활성화합니다. OMC 오케스트레이션 스킬이 비활성화되고,
Maestro 오케스트레이션 스킬이 활성화됩니다.

## 모드 전환 규칙

### 활성화 시 차단되는 OMC 스킬
- `/autopilot`, `/ralph`, `/ultrawork`, `/team`, `/pipeline`, `/ultrapilot`, `/swarm`, `/ecomode`

### Maestro 모드에서 사용 가능한 스킬
- Maestro 오케스트레이션: `/ms`, `/ml`, `/mst`, `/ma`, `/mf`, `/mc`, `/md`, `/mp`, `/mh`, `/mcf`
- CLI 직접 호출: `/mx`, `/mg` (모드 무관)
- 단발 분석/리뷰: `/analyze`, `/deepsearch`, `/code-review`, `/security-review` (모드 무관)
- 유틸리티: `/note`, `/plan`, `/trace`, `/doctor` (모드 무관)

## 실행 프로토콜

1. `.gran-maestro/` 디렉토리 존재 확인, 없으면 생성
2. 플러그인 루트 경로 확인 (이 스킬의 Base directory에서 2단계 상위)
3. `.gran-maestro/config.json` 존재 확인
   - 없으면: 플러그인 루트의 `templates/defaults/config.json` 내용을 읽어서 `.gran-maestro/config.json`에 저장
4. `.gran-maestro/agents.json` 존재 확인
   - 없으면: 플러그인 루트의 `templates/defaults/agents.json` 내용을 읽어서 `.gran-maestro/agents.json`에 저장
5. `.gran-maestro/mode.json` 작성 (always overwrite):
   ```json
   {
     "active": true,
     "activated_at": "{현재 ISO timestamp}",
     "active_requests": [],
     "auto_deactivate": true,
     "previous_mode": "omc"
   }
   ```
6. `.gran-maestro/requests/` 디렉토리 존재 확인, 없으면 생성
7. `.gran-maestro/worktrees/` 디렉토리 존재 확인, 없으면 생성
8. 사용자에게 모드 전환 알림 출력

## 출력

```
🎼 Gran Maestro 모드 활성화

역할 전환: Claude Code → PM (지휘자)
- 코드 작성: 금지 (Codex/Gemini에 위임)
- 분석/스펙/리뷰: 활성

OMC 오케스트레이션 스킬이 비활성화되었습니다.
/ms 로 새 요청을 시작하세요.
```

## 한국어 트리거

- "마에스트로 켜", "마에스트로 시작", "지휘자 모드"

## 부트스트래핑 참조

기본 설정 템플릿 위치 (플러그인 내):
- `templates/defaults/config.json` — 전체 기본 설정
- `templates/defaults/agents.json` — 실행/리뷰/분석 에이전트 정의
- `templates/defaults/mode.json` — 모드 상태 초기값
