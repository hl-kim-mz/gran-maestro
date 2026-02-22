---
name: cleanup
description: "세션을 일괄 정리합니다. ideation/discussion은 최근 N개만 유지하고, completed requests를 자동 아카이브하며, 오래된 활성 requests는 사용자 선택으로 정리합니다. 사용자가 '정리', '클린업', '청소'를 말하거나 /mst:cleanup을 호출할 때 사용."
user-invocable: true
argument-hint: "[--run] [--dry-run]"
---

# maestro:cleanup

Gran Maestro 세션을 일괄 정리하는 스킬입니다. 한 번의 호출로 ideation, discussion, requests를 모두 정리합니다.
이 스킬은 Maestro 모드 활성 여부에 관계없이 사용 가능합니다.

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

설정이 없으면 위 기본값을 사용합니다.

## 실행 프로토콜

### 인자 없음: 정리 대상 미리보기

1. `config.json`에서 `cleanup` 설정 로드 (없으면 기본값 사용)
2. `config.json`에서 `archive` 설정 로드
3. 각 타입별 현황 스캔:

   **Ideation**:
   - `.gran-maestro/ideation/` 하위 IDN-* 디렉토리 스캔
   - 각 세션의 `session.json` 읽어 `created_at`, `status` 확인
   - `created_at` 기준 내림차순 정렬
   - `ideation_keep_count` 초과분 중 `status`가 `done` 또는 `completed`인 세션 수 카운트

   **Discussion**:
   - `.gran-maestro/discussion/` 하위 DSC-* 디렉토리 스캔
   - 각 세션의 `session.json` 읽어 `created_at`, `status` 확인
   - `created_at` 기준 내림차순 정렬
   - `discussion_keep_count` 초과분 중 `status`가 `done` 또는 `completed`인 세션 수 카운트

   **Debug**:
   - `.gran-maestro/debug/` 하위 DBG-* 디렉토리 스캔
   - 각 세션의 `session.json` 읽어 `created_at`, `status` 확인
   - `created_at` 기준 내림차순 정렬
   - `debug_keep_count` 초과분 중 `status`가 `done` 또는 `completed`인 세션 수 카운트

   **Requests (자동 정리 대상)**:
   - `.gran-maestro/requests/` 하위 REQ-* 디렉토리 스캔
   - 각 요청의 `request.json` 읽어 `status`, `created_at`, `title` 확인
   - `status`가 `done`, `completed` 또는 `cancelled`인 요청 수 카운트

   **Requests (인터랙티브 정리 대상)**:
   - 위 스캔에서 `status`가 `done`/`completed`/`cancelled`이 아닌 요청 중
   - `created_at`으로부터 `old_request_threshold_hours` 이상 경과한 요청 수 카운트

4. 미리보기 표시:

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

3단계로 순차 실행합니다.

#### Step 1: Ideation / Discussion 정리 (자동)

**Ideation**:
1. `.gran-maestro/ideation/` 하위 IDN-* 스캔
2. 각 `session.json`의 `created_at`, `status` 읽기
3. `created_at` 기준 내림차순 정렬
4. 최근 `ideation_keep_count`개를 유지 목록에 넣기
5. 나머지 중 `status`가 `done` 또는 `completed`인 세션만 아카이브 대상 선별
   - **진행 중 세션 보호**: `done`/`completed`가 아닌 세션은 keep count 초과여도 보호
6. 아카이브 대상이 있으면:
   - `.gran-maestro/ideation/archived/` 디렉토리 생성 (없으면)
   - tar.gz 압축:
     ```bash
     tar -czf .gran-maestro/ideation/archived/ideation-{ID_from}-{ID_to}-{YYYYMMDD}.tar.gz \
       -C .gran-maestro/ideation {IDN-001} {IDN-002} ...
     ```
   - 원본 디렉토리 삭제
   - `[Cleanup] ideation {N}개 아카이브됨`

**Discussion**: 동일한 로직, `discussion_keep_count` 사용.

**Debug**: 동일한 로직, `debug_keep_count` 사용. `.gran-maestro/debug/` 하위 DBG-* 대상.

#### Step 2: Completed Requests 정리 (자동)

1. `.gran-maestro/requests/` 하위 REQ-* 스캔
2. 각 `request.json`의 `status` 읽기
3. `status`가 `done`, `completed` 또는 `cancelled`인 요청 선별
4. 아카이브 대상이 있으면:
   - tar.gz 압축:
     ```bash
     tar -czf .gran-maestro/requests/archived/requests-{ID_from}-{ID_to}-{YYYYMMDD}.tar.gz \
       -C .gran-maestro/requests {REQ-001} {REQ-002} ...
     ```
   - 원본 디렉토리 삭제
   - `[Cleanup] requests {N}개 done/completed 아카이브됨`

#### Step 3: 오래된 활성 Requests 인터랙티브 정리

1. Step 2에서 남은 REQ-* 중 `created_at`으로부터 `old_request_threshold_hours` 이상 경과한 요청 필터링
2. 대상이 없으면 이 단계 스킵
3. 대상이 있으면 `AskUserQuestion`으로 멀티 토글 선택창 표시:

   **옵션 구성** (최대 4개, 가장 오래된 순):
   - label: `{REQ-ID}: {title 앞 20자}`
   - description: `상태: {status} | 생성: {relative_time} ({created_at의 YYYY-MM-DD HH:mm})`

   ```
   AskUserQuestion({
     questions: [{
       question: "아카이브할 오래된 요청을 선택하세요. 선택한 요청은 archive로 이동됩니다.",
       header: "Cleanup",
       multiSelect: true,
       options: [
         { label: "REQ-013: JWT 인증 구현", description: "상태: phase2_execution | 생성: 3일 전 (2026-02-15 09:30)" },
         { label: "REQ-014: 대시보드 개선", description: "상태: phase1_analysis | 생성: 2일 전 (2026-02-16 14:00)" }
       ]
     }]
   })
   ```

4. **4개 초과 시**: 가장 오래된 4개만 표시. 결과 출력 후 안내:
   ```
   남은 오래된 요청 {N}개가 있습니다. `/mst:cleanup --run`을 다시 실행하세요.
   ```

5. 사용자가 선택한 요청을 아카이브:
   - 선택된 각 요청을 개별 tar.gz로 압축 (다른 요청과 묶지 않음):
     ```bash
     tar -czf .gran-maestro/requests/archived/requests-{REQ-ID}-{YYYYMMDD}.tar.gz \
       -C .gran-maestro/requests {REQ-ID}
     ```
   - 원본 디렉토리 삭제
   - `[Cleanup] {N}개 요청 아카이브됨 (사용자 선택)`

6. 사용자가 아무것도 선택하지 않으면 (Other로 "스킵" 입력 등):
   - `오래된 요청 정리를 건너뛰었습니다.`

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

`--run`과 동일한 로직을 수행하되, 실제 tar.gz 압축이나 삭제를 수행하지 않습니다.
각 단계에서 `[DRY-RUN]` 접두어와 함께 어떤 작업이 수행될지만 표시합니다.

Step 3의 AskUserQuestion도 호출하지 않고, 대상 목록만 표시합니다.

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

`/mst:archive` 스킬과 동일한 보호 규칙을 적용합니다:

- **자동 정리 (Step 1, 2)**: `status`가 `done`, `completed` 또는 `cancelled`인 세션만 아카이브
- **인터랙티브 정리 (Step 3)**: 사용자가 명시적으로 선택한 세션만 아카이브 (상태 무관)
- 진행 중인 세션이 keep count 초과여도 자동 삭제하지 않음

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

- "정리 대상이 없습니다" → 모든 세션이 keep count 이내이고, completed requests가 없으며, 오래된 활성 requests가 없는 상태
- "진행 중 세션은 정리할 수 없습니다" → Step 1/2는 자동으로 진행 중 세션을 보호합니다. 강제로 정리하려면 `/mst:archive --run`을 사용하세요
- "tar 오류" → 디스크 공간 확인, `{type}/archived/` 디렉토리 쓰기 권한 확인
- "복원이 필요합니다" → `/mst:archive --restore {ID}`를 사용하세요. cleanup 스킬은 복원 기능을 제공하지 않습니다
