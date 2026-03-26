---
name: research
description: "웹 검색 기반 리서치 봇. 시장조사, 기술 트렌드, 경쟁사 분석을 수행하고 구조화된 리서치 리포트를 생성합니다. '리서치', '조사해줘', '트렌드 찾아줘', /mst:research 호출 시 사용."
user-invocable: true
argument-hint: "{리서치 주제} [--focus market|technology|competitor|benchmark] [--output {파일경로}]"
---

# maestro:research

웹 검색을 통해 외부 정보를 수집하고 구조화된 리서치 리포트를 생성합니다.
Claude 서브에이전트(WebSearch 도구 포함)를 활용하여 실시간 정보를 탐색합니다.

## 실행 프로토콜

> **경로 규칙**: 모든 `.gran-maestro/` 경로는 절대경로로 사용합니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```

### Step 1: 초기화

1. `$ARGUMENTS` 파싱:
   - `--focus {market|technology|competitor|benchmark}`: 리서치 포커스 (기본: 전체)
   - `--output {경로}`: 출력 파일 경로 (기본: `.gran-maestro/research/RSC-NNN/report.md`)
   - 나머지: 리서치 주제

2. 리서치 세션 ID 채번:
   ```bash
   mkdir -p "$PROJECT_ROOT/.gran-maestro/research"
   EXISTING=$(ls "$PROJECT_ROOT/.gran-maestro/research/" 2>/dev/null | grep -E '^RSC-[0-9]+$' | wc -l)
   RSC_NUM=$(printf "%03d" $((EXISTING + 1)))
   RSC_ID="RSC-$RSC_NUM"
   mkdir -p "$PROJECT_ROOT/.gran-maestro/research/$RSC_ID"
   ```

3. 세션 메타데이터 저장:
   ```json
   {
     "id": "{RSC_ID}",
     "topic": "{리서치 주제}",
     "focus": "{focus}",
     "status": "in_progress",
     "created_at": "{timestamp}"
   }
   ```

### Step 2: Researcher 에이전트 프롬프트 구성

`{PROJECT_ROOT}/.gran-maestro/research/{RSC_ID}/prompt.md` 파일 작성:

```
{researcher.md의 <role>, <capabilities>, <research_process>, <output_format> 내용 삽입}

## Research Assignment

**Topic**: {리서치 주제}
**Focus**: {focus 옵션}
**Session ID**: {RSC_ID}

Use WebSearch tool extensively to find current, credible information.
Search in both Korean and English for comprehensive coverage.
Minimum 5 distinct searches required before synthesizing.

Output the full research report following the <output_format> specification.
Save your report to: {output_path}
```

### Step 3: Claude 서브에이전트 실행

```bash
MODEL=$(python3 {PLUGIN_ROOT}/scripts/mst.py resolve-model claude default 2>/dev/null || echo "sonnet")
claude -p "$(cat $PROJECT_ROOT/.gran-maestro/research/$RSC_ID/prompt.md)" \
  --model "$MODEL" \
  --permission-mode bypassPermissions \
  2>&1 | tee "$PROJECT_ROOT/.gran-maestro/research/$RSC_ID/running.log"
EXIT=$?
```

### Step 4: 결과 저장 및 반환

1. 리포트를 `{PROJECT_ROOT}/.gran-maestro/research/{RSC_ID}/report.md`에 저장
2. `session.json`의 `status`를 `"completed"`로 업데이트
3. 리포트 내용을 사용자에게 출력
4. 저장 경로 안내: `📄 리서치 리포트 저장됨: .gran-maestro/research/{RSC_ID}/report.md`

## 예시

```
/mst:research "AI 코드 에디터 시장 현황 2025"
/mst:research "React vs Vue vs Svelte 성능 벤치마크" --focus technology
/mst:research "국내 B2B SaaS 온보딩 UX 사례" --focus competitor
```
