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
   - false면: 사용자 명시 설정으로 간주 → 계속
   - true면:
     a. **UI 키워드 1차 필터**: 요청 텍스트/spec §1 요약에 아래 키워드 중 하나라도 포함되지 않으면 list_projects 호출 없이 skip:
        - whitelist: `화면`, `UI`, `페이지`, `page`, `screen`, `컴포넌트`, `component`, `레이아웃`, `layout`, `디자인`, `design`, `목업`, `mockup`, `시안`, `뷰`, `view`
     b. **세션 캐시 확인**: 현재 세션 중 이미 `list_projects`를 성공 호출한 결과가 있으면 재사용 (재호출 생략)
     c. 캐시 미존재 시: `mcp__stitch__list_projects` 호출 (30초 타임아웃)
        - 성공: 결과를 세션 캐시에 저장 → 계속
        - 실패/타임아웃: `[Stitch] 연결 불가 — 건너뜀. /mst:stitch로 수동 실행 가능.` 출력 후 종료

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
   - `status: "active"` 항목 발견 시: "이미 생성된 화면입니다." 출력 후 기존 URL 반환, 종료
   - `status: "pending"` 항목 발견 시: 이전 생성 시도가 타임아웃됐을 가능성 있음 → 서버 확인 진행
     - `mcp__stitch__list_screens` 호출로 실제 화면 존재 여부 확인
     - 발견 시: `get_screen`으로 URL 확보 → pending 항목을 active로 갱신 → 기존 URL 반환, 종료
     - 매칭 기준: pending 항목의 `created_at` 이후 생성된 화면 중 최근 3개를 검사
     - 미발견 시: `stale_at`(= `created_at` + 5분) 경과 여부 확인
       - `stale_at` 이내: pending 항목 유지 → "이전 생성 요청이 아직 처리 중일 수 있습니다. 잠시 후 다시 시도하세요." 출력 후 종료
       - `stale_at` 경과: pending 항목 제거 → 새 생성 진행

2. **pending 선기록**:
   - REQ-NNN이 있을 경우, `generate_screen_from_text` 호출 직전 `request.json`의 `stitch_screens`에 임시 항목 기록:
     ```json
     { "status": "pending", "hash": "{hash}", "route": "{route}", "created_at": "{TS}" }
     ```
   - 타임아웃 발생 시 이 항목이 재실행 중복 방지에 사용됨

3. **대기 안내 메시지 출력**:
   ```
   [Stitch] 화면 생성 중... (최대 수 분 소요될 수 있습니다)
   ```

4. **화면 생성**:
   ```
   mcp__stitch__generate_screen_from_text(
     projectId: {config.stitch.project_id},
     prompt: "{화면 설명}\n\n[기존 레이아웃 컨텍스트]\n{수집된 컨텍스트}",
     deviceType: "DESKTOP"
   )
   ```
   - **성공 시**: step 5(get_screen)로 진행
   - **실패/타임아웃 시**: list_screens 폴백 검증 진행:
     1. 3~5초 대기 (서버 작업 완료 대기)
     2. `mcp__stitch__list_screens` 호출
     3. pending 항목의 `created_at` 이후 생성된 화면 중 최근 3개를 검사하여 매칭되는 화면 탐색
     4. 발견 시: step 5(get_screen)로 진행하여 URL 확보 → pending 항목을 active로 갱신 → 정상 사용자 보고
     5. 미발견 시: `stale_at`(= `created_at` + 5분) 경과 여부 확인
        - `stale_at` 이내: pending 항목 유지 → "[Stitch] 화면 생성 요청이 처리 중입니다 — Stitch 서버가 응답하는 데 수 분이 걸릴 수 있습니다. 잠시 후 다시 실행하면 자동으로 재확인합니다." 출력 후 종료
        - `stale_at` 경과: pending 항목 제거 → "[Stitch] 화면 생성 실패 — {오류}. 텍스트 명세로 진행합니다." 출력 후 종료

5. **화면 URL 확보** (`get_screen` 최대 3회 재시도):
   ```
   mcp__stitch__get_screen(name: "projects/{id}/screens/{screen_id}", ...)
   ```
   - 실패 시 5초 대기 후 재시도, 최대 3회
   - 3회 모두 실패 시: screen_id를 pending 항목에 기록하고 "[Stitch] 화면 URL 확보 실패 — screen_id: {id}. 나중에 /mst:stitch --list로 확인 가능합니다." 출력

6. **variants 요청 시** (--variants 또는 트리거 C):
   ```
   mcp__stitch__generate_variants(
     projectId: {project_id},
     selectedScreenIds: [{생성된 screen_id}],
     prompt: "다양한 레이아웃과 색상 방향으로 3가지 변형 생성",
     variantOptions: { variantCount: 3, creativeRange: "EXPLORE" }
   )
   ```

## 메타데이터 기록

REQ-NNN이 있는 경우 `request.json`의 `stitch_screens` 배열의 pending 항목을 다음으로 갱신 (없으면 신규 추가):

> **타임스탬프 취득 (MANDATORY)**:
> `TS=$(python3 {PLUGIN_ROOT}/scripts/mst.py timestamp now)`
> 위 명령 실패 시 폴백: `python3 -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).isoformat())"`
> 출력값을 `created_at` 필드에 기입한다. 날짜만 기입 금지.

```json
{
  "screen_id": "uuid-{random}",
  "stitch_screen_id": "{Stitch screen_id}",
  "req_id": "REQ-NNN",
  "title": "REQ-NNN {화면명}",
  "route": "{경로 또는 null}",
  "hash": "{요청 텍스트 hash}",
  "url": "{Stitch 화면 URL}",
  "created_at": "{TS — mst.py timestamp now 출력값}",
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
| list_projects 타임아웃 (30초) | "[Stitch] 연결 불가 — 건너뜀. /mst:stitch로 수동 실행 가능." 출력 후 종료 |
| generate_screen 타임아웃 | 즉시 종료 금지 — 3~5초 대기 후 list_screens 폴백; stale_at(created_at+5분) 이내면 pending 유지, 경과 시 제거 |
| get_screen 실패 | 5초 간격으로 최대 3회 재시도. 모두 실패 시 screen_id를 pending 항목에 기록하고 URL 미확보 안내 출력 |
| 화면 생성 실패 | "[Stitch] 화면 생성 실패 — {오류}. 텍스트 명세로 진행합니다." |
| enabled=false | "[Stitch] 비활성화됨 (config.stitch.enabled=false)" |

## 옵션

- `--auto`: 사용자 확인 없이 자동 실행
- `--variants`: 화면 생성 후 3가지 변형 추가 생성
- `--req REQ-NNN`: 특정 REQ에 연결 (메타데이터 기록)
- `--edit SCREEN_ID`: 기존 화면 수정
- `--list`: 현재 Stitch 프로젝트의 화면 목록 조회
