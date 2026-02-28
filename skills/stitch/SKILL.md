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

### E. 멀티 스타일 요청 (--multi 플래그 또는 plan Step 4.5 진입)
- 감지: `--multi` 플래그 명시 or `mst:plan` Step 4.5 "스티치로 디자인 시안 보기" 선택 진입
- 처리: 사용자 확인 없이 바로 **멀티 스타일 생성 프로토콜** 진행

## 화면 생성 프로토콜

0. **baseline_screen_ids 기록**:
   - `mcp__stitch__list_screens` 호출 → 응답의 `screens[].name`에서 screen ID를 추출하여
     `baseline_screen_ids` Set으로 저장
   - screen ID 추출: `name` 필드의 마지막 `/` 이후 값 (예: `"projects/.../screens/abc123"` → `"abc123"`)

1. **중복 체크 (diff hash)**:
   - REQ-NNN이 있을 경우: `request.json`의 `stitch_screens`에서 동일 `route + hash` 조합 확인 (기존 동일)
   - REQ-NNN 없고 PLN-NNN이 있을 경우: `plan.json`의 `stitch_screens`에서 확인
   - 둘 다 없을 경우: 중복 체크 생략
   - `status: "active"` 항목 발견 시: "이미 생성된 화면입니다." 출력 후 기존 URL 반환, 종료
   - `status: "pending"` 항목 발견 시: 이전 생성 시도가 타임아웃됐을 가능성 있음 → 서버 확인 진행
     - `mcp__stitch__list_screens` 호출로 실제 화면 존재 여부 확인
     - 발견 시: `get_screen`으로 URL 확보 → pending 항목을 active로 갱신 → 기존 URL 반환, 종료
     - 매칭 기준:
       - pending 항목에 `baseline_screen_ids`가 있으면: 현재 screen IDs에서 baseline_screen_ids 제거(차집합) → 차집합이 비어있지 않으면 해당 화면 중 첫 번째 선택
       - `baseline_screen_ids`가 없으면(구버전 pending): `created_at` 이후 생성된 화면 중 최근 3개를 검사 (기존 방식 유지)
     - 미발견 시: `stale_at`(= `created_at` + 5분) 경과 여부 확인
       - `stale_at` 이내: pending 항목 유지 → "이전 생성 요청이 아직 처리 중일 수 있습니다. 잠시 후 다시 시도하세요." 출력 후 종료
       - `stale_at` 경과: pending 항목 제거 → 새 생성 진행

2. **pending 선기록**:
   - REQ-NNN이 있을 경우: `generate_screen_from_text` 호출 직전 `request.json`의 `stitch_screens`에 임시 항목 기록 (기존 동일):
     ```json
     { "status": "pending", "hash": "{hash}", "route": "{route}", "created_at": "{TS}", "baseline_screen_ids": ["{id1}", "{id2}", ...] }
     ```
   - REQ-NNN 없고 PLN-NNN이 있을 경우: `plan.json`의 `stitch_screens`에 기록 (형식 동일):
     ```json
     { "status": "pending", "hash": "{hash}", "created_at": "{TS}", "baseline_screen_ids": ["{id1}", "{id2}", ...] }
     ```
   - 둘 다 없을 경우: pending 선기록 생략
   - 빈 응답/타임아웃 발생 시 이 항목이 재실행 중복 방지에 사용됨

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
   - **응답 있음 (screen_id 포함)**: step 5(get_screen)로 진행 (기존 동일)
   - **빈 응답/null**: 비동기 수락으로 처리 → 폴링 루프(4-1) 진입 (재시도 금지)
   - **명시적 오류(예외)**: 실패 처리 (기존 동일)

4-1. **폴링 루프** (빈 응답인 경우만):
   최대 10회, 30초 간격 (총 최대 5분)

   반복마다:
   a. `python3 {PLUGIN_ROOT}/scripts/mst.py stitch sleep --interval 30` (Bash 호출)
   b. `mcp__stitch__list_screens` 호출
   c. `현재 screen IDs - baseline_screen_ids ≠ ∅` 인가?
      - YES: 차집합의 첫 번째 screen ID 선택 → step 5로 진행
      - NO: 반복 계속

   10회 모두 미감지 시:
   - "[Stitch] 화면 생성 요청이 처리 중입니다 — 수 분 내 완료됩니다. 잠시 후 /mst:stitch --list로 확인하세요." 출력
   - pending 항목 유지 (`stale_at` = `created_at` + 5분 기존 로직 그대로 적용)
   - 종료

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

## 멀티 스타일 생성 프로토콜

`--multi` 플래그 또는 plan Step 4.5 진입 시 이 프로토콜을 실행한다.

0. **baseline_screen_ids 기록** (1회):
   - `mcp__stitch__list_screens` 호출 → 응답의 `screens[].name`에서 screen ID 추출 → `baseline_screen_ids` Set으로 저장
   - screen ID 추출: `name` 필드에서 마지막 `/` 이후 값

1. **스타일 세트 도출** (LLM 자율 판단):
   - 요청 텍스트/화면 설명을 분석해 3~4개 스타일 도출
   - 각 스타일: 이름(예: "Minimal & Clean") + 차별화 포인트 요약
   - 스타일 예시: Minimal & Clean / Dark & Modern / Vibrant & Colorful / Corporate & Professional
   - 맥락에 맞지 않는 스타일은 제외하고 적합한 스타일로 대체

2. **배치 pending 선기록**:
   - REQ-NNN이 있을 경우: `request.json`의 `stitch_screens`에 배치 항목 기록:
     ```json
     {
       "status": "pending",
       "type": "multi_style_batch",
       "batch_id": "{uuid}",
       "styles": ["Minimal & Clean", "Dark & Modern", "Vibrant & Colorful"],
       "baseline_screen_ids": ["{id1}", "{id2}", "..."],
       "created_at": "{TS}"
     }
     ```
   - REQ-NNN 없고 PLN-NNN이 있을 경우: `plan.json`의 `stitch_screens`에 동일 형식으로 기록
   - 둘 다 없을 경우: 선기록 생략

3. **스타일별 generate_screen 순차 호출** (N = 스타일 수):
   - 각 스타일마다:
     ```
     mcp__stitch__generate_screen_from_text(
       projectId: {config.stitch.project_id},
       prompt: "{기본 화면 설명}\n\n[스타일 방향] {스타일명}: {스타일 차별화 포인트}",
       deviceType: "DESKTOP"
     )
     ```
   - 응답 있음(screen_id 포함): screen_id 임시 보관 → 다음 스타일 호출 계속
   - 빈 응답/null: 해당 스타일 "pending" 상태로 표시 → 폴링 루프(Step 4)에서 일괄 처리
   - 명시적 오류: 해당 스타일 실패 기록 후 계속

4. **폴링 루프** (즉시 응답 없는 스타일이 있는 경우):
   - 대기 안내 출력:
     ```
     [Stitch] 멀티 스타일 시안 생성 중... (최대 5분 소요)
     ```
   - 최대 10회, 30초 간격:
     a. `python3 {PLUGIN_ROOT}/scripts/mst.py stitch sleep --interval 30` (Bash 호출)
     b. `mcp__stitch__list_screens` 호출
     c. `현재 screen IDs - baseline_screen_ids`의 차집합 크기 >= 수집 목표 수?
        - YES: 차집합에서 목표 수만큼 screen ID 선택 → Step 5로 진행
        - NO: 반복 계속
   - 10회 모두 미감지 시:
     - "[Stitch] 일부 스타일 생성이 지연되고 있습니다 — 잠시 후 /mst:stitch --list로 확인하세요." 출력
     - pending 항목 유지 → 수집된 screen IDs만으로 진행 (0개이면 종료)

5. **각 화면 URL 확보** (`get_screen` 최대 3회 재시도):
   - 각 screen_id에 대해:
     ```
     mcp__stitch__get_screen(name: "projects/{id}/screens/{screen_id}", ...)
     ```
   - `screenshot.downloadUrl` 추출 (없으면 null)
   - 스타일명과 screen_id, downloadUrl을 매핑하여 보관

6. **사용자에게 표시**:
   ```
   [Stitch] {N}개 스타일 시안이 생성되었습니다.

   ## A. {스타일명1}
   ![{스타일명1}]({downloadUrl1})

   ## B. {스타일명2}
   ![{스타일명2}]({downloadUrl2})

   ... (스타일 수만큼 반복)

   📊 대시보드에서 비교: http://{config.server.host}:{config.server.port}/design/{PLN-NNN 또는 REQ-NNN}
   🔗 Stitch 프로젝트: https://stitch.withgoogle.com/projects/{project_id}
   ```
   - `downloadUrl`이 null인 스타일은 이미지 라인 생략, 스타일명과 "이미지 미확보" 텍스트 표시
   - 대시보드 링크: PLN-NNN이 있으면 PLN 기반, 없으면 REQ 기반

7. **Q1: 어떤 스타일을 기반으로 할까요?** (`AskUserQuestion`):
   - 선택지: A({스타일명1}) / B({스타일명2}) / C({스타일명3}) / [D({스타일명4})] / 다시 생성 (다른 스타일로)
   - "다시 생성" 선택 시: Step 1로 돌아가 새 스타일 세트 도출 후 재시도

8. **Q2: 선택한 시안의 variants를 몇 개 만들까요?** (`AskUserQuestion`):
   - 선택지: 0개 (이대로 완료) / 1개 / 2개 / 3개

9. **variants 생성** (Q2 선택이 > 0인 경우):
   ```
   mcp__stitch__generate_variants(
     projectId: {project_id},
     selectedScreenIds: [{선택된 screen_id}],
     prompt: "선택된 스타일을 유지하면서 레이아웃과 색상을 다양하게 변형",
     variantOptions: { variantCount: {Q2 선택값}, creativeRange: "EXPLORE" }
   )
   ```

10. **메타데이터 갱신**:
    - 선택된 스타일의 배치 pending 항목을 아래 형식으로 갱신 (active):
      ```json
      {
        "stitch_screen_id": "{screen_id}",
        "url": "https://stitch.withgoogle.com/projects/{project_id}",
        "image_url": "{downloadUrl 또는 null}",
        "style": "{선택된 스타일명}",
        "status": "active"
      }
      ```
    - 선택되지 않은 스타일의 screen_id들은 `archived` 상태로 각각 기록:
      ```json
      {
        "stitch_screen_id": "{screen_id}",
        "style": "{스타일명}",
        "status": "archived"
      }
      ```
    - variants 생성 시: 각 variant를 `status: "variant"` 항목으로 추가 기록
    - design.md 갱신: 선택된 스타일 + variants 항목 기록 (기존 `## PLN 컨텍스트 감지 및 design.md 저장` 프로토콜 준수)

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

## PLN 컨텍스트 감지 및 design.md 저장

화면 생성이 완료된 후(메타데이터 기록 이후), 아래 로직을 실행한다.

### PLN 자동 감지

1. `.gran-maestro/plans/PLN-*/plan.json` 파일들을 스캔
2. `status`가 `"active"` 또는 `"in_progress"`인 항목 추출
3. 여러 개인 경우: `created_at` 기준 가장 최근 것을 선택
4. 없으면: 이 단계 전체를 skip (기존 REQ 기반 동작 그대로 유지)

### design.md 생성/갱신

활성 PLN 감지 시 `.gran-maestro/plans/PLN-NNN/design.md` 파일에 기록한다.

**신규 파일 생성 시 헤더 (파일이 없는 경우에만):**
```markdown
# 디자인 시안 — PLN-NNN

> mst:stitch로 생성된 화면입니다.

---
```

**각 생성된 화면에 대해 append:**
```markdown
## {screen_title}

[Stitch에서 보기 ↗]({stitch_web_url})

![{screen_title} 미리보기]({image_url})

> ⚠️ 이미지 URL은 수 시간 후 만료됩니다. 만료 시 `/mst:stitch`로 재생성하세요.

{screen_description_or_empty_string}

---
```

**필드 출처:**
- `screen_title`: `stitch_screens[].title` (또는 `"시안 N"` 자동 생성)
- `stitch_web_url`: `https://stitch.withgoogle.com/projects/{project_id}` 형식으로 구성
  (Stitch는 SPA — 화면 수준 직접 URL 미지원, `/screens/{screen_id}` 경로는 404 반환)
- `image_url`: `get_screen()` 응답의 `screenshot.downloadUrl` 필드 (중첩 `FileReference` 객체);
             `screenshot` 키 미존재 · `downloadUrl` 미존재 · 빈 문자열 → 모두 `null` 처리
             → 이미지 라인 생략, 프로젝트 링크만 표시
             (⚠️ `imageUrl`, `screenshotUrl` 필드는 실제 API 응답에 존재하지 않음)
- `screen_description`: 생성 시 사용된 프롬프트 요약 (없으면 생략)

### plan.json stitch_screens[] 갱신

`design.md` 기록 후 `.gran-maestro/plans/PLN-NNN/plan.json`의 `stitch_screens[]` 배열에 추가:

```json
{
  "screen_id": "uuid-{random}",
  "stitch_screen_id": "{Stitch의 실제 screen_id}",
  "pln_id": "PLN-NNN",
  "title": "{screen_title}",
  "url": "{stitch_web_url}",
  "image_url": "{image_url_or_null}",
  "created_at": "{ISO timestamp}",
  "status": "active"
}
```

`plan.json`에 `stitch_screens` 키가 없으면 빈 배열로 초기화 후 추가한다.

### 완료 보고 (기존 사용자 보고 메시지 이후 추가 출력)

```
✅ design.md에 {N}개 시안이 기록되었습니다. (PLN-NNN)
   → .gran-maestro/plans/PLN-NNN/design.md
```

## 사용자 보고

생성 완료 후:
```
[Stitch] {N}개 화면이 생성되었습니다.
📋 생성된 화면: "{화면명1}", "{화면명2}", ...  ← 생성된 screen_title 목록 (단일 화면 시 생략 가능)
🔗 프로젝트 보기: https://stitch.withgoogle.com/projects/{project_id}
📄 이미지 미리보기: design.md 참고
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
| generate_screen 빈 응답 | 비동기 수락으로 처리 — 재시도 금지. 폴링 루프(30초×10회) 진입. 10회 미감지 시 pending 유지 + 사용자 안내 후 종료. |
| get_screen 실패 | 5초 간격으로 최대 3회 재시도. 모두 실패 시 screen_id를 pending 항목에 기록하고 URL 미확보 안내 출력 |
| 화면 생성 실패 | "[Stitch] 화면 생성 실패 — {오류}. 텍스트 명세로 진행합니다." |
| enabled=false | "[Stitch] 비활성화됨 (config.stitch.enabled=false)" |

## 옵션

- `--auto`: 사용자 확인 없이 자동 실행
- `--variants`: 화면 생성 후 3가지 변형 추가 생성
- `--req REQ-NNN`: 특정 REQ에 연결 (메타데이터 기록)
- `--edit SCREEN_ID`: 기존 화면 수정
- `--list`: 현재 Stitch 프로젝트의 화면 목록 조회
- `--multi`: 멀티 스타일 시안 생성 모드. 3~4개 스타일을 자동 도출하여 각각 화면을 생성하고, 사용자가 선택 후 variants 추가 가능.
