---
name: request
description: "새 요청을 시작하고 PM 분석 워크플로우에 진입합니다. 사용자가 '구현해줘', '만들어줘', '개발해줘', '추가해줘'를 말하거나 /mst:request를 호출할 때 사용."
user-invocable: true
argument-hint: "[--auto|-a] {요청 내용}"
---

# maestro:request

Gran Maestro 워크플로우의 시작점. 사용자의 요청을 받아 PM 분석 Phase에 진입합니다.

## 모드 전환 (자동 부트스트래핑)

Maestro 모드가 비활성 상태이면 자동으로 활성화합니다:

1. `.gran-maestro/` 디렉토리 존재 확인, 없으면 생성
2. `.gitignore`에 `.gran-maestro/` 등록:
   - 프로젝트 루트의 `.gitignore` 파일 읽기 (없으면 생성)
   - `.gran-maestro/` 패턴이 이미 존재하는지 확인 (정확히 `.gran-maestro/` 또는 `/.gran-maestro/`)
   - 없으면 파일 끝에 `.gran-maestro/` 한 줄 추가
3. 플러그인 루트 경로 확인 (이 스킬의 Base directory에서 2단계 상위)
4. `.gran-maestro/config.json` 존재 확인
   - 없으면: 플러그인의 `templates/defaults/config.json` 내용을 복사
5. `.gran-maestro/agents.json` 존재 확인
   - 없으면: 플러그인의 `templates/defaults/agents.json` 내용을 복사
6. `.gran-maestro/mode.json` 확인
   - `active: false`이거나 파일 없음 → 아래 내용으로 생성/업데이트:

   > ⏱️ **타임스탬프 취득 (MANDATORY)**:
   > `TS=$(python3 {PLUGIN_ROOT}/scripts/mst.py timestamp now)`
   > 위 명령 실패 시 폴백: `python3 -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).isoformat())"`
   > 출력값을 `activated_at` 필드에 기입한다. 날짜만 기입 금지.

     ```json
     {
       "active": true,
       "activated_at": "{TS — mst.py timestamp now 출력값}",
       "auto_deactivate": true,
       }
     ```
7. `.gran-maestro/requests/` 디렉토리 확인, 없으면 생성
8. `.gran-maestro/worktrees/` 디렉토리 확인, 없으면 생성
9. 사용자에게 모드 전환 알림 (첫 활성화 시에만)

## 실행 프로토콜

> ⚠️ **절대 금지 (예외 없음)**: spec.md 저장 및 `/mst:approve` 확인 전에는
> 코드 수정·파일 편집·git 커밋·빌드 등 어떠한 구현 행위도 수행하지 않는다.
> 요청이 아무리 단순하거나 수정 위치가 명확해 보여도 이 규칙은 적용된다.
> `--auto`/`-a` 플래그가 명시된 경우에만 승인 단계를 건너뛸 수 있다.

### Step 0: 아카이브 체크 (자동)

config.json의 `archive.auto_archive_on_create`가 true이면:

**스크립트 우선**: `python3 {PLUGIN_ROOT}/scripts/mst.py request count --active` 로 활성 세션 수 확인. `archive.max_active_sessions` 초과 시: `python3 {PLUGIN_ROOT}/scripts/mst.py archive run --max {max_active_sessions}` 실행. 실패 시 fallback.

**Fallback:**
1. `.gran-maestro/requests/` 하위의 REQ-* 디렉토리 수 확인
2. `archive.max_active_sessions` 초과 시:
   - 완료된(completed/cancelled) 세션만 아카이브 대상
   - 오래된 순 정렬 → 초과분을 `.gran-maestro/archive/`에 tar.gz 압축
   - 원본 디렉토리 삭제
   - `[Archive] requests {N}개 세션 아카이브됨` 알림
3. 아카이브 완료 후 정상적으로 요청 생성 진행

상세 아카이브 로직은 `/mst:archive` 스킬의 "자동 아카이브 프로토콜" 참조.

### Step 1: 요청 생성

1. 새 요청 ID 채번 (REQ-NNN):
   - **스크립트 우선**: `python3 {PLUGIN_ROOT}/scripts/mst.py counter next` → 출력 ID 사용 (counter.json 자동 업데이트)
   - **Fallback (counter.json 기반)**:
   - `.gran-maestro/requests/counter.json` 파일 Read
   - **파일 존재 시**: `next_id = last_id + 1`
   - **파일 미존재 시** (최초 또는 복구):
     a. `.gran-maestro/requests/` 하위의 기존 REQ-* 디렉토리 스캔
     b. `.gran-maestro/requests/completed/` 하위의 기존 REQ-* 디렉토리 스캔
     c. `.gran-maestro/archive/` 내 `requests-*` tar.gz 파일명에서 ID 범위 추출
     d. 모든 소스에서 최대 번호 결정 → `counter.json` 생성: `{ "last_id": {max_number} }`
     e. `next_id = last_id + 1`
   - `counter.json` 업데이트: `{ "last_id": {next_id} }`
2. `.gran-maestro/requests/REQ-NNN/` 디렉토리 생성 (NNN은 3자리 zero-padded)
   - 하위에 `tasks/`, `discussion/`, `design/` 서브디렉토리도 함께 생성
3. 요청 메타데이터 기록 (`request.json`):

   > ⏱️ **타임스탬프 취득 (MANDATORY)**:
   > `TS=$(python3 {PLUGIN_ROOT}/scripts/mst.py timestamp now)`
   > 위 명령 실패 시 폴백: `python3 -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).isoformat())"`
   > 출력값을 `created_at` 필드에 기입한다. 날짜만 기입 금지.

   ```json
   {
     "id": "REQ-NNN",
     "title": "{사용자 요청 요약}",
     "original_request": "{전체 요청 텍스트}",
     "status": "phase1_analysis",
     "current_phase": 1,
     "created_at": "{TS — mst.py timestamp now 출력값}",
     "auto_approve": false,
     "tasks": [],
     "dependencies": { "blockedBy": [], "relatedTo": [], "blocks": [] },
     "stitch_screens": []
   }
   ```
   - `--auto` 또는 `-a` 플래그가 인자 내 어느 위치(앞/뒤)에 있어도 감지: `"auto_approve": true`로 설정
4. PM Conductor 역할로 Phase 1 분석 수행 (`agents/pm-conductor.md`의 `<phase1_protocol>` 준수):
   a. 요청 파싱 및 복잡도 분류 (simple | standard | complex)
   b. Simple → 단독 분석 / Standard·Complex → Analysis Squad 팀 소환
   c. 코드베이스 탐색 (`/mst:codex`로 정밀 심볼 추적, `/mst:gemini`로 광역 탐색 위임), 외부 AI 분석 (반드시 `Skill(skill: "mst:codex", ...)`, `Skill(skill: "mst:gemini", ...)` 도구로 호출 — MCP 직접 호출 금지)
   d-1. `--from-debug DBG-NNN` 제공 여부 처리:
      - 인자에서 `--from-debug DBG-NNN` 패턴 감지 시:
        1. `.gran-maestro/debug/DBG-NNN/debug-report.md` Read
           - 파일 미존재 시: "[경고] debug-report.md 없음. 일반 워크플로우로 계속." 출력 후 플래그 무시
        2. `debug_context` 메모리 보관:
           - `linked_debug_id`: "DBG-NNN"
           - `root_cause`: Root Cause 섹션 요약
           - `fix_suggestions`: 수정 제안 목록 (P0~P2)
           - `affected_files`: 영향 파일 목록
        3. `request.json` 생성 단계에서 `"linked_debug": "DBG-NNN"` 필드 추가
        4. `spec.md` 작성 시 `## 디버그 연계` 섹션 자동 삽입 (§ 1. 요약 위 또는 § 9 아래):
           ```
           ## 디버그 연계
           - 참조 세션: {DBG-NNN}
           - 근본 원인: {debug_context.root_cause}
           - 수정 제안(P0): {핵심 수정 항목}
           - 수정 제안(P1~): {선택적 개선 항목}
           - 영향 파일: {debug_context.affected_files}
           ```
      - `--from-debug`와 `--plan`이 동시 제공된 경우: `--plan` 우선 처리, debug_context는 보조로 유지
   d. `--plan` 제공 여부 처리:
      - `/mst:plan` / `/mst:request` 요청에서 `--plan PLN-NNN` 또는 자연어 `PLN-NNN` 패턴 감지 시 `plans/PLN-NNN/plan.json` 및 `plans/PLN-NNN/plan.md`를 Read
      - plan.json/plan.md 존재 시 `request.json` 생성 단계에서 `source_plan: "PLN-NNN"`를 기록
      - plan.json의 `linked_requests`에 현재 REQ-NNN를 추가하고, `status`가 `active`면 `in_progress`로 변경
      - plan.md의 결정사항·범위·제약을 Phase 1 인풋으로 사용
      - **분리 실행 감지**: plan.md의 `## 분리 실행` 섹션 파싱:
        1. 섹션이 존재하고 테이블에 **2개 이상의 단계**가 있으면 다중 REQ 생성 모드 진입
        2. 현재 REQ-NNN = 1단계(①). 2단계부터 순서대로 REQ 채번·생성:
           - `counter.json` 갱신 (`last_id += 1` per step)
           - `.gran-maestro/requests/REQ-(N+k)/` 디렉토리 및 `tasks/`, `discussion/`, `design/` 서브디렉토리 생성
           - `request.json` 생성: `status: "pending_dependency"`, `title`: 해당 단계 작업 설명, `source_plan: "PLN-NNN"`
           - `dependencies.blockedBy`: 이전 단계 REQ ID (병렬 가능 `yes` 단계는 `blockedBy` 없이 생성)
        3. 1단계 REQ-NNN의 `request.json`에 `dependencies.blocks: [REQ-(N+1), ...]` 설정
        4. plan.json의 `linked_requests`에 새로 생성된 모든 REQ ID 추가
        5. 사용자에게 생성 결과 요약 표시:
           ```
           [분리 실행] {N}개 REQ 생성됨:
           - REQ-NNN (①): {작업 제목} ← 지금 spec 작성
           - REQ-(N+1) (②): {작업 제목} [blockedBy: REQ-NNN, 활성화 대기 중]
           ...
           ```
        6. 이후 spec 생성은 **REQ-NNN (1단계)에만** 수행
      - plan.json 또는 plan.md 미존재 시 경고 후 사일런트 모드로 자동 전환
   e. **모호한 요구사항 처리**:
      [--plan 제공된 경우]: plans/PLN-NNN/plan.json + plans/PLN-NNN/plan.md를 Read하고 결정 사항을 따름.
      [--plan 없는 경우]: PM이 요구사항 모호함 수준을 평가:
        - **경미한 모호함 (minor)**: 합리적인 가정 수립 → spec.md "가정 사항" 섹션에 기록 → 진행
        - **중요한 모호함 (significant)**: 팀 판단 프로세스 실행 (사용자에게 질문하지 않음):
            1. PM 자율 판단으로 ideation / discussion 선택:
               - ideation: 복수 해석이 가능하고 다각도 비교 분석이 필요한 경우
               - discussion: 리스크가 크거나 팀 합의가 필요한 경우
            2. `Skill(skill: "mst:ideation"/"mst:discussion", args: "{모호한 요구사항 주제} --from-request")` 실행
            3. `synthesis.md` / `consensus.md`에서 핵심 3~5개 추출 → 사용자에게 요약 표시
               (형태: "[AI 팀 의견] 위 내용을 바탕으로 spec을 작성합니다." — 응답 대기 없이 자동 진행)
            4. 결과 파일을 `REQ-NNN/discussion/`에 복사 저장:
               - ideation 결과 → `discussion/req-ambiguity-synthesis.md`
               - discussion 결과 → `discussion/req-ambiguity-consensus.md`
            5. spec.md `## 9. 팀 판단 기반 결정` 섹션에 결정 내용 기록
   f. **디버그 의도 감지 (LLM 판단)**: 사용자 요청이 버그 탐지, 문제 원인 분석, 디버깅 목적으로 판단되면:
      - `config.collaborative_debug.auto_trigger_from_start`가 `true`인 경우: `/mst:debug`를 자동 호출하여 병렬 조사를 수행하고, 이 워크플로우를 종료합니다
      - `false`인 경우: 사용자에게 `/mst:debug`를 사용할 수 있다고 안내한 뒤 일반 워크플로우로 진행합니다
      - 디버깅 의도 판단 기준: "버그", "에러", "문제", "원인 분석", "왜 안 되는지", "디버그" 등의 키워드 + 문맥상 문제 해결 요청
   g. 접근 방식 결정 시: 3 AI 의견 수집 → 종합 → 순위별 추천
      - **Ideation 자동 트리거 (LLM 판단)**: 아래 조건 중 하나라도 해당하면 `Skill(skill: "mst:ideation", args: "{주제} --from-request")`로 호출하여 체계적인 3-AI 분석을 수행합니다. LLM이 상황을 종합적으로 판단하여 결정합니다:
        - 복잡도가 `complex`로 분류된 경우
        - 접근 방식이 2개 이상이고 트레이드오프가 명확하지 않은 경우
        - 아키텍처 변경, 보안 설계, 성능 최적화 등 고영향 의사결정이 필요한 경우
        - PM이 단독 판단에 확신이 부족한 경우
      - Ideation 결과(`synthesis.md`)의 추천 방향을 spec 작성에 반영합니다
      - Ideation 결과(`synthesis.md`)를 `discussion/req-approach-synthesis.md`에 복사 저장합니다
      - 단순(simple) 요청이나 접근 방식이 명백한 경우에는 ideation 없이 진행합니다
   h-0. **Stitch 트리거 감지** (config.stitch.enabled=true인 경우):
      - 명시적 디자인 요청 감지 ("화면 디자인해줘", "Stitch로", "목업", "시안" 등):
        → 즉시 `Skill(skill: "mst:stitch", args: "--req REQ-NNN {요청 내용}")` 호출
        → Stitch 완료 후 spec.md 작성 계속
      - 그 외(새 화면 추가/전체 변경/약한 신호): approve Phase 2.5에서 Stitch 제안이 이루어지므로 이 단계에서 skip
   h. **Implementation Spec 작성** (`templates/spec.md` 템플릿 사용)
      - `--plan` 없이 진행한 경우 spec.md에는 `## 가정 사항 (Assumptions)` 섹션을 포함
   h-1. **다중 태스크 분해 처리** (plan 기반 우선, 없으면 PM 자율 판단):

      [--plan PLN-NNN 제공된 경우]:
      - plan.md의 `## 태스크 분해` 섹션을 Read
      - 동일 REQ에 대해 태스크가 2개 이상이면 다중 태스크 모드 진입:
        - tasks/01은 Step 4.i에서 정상 생성
        - tasks/02, tasks/03... 디렉토리를 미리 생성
        - 각 추가 태스크에 대해 spec.md를 작성 (§7 blockedBy에 선행 조건 기록)
          예: task 02 spec §7 → blockedBy: ["01"]
        - 모든 태스크의 메타데이터를 Step 4.k에서 request.json tasks[]에 등록
      - 섹션 없거나 태스크가 1개이면 단일 태스크(Step 4.i~k 그대로 진행)

      [--plan 없는 경우 — PM 자율 판단]:
      - pm-conductor.md Step 6.6의 판단 결과를 따름
      - PM이 2단계 이상 분해를 결정했으면 동일하게 tasks/02, 03... 생성
      - blockedBy 설정 및 tasks[] 등록 동일 절차 적용
   i. 태스크 디렉토리 생성: `.gran-maestro/requests/REQ-NNN/tasks/01/`
   j. **spec.md 파일 저장**: `.gran-maestro/requests/REQ-NNN/tasks/01/spec.md`
   k. `request.json`의 `tasks` 배열에 태스크 메타데이터 추가 (spec.md 저장 직후 즉시 수행, 다중 태스크 시 02, 03... 모든 태스크 포함):
      - `id`: 태스크 번호 (예: "01")
      - `title`: 태스크 제목
      - `status`: "pending"
      - `agent`: spec.md의 `Assigned Agent` 값 (필수 — 반드시 기록, 누락 금지)
      - `spec`: "tasks/01/spec.md"
   l. `request.json`의 `status`를 `"spec_ready"`로 업데이트
5. ⚠️ **spec.md 작성 완료 확인** — spec.md 파일이 존재하지 않으면 이 스킬을 종료하지 않음
6. 스펙 요약을 사용자에게 표시하고, `/mst:approve REQ-NNN`으로 승인 안내
   - **[필수] 할당 에이전트 보고**: 스펙 요약 표시 시 아래 형식으로 반드시 명시
     - 단일 REQ: `[할당 예정] REQ-NNN → {agent명} ({provider})`
     - 다중 REQ(분리 실행): 각 REQ별로 개별 명시
       예: `REQ-NNN (①) → codex-dev (codex) | REQ-(N+1) (②) → gemini-dev (gemini)`
     - 에이전트명은 `request.json`의 `tasks[].agent` 값, provider는 `config.json` `models.developer` 참조
   - ⚠️ 이 단계 이후 `/mst:approve` 수신 전까지: 코드 수정·파일 편집·커밋 전면 금지
   - `--auto` 또는 `-a` 모드인 경우: 승인 단계 스킵, 자동으로 Phase 2 진입

## 옵션

- `--auto` / `-a`: 스펙 자동 승인 모드 (사용자 승인 단계 스킵, `auto_approve: true`)
  - 요청 앞(`/mst:request --auto "요청"`) 또는 뒤(`/mst:request "요청" --auto`) 모두 허용

## 예시

```
/mst:request "JWT 기반 사용자 인증 기능을 추가해줘"
/mst:request --auto "로그인 버튼 색상을 파란색으로 변경"
/mst:request -a "로그인 버튼 색상을 파란색으로 변경"
/mst:request "사용자 프로필 페이지에 아바타 업로드 기능 추가" --auto
```

## 문제 해결

- `.gran-maestro/` 디렉토리 생성 실패 → 현재 디렉토리가 git 저장소인지 확인. 쓰기 권한 확인
- `mode.json` 잠금 충돌 → 다른 세션에서 Maestro가 실행 중인지 확인. `mode.json.lock` 파일이 남아있으면 수동 삭제
- 기존 요청 ID 충돌 → `.gran-maestro/requests/` 디렉토리를 확인하고 중복 REQ 폴더가 없는지 검증
