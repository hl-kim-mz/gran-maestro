---
name: archive
description: "세션 아카이브를 관리합니다. 오래된 ideation/discussion/request 세션을 압축 보관하고, 아카이브 현황 조회/복원/삭제를 수행합니다. 사용자가 '아카이브', '정리', '세션 정리'를 말하거나 /mst:archive를 호출할 때 사용."
user-invocable: true
argument-hint: "[--run [--type {ideation|discussion|requests}]] [--restore {ID}] [--purge [--before {YYYY-MM-DD}]] [--list]"
---

# maestro:archive

타입별(ideation/discussion/requests) 최근 N개 세션만 활성 유지하고, 초과분을 `archived/`에 tar.gz 압축 보관합니다.

## 설정 참조

`config.resolved.json`의 `archive` 섹션:

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `max_active_sessions` | 20 | 타입별 활성 유지 갯수 |
| `archive_retention_days` | null | null=영구 보존, 숫자=N일 후 아카이브 자동 삭제 |
| `auto_archive_on_create` | true | 새 세션 생성 시 자동 아카이브 체크 |
| `archive_directory` | `{type_dir}/archived` | 타입별 아카이브 저장 경로 (자동) |

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

### 인자 없음: 아카이브 현황 표시

`archive` 설정 로드 → 각 타입 디렉토리 스캔(IDN-*/DSC-*/REQ-* 수) + `archived/`의 tar.gz 파일 수/디스크 사용량 확인 → 현황 표시:

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

`--type {ideation|discussion|requests}`로 특정 타입만 실행 가능.

1. 대상 타입 스캔 → `session.json`/`request.json` 읽기
2. **진행 중 세션 보호**: `done`/`completed`/`cancelled` 아닌 세션은 절대 아카이브 금지
3. 완료 세션을 `created_at` 오래된 순 정렬 → `max_active_sessions` 초과분 선별
4. `{type_dir}/archived/` 생성 후 tar.gz 압축 (원본 삭제):
   ```bash
   tar -czf {PROJECT_ROOT}/.gran-maestro/{type_dir}/archived/{type}-{ID_from}-{ID_to}-{YYYYMMDD}.tar.gz \
     -C {PROJECT_ROOT}/.gran-maestro/{type_dir} {session_dirs...}
   ```
5. `archive_retention_days` 설정 시 만료된 tar.gz 자동 삭제 (mtime 기준)
6. 결과 요약 표시:

```
아카이브 완료
─────────────────────────────────────
requests: 3개 세션 아카이브됨
  → requests-REQ001-REQ003-20260217.tar.gz (24.5 KB)
  원본 삭제 완료

만료 아카이브 삭제: 0개
```

### `--restore {ID}`: 아카이브에서 세션 복원

1. ID 접두사(REQ/IDN/DSC/DBG)로 타입 결정 → `archived/`에서 해당 ID 포함 tar.gz 탐색
2. 목록 확인: `tar -tzf {archive_file} | grep {ID}`
3. 세션 디렉토리만 추출: `tar -xzf {archive_file} -C {PROJECT_ROOT}/.gran-maestro/{type_dir} {session_dir}`
4. 복원 결과 표시; 아카이브 파일 자체는 삭제 안 함

### `--purge [--before {YYYY-MM-DD}]`: 오래된 아카이브 삭제

- `--before`: 해당 날짜 이전 tar.gz 삭제
- 미지정: `archive_retention_days` 기준 만료 파일 삭제 (null이면 "보존 기간 미설정" 안내)
- 삭제 전 대상 목록 표시 + `AskUserQuestion` 확인 후 실행

### `--list`: 아카이브된 세션 목록 표시

각 타입 `archived/`의 tar.gz 파일 스캔 → `tar -tzf {archive_file}`로 내용 확인 → 타입별 그룹화 표시:

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

`archive.auto_archive_on_create=true` 시 새 세션 생성 시점에 자동 체크:
1. 해당 타입 세션 수 확인 → `max_active_sessions` 초과 시:
   - 완료된(done/completed/cancelled) 세션만 아카이브 대상 → 오래된 순 정렬 → tar.gz 압축 + 원본 삭제
   - `[Archive] {type} {N}개 세션 아카이브됨 → {archive_filename}` 알림
2. 완료 후 새 세션 생성 진행

## 진행 중 세션 보호 규칙

`done`/`completed`/`cancelled` 아닌 모든 세션은 자동/수동 아카이브 모두에서 절대 아카이브 금지 (예: `analyzing`, `collecting`, `phase1_analysis`, `phase2_execution` 등).

## counter.json 보호 규칙

각 타입 디렉토리의 `counter.json`은 절대 삭제 금지 — 세션 ID 단조 증가 카운터로 아카이브/정리 대상 아님. `--run` 시 세션 디렉토리(IDN-*/DSC-*/DBG-*/REQ-*)만 처리, `counter.json`은 건드리지 않음.

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
| config.resolved.json에 archive 섹션 없음 | 기본값 사용 (max_active=20, retention=null, auto=true) |

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

- "아카이브 대상 없음" → 모든 세션 진행 중이거나 활성 수가 `max_active_sessions` 이하
- "복원 후 세션 미표시" → 복원된 `session.json`/`request.json` 상태 확인
- "디스크 부족" → `--purge` 또는 `archive_retention_days` 설정
