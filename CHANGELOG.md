# Changelog

모든 주요 변경사항을 이 파일에 기록합니다. [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따릅니다.

---

## [0.46.0] — 2026-03-02

### 새 기능

- **CLI config resolve 명령어**: `config resolve <key>` 명령으로 최종 병합된 설정값 조회 지원
- **Hook 설정**: CLI 훅 구성 및 스킬 경로 변경 지원

### 버그 수정

- **WorkflowView 태스크 선택 수정**: 태스크 클릭 시 selectedTask가 갱신되지 않던 버그 수정

---

## [0.45.0] — 2026-03-02

### 새 기능

- **대시보드 SPA 라우팅**: React Router 기반 클라이언트 사이드 라우팅 도입으로 페이지 새로고침 없이 뷰 전환 가능
- **대시보드 신규 뷰 3종**: Overview(전체 현황), Archives(아카이브 관리), AgentPerformance(에이전트 성과 분석) 뷰 추가
- **아카이브 API**: GET /archives, POST /archives/:id/restore 엔드포인트로 아카이브 조회 및 복원 지원
- **통합 통계 API**: GET /stats, /stats/agents 엔드포인트로 전체 통계 및 에이전트별 성과 데이터 제공
- **워크트리 현황 API**: GET /worktrees 엔드포인트로 활성 워크트리 현황 조회 지원
- **SSE 이벤트 확장**: design_update/explore_update 패턴 추가 및 태스크 duration 필드 지원
- **Explore 에이전트 설정**: config에 explore 에이전트 구성 섹션 추가
- **리뷰 자동 수정 설정**: severity_auto_fix 설정으로 MINOR 이슈 자동 수정 정책 및 보안 키워드 오버라이드 지원

### 개선

- **공통 ListFilter 컴포넌트**: 5개 목록 뷰에 일관된 필터링 UI 적용
- **IdeationView 개선**: Explore 에이전트별 결과 탭 분리 및 React #310 적용
- **SettingsView 개선**: 배열 편집 UI, SETTING_DESCRIPTIONS 18키 보완, Modified/Custom 배지, Reset/Delete 버튼
- **DocumentsView 개선**: 트리 확장 및 파일 검색 기능 추가
- **NotificationPanel 개선**: 알림→세션 네비게이션, Sheet 자동 닫기
- **Header 상태 인디케이터**: mode.json 상태를 헤더에 실시간 표시
- **DebugView 개선**: Plan 링크, dependencies 표시, duration 정보 추가
- **백엔드 deepMerge**: 설정 API에 deepMerge 유틸 적용으로 부분 업데이트 지원

### 버그 수정

- **Path Traversal 취약점 수정**: Deno.realPath + baseDir 접두사 검증으로 경로 탐색 공격 방어
- **SettingsView lastSseEvent 버그 수정**: SSE 이벤트 상태 관리 오류 해결

---

## [0.44.1] — 2026-03-02

### 개선

- **Stitch 디자인 → 구현 전달 파이프라인**: Stitch에서 생성된 HTML/CSS 코드가 구현 에이전트에게 자동 전달되도록 개선 (spec.md §10에 html_file 절대경로 포함, impl-request에 읽기 지시 추가, IMPL_CONTEXT 자동 삽입)

## [0.44.0] — 2026-03-02

### 새 기능

- **MINOR 임계값 에스컬레이션**: 리뷰에서 MINOR 이슈가 설정된 임계값 이상 발견되면 자동으로 사용자에게 에스컬레이션하여 승인/거부 선택 제공
- **AskUserQuestion 장단점 포맷**: 선택지 제시 시 장단점 3줄형 포맷 가이드라인 추가로 사용자의 정보 기반 의사결정 지원

### 개선

- **리뷰 등급별 분기 처리**: 리뷰어 프롬프트에 등급 태깅, 체크리스트, 보안 오버라이드 적용하여 리뷰 품질 향상
- **approve MINOR 처리 개선**: PM이 MINOR 이슈를 직접 수정하는 분기 추가 및 FAIL 처리 보완
- **review SKILL.md enabled 가드**: 리뷰 비활성화 시 스킵 로직 추가 및 스키마·보안 키워드 동기화
- **README 및 매뉴얼 문서 갱신**: 7개 한글 문서 점검 및 갱신

---

## [0.43.1] — 2026-03-02

### 새 기능

- **Stitch 디자인 HTML 코드 자동 저장**: `output_components`에 포함된 HTML/CSS/React 코드를 `screen-NNN.html` 파일로 자동 저장
  - plan 디자인 시안 섹션에 구현 코드 경로 표시
  - `design.json` screens에 `html_file` 필드 추가

### 개선

- **prereview 반복 루프**: request 스킬에서 스펙 사전 검토를 반복 실행하여 CRITICAL/MAJOR 이슈 자동 수정
- **plan escalation_trigger 기반 변경**: plan 스킬 Step 3.8.5에서 escalation 조건을 config 기반으로 처리
- **Gemini --sandbox 옵션 제거**: gemini/discussion/plan/approve 스킬에서 불필요한 --sandbox 플래그 정리
- **대시보드 설정 찾아 바꾸기**: JSON value bulk replace 기능 추가
- **대시보드 Plan/Traces 탭 연동**: PlanDiagramTab 교차 링크 + Phase 2 실행 정보 표시
- **approve retry_count 기록**: approve 스킬에서 재시도 횟수를 메타데이터에 기록
- **discussion/ideation combined+split 패턴**: 병렬 Write 대신 combined+split 패턴으로 세션 파일 생성 안정화
- **아카이브 자동화**: accept 스킬 완료 시 `mst.py archive run-all` 자동 호출 + 대시보드 정리 버튼 추가

---

## [0.43.0] — 2026-03-02

### 새 기능

- **Phase 1 탐색 에이전트 role 기반 config 설정**: `config.json`의 `phase1_exploration.roles`로 탐색 에이전트를 교체하거나 비활성화 가능
  - `symbol_tracing` (기본: codex) / `broad_scan` (기본: gemini) 역할별 agent·enabled·model 설정
  - `enabled: false` 시 해당 에이전트 dispatch 생략; Claude 직접 탐색은 항상 활성

### 개선

- **Phase 1 3-way 병렬 탐색**: PM Conductor(Claude)가 codex/gemini와 동시에 직접 Read/Glob/Grep 탐색 수행
  - 총 소요 = `max(codex_time, gemini_time, claude_direct_time)` — 추가 지연 없음
- **Phase 1 탐색 명세 명확화**: pm-conductor.md + SKILL.md에서 하드코딩 제거, config 기반 role dispatch로 통일

---

## [0.42.0] — 2026-03-01

### 새 기능

- **mst:review 스킬**: 구현 완성도를 반복 검토하는 신규 스킬 추가 (`/mst:review REQ-NNN`)
  - spec AC 체크리스트 검증(Claude 인컨텍스트) + 코드/아키텍처/UI 리뷰어 병렬 실행
  - 갭 발견 시 태스크 자동 생성 → Phase 2 재실행 → max_iterations 도달까지 반복
  - `--auto` 플래그로 무인 실행 지원

### 개선

- **approve Phase 3 리뷰 루프**: `review.auto_review: true` 시 Phase 3에서 mst:review 자동 호출
  - passed → Phase 5 직행 / gap_found → 신규 태스크 Phase 2 재실행 / limit_reached → 사용자 선택
- **대시보드 REQ 카드 리뷰 뱃지**: 리뷰 진행 상태를 뱃지로 표시 (🔍 N회차 리뷰 중 / 🔄 갭 수정 중 / ⚠️ 리뷰 한계 도달)
- **config.json `review` 섹션 추가**: `auto_review` (기본 true), `max_iterations` (기본 3), 역할별 에이전트 설정
- **plan 리뷰 루프 (REQ-230)**: plan 확정 전 AI 팀 검토 단계 추가 (Step 3.8)
- **Pre-review 에이전트 설정**: `prereview` config 섹션으로 에이전트별 참여 수 제어 가능

---

## [0.41.4] — 2026-03-01

### 버그 수정

- **WorkflowView Details 탭 스크롤 영역 레이아웃 버그 수정** — Details 탭 내 스크롤 영역 레이아웃이 올바르게 동작하지 않던 문제 수정 (REQ-226)

### 개선

- **알림 시스템 완료 이벤트 전용 전환** — 종모양 알림을 완료 이벤트 전용으로 전환하고 토스트 알림 제거 (REQ-223)

---

## [0.41.3] — 2026-03-01

### 버그 수정

- **WorkflowView 태스크 패널 스크롤 수정** — 태스크 상세 패널에 `min-h-0` 추가, 내용 오버플로우 시 스크롤이 제대로 동작하지 않던 문제 수정

---

## [0.41.2] — 2026-03-01

### 버그 수정

- **PlansView Design 탭 섹션 누락 수정** — Plans 목록 뷰에서 Design 탭 섹션이 표시되지 않던 문제 수정 (REQ-225)
- **EXP 세션 카드 내용 중복 표시 수정** — Explore 세션 카드에서 동일 내용이 중복으로 표시되던 문제 수정

---

## [0.41.1] — 2026-03-01

### 버그 수정

- **Plan Design 탭 이미지 잘림 수정** — `object-cover max-h-80` → `max-w-[85%] block mx-auto` 로 변경, Plan 탭 이미지 잘림 해결 (REQ-224)

---

## [0.41.0] — 2026-03-01

### 새 기능

- **CompletionAlarm** — 요청 완료 시 SSE `completion_alert` 이벤트 방출 + 프론트엔드 토스트 알림 컴포넌트 추가 (REQ-221)
- **Design 탭 신설** — 대시보드에 Stitch 디자인 화면을 전용 탭으로 표시, `DesignView` 컴포넌트 + `/api/designs` 라우트 + 백엔드 DES 타입 지원 (REQ-218)
- **Stitch DES-NNN 세션 프로토콜** — PLN 세션 의존 제거, Stitch 스킬이 독립 DES 세션 ID로 동작 (REQ-218)

### 개선

- **에이전트 선택 규칙 확정형 전환** — 금지/허용/우선 방식을 IF-THEN 플로우로 재정의하여 에이전트 선택 일관성 향상 (REQ-219)
- **Stitch multi_style_batch 안정성** — 재진입 감지 로직 추가 + stale_at 기준 15분으로 수정 (REQ-220)
- **Stitch 폴링 한도 확대** — 최대 폴링 횟수 10회 → 20회 (총 최대 10분 대기)
- **Design 탭 이미지 표시 수정** — `object-cover max-h-80` → `max-w-[85%] block mx-auto` 로 변경, 이미지 잘림 해결 (REQ-222)

---

## [0.40.2] — 2026-02-28

### 개선

- Plans 뷰에서 Diagram 탭 제거

---

## [0.40.1] — 2026-02-28

### 개선

- **Stitch 폴링 신뢰성 향상** — count 비교 → screen ID set 차집합 비교로 전환, 폴링 윈도우 3분 → 5분 연장 (REQ-216)
- **mst:accept pending Stitch 자동 재확인** — accept 시 pending 상태 stitch_screens를 자동으로 재확인하여 active 갱신 (REQ-216)
- **Plans 다이어그램 뷰** — 대시보드에 Plans 간 의존 관계를 시각화하는 Diagram 탭 추가 (REQ-215)
- **mst:stitch 멀티 스타일 생성** — `--multi` 플래그로 여러 스타일 방향 화면을 한 번에 생성, plan Step 4.5에서 자동 제안 (REQ-217)
- **sync-local 스크립트** — 로컬 플러그인 캐시 동기화 스크립트 추가 (REQ-214)

## [0.40.0] — 2026-02-28

### 새 기능

- **mst:stitch 비동기 생성 처리** — 화면 생성 요청을 비동기로 처리하여 타임아웃 없이 안정적으로 동작 (REQ-206)
- **Ideation 탭 통합** — Explore 탭을 Ideation 탭으로 통합하여 브레인스토밍·탐색 기능 일원화 (REQ-209)

### 개선

- **에이전트 배정 로직 강화** — config 주입 방식 개선 및 spec 작성 과정 표현 강화 (REQ-213)
- **cleanup 스킬 plans 지원** — plans 정리 포함, requests 최소 유지 갯수 적용 (REQ-208)
- **버전 bump 시 커밋 자동 포함** — 버전업 워크플로우에서 미커밋 변경사항 자동 반영 (REQ-210)
- **UI 감지 방식 개선** — LLM 의미 판단 기반으로 UI 변경 여부를 더 정확하게 감지 (REQ-205)
- **mst:plan Step 4 디자인 시안** — Stitch 디자인 시안 보기 옵션 추가, `templates/plan.md` 디자인 시안 섹션 템플릿 반영 (REQ-205)
- **PM 커밋 통일 + self-check 출력 의무화** — 커밋 형식 일관성 강화 및 자체 검증 단계 출력 필수화 (REQ-203)

### 버그 수정

- **PlansView design.md 갱신 버그 수정** — refresh 및 SSE 이벤트가 design.md에 미반영되던 문제 수정 (REQ-212)
- **Explore 세션 상태 변경 실패 수정** — EXP-* 타입 처리 누락으로 상태 전환 실패하던 문제 수정 (REQ-211)
- **Stitch 링크 404 버그 수정** — URL 형식·이미지 필드명·터미널 출력·만료 경고 개선 (REQ-207)
- **pm-conductor default_agent 오할당** — 잘못된 에이전트가 기본값으로 지정되던 문제 수정 (REQ-204)

---

## [0.39.0] — 2026-02-28

### 새 기능

- **bump.py 버전업 스크립트** — 3파일 버전 자동 동기화 + 직전 버전 이후 git log 출력 (REQ-201)

### 개선

- **frontend useAuth** — token 저장 로직 추가, AppContext projectId 폴백 처리, URL 정리 (REQ-200, REQ-202)
- **projects.ts 경로 정규화** — `.gran-maestro` 서브디렉토리 자동 감지 및 path 중복 체크 (REQ-200, REQ-202)
- **plans.ts 타입 오류 수정** — registry 정리 포함 (REQ-202)
- **accept SKILL.md** — `git branch -D` 강제 삭제 명세 보강 (REQ-199)

---

## [0.36.0] — 2026-02-27

### 새 기능

- **대시보드 PlansView** — Overview / Design 2탭 분리, `design.md` 렌더링 지원 (REQ-167)
- **pending_dependency 자동 활성화** — `accept` Step 5.5 추가, `approve` 필터 개선, `mst.py` plan sync 연동 (REQ-168)
- **mst:stitch PLN 컨텍스트 감지** — 활성 PLN 세션 자동 감지 후 `design.md` 생성 (REQ-165)
- **AGENTS.md + 공통 템플릿** — 분기 규칙 및 실행 원칙 명확화, 에이전트 초기 컨텍스트 표준화 (REQ-165)
- **Stitch MCP 직접 호출 방지** — `mst:stitch` 스킬 경유 강제, 일관된 PLN 연동 보장 (REQ-166)
- **Codex 위임 확대** — agent 배정 기준 명확화, 호출 일관성 개선, Step 5b 검토 강화 (REQ-171)

### 개선

- **mst:debug 리팩토링** — 개별 에이전트 취합 방식에서 PM 중앙 취합 방식으로 전환 (REQ-162)
- **SKILL.md 프롬프트 압축** — Phase 1: 설명 문장 압축 + 예시 섹션 축소 (27개 스킬), Phase 2: 오류 처리 희귀 케이스 정리 (REQ-163, REQ-164)
- **OMX 가이드 문서 추가** — `docs/omx-guide.md`: oh-my-codex 설치, AGENTS.md 커스터마이징, 트리거 레퍼런스 (REQ-170)
- **README Stitch 사용자 가이드 추가** — 요청 유형별 동작 표, PLN 연동 사례 정리 (REQ-169)

### 버그 수정

- **mst:stitch pending 즉시 삭제 버그** — `stale_at(5분)` 유지 방식으로 교체, 조기 삭제 방지 (REQ-161)

---

## [0.35.4] — 2026-02-26

### 개선

- **mst:stitch 타임아웃 복구 메커니즘** — 생성 도중 타임아웃 시 pending 상태 보존 및 재시도 가이드 (REQ-159)

### 버그 수정

- **대시보드 탭 미표시 문제 수정** — DBG-021: 특정 조건에서 탭이 렌더링되지 않던 문제 해결 (REQ-160)

---

## [0.35.3] — 2026-02-26

### 새 기능

- **mst:setup-omx 스킬 추가** — Codex CLI 프로젝트에 oh-my-codex 설치·초기화·gitignore 등록·AGENTS.md 주입을 4단계로 자동화 (REQ-158)

---

## [0.35.2] — 2026-02-26

### 개선

- **Spec Pre-review Pass** — 구현 에이전트가 스펙 승인 전 사전 Q&A를 수행해 모호성 제거 (REQ-156)
- **mst:request 설명 문구 개선** — 스펙 작성 의도 및 approve 분리 흐름 명확화 (REQ-157)

---

## [0.35.1] — 2026-02-25

### 새 기능

- **mst:explore 스킬 추가** — 에이전트들이 코드베이스를 백그라운드로 자율 탐색해 원하는 정보를 찾아오는 스킬 (REQ-155)

### 변경

- **mst:start → mst:request 이름 변경** — 스킬 이름을 의도에 맞게 변경, `mst:start`는 deprecated 래퍼로 유지 (REQ-154)

### 문서

- `docs/best-practices.md` 설명 문구 간소화
