---
name: picks
description: "captures/ 큐에서 자연어로 항목을 선택하고, 변경 요청 시 /mst:plan --from-picks로 자동 전환합니다."
user-invocable: true
argument-hint: "[--list] [--all] [{자연어 선택/변경 요청}]"
---

# maestro:picks

사용자가 캡처 큐에서 항목을 자연어로 선택하고, 변경 요청 감지 시 `/mst:plan --from-picks`로 자동 전환합니다.

## 실행 제약 (CRITICAL -- 항상 준수)

이 스킬 실행 중 **Write/Edit 도구를 사용할 수 있는 경로는 아래만 해당**합니다:

- `{PROJECT_ROOT}/.gran-maestro/captures/CAP-*/capture.json` (status 업데이트용)

**그 외 모든 경로에 대한 Write/Edit 사용은 절대 금지입니다.**

## 실행 프로토콜

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

### Step 1: 캡처 목록 로드

1. `{PROJECT_ROOT}/.gran-maestro/captures/` 디렉토리 존재 확인
   - **미존재 시**: "캡처가 없습니다. Chrome Extension에서 캡처를 시작하세요." 안내 후 종료
2. `{PROJECT_ROOT}/.gran-maestro/captures/CAP-*/capture.json` 일괄 Read
3. 기본 필터: status가 `archived` 또는 `done`인 항목 제외 (pending/selected/consumed 표시)
   - consumed 항목에는 `[consumed]` 라벨 부착 (재선택 가능)
   - `--all` 옵션 시: archived/done 포함 전체 표시
4. `created_at` 기준 최신순 정렬, 기본 50개 제한
   - `--all` 사용 시 50개 제한 해제
5. **캡처가 0개일 때**: "표시할 캡처가 없습니다. Chrome Extension에서 캡처를 시작하세요." 안내 후 종료

### Step 2: 목록 표시

캡처 목록을 요약 테이블로 표시합니다:

| ID | URL | Selector | Memo | Tags | Status | Age |
|----|-----|----------|------|------|--------|-----|

- **Age**: 상대 시간으로 표시 (예: "3일 전", "2h")
- **Status**: pending / selected / consumed (`[consumed]` 라벨) / archived / done
- `ttl_warned_at`이 non-null인 항목: Status 옆에 `[⚠ 24h]` 표시 (TTL 경고)
- URL은 발췌 표시 (도메인 + 경로 앞부분)

**`--list` 옵션 시**: 목록만 표시 후 종료 (사용자 입력 대기 없음)

### Step 3: 사용자 입력 분석 (LLM)

사용자 입력을 LLM이 분석하여 아래 유형으로 분류합니다:

#### 3-A: 직접 ID 지정
- 예: "CAP-001, CAP-003"
- 지정된 ID에 해당하는 캡처를 선택 대상으로 확정

#### 3-B: 자연어 필터
- 예: "헤더 관련", "버튼", "#ui 태그"
- LLM이 memo, tags, selector, url 등을 종합하여 매칭되는 캡처를 선택 대상으로 확정

#### 3-C: 변경 요청 감지
- 예: "이 버튼 색상 빨간색으로 바꿔", "수정해줘", "바꿔줘", "추가해줘"
- 변경 요청 키워드: 수정, 바꿔, 추가, 삭제, 변경, 고쳐, 업데이트, modify, change, fix, update, add, remove
- 선택 + 변경 요청이 동시에 포함된 것으로 처리 -> Step 4로 진행

#### 매칭 결과 처리

- **매칭 0건**: "일치하는 캡처가 없습니다. 다시 시도해주세요." 안내 -> 재입력 대기
- **재입력 최대 3회** 후에도 0건이면 종료
- **선택만 (변경 요청 없음)**: 선택된 캡처의 status를 `selected`로 업데이트 (capture.json Write) -> 목록 재표시 (갱신된 status 반영) -> 선택 완료 안내 + 클립보드 복사 제공 후 종료

클립보드 복사 내용:
```
/mst:plan --from-picks [CAP-003] [CAP-005] {요약}
```

### Step 4: 선택 확인 및 /mst:plan 전환

변경 요청이 감지된 경우 실행합니다.

**실행 순서** (반드시 순차):

1. **status 업데이트 먼저**: 선택된 캡처의 status를 `selected`로 업데이트 (capture.json Write)
2. **`/mst:plan --from-picks` 호출**: 사용자 전체 입력에서 요청 텍스트를 추출하여 전달

```
Skill(skill: "mst:plan", args: "--from-picks [CAP-NNN] [CAP-NNN] {요청 텍스트}")
```

## 옵션 정리

| 옵션 | 설명 |
|------|------|
| `--list` | 캡처 목록만 표시 후 종료 (선택 대화 진입 안 함) |
| `--all` | archived/done 포함 전체 표시, 50개 제한 해제 |
| `--list --all` | 전체 캡처 목록 확인 (archived/done 포함, 제한 없음) |

## 에러 처리

- `captures/` 디렉토리 미존재: "캡처가 없습니다. Chrome Extension에서 캡처를 시작하세요." 안내 후 종료
- `capture.json` 파싱 실패: 해당 항목 건너뛰기 + 경고 표시
- TTL 경고 대상 캡처: `ttl_warned_at` non-null 시 `[⚠ 24h]` 표시
