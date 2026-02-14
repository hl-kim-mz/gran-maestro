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
2. `.gran-maestro/mode.json` 작성:
   ```json
   {
     "active": true,
     "activated_at": "ISO-timestamp",
     "active_requests": [],
     "auto_deactivate": true,
     "previous_mode": "omc"
   }
   ```
3. `.gran-maestro/config.json` 존재 확인, 없으면 기본 설정 생성
4. 사용자에게 모드 전환 알림

## 출력

```
🎼 Gran Maestro 모드 활성화

역할 전환: Claude Code → PM (지휘자)
- 코드 작성: 금지 (Codex/Gemini에 위임)
- 분석/스펙/리뷰: 활성

OMC 오케스트레이션 스킬이 비활성화되었습니다.
/ms 로 새 요청을 시작하세요.
```
