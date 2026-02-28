---
name: request
description: "요구사항을 분석하고 구현 스펙(spec.md)을 작성합니다. 실행 승인은 /mst:approve로 별도 진행합니다. 사용자가 '구현해줘', '만들어줘', '개발해줘', '추가해줘'를 말하거나 /mst:request를 호출할 때 사용."
user-invocable: true
argument-hint: "[--auto|-a] {요청 내용}"
---

# maestro:request

Gran Maestro 워크플로우의 시작점. 사용자의 요청을 받아 PM 분석 Phase에 진입합니다.

## 모드 전환 (자동 부트스트래핑)

Maestro 모드 비활성 시 자동 활성화:
- `.gran-maestro/` 디렉토리 생성, `.gitignore`에 `.gran-maestro/` 등록 (미존재 시)
- 플러그인 루트 확인, `config.json` / `agents.json` 없으면 `templates/defaults/`에서 복사
- `.gran-maestro/mode.json` 확인: `active: false`이거나 파일 없음 → 아래 내용으로 생성/업데이트:

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
- `requests/`, `worktrees/` 디렉토리 확인, 없으면 생성
- 사용자에게 모드 전환 알림 (첫 활성화 시에만)

## 실행 프로토콜

> ⚠️ **절대 금지 (예외 없음)**: spec.md 저장 및 `/mst:approve` 확인 전에는
> 코드 수정·파일 편집·git 커밋·빌드 등 어떠한 구현 행위도 수행하지 않는다.
> 요청이 아무리 단순하거나 수정 위치가 명확해 보여도 이 규칙은 적용된다.
> `--auto`/`-a` 플래그가 명시된 경우에만 승인 단계를 건너뛸 수 있다.

### Step 0: 아카이브 체크 (자동)

`archive.auto_archive_on_create`가 true이면:
- **스크립트 우선**: `python3 {PLUGIN_ROOT}/scripts/mst.py request count --active` → 초과 시 `python3 {PLUGIN_ROOT}/scripts/mst.py archive run --max {max_active_sessions}`
- **Fallback**: REQ-* 디렉토리 수 확인 → 초과분 tar.gz 압축 후 원본 삭제

상세 아카이브 로직은 `/mst:archive` 스킬의 "자동 아카이브 프로토콜" 참조.

### Step 1: 요청 생성

1. 새 요청 ID 채번 (REQ-NNN):
   - **스크립트 우선**: `python3 {PLUGIN_ROOT}/scripts/mst.py counter next` → 출력 ID 사용 (counter.json 자동 업데이트)
   - **Fallback (counter.json 기반)**:
   - `.gran-maestro/requests/counter.json` 파일 Read
   - **파일 존재 시**: `next_id = last_id + 1`
   - **파일 미존재 시** (최초 또는 복구):
     a. `requests/`, `requests/completed/`, `archive/requests-*` tar.gz 파일명에서 최대 번호 결정
     b. `counter.json` 생성: `{ "last_id": {max_number} }`, `next_id = last_id + 1`
   - `counter.json` 업데이트: `{ "last_id": {next_id} }`
2. `.gran-maestro/requests/REQ-NNN/` 디렉토리 생성 (NNN은 3자리 zero-padded), 하위 `tasks/`, `discussion/`, `design/` 서브디렉토리도 함께 생성
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
   - `--auto` / `-a` 플래그 인자 내 어느 위치에 있어도 감지: `"auto_approve": true`로 설정
4. PM Conductor 역할로 Phase 1 분석 수행 (`agents/pm-conductor.md`의 `<phase1_protocol>` 준수):
   a. 요청 파싱 및 복잡도 분류 (simple | standard | complex)
   b. Simple → 단독 분석 / Standard·Complex → Analysis Squad 팀 소환
   c. 코드베이스 탐색 (`/mst:codex` 정밀 심볼 추적, `/mst:gemini` 광역 탐색); 반드시 `Skill(skill: "mst:codex/gemini", ...)` 도구로 호출 — MCP 직접 호출 금지
   d-1. `--from-debug DBG-NNN` 제공 여부 처리:
      - `debug/DBG-NNN/debug-report.md` Read (미존재 시 경고 후 플래그 무시)
      - `debug_context` 메모리 보관: `linked_debug_id`, `root_cause`, `fix_suggestions`, `affected_files`
      - `request.json`에 `"linked_debug": "DBG-NNN"` 필드 추가
      - `spec.md` 작성 시 `## 디버그 연계` 섹션 자동 삽입 (참조 세션/근본 원인/수정 제안/영향 파일)
      - `--from-debug`와 `--plan` 동시 시: `--plan` 우선, debug_context는 보조 유지
   d. `--plan` 제공 여부 처리:
      - `--plan PLN-NNN` 또는 자연어 `PLN-NNN` 감지 시 `plans/PLN-NNN/plan.json` + `plan.md` Read
      - `request.json`에 `source_plan: "PLN-NNN"` 기록; `plan.json`의 `linked_requests`에 REQ-NNN 추가, `status` `active` → `in_progress`
      - plan.md 결정사항·범위·제약을 Phase 1 인풋으로 사용
      - **분리 실행 감지**: plan.md의 `## 분리 실행` 섹션에 2개 이상 단계 시 다중 REQ 생성 모드:
        1. REQ-NNN = 1단계(①), 2단계부터 REQ 채번·생성 (`status: "pending_dependency"`, `blockedBy` 설정)
        2. 1단계 `request.json`에 `dependencies.blocks` 설정, `plan.json`에 모든 REQ ID 추가
        3. 사용자에게 생성 결과 요약 표시; spec 생성은 **REQ-NNN (1단계)에만** 수행
      - plan.json/plan.md 미존재 시 경고 후 사일런트 모드로 전환
   e. **모호한 요구사항 처리**:
      - [--plan]: plan.md 결정 사항을 따름
      - [--plan 없음]: PM이 모호함 수준 평가:
        - **minor**: 합리적 가정 수립 → spec.md "가정 사항" 섹션에 기록 → 진행
        - **significant**: 사용자 질문 없이 팀 판단 프로세스 실행:
            1. PM 자율 판단으로 ideation(다각도 비교) / discussion(리스크/합의) 선택
            2. `Skill(skill: "mst:ideation"/"mst:discussion", args: "{주제} --from-request")` 실행
            3. 핵심 3~5개 추출 → "[AI 팀 의견]" 요약 표시 후 자동 진행
            4. 결과를 `REQ-NNN/discussion/req-ambiguity-{synthesis|consensus}.md`에 저장
            5. spec.md `## 9. 팀 판단 기반 결정` 섹션에 기록
   f. **디버그 의도 감지 (LLM 판단)**: 버그/에러/원인분석 등 디버깅 의도 감지 시:
      - `auto_trigger_from_start=true`: `/mst:debug` 자동 호출 후 이 워크플로우 종료
      - `false`: `/mst:debug` 사용 안내 후 일반 워크플로우 진행
   g. 접근 방식 결정 시 **Ideation 자동 트리거 (LLM 판단)**: 아래 중 하나 해당 시 `Skill(skill: "mst:ideation", args: "{주제} --from-request")` 호출:
      - `complex` 분류, 트레이드오프 불명확, 고영향 의사결정, PM 단독 판단 확신 부족
      - 결과(`synthesis.md`)를 spec 작성에 반영하고 `discussion/req-approach-synthesis.md`에 저장
      - simple 요청/접근 방식 명백한 경우 ideation 없이 진행
   h-0. **Stitch 트리거 감지** (config.stitch.enabled=true인 경우):
      - 명시적 디자인 요청("화면 디자인해줘", "Stitch로", "목업", "시안" 등):
        ⚠️ **`mcp__stitch__*` 도구를 직접 호출하는 것은 절대 금지.**
        반드시 `Skill(skill: "mst:stitch", args: "--req REQ-NNN {요청 내용}")` 스킬을 통해서만 호출합니다.
        → Stitch 완료 후 spec.md 작성 계속
      - 그 외(새 화면 추가/약한 신호): approve Phase 2.5에서 제안, 이 단계 skip
   h-0.5. **Assigned Agent 기본값 보관**: spec.md 작성 직전, `.gran-maestro/config.json`의 `workflow.default_agent` 값을 읽어 Assigned Agent 필드의 기본값으로 설정한다. `templates/spec.md`의 Decision Tree(0~3단계)는 이 기본값의 override 조건으로만 동작한다. config 미참조 시 `claude-dev` 자동 선택은 금지.
   h. **Implementation Spec 작성** (`templates/spec.md` 템플릿 사용); `--plan` 없으면 `## 가정 사항` 섹션 포함
   h-1. **다중 태스크 분해 처리** (plan 기반 우선, 없으면 PM 자율 판단):
      - [--plan]: `## 태스크 분해` 섹션 파싱 → 2개 이상 시 동일 절차 (아래 스텝 0~2 수행)
      - [--plan 없음]: pm-conductor.md Step 6.6 판단 따름; 2단계 이상 결정 시 동일 절차
      - **혼재 태스크 분리 기준**: 신규 `.ts` 파일 생성과 `.md` 문서 수정이 동일 태스크에 포함된 경우 → 태스크 2개로 분리 권장 (각 태스크의 agent 배정이 달라지므로: `.ts` 생성은 `codex-dev`, `.md` 수정은 `claude-dev`)

      **스텝 0 (선행): 의존성 및 배정 확정**
      - 모든 태스크 ID, blockedBy/blocks, 에이전트 배정을 단일 thinking에서 확정한다 (이후 Write 또는 서브에이전트 어느 경로든 이 테이블을 불변 입력으로 사용)
      - [--plan]: plan.md 결정사항 기반; [--plan 없음]: PM 자율 판단 기반

      **스텝 1 (분기): 독립 태스크 수 판단**
      - 독립 태스크(blocks/blockedBy 없는 것) 수 계산:
        - 독립 태스크 < 2개: 기존 순차 Write 유지
        - 독립 태스크(blocks/blockedBy 없는 것) 2개 이상: Phase A 또는 Phase B 선택
          - [Phase A] Write 동시 호출 (기본값): 단일 응답 내 N개 Write 동시 호출 (각 spec.md에 스텝 0 의존성 테이블 그대로 기입)
          - [Phase B] 서브에이전트 병렬 (reasoning 복잡도 높거나 태스크별 독립 탐색 필요 시 PM 자유 재량):
            - `Task(subagent_type: "general-purpose", run_in_background: true)` 로 N개 병렬 dispatch
            - 각 서브에이전트에 의존성 테이블 + 에이전트 배정 결과를 읽기 전용으로 주입 (프롬프트에 포함): 서브에이전트는 해당 값을 §7, §8에 그대로 기입, 의존성/배정 결정 금지
            - Phase B로 spec을 작성한 서브에이전트와 별개로 PM이 prereview 에이전트를 dispatch (역할 분리)

      **스텝 2 (검증): 양방향 의존성 검증 훅** (모든 spec.md Write 완료 직후 실행)
      - 각 spec의 blocks 목록을 읽어 대상 태스크 spec의 blockedBy 포함 여부 확인; 역방향도 동일하게 검증
      - blocks/blockedBy 양방향 일치 검증: 불일치 발견 시 오류 메시지 출력 + request.json의 tasks 배열 업데이트 차단 (spec.md는 유지, PM이 수동 수정 후 재시도)
      - 부분 실패 (k/N spec 성공) 시: 실패 태스크 ID 목록 표시 + 해당 태스크 spec.md만 재작성 재시도 안내 (성공 태스크 유지)

   i. 태스크 디렉토리 일괄 생성: `.gran-maestro/requests/REQ-NNN/tasks/01..N` (N개 동시 생성)
   j. **spec.md 병렬 Write**: (의존성 고정 후) 단일 응답 내 N개 Write 동시 호출로 저장
   h-2. **Spec Pre-review Pass** (모든 spec.md Write 완료 + 검증 훅 통과 후 실행)

      **실행 조건** (순서대로): `--auto`/`-a` → skip; `--no-prereview` → skip; `workflow.spec_prereview=false` → skip; `--prereview` → 강제 실행; 모두 통과 시 실행
      **에스컬레이션 모드**: `--plan` 있으면 `"user"`, 없으면 `"pm-self"`

      prereview-prompt.md N개 동시 Write (단일 응답): 각 `tasks/NN/prereview-prompt.md`를 `templates/spec-prereview-prompt.md` + 변수 치환으로 한 번에 생성
      에이전트 병렬 dispatch:
      a. prereview 에이전트 dispatch: claude-dev 2개+ 태스크 시 `Task(run_in_background: true)` 직접 호출 (Skill() 순차 실행 제약 우회); codex-dev/gemini-dev는 `Skill(skill: "mst:{agent}", run_in_background: true)` 사용
      b. 결과 처리:
         - 실패 시: "[Pre-review skip]" 출력 후 다음 task
         - `NO_QUESTIONS` 시: 수정 없이 계속
         - 질문 목록 시: `"user"` → `AskUserQuestion`(옵션 최대 4개); `"pm-self"` → PM 합리적 판단으로 자체 답변
      c. Q&A 존재 시 spec.md 끝에 `## 구현 전 검토 (Pre-review Q&A)` 테이블 추가

   k. `request.json`의 `tasks` 배열에 태스크 메타데이터 추가 (spec.md 저장 직후, 다중 태스크 시 02, 03... 포함):
      `id`, `title`, `status: "pending"`, `agent`(필수 — 누락 금지), `spec: "tasks/01/spec.md"`
   l. `request.json`의 `status`를 `"spec_ready"`로 업데이트
5. ⚠️ **spec.md 작성 완료 확인** — spec.md 미존재 시 스킬 종료 금지
6. 스펙 요약 표시 + `/mst:approve REQ-NNN` 승인 안내
   - **[필수] 할당 에이전트 보고**: `[할당 예정] REQ-NNN → {agent명} ({provider})` 형식으로 명시 (다중 REQ 시 개별 명시)
   - ⚠️ `/mst:approve` 수신 전까지: 코드 수정·파일 편집·커밋 전면 금지
   - `--auto` / `-a` 모드: 승인 단계 스킵, 자동으로 Phase 2 진입

## 옵션

- `--auto` / `-a`: 스펙 자동 승인 모드 (사용자 승인 단계 스킵, `auto_approve: true`)
  - 요청 앞(`/mst:request --auto "요청"`) 또는 뒤(`/mst:request "요청" --auto`) 모두 허용
  - `--auto` / `-a` 모드에서는 Spec Pre-review Pass(h-2)를 skip한다
- `--prereview`: config 설정 무관하게 Pre-review Pass 강제 실행
- `--no-prereview`: config 설정 무관하게 Pre-review Pass skip

## 예시

```
/mst:request "JWT 기반 사용자 인증 기능을 추가해줘"
/mst:request --auto "로그인 버튼 색상을 파란색으로 변경"
/mst:request -a "로그인 버튼 색상을 파란색으로 변경"
/mst:request "사용자 프로필 페이지에 아바타 업로드 기능 추가" --auto
```

## 문제 해결

- `.gran-maestro/` 생성 실패 → git 저장소 여부 및 쓰기 권한 확인
- `mode.json` 잠금 충돌 → `mode.json.lock` 수동 삭제
- 요청 ID 충돌 → `requests/` 하위 중복 REQ 폴더 검증
