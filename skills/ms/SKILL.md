---
name: maestro:start
description: "새 요청을 시작하고 PM 분석 워크플로우에 진입합니다"
user-invocable: true
argument-hint: "<요청 내용> [--auto]"
aliases: ["ms"]
---

# maestro:start

Gran Maestro 워크플로우의 시작점. 사용자의 요청을 받아 PM 분석 Phase에 진입합니다.

## 모드 전환 (자동 부트스트래핑)

Maestro 모드가 비활성 상태이면 자동으로 활성화합니다:

1. `.gran-maestro/` 디렉토리 존재 확인, 없으면 생성
2. 플러그인 루트 경로 확인 (이 스킬의 Base directory에서 2단계 상위)
3. `.gran-maestro/config.json` 존재 확인
   - 없으면: 플러그인의 `templates/defaults/config.json` 내용을 복사
4. `.gran-maestro/agents.json` 존재 확인
   - 없으면: 플러그인의 `templates/defaults/agents.json` 내용을 복사
5. `.gran-maestro/mode.json` 확인
   - `active: false`이거나 파일 없음 → 아래 내용으로 생성/업데이트:
     ```json
     {
       "active": true,
       "activated_at": "{현재 ISO timestamp}",
       "active_requests": [],
       "auto_deactivate": true,
       "previous_mode": "omc"
     }
     ```
6. `.gran-maestro/requests/` 디렉토리 확인, 없으면 생성
7. `.gran-maestro/worktrees/` 디렉토리 확인, 없으면 생성
8. 사용자에게 모드 전환 알림 (첫 활성화 시에만)

## 실행 프로토콜

1. 새 요청 ID 채번 (REQ-NNN):
   - `.gran-maestro/requests/` 하위의 기존 REQ-* 디렉토리를 스캔
   - 최대 번호를 찾아 +1 (첫 요청이면 REQ-001)
2. `.gran-maestro/requests/REQ-NNN/` 디렉토리 생성
   - 하위에 `tasks/`, `discussion/`, `design/` 서브디렉토리도 함께 생성
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
   - `--auto` 플래그가 설정된 경우: `"auto_approve": true`로 설정
4. `.gran-maestro/mode.json`의 `active_requests` 배열에 새 요청 ID 추가
5. PM Conductor 에이전트 활성화 (`gran-maestro:pm-conductor`)
6. 복잡도 판단:
   - **Simple**: PM Conductor 단독 분석
   - **Standard/Complex**: Analysis Squad 팀 소환 (Explorer x2 + Analyst + Design Wing)
7. Phase 1 진입 → 사용자와 소통 시작

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
