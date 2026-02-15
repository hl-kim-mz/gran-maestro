---
name: start
description: "새 요청을 시작하고 PM 분석 워크플로우에 진입합니다. 사용자가 '구현해줘', '만들어줘', '개발해줘', '추가해줘'를 말하거나 /mst:start를 호출할 때 사용. 일반적인 코드 수정이나 OMC 오케스트레이션 요청에는 사용하지 않음."
user-invocable: true
argument-hint: "{요청 내용} [--auto]"
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
5. PM Conductor 역할로 Phase 1 분석 수행 (`agents/pm-conductor.md`의 `<phase1_protocol>` 준수):
   a. 요청 파싱 및 복잡도 분류 (simple | standard | complex)
   b. Simple → 단독 분석 / Standard·Complex → Analysis Squad 팀 소환
   c. 코드베이스 탐색 (Explorer 위임), 외부 AI 분석 (반드시 `Skill(skill: "mst:codex", ...)`, `Skill(skill: "mst:gemini", ...)` 도구로 호출 — OMC MCP 직접 호출 금지)
   d. 모호한 요구사항은 사용자에게 질문 (AskUserQuestion, 한 번에 하나씩)
   e. 접근 방식 결정 시: 3 AI 의견 수집 → 종합 → 순위별 추천
   f. **Implementation Spec 작성** (`templates/spec.md` 템플릿 사용)
   g. 태스크 디렉토리 생성: `.gran-maestro/requests/REQ-NNN/tasks/01/`
   h. **spec.md 파일 저장**: `.gran-maestro/requests/REQ-NNN/tasks/01/spec.md`
   i. `request.json`의 `tasks` 배열에 태스크 메타데이터 추가
6. ⚠️ **spec.md 작성 완료 확인** — spec.md 파일이 존재하지 않으면 이 스킬을 종료하지 않음
7. 스펙 요약을 사용자에게 표시하고, `/mst:approve REQ-NNN`으로 승인 안내
   - `--auto` 모드인 경우: 승인 단계 스킵, 자동으로 Phase 2 진입

## 옵션

- `--auto`: 스펙 자동 승인 모드 (사용자 승인 단계 스킵, `auto_approve: true`)

## 예시

```
/mst:start "JWT 기반 사용자 인증 기능을 추가해줘"
/mst:start --auto "로그인 버튼 색상을 파란색으로 변경"
/mst:start "사용자 프로필 페이지에 아바타 업로드 기능 추가"
```

## 문제 해결

- `.gran-maestro/` 디렉토리 생성 실패 → 현재 디렉토리가 git 저장소인지 확인. 쓰기 권한 확인
- `mode.json` 잠금 충돌 → 다른 세션에서 Maestro가 실행 중인지 확인. `mode.json.lock` 파일이 남아있으면 수동 삭제
- 기존 요청 ID 충돌 → `.gran-maestro/requests/` 디렉토리를 확인하고 중복 REQ 폴더가 없는지 검증
