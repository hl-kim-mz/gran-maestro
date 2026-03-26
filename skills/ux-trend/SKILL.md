---
name: ux-trend
description: "디자인 트렌드 및 UX/UI 전문가 분석. 최신 디자인 패턴, 사용성 원칙, 경쟁 UX 벤치마킹을 수행합니다. 'UX 분석', '디자인 트렌드', 'UX 검토', /mst:ux-trend 호출 시 사용."
user-invocable: true
argument-hint: "{분석 주제 또는 --file {경로}} [--focus flow|trend|benchmark|accessibility]"
---

# maestro:ux-trend

UX Trend Expert 에이전트가 디자인 트렌드와 UX 원칙을 기반으로 제품 경험을 분석하고 개선 방향을 제시합니다.

## 실행 프로토콜

> **경로 규칙**: 모든 `.gran-maestro/` 경로는 절대경로로 사용합니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

### Step 1: 초기화 및 입력 파싱

1. `$ARGUMENTS` 파싱:
   - `--file {경로}`: 분석할 문서/스펙 파일 (UI spec, wireframe 설명, 화면 정의서 등)
   - `--focus {flow|trend|benchmark|accessibility}`: 분석 포커스 (기본: 전체)
   - 나머지: 인라인 분석 주제 또는 화면 설명

2. 분석 세션 ID 채번:
   ```bash
   mkdir -p "$PROJECT_ROOT/.gran-maestro/ux-analyses"
   EXISTING=$(ls "$PROJECT_ROOT/.gran-maestro/ux-analyses/" 2>/dev/null | grep -E '^UXA-[0-9]+$' | wc -l)
   UXA_NUM=$(printf "%03d" $((EXISTING + 1)))
   UXA_ID="UXA-$UXA_NUM"
   mkdir -p "$PROJECT_ROOT/.gran-maestro/ux-analyses/$UXA_ID"
   ```

### Step 2: UX Trend Expert 프롬프트 구성

`{PROJECT_ROOT}/.gran-maestro/ux-analyses/{UXA_ID}/prompt.md` 파일 작성:

```
{ux-trend-expert.md의 <role>, <expertise_domains>, <evaluation_framework>, <output_format> 내용 삽입}

## Analysis Assignment

**Session ID**: {UXA_ID}
**Focus**: {focus 옵션}

## Subject to Analyze

{분석 대상 내용 — 인라인 텍스트 또는 파일 내용}

---

Conduct a thorough UX/design analysis.
Reference specific, current (2024-2025) design trends with real product examples.
Use WebSearch to find the latest design patterns and competitor UX approaches if needed.
Prioritize recommendations by impact vs. effort.
Output the full analysis following the <output_format> specification.
```

### Step 3: Claude 서브에이전트 실행

```bash
MODEL=$(python3 {PLUGIN_ROOT}/scripts/mst.py resolve-model claude default 2>/dev/null || echo "sonnet")
claude -p "$(cat $PROJECT_ROOT/.gran-maestro/ux-analyses/$UXA_ID/prompt.md)" \
  --model "$MODEL" \
  --permission-mode bypassPermissions \
  2>&1 | tee "$PROJECT_ROOT/.gran-maestro/ux-analyses/$UXA_ID/running.log"
EXIT=$?
```

### Step 4: 결과 저장 및 반환

1. 분석 결과를 `{PROJECT_ROOT}/.gran-maestro/ux-analyses/{UXA_ID}/analysis.md`에 저장
2. Executive Summary를 먼저 출력
3. 전체 분석 내용 출력
4. 저장 경로 안내: `📄 UX 분석 저장됨: .gran-maestro/ux-analyses/{UXA_ID}/analysis.md`

## 예시

```
/mst:ux-trend "온보딩 플로우 — 회원가입 5단계 폼"
/mst:ux-trend --file .gran-maestro/requests/REQ-001/design/ui-spec.md
/mst:ux-trend "대시보드 메인 화면 정보 구조" --focus benchmark
/mst:ux-trend "모바일 결제 플로우" --focus accessibility
```
