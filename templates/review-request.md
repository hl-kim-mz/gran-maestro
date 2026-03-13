# Code Review Request — Self-Exploration Mode

- Request: {{REQ_ID}} / Task: {{TASK_ID}}
- Worktree: {{WORKTREE_PATH}}
- Base branch: {{BASE_BRANCH}}
- Spec: {{SPEC_PATH}}
- Plan: {{PLAN_PATH}}

## 변경 의도 (PM 작성 — 1~3줄 자유 형식)

{{INTENT}}

## 리뷰 관점

{{PERSPECTIVE}}

## 자기탐색 지시

아래 순서로 변경사항을 직접 탐색하라. PM이 제공한 diff나 요약에 의존하지 말고 직접 확인하라.

0. 스펙 직접 읽기: `cat {{SPEC_PATH}}` (또는 Read 도구) — 변경 의도·범위·수락 조건 파악
0.1. plan 직접 읽기 (source_plan이 있는 경우만): `{{PLAN_PATH}}`가 `"N/A"`가 아니면 `cat {{PLAN_PATH}}` (또는 Read 도구), `"N/A"`면 source_plan 없음으로 보고 이 단계를 skip
1. `git -C {{WORKTREE_PATH}} diff --name-only {{BASE_BRANCH}}...HEAD` — 변경된 파일 목록 파악
2. `git -C {{WORKTREE_PATH}} diff {{BASE_BRANCH}}...HEAD` — 전체 변경 내용 확인
3. 변경된 파일만 탐색할 것. 변경되지 않은 파일은 검토 범위 밖이다
4. 필요 시 관련 파일을 직접 읽어 문맥 파악
5. 빌드 확인 (프로젝트에 빌드 시스템이 있는 경우): `package.json`, `Makefile`, `pyproject.toml`, `deno.json` 등 빌드 설정이 존재하고 변경 파일이 컴파일/번들 대상이라면 빌드를 직접 실행하여 성공 여부를 확인한다. 빌드 실패 시 [CRITICAL] 이슈로 보고한다.

## 수락 조건 (검토 기준)

{{ACCEPTANCE_CRITERIA}}

## 포커스 힌트

{{FOCUS_HINTS}}

## 등급 판별 가이드

각 이슈에 아래 체크리스트를 적용하여 등급을 결정한다. 해당 등급의 질문 중 **2개 이상 YES**이면 그 등급으로 태깅한다. 상위 등급부터 순서대로 평가하여 처음 매칭되는 등급을 적용한다.

### [CRITICAL] 판별 (2개 이상 YES → CRITICAL)

1. 이 이슈가 런타임 오류, 데이터 손실, 또는 서비스 중단을 유발할 수 있는가?
2. 이 이슈가 spec §3 수락 조건(AC)을 직접적으로 위반하는가?
3. 이 이슈를 수정하지 않으면 후속 기능 개발이 불가능하거나 전체 워크플로우가 차단되는가?
4. 빌드/컴파일이 실패하는가?

### [MAJOR] 판별 (2개 이상 YES → MAJOR)

1. 이 이슈가 엣지케이스 미처리, 예외 처리 누락 등 특정 조건에서 오작동을 유발하는가?
2. 이 이슈가 설계 의도와 구현 방향의 불일치를 나타내는가?
3. 이 이슈를 방치하면 유지보수 비용이 현저히 증가하거나 기술 부채가 누적되는가?
4. plan.md 및 spec.md의 범위를 벗어난 불필요한 파일 수정 또는 관련 없는 로직 변경이 있는가?
5. plan.md에 명시된 상위 목표·방향과 실제 구현이 충돌하는가?

### [MINOR] 판별 (위 등급에 해당하지 않는 경우)

1. 이 이슈가 코드 스타일, 네이밍, 포맷팅 등 가독성 관련인가?
2. 이 이슈가 기능 동작에 영향을 주지 않는 개선 제안인가?
3. 이 이슈가 문서화 누락, 주석 부족 등 비기능적 사항인가?

> 어느 등급에도 2개 이상 YES가 아니면 [MINOR]로 태깅한다.

## 보안 오버라이드

아래 보안 키워드와 관련된 이슈는 **체크리스트 점수와 무관하게** 반드시 `[CRITICAL]`로 태깅한다:

- 인증(authentication), 인가(authorization), 권한 우회
- 인젝션(injection), SQL injection, 코드 인젝션
- XSS(Cross-Site Scripting), CSRF(Cross-Site Request Forgery)
- 시크릿(secret) 노출, API 키 하드코딩, 자격 증명 유출
- 경로 탐색(path traversal), 디렉토리 트래버설

## 출력 형식

- **결과**: PASS / FAIL / PARTIAL
- **이슈 목록**: 각 이슈에 반드시 `[CRITICAL]`, `[MAJOR]`, `[MINOR]` 등급을 태깅한다.
  - 형식: `파일:라인 | [CRITICAL] | 설명`
  - 형식: `파일:라인 | [MAJOR] | 설명`
  - 형식: `파일:라인 | [MINOR] | 설명`
- **개선 제안**: 필수 수정 사항 외 선택적 개선 (있는 경우만)
