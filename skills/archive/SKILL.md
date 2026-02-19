---
name: archive
description: "세션 아카이브를 관리합니다. 오래된 ideation/discussion/request 세션을 압축 보관하고, 아카이브 현황 조회/복원/삭제를 수행합니다. 사용자가 '아카이브', '정리', '세션 정리'를 말하거나 /mst:archive를 호출할 때 사용."
user-invocable: true
argument-hint: "[--run [--type {ideation|discussion|requests}]] [--restore {ID}] [--purge [--before {YYYY-MM-DD}]] [--list]"
---

# maestro:archive

Gran Maestro 세션 아카이브를 관리합니다.
타입별(ideation/discussion/requests) 최근 N개 세션만 활성 유지하고, 초과분은 각 타입 디렉토리 하위 `archived/`에 tar.gz 압축 보관합니다.

## 설정 참조

`config.json`의 `archive` 섹션:

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `max_active_sessions` | 20 | 타입별 활성 유지 갯수 |
| `archive_retention_days` | null | null=영구 보존, 숫자=N일 후 아카이브 자동 삭제 |
| `auto_archive_on_create` | true | 새 세션 생성 시 자동 아카이브 체크 |
| `archive_directory` | `{type_dir}/archived` | 타입별 아카이브 저장 경로 (자동) |

## 실행 프로토콜

### 인자 없음: 아카이브 현황 표시

1. `config.json`에서 `archive` 설정 로드
2. 각 타입 디렉토리 스캔:
   - `.gran-maestro/ideation/` → IDN-* 디렉토리 수
   - `.gran-maestro/discussion/` → DSC-* 디렉토리 수
   - `.gran-maestro/requests/` → REQ-* 디렉토리 수
3. 각 타입의 `archived/` 디렉토리 스캔:
   - `.gran-maestro/{ideation,discussion,requests,debug}/archived/` 내 .tar.gz 파일 수
   - 총 디스크 사용량
4. 현황 표시:

```
Gran Maestro — 아카이브 현황
═══════════════════════════════════════

설정: max_active=20, retention=영구, auto_archive=ON

타입         활성    아카이브   상태
─────────────────────────────────────
ideation     12      0         OK
discussion    8      0         OK
requests     23      0         초과 (3개 아카이브 대상)

아카이브 디스크 사용량: 0 B
```

### `--run`: 수동 아카이브 실행

선택적으로 `--type {ideation|discussion|requests}`로 특정 타입만 실행 가능.

1. 대상 타입 디렉토리 스캔
2. 각 세션의 `session.json` (또는 `request.json`) 읽기
3. **진행 중 세션 보호**: `status`가 `completed` 또는 `cancelled`이 아닌 세션은 절대 아카이브하지 않음
4. 완료된 세션을 `created_at` 기준 오래된 순 정렬
5. `max_active_sessions` 초과분 선별 (가장 오래된 것부터)
6. `.gran-maestro/{type_dir}/archived/` 디렉토리 생성 (없으면)
7. 선별된 세션을 tar.gz 압축:
   ```bash
   tar -czf .gran-maestro/{type_dir}/archived/{type}-{ID_from}-{ID_to}-{YYYYMMDD}.tar.gz \
     -C .gran-maestro/{type_dir} {session_dir1} {session_dir2} ...
   ```
   - `{type}`: `ideation`, `discussion`, `requests`
   - `{ID_from}`: 아카이브 대상 중 가장 작은 ID (예: IDN-001)
   - `{ID_to}`: 아카이브 대상 중 가장 큰 ID (예: IDN-005)
   - `{YYYYMMDD}`: 아카이브 실행 날짜
8. 원본 디렉토리 삭제
9. `archive_retention_days` 설정 시 만료된 아카이브 .tar.gz 자동 삭제:
   - 아카이브 파일의 수정 시간(mtime) 기준
   - `archive_retention_days`일 초과 시 삭제
10. 결과 요약 표시:

```
아카이브 완료
─────────────────────────────────────
requests: 3개 세션 아카이브됨
  → requests-REQ001-REQ003-20260217.tar.gz (24.5 KB)
  원본 삭제 완료

만료 아카이브 삭제: 0개
```

### `--restore {ID}`: 아카이브에서 세션 복원

1. ID 접두사(REQ/IDN/DSC/DBG)로 타입을 결정하고 `.gran-maestro/{type_dir}/archived/`에서 해당 ID를 포함하는 .tar.gz 파일 탐색
2. 대상 아카이브 파일을 임시로 목록 확인:
   ```bash
   tar -tzf {archive_file} | grep {ID}
   ```
3. 해당 세션 디렉토리만 추출하여 원래 위치에 복원:
   ```bash
   tar -xzf {archive_file} -C .gran-maestro/{type_dir} {session_dir}
   ```
4. 복원 결과 표시
5. **주의**: 아카이브 파일 자체는 삭제하지 않음 (다른 세션이 포함되어 있을 수 있음)

### `--purge [--before {YYYY-MM-DD}]`: 오래된 아카이브 삭제

1. `--before` 지정 시: 해당 날짜 이전의 아카이브 .tar.gz 파일 삭제
2. `--before` 미지정 시: `archive_retention_days` 설정 기준으로 만료된 파일 삭제
   - `archive_retention_days`가 null이면 "보존 기간이 설정되지 않았습니다" 안내
3. 삭제 전 대상 목록을 사용자에게 표시하고 확인 요청 (AskUserQuestion)
4. 확인 후 삭제 실행

### `--list`: 아카이브된 세션 목록 표시

1. 각 `.gran-maestro/{ideation,discussion,requests,debug}/archived/` 디렉토리의 모든 .tar.gz 파일 스캔
2. 각 파일의 내용 목록 확인:
   ```bash
   tar -tzf {archive_file}
   ```
3. 타입별로 그룹화하여 표시:

```
Gran Maestro — 아카이브 목록
═══════════════════════════════════════

ideation (2 archives):
  ideation-IDN001-IDN005-20260210.tar.gz (15.2 KB)
    IDN-001, IDN-002, IDN-003, IDN-004, IDN-005
  ideation-IDN006-IDN010-20260215.tar.gz (18.7 KB)
    IDN-006, IDN-007, IDN-008, IDN-009, IDN-010

discussion (1 archive):
  discussion-DSC001-DSC003-20260212.tar.gz (8.3 KB)
    DSC-001, DSC-002, DSC-003

requests (1 archive):
  requests-REQ001-REQ010-20260214.tar.gz (42.1 KB)
    REQ-001 ~ REQ-010
```

## 자동 아카이브 프로토콜 (다른 스킬에서 호출)

`config.json`의 `archive.auto_archive_on_create`가 true이면, ideation/discussion/start 스킬이 새 세션 생성 시 자동으로 아카이브 체크를 수행합니다.

자동 아카이브 로직:

1. 해당 타입 디렉토리의 세션 수 확인
2. `archive.max_active_sessions` 초과 시:
   a. 완료된(completed/cancelled) 세션만 아카이브 대상
   b. 오래된 순 정렬 → 초과분 선별
   c. tar.gz 압축 → 원본 삭제
3. 아카이브 완료 후 간략한 알림 표시:
   ```
   [Archive] {type} {N}개 세션 아카이브됨 → {archive_filename}
   ```
4. 정상적으로 새 세션 생성 진행

## 진행 중 세션 보호 규칙

**절대 아카이브하지 않는 세션**:
- `status`가 `completed` 또는 `cancelled`이 **아닌** 모든 세션
- 예: `analyzing`, `collecting`, `synthesizing`, `discussing`, `debating`, `phase1_analysis`, `phase2_execution` 등
- 이 규칙은 자동/수동 아카이브 모두에 적용

## counter.json 보호 규칙

**절대 삭제하지 않는 파일**: 각 타입 디렉토리의 `counter.json`
- `counter.json`은 세션 ID 채번의 단조 증가 카운터로, 아카이브/정리 시 절대 삭제하지 않음
- 위치: `.gran-maestro/{ideation,discussion,debug,requests}/counter.json`
- 이 파일은 세션 디렉토리가 아니므로 tar.gz 아카이브 대상이 아님
- `--run` 실행 시 세션 디렉토리(IDN-*, DSC-*, DBG-*, REQ-*)만 대상으로 하며, `counter.json`은 건드리지 않음

## 디렉토리 구조

```
.gran-maestro/
├── ideation/
│   ├── IDN-* (active) + counter.json
│   └── archived/
│       └── ideation-IDN001-IDN005-20260217.tar.gz
├── discussion/
│   ├── DSC-* (active) + counter.json
│   └── archived/
│       └── discussion-DSC001-DSC003-20260217.tar.gz
├── requests/
│   ├── REQ-* (active) + counter.json
│   └── archived/
│       └── requests-REQ001-REQ010-20260217.tar.gz
├── debug/
│   ├── DBG-* + counter.json
│   └── archived/
└── plans/
    └── PLN-*.md
```

## 에러 처리

| 상황 | 대응 |
|------|------|
| `{type_dir}/archived/` 생성 실패 | 쓰기 권한 확인 안내 |
| tar 명령 실패 | 에러 메시지 표시, 원본 보존 (삭제하지 않음) |
| 복원 시 ID를 찾을 수 없음 | 아카이브 목록 표시 + 올바른 ID 안내 |
| 복원 대상 디렉토리가 이미 존재 | 덮어쓰기 전 사용자 확인 |
| config.json에 archive 섹션 없음 | 기본값 사용 (max_active=20, retention=null, auto=true) |

## 예시

```
/mst:archive                          # 현황 표시
/mst:archive --run                    # 모든 타입 아카이브 실행
/mst:archive --run --type ideation    # ideation만 아카이브
/mst:archive --restore IDN-003        # IDN-003 복원
/mst:archive --list                   # 아카이브 목록
/mst:archive --purge                  # 만료 아카이브 삭제
/mst:archive --purge --before 2026-01-01  # 특정 날짜 이전 삭제
```

## 문제 해결

- "아카이브 대상이 없음" → 모든 세션이 진행 중이거나, 활성 세션 수가 `max_active_sessions` 이하
- "tar 명령을 찾을 수 없음" → 시스템에 tar가 설치되어 있는지 확인 (macOS/Linux 기본 포함)
- "복원 후 세션이 보이지 않음" → 복원된 세션의 `session.json`/`request.json` 상태 확인
- "디스크 공간 부족" → `--purge`로 오래된 아카이브 정리 또는 `archive_retention_days` 설정
