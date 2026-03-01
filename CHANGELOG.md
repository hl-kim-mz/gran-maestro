# Changelog

모든 주요 변경사항을 이 파일에 기록합니다. [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따릅니다.

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
