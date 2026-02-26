---
name: cleanup
description: "세션을 일괄 정리합니다. ideation/discussion은 최근 N개만 유지하고, completed requests를 자동 아카이브하며, 오래된 활성 requests는 사용자 선택으로 정리합니다. 사용자가 '정리', '클린업', '청소'를 말하거나 /mst:cleanup을 호출할 때 사용."
user-invocable: true
argument-hint: "[--run] [--dry-run]"
---

# maestro:cleanup

한 번의 호출로 ideation, discussion, requests를 일괄 정리합니다. Maestro 모드 활성 여부 무관.

## archive 스킬과의 차이

| 항목 | `/mst:cleanup` | `/mst:archive` |
|------|---------------|----------------|
| 목적 | **한 번에 전부** 정리 | 타입별 세밀 관리 |
| 동작 | 3단계 자동 + 인터랙티브 | 수동 지정 |
| 복원 | 지원 안 함 (`/mst:archive --restore` 사용) | 지원 |
| 대상 | ideation + discussion + requests 일괄 | `--type`으로 개별 지정 |

## 설정 참조

`config.json`의 `cleanup` 섹션:

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `ideation_keep_count` | 10 | ideation 세션 유지 갯수 |
| `discussion_keep_count` | 10 | discussion 세션 유지 갯수 |
| `debug_keep_count` | 10 | debug 세션 유지 갯수 |
| `old_request_threshold_hours` | 24 | 오래된 requests 판단 기준 (시간) |

설정 없으면 기본값 사용.

## 실행 프로토콜

### 인자 없음: 정리 대상 미리보기

`config.json`에서 `cleanup`/`archive` 설정 로드 → 각 타입 스캔:
- **Ideation/Discussion/Debug**: 각 타입 디렉토리에서 `session.json`의 `created_at`/`status` 읽기 → 내림차순 정렬 → keep_count 초과 중 `done`/`completed` 세션 수 카운트
- **Requests (자동)**: `request.json`에서 `done`/`completed`/`cancelled` 요청 수 카운트
- **Requests (인터랙티브)**: 미완료 요청 중 `old_request_threshold_hours` 이상 경과 카운트

미리보기 표시:

```
Gran Maestro — Cleanup 미리보기
═══════════════════════════════════════

[자동 정리]
  ideation    : 3개 세션 아카이브 대상 (유지: 10, 현재: 13, 완료: 3)
  discussion  : 0개 (유지: 10, 현재: 5)
  debug       : 0개 (유지: 10, 현재: 2)
  requests    : 2개 done/completed/cancelled 아카이브 대상

[인터랙티브 정리]
  requests    : 1개 활성 요청이 24시간 이상 경과
    REQ-013: JWT 인증 구현 (phase2_execution, 3일 전)

실행하려면: /mst:cleanup --run
```

### `--run`: 정리 실행

3단계로 순차 실행.

#### Step 1: Ideation / Discussion / Debug 정리 (자동)

각 타입별로: 스캔 → `created_at` 내림차순 정렬 → 최근 `{type}_keep_count`개 유지 → 나머지 중 `done`/`completed`만 아카이브 대상 (진행 중 세션 보호) → `{type}/archived/` 생성 후 tar.gz 압축:
```bash
tar -czf .gran-maestro/{type}/archived/{type}-{ID_from}-{ID_to}-{YYYYMMDD}.tar.gz \
  -C .gran-maestro/{type} {session_dirs...}
```
원본 삭제 → `[Cleanup] {type} {N}개 아카이브됨`

#### Step 2: Completed Requests 정리 (자동)

`requests/REQ-*` 스캔 → `done`/`completed`/`cancelled` 선별 → tar.gz 압축 후 원본 삭제 → `[Cleanup] requests {N}개 아카이브됨`

#### Step 3: 오래된 활성 Requests 인터랙티브 정리

1. 남은 REQ-* 중 `old_request_threshold_hours` 이상 경과한 요청 필터링
2. 대상 없으면 스킵
3. `AskUserQuestion` 멀티 토글 (최대 4개, 오래된 순; label: `{REQ-ID}: {title 앞 20자}`, description: 상태/생성 시각)
4. 4개 초과 시 가장 오래된 4개만 표시 후 재실행 안내
5. 선택된 요청 개별 tar.gz 압축 후 원본 삭제 → `[Cleanup] {N}개 아카이브됨 (사용자 선택)`
6. 미선택 시: `오래된 요청 정리를 건너뛰었습니다.`

#### 최종 결과 표시

```
Gran Maestro — Cleanup 완료
═══════════════════════════════════════

ideation    : 3개 아카이브됨 → ideation-IDN001-IDN003-20260218.tar.gz
discussion  : 0개 (정리 대상 없음)
debug       : 0개 (정리 대상 없음)
requests    : 2개 done/completed 아카이브됨 → requests-REQ001-REQ002-20260218.tar.gz
              1개 사용자 선택 아카이브됨 → requests-REQ013-20260218.tar.gz

총 6개 세션 정리 완료
```

### `--dry-run`: 모의 실행

`--run`과 동일 로직이나 실제 압축/삭제 없이 `[DRY-RUN]` 접두어로 대상만 표시. Step 3의 AskUserQuestion도 호출하지 않고 대상 목록만 표시.

```
Gran Maestro — Cleanup 모의 실행
═══════════════════════════════════════

[DRY-RUN] ideation: 3개 아카이브 예정
  IDN-001 (completed, 2026-02-10)
  IDN-002 (completed, 2026-02-11)
  IDN-003 (completed, 2026-02-12)

[DRY-RUN] discussion: 정리 대상 없음

[DRY-RUN] requests (done/completed): 2개 아카이브 예정
  REQ-001 (completed, 2026-02-05)
  REQ-002 (cancelled, 2026-02-08)

[DRY-RUN] requests (오래된 활성): 1개 사용자 선택 대상
  REQ-013: JWT 인증 구현 (phase2_execution, 3일 전)

실행하려면: /mst:cleanup --run
```

## 진행 중 세션 보호 규칙

- **자동 정리 (Step 1, 2)**: `done`/`completed`/`cancelled` 세션만 아카이브
- **인터랙티브 정리 (Step 3)**: 사용자 명시 선택 세션만 아카이브 (상태 무관)
- 진행 중 세션은 keep count 초과여도 자동 삭제 안 함

## 에러 처리

| 상황 | 대응 |
|------|------|
| `.gran-maestro/` 디렉토리 없음 | "Maestro가 초기화되지 않았습니다. `/mst:on`으로 시작하세요." |
| `config.json`에 `cleanup` 섹션 없음 | 기본값 사용 (`keep=10, threshold=24h`) |
| tar 명령 실패 | 에러 메시지 표시, 원본 보존 (삭제하지 않음) |
| `session.json` / `request.json` 파싱 실패 | 해당 세션 건너뛰고 경고 표시 |
| 아카이브 디렉토리 쓰기 불가 | 권한 확인 안내 |

## 예시

```
/mst:cleanup               # 정리 대상 미리보기
/mst:cleanup --run         # 3단계 정리 실행
/mst:cleanup --dry-run     # 모의 실행 (변경 없이 대상만 표시)
```

## 문제 해결

- "정리 대상 없음" → 세션이 keep count 이내이거나 completed/오래된 requests 없음
- "진행 중 세션 정리 불가" → Step 1/2가 자동 보호; 강제 정리는 `/mst:archive --run`
- 복원 필요 시 → `/mst:archive --restore {ID}` (cleanup 스킬은 복원 미지원)
