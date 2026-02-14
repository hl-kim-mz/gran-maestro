---
name: maestro:start
description: "새 요청을 시작하고 PM 분석 워크플로우에 진입합니다"
user-invocable: true
argument-hint: "<요청 내용> [--auto]"
aliases: ["ms"]
---

# maestro:start

Gran Maestro 워크플로우의 시작점. 사용자의 요청을 받아 PM 분석 Phase에 진입합니다.

## 모드 전환

Maestro 모드가 비활성 상태이면 자동으로 활성화합니다:
1. `.gran-maestro/mode.json` 확인
2. `active: false`이면 → Maestro 모드 활성화 (OMC 오케스트레이션 비활성화)
3. 사용자에게 모드 전환 알림

## 실행 프로토콜

1. 새 요청 ID 채번 (REQ-NNN) — `.gran-maestro/requests/` 하위 최대 번호 + 1
2. `.gran-maestro/requests/REQ-NNN/` 디렉토리 생성
3. 요청 메타데이터 기록 (`request.json`):
   ```json
   {
     "id": "REQ-NNN",
     "title": "{사용자 요청 요약}",
     "original_request": "{전체 요청 텍스트}",
     "status": "phase1_analysis",
     "current_phase": 1,
     "created_at": "ISO-timestamp",
     "auto_approve": false,
     "tasks": [],
     "dependencies": { "blockedBy": [], "relatedTo": [], "blocks": [] }
   }
   ```
4. PM Conductor 에이전트 활성화 (`gran-maestro:pm-conductor`)
5. 복잡도 판단:
   - **Simple**: PM Conductor 단독 분석
   - **Standard/Complex**: Analysis Squad 팀 소환 (Explorer x2 + Analyst + Design Wing)
6. Phase 1 진입 → 사용자와 소통 시작

## 옵션

- `--auto`: 스펙 자동 승인 모드 (사용자 승인 단계 스킵, `auto_approve: true`)

## 예시

```
/ms "JWT 기반 사용자 인증 기능을 추가해줘"
/ms --auto "로그인 버튼 색상을 파란색으로 변경"
/ms "사용자 프로필 페이지에 아바타 업로드 기능 추가"
```

## 한국어 트리거

다음 패턴이 감지되면 자동으로 `/ms`를 호출합니다:
- "구현해줘", "만들어줘", "개발해줘", "추가해줘"
