---
name: cto-review
description: "CTO 관점의 기술 스펙 검토. 아키텍처 타당성, 확장성, 보안, 기술 부채를 평가하고 리뷰 리포트를 생성합니다. '기술 검토', 'CTO 리뷰', '스펙 점검', /mst:cto-review 호출 시 사용."
user-invocable: true
argument-hint: "{스펙 내용 또는 --file {경로}} [--context {추가 컨텍스트}]"
---

# maestro:cto-review

CTO 에이전트가 기술 스펙을 8가지 차원(실현가능성, 확장성, 유지보수성, 보안, 기술부채, 의존성, 관찰가능성, 비용)으로 검토합니다.

## 실행 프로토콜

> **경로 규칙**: 모든 `.gran-maestro/` 경로는 절대경로로 사용합니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

### Step 1: 초기화 및 입력 파싱

1. `$ARGUMENTS` 파싱:
   - `--file {경로}`: 검토할 스펙 파일 경로 (예: spec.md, README.md, `.gran-maestro/requests/REQ-NNN/tasks/01/spec.md`)
   - `--context {텍스트}`: 추가 배경 컨텍스트
   - 나머지: 인라인 스펙 내용

2. 스펙 내용 확정:
   - `--file` 지정 시: 파일 읽어서 사용
   - 없으면: `$ARGUMENTS`의 인라인 텍스트 사용

3. 리뷰 세션 ID 채번:
   ```bash
   mkdir -p "$PROJECT_ROOT/.gran-maestro/cto-reviews"
   EXISTING=$(ls "$PROJECT_ROOT/.gran-maestro/cto-reviews/" 2>/dev/null | grep -E '^CTR-[0-9]+$' | wc -l)
   CTR_NUM=$(printf "%03d" $((EXISTING + 1)))
   CTR_ID="CTR-$CTR_NUM"
   mkdir -p "$PROJECT_ROOT/.gran-maestro/cto-reviews/$CTR_ID"
   ```

### Step 2: CTO Reviewer 프롬프트 구성

`{PROJECT_ROOT}/.gran-maestro/cto-reviews/{CTR_ID}/prompt.md` 파일 작성:

```
{cto-reviewer.md의 <role>, <review_dimensions>, <severity_definitions>, <output_format> 내용 삽입}

## Review Assignment

**Session ID**: {CTR_ID}
**Context**: {--context 값 또는 "없음"}

## Specification to Review

{스펙 내용}

---

Conduct a thorough CTO-level review across all 8 dimensions.
Be specific about each issue — vague feedback is not acceptable.
Propose concrete alternatives for every problem identified.
Output the full review following the <output_format> specification.
```

### Step 3: Claude 서브에이전트 실행

```bash
MODEL=$(python3 {PLUGIN_ROOT}/scripts/mst.py resolve-model claude default 2>/dev/null || echo "sonnet")
claude -p "$(cat $PROJECT_ROOT/.gran-maestro/cto-reviews/$CTR_ID/prompt.md)" \
  --model "$MODEL" \
  --permission-mode bypassPermissions \
  2>&1 | tee "$PROJECT_ROOT/.gran-maestro/cto-reviews/$CTR_ID/running.log"
EXIT=$?
```

### Step 4: 결과 저장 및 반환

1. 리뷰 결과를 `{PROJECT_ROOT}/.gran-maestro/cto-reviews/{CTR_ID}/review.md`에 저장
2. Overall Assessment 요약을 사용자에게 먼저 출력
3. 전체 리뷰 내용 출력
4. 저장 경로 안내: `📄 CTO 리뷰 저장됨: .gran-maestro/cto-reviews/{CTR_ID}/review.md`

## 예시

```
/mst:cto-review "Redis를 캐시 레이어로 추가하고 세션을 JWT로 전환하는 방안"
/mst:cto-review --file .gran-maestro/requests/REQ-001/tasks/01/spec.md
/mst:cto-review --file architecture.md --context "MAU 10만 목표, AWS 인프라 사용"
```
