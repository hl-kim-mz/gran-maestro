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
2. 실패 시 fallback으로 `.gran-maestro/plans/`에서 `PLN-*` 디렉토리 수 기준으로 정리
3. 초과분은 보관 정책(`archive` 하위 설정)을 준수해 보관 후 다음 단계 진행

### Step 1: 초기화

1. `.gran-maestro/plans/` 디렉토리 확인, 없으면 생성
2. PLN 번호 채번
   - `.gran-maestro/plans/PLN-*` 디렉토리 스캔
   - `.gran-maestro/plans/PLN-*/plan.json` 존재 여부를 확인해 채번 기준으로 사용
   - 최대 번호를 추출해 `+1` (최초: `001`)
3. 위 정보는 실행 중에만 메모리에 보관하고 파일은 아직 작성하지 않음
4. `.gran-maestro/plans/PLN-NNN/` 디렉토리 생성
5. `.gran-maestro/plans/PLN-NNN/plan.json` 먼저 작성:
   ```json
   {
     "id": "PLN-NNN",
     "title": "플랜 주제",
     "status": "active",
     "created_at": "ISO-timestamp",
     "linked_requests": []
   }
   ```

### Step 2: 초기 분석 & 첫 질문

1. PM이 요청 주제를 분석해 핵심 미결 항목, 제약, 우선순위가 높은 이슈를 정리
2. 가장 중요한 항목 하나를 고른 뒤 `AskUserQuestion`로 **한 번에 하나씩** 질문

### Step 3: 반복 대화

1. 사용자 답변을 반영해 PM이 추가 질문 필요성을 자율 판단
2. 핵심 결정 사항과 범위가 충분히 명확해질 때까지 질문-응답 반복
3. 모든 질문은 `AskUserQuestion`를 통해 **동시 1개 질문만** 제시

#### 시각적 미리보기 활용 (UI/레이아웃 선택 시)

아래 조건에 해당하는 선택지를 단일 선택(`multiSelect: false`)으로 제시할 때는
각 옵션에 ASCII 도식을 첨부해 사용자가 직관적으로 비교하게 한다:

- **UI 레이아웃** 변경 (사이드바 위치, 패널 분할, 그리드 구조 등)
- **컴포넌트 구조** 선택 (중첩 vs 플랫, 모달 vs 인라인 등)
- **화면 흐름** 분기 (단계 수, 탭 vs 스텝 vs 드로어 등)
- **정보 밀도** 차이가 한눈에 보여야 하는 경우

**필드 역할 분리 (필수):**
- **`description`**: ASCII 도식 배치 — 키보드 내비게이션 시 하단에 전체 표시되므로 줄 수 제한 없음
- **`markdown`**: 짧은 텍스트 설명 **3줄 이내** — 우측 미리보기 패널에 표시 (고정 높이이므로 초과 시 잘림)

ASCII 도식 작성 규칙:
```
┌─────────────┐   ← 박스로 영역 구분
│  컴포넌트    │
│  ┌────────┐ │   ← 중첩 구조 표현
│  │  내부  │ │
│  └────────┘ │
└─────────────┘
[버튼A] [버튼B]   ← 인라인 요소
─────────────────  ← 구분선
```

> ⚠️ `multiSelect: true` 질문에서는 미리보기 패널이 비활성화되므로
> 복수 선택이 필요한 경우엔 단일 선택 질문 여러 개로 분리하거나 텍스트 설명으로 대체한다.

### Step 3.5: 분리 실행 판단 (PM 자율)

PM이 아래 조건을 감지하면 분리 실행을 제안하고 사용자에게 동의 요청

- 코드 영역이 완전히 독립적일 때 (예: FE + 백엔드 API)
- 실행 타임라인이 다를 때 (긴급 수정 + 장기 개선)
- 동일 파일/영역 충돌 가능성이 높아 별도 브랜치 운영이 유리할 때
- 리스크 성격이 달라 PR/리뷰 주기를 분리하는 것이 안정적인 경우

### Step 4: plan.md 초안 제시 & 사용자 승인

1. 대화 내용을 반영해 plan 초안 텍스트를 사용자에게 제시
   - **반드시 파일은 아직 작성하지 않음**
2. 초안 제시 후 반드시 `AskUserQuestion`으로 아래 선택지를 제시:
   - **"저장하고 /mst:start 실행"** — plan.md 저장 후 즉시 /mst:start 호출
   - **"수정 후 진행"** — 수정할 내용을 텍스트로 입력받아 재제시
   - **"저장만 하기"** — plan.md만 저장하고 /mst:start는 나중에 수동 실행
3. "수정 후 진행" 선택 시: 수정 내용을 반영해 초안 텍스트 갱신 후 Step 4 처음부터 반복
4. "저장하고 /mst:start 실행" 또는 "저장만 하기" 선택 시 `.gran-maestro/plans/PLN-NNN/plan.md`에 최초 작성
5. **mst:start 자동 호출 — spec.md 생성 (필수)**
   - "저장하고 /mst:start 실행" 선택 시에만 해당
   - plan.md 작성 직후 `Skill(skill: "mst:start", args: "--plan PLN-NNN {plan 주제}")`를 즉시 호출
   - 분리 실행인 경우: 제안된 각 PLN별로 `Skill(skill: "mst:start", args: "--plan PLN-NNN {각 plan 주제}")`을 순차 또는 병렬 호출 (병렬 가능 여부는 plan의 분리 실행 테이블 참조)
   - ⚠️ **spec.md 작성이 완료되기 전까지 plan 스킬을 종료하지 않음**

## 출력 형식

`templates/plan.md`를 기본 템플릿으로 사용하여 plan.md를 작성합니다.
