---
name: plan
description: "요구사항 미결정 항목을 사용자와 대화로 정제하고 실행 가능한 plan.md를 작성합니다. 모호함을 줄인 결정사항, 범위, 제약을 기록해 /mst:start로 바로 이어집니다."
user-invocable: true
argument-hint: "{플래닝 주제}"
---

# maestro:plan

요청의 핵심 미결 항목을 사용자와 Q&A로 정제한 뒤, 계획에 대한 합의가 이뤄지면 `templates/plan.md` 형식의 plan.md를 생성합니다.

## 실행 프로토콜

### Step 0: 아카이브 체크

`config.archive.auto_archive_on_create`가 `true`이면 `plans/`의 오래된 PLN 파일을 `config.archive.max_active_sessions` 기준으로 아카이브합니다.

1. 우선 `python3 {PLUGIN_ROOT}/scripts/mst.py plan count --active` 실행 시도
2. 실패 시 fallback으로 `.gran-maestro/plans/`에서 `PLN-*.md`를 파일 수 기준으로 정리
3. 초과분은 보관 정책(`archive` 하위 설정)을 준수해 보관 후 다음 단계 진행

### Step 1: 초기화

1. `.gran-maestro/plans/` 디렉토리 확인, 없으면 생성
2. PLN 번호 채번
   - `.gran-maestro/plans/PLN-*.md` 파일명 스캔
   - 최대 번호를 추출해 `+1` (최초: `001`)
3. 위 정보는 실행 중에만 메모리에 보관하고 파일은 아직 작성하지 않음

### Step 2: 초기 분석 & 첫 질문

1. PM이 요청 주제를 분석해 핵심 미결 항목, 제약, 우선순위가 높은 이슈를 정리
2. 가장 중요한 항목 하나를 고른 뒤 `AskUserQuestion`로 **한 번에 하나씩** 질문

### Step 3: 반복 대화

1. 사용자 답변을 반영해 PM이 추가 질문 필요성을 자율 판단
2. 핵심 결정 사항과 범위가 충분히 명확해질 때까지 질문-응답 반복
3. 모든 질문은 `AskUserQuestion`를 통해 **동시 1개 질문만** 제시

### Step 3.5: 분리 실행 판단 (PM 자율)

PM이 아래 조건을 감지하면 분리 실행을 제안하고 사용자에게 동의 요청

- 코드 영역이 완전히 독립적일 때 (예: FE + 백엔드 API)
- 실행 타임라인이 다를 때 (긴급 수정 + 장기 개선)
- 동일 파일/영역 충돌 가능성이 높아 별도 브랜치 운영이 유리할 때
- 리스크 성격이 달라 PR/리뷰 주기를 분리하는 것이 안정적인 경우

### Step 4: plan.md 초안 제시 & 사용자 승인

1. 대화 내용을 반영해 plan 초안 텍스트를 사용자에게 제시
   - **반드시 파일은 아직 작성하지 않음**
2. 사용자 수정 요청이 오면 텍스트만 갱신해 재제시
3. 최종 승인 시 `.gran-maestro/plans/PLN-NNN.md`에 최초 작성
4. 실행 안내
   - 단일 실행: `/mst:start --plan PLN-NNN` 한 줄 가이드
   - 분리 실행: 제안된 각 plan 조각별로 `PLN-xxx`를 기준으로 여러 `/mst:start --plan PLN-xxx` 안내(병렬 가능 여부 표시)

## 출력 형식

`templates/plan.md`를 기본 템플릿으로 사용하여 plan.md를 작성합니다.

