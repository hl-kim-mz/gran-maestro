---
name: stitch
description: "Stitch MCP를 사용해 UI 화면을 설계합니다. 명시적 디자인 요청, 새 화면 추가, 전체 디자인 변경 시 사용."
user-invocable: true
argument-hint: "[--auto] [--variants] [--req REQ-NNN] {화면 설명}"
---

# maestro:stitch

## 선행 조건 확인

1. `config.stitch.enabled` 확인 → false면 즉시 종료 (안내 메시지 출력)
2. `config.stitch.auto_detect` 확인:
   - true면: `mcp__stitch__list_projects` 호출 (30초 타임아웃)
     - 성공: Stitch 사용 가능 → 계속
     - 실패/타임아웃: `[Stitch] 연결 불가 — 건너뜀. /mst:stitch로 수동 실행 가능.` 출력 후 종료
   - false면: 사용자 명시 설정으로 간주 → 계속

## 프로젝트 확인/생성

1. `config.stitch.project_id` 확인:
   - 값 있으면: `mcp__stitch__get_project` 호출로 유효성 검증
   - null이면: `mcp__stitch__create_project` 로 새 프로젝트 생성 → config.stitch.project_id 저장
     - 프로젝트 이름: `{현재 디렉토리명}-UI`
     - `.gran-maestro/config.json`의 `stitch.project_id`에 저장

## 기존 화면 컨텍스트 수집 (선택)

기존 UI 화면이 있는 경우 레이아웃 일관성을 위해:
1. `mcp__stitch__list_screens` 로 기존 Stitch 화면 목록 조회
2. 기존 화면이 있으면: 최근 화면 1-2개의 핵심 레이아웃 패턴을 텍스트로 요약 (공통 Header/Sidebar 구조, 주요 컴포넌트 패턴)
3. 이 컨텍스트를 `generate_screen_from_text` 프롬프트에 포함

## 트리거 분기

### A. 명시적 디자인 요청 (즉시 실행)
- 감지: "화면 디자인해줘", "Stitch로 그려줘", "목업 만들어줘" 등 명시적 디자인 의도
- 처리: 사용자 확인 없이 바로 화면 생성 프로토콜 진행

### B. 새 화면 추가 요청 (사용자 선택)
- 강한 신호: 새 라우트 파일 생성 + 네비게이션 노출 예정
- 중간 신호: "새/추가/신규 화면/페이지" 키워드 포함
- config.stitch.auto_trigger=false(기본): "Stitch로 화면 먼저 설계할까요?" 물어봄
- config.stitch.auto_trigger=true: 자동 실행

### C. 전체 디자인 변경 (사용자 선택 + variants)
- 감지: "전체 디자인 바꿔줘", "리디자인", "전면 개편" 등
- 처리: B와 동일하게 확인 후, --variants 옵션으로 2-3개 방향 제안

### D. 약한 신호 (개입 안 함)
- 기존 화면 컴포넌트/스타일 수정만 → Stitch 개입 없음

## 화면 생성 프로토콜

1. **중복 체크 (diff hash)**:
   - REQ-NNN이 있을 경우 `request.json`의 `stitch_screens`에서 동일 `route + hash` 조합 확인
   - 일치하면: "이미 생성된 화면입니다." 출력 후 기존 URL 반환, 종료

2. **화면 생성**:
   ```
   mcp__stitch__generate_screen_from_text(
     projectId: {config.stitch.project_id},
     prompt: "{화면 설명}\n\n[기존 레이아웃 컨텍스트]\n{수집된 컨텍스트}",
     deviceType: "DESKTOP"
   )
   ```

3. **variants 요청 시** (--variants 또는 트리거 C):
   ```
   mcp__stitch__generate_variants(
     projectId: {project_id},
     selectedScreenIds: [{생성된 screen_id}],
     prompt: "다양한 레이아웃과 색상 방향으로 3가지 변형 생성",
     variantOptions: { variantCount: 3, creativeRange: "EXPLORE" }
   )
   ```

4. **화면 URL 확보**:
   ```
   mcp__stitch__get_screen(name: "projects/{id}/screens/{screen_id}", ...)
   ```

## 메타데이터 기록

REQ-NNN이 있는 경우 `request.json`의 `stitch_screens` 배열에 추가:
```json
{
  "screen_id": "uuid-{random}",
  "stitch_screen_id": "{Stitch screen_id}",
  "req_id": "REQ-NNN",
  "title": "REQ-NNN {화면명}",
  "route": "{경로 또는 null}",
  "hash": "{요청 텍스트 hash}",
  "url": "{Stitch 화면 URL}",
  "created_at": "{ISO timestamp}",
  "status": "active"
}
```

## REQ 문서 자동 첨부

REQ-NNN의 spec.md 하단에 Stitch 섹션 추가:
```markdown
## Stitch 디자인
- {화면명}: {Stitch URL}
```

## 사용자 보고

생성 완료 후:
```
[Stitch] "{화면명}" 화면이 생성되었습니다.
🔗 Stitch 링크: {URL}
spec.md에 링크가 첨부되었습니다.
```

variants 생성 시:
```
[Stitch] 3가지 디자인 방향이 생성되었습니다.
🔗 원본: {URL}
🔗 변형 1: {URL}
🔗 변형 2: {URL}
🔗 변형 3: {URL}
```

## 오류 처리

| 오류 | 처리 |
|------|------|
| 타임아웃 (30초) | "[Stitch] 연결 불가 — 건너뜀. /mst:stitch로 수동 실행 가능." 출력 후 종료 |
| 프로젝트 ID 무효 | project_id를 null로 초기화 후 새 프로젝트 생성으로 재시도 |
| 화면 생성 실패 | "[Stitch] 화면 생성 실패 — {오류}. 텍스트 명세로 진행합니다." |
| enabled=false | "[Stitch] 비활성화됨 (config.stitch.enabled=false)" |

## 옵션

- `--auto`: 사용자 확인 없이 자동 실행
- `--variants`: 화면 생성 후 3가지 변형 추가 생성
- `--req REQ-NNN`: 특정 REQ에 연결 (메타데이터 기록)
- `--edit SCREEN_ID`: 기존 화면 수정
- `--list`: 현재 Stitch 프로젝트의 화면 목록 조회
