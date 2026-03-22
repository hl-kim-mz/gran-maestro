# SKILL-AUTHORING

Gran Maestro 스킬 작성 표준 가이드입니다. 목적은 스킬 간 품질 편차를 줄이고, 작성·리뷰·유지보수 시 판단 기준을 고정하는 것입니다.

## CSO Naming (영문 헤더 + 한글 보조)

- 모든 문서/섹션 헤더는 `English (한국어)` 형식을 사용합니다.
- 예: `## Quickstart (빠른 시작)`, `## Detail (심화)`
- 본문은 한국어를 기본으로 작성합니다.

## Quickstart (빠른 시작)

아래 템플릿을 복사해 새 `SKILL.md`에 붙여 넣고, 먼저 등급(Core/Support/Utility)을 3축 점수(거버넌스 산출물/체이닝 필수성/상태 변이)로 판정한 뒤 해당 섹션을 채웁니다. Core는 I/O Contract와 Gate를 필수로 작성하고, Support는 Gate를 권장으로, Utility는 실행 마커·경로 규칙 중심으로 최소화합니다. AR은 내용 설계가 아니라 배치 위치만 먼저 잡고, 실제 패턴 정의는 별도 정책을 따릅니다.

```markdown
# maestro:{skill-name}

## Skill Marker (스킬 실행 마커)
- [MST skill={name} step={N}/{M} return_to={...}]

## Path Rule (경로 규칙)
- PROJECT_ROOT 절대경로 강제

## I/O Contract
- **Input**: {트리거 + 필요 입력}
- **Output**: {산출물 + 저장 위치}
- **Precondition**: {외부 상태 요구}
- **Postcondition**: {완료 후 상태}

## Gate: {Gate-Name}
### Entry (진입 조건)
- {내부 품질 체크}
### Exit (완료 조건 + 증거)
- {완료 증거}
### AR (금지 패턴, 최대 3개)
- {AR 항목 자리 1}
- {AR 항목 자리 2}
```

## Detail (심화)

### Tier Classification (3등급 분류)

등급은 아래 3축 점수 합산으로 결정합니다.

| 평가축 | Core (2점) | Support (1점) | Utility (0점) |
|---|---|---|---|
| 거버넌스 산출물 | PLN/REQ/REV 등 추적 가능한 산출물 생성 | 다른 스킬 산출물에 기여 | 산출물 없음 |
| 체이닝 필수성 | 거버넌스 체인에서 생략 불가 | 체인에서 선택 호출 | 독립 실행 위주 |
| 상태 변이 | 프로젝트 상태(phase/status) 변경 | 파일/문서 변경 | 조회/표시 중심 |

- 합산 4점 이상: `Core`
- 합산 1~3점: `Support`
- 합산 0점: `Utility`
- 기준 Core 예시: `plan`, `request`, `review`, `approve`, `accept`

### Required Sections Matrix (등급별 필수 섹션 매트릭스)

| 섹션 | Core | Support | Utility |
|---|---|---|---|
| Skill Marker (스킬 실행 마커) | 필수 | 필수 | 필수 |
| Path Rule (경로 규칙) | 필수 | 필수 | 필수 |
| I/O Contract | 필수 | 필수 | 권장 |
| Gate (Entry/Exit/AR) | 필수 | 권장 | 불필요 |
| Anti-Rationalization (AR) | 필수 | 권장 | 불필요 |
| Execution Constraints (실행 제약) | 필수 | 권장 | 선택 |

### Gate Standard (게이트 3블록 표준)

Gate는 실행 가능 여부를 사전에 고정하고, 종료 증거를 명시해 재실행 가능성을 높입니다.

```markdown
## Gate: {이름}
### Entry (진입 조건)
- 스킬 시작 전에 충족해야 하는 내부 품질 요구
- 예: 체크리스트 통과, 필수 분석 완료

### Exit (완료 조건 + 증거)
- 완료 시 반드시 남아야 하는 증거
- 예: 생성 파일/상태 변경/검증 로그

### AR (금지 패턴, 최대 3개)
- AR 항목은 "여기에 배치"만 하고, 구체 패턴 문구는 별도 정책 문서에서 관리
- 항목 수는 최대 3개
```

### I/O Contract Standard (입출력 계약 4필드)

```markdown
## I/O Contract
- **Input**: {사용자 트리거 + 필수 인자/컨텍스트}
- **Output**: {생성 산출물 + 경로/형식}
- **Precondition**: {시작 전 외부 상태 요구}
- **Postcondition**: {완료 후 보장 상태}
```

### Precondition vs Gate Entry (구분 규칙)

- `Precondition`: 외부 상태 요구사항
- 예: `request.json.current_phase == 3`, `plan.md 존재`
- `Gate Entry`: 스킬 내부 품질 요구사항
- 예: 내부 점검표 통과, 필수 근거 수집 완료

같은 "시작 전 조건"처럼 보여도, 상태/데이터의 존재 여부는 Precondition에, 품질 게이트 통과 여부는 Gate Entry에 둡니다.

### Example: accept Before/After (발췌 예시)

실제 `skills/accept/SKILL.md`를 수정하지 않고, 문서 내 발췌 예시만 제공합니다.

**Before (excerpt)**

```markdown
# maestro:accept

## 실행 프로토콜
### REQ ID 결정 (인자 없이 호출 시)
...
### 최종 수락 실행 (Phase 3 → Phase 5)
...
```

**After (excerpt, Gate + I/O Contract 추가)**

```markdown
# maestro:accept

## I/O Contract
- **Input**: REQ-NNN (phase3 PASS 상태), 수락 트리거
- **Output**: summary.md 생성, main 반영 상태
- **Precondition**: current_phase==3, phase3_review PASS
- **Postcondition**: current_phase==5, status==done

## Gate: Accept
### Entry (진입 조건)
- phase3 PASS 확인
### Exit (완료 조건 + 증거)
- main 반영 완료
- summary.md 생성 확인
### AR (금지 패턴, 최대 3개)
- {AR 항목 자리 1}
```

### Tier Checklists (등급별 검증 체크리스트)

#### Core Checklist (핵심 스킬)

- [ ] 3축 점수 합산이 4점 이상이며 Core 근거가 문서에 명시됨
- [ ] Skill Marker, Path Rule, I/O Contract, Gate(Entry/Exit/AR)가 모두 존재함
- [ ] Precondition과 Gate Entry가 혼용되지 않음
- [ ] Exit에 완료 증거(파일/상태/로그)가 명시됨
- [ ] AR은 위치만 배치되고 구체 패턴은 별도 정책을 참조함

#### Support Checklist (지원 스킬)

- [ ] 3축 점수 합산이 1~3점이며 Support 근거가 문서에 명시됨
- [ ] Skill Marker, Path Rule, I/O Contract가 존재함
- [ ] Gate는 필요 시 추가되며, 누락 시 사유가 기록됨
- [ ] 상위 Core 스킬과의 입력/출력 연결점이 명확함

#### Utility Checklist (유틸리티 스킬)

- [ ] 3축 점수 합산이 0점이며 Utility 근거가 문서에 명시됨
- [ ] Skill Marker, Path Rule이 존재함
- [ ] I/O Contract는 필요 시 최소 필드로 작성됨
- [ ] 상태 변이 없는 조회/보조 동작임이 확인됨

### Exceptions (예외 처리 원칙)

- Utility라도 상태를 변경하기 시작하면 재평가하여 Support/Core로 상향합니다.
- Support가 거버넌스 산출물을 직접 생성하면 Core 재분류를 검토합니다.
- AR 상세 문구가 필요한 경우, 이 문서에 직접 추가하지 말고 AR 전용 정책 문서에서 관리합니다.
