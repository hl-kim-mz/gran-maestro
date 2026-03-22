---
name: explore
description: "에이전트들이 코드베이스를 백그라운드로 자율 탐색해 원하는 정보를 찾아옵니다. 사용자가 '탐색', '코드 찾아줘', '어디 있어'를 말하거나 /mst:explore를 호출할 때 사용."
user-invocable: true
argument-hint: "{탐색 목표 설명} [--focus {파일패턴}]"
---

# maestro:explore

디버그와 동일한 병렬/자동 패턴으로 에이전트들이 코드베이스를 탐색하고 Claude PM이 종합 리포트를 작성합니다.

## 3. 실행 프로토콜(요약)

> **경로 규칙 (MANDATORY)**: 이 스킬의 모든 `.gran-maestro/` 경로는 **절대경로**로 사용합니다.
> 스킬 실행 시작 시 `PROJECT_ROOT`를 취득하고, 이후 모든 경로에 `{PROJECT_ROOT}/` 접두사를 붙입니다.
> ```bash
> PROJECT_ROOT=$(pwd)
> ```
>
> `{PLUGIN_ROOT}`는 이 스킬의 "Base directory"에서 `skills/{스킬명}/`을 제거한 **절대경로**입니다. 상대경로(`.claude/...`)는 절대 사용하지 않습니다.

### Step 0: 아카이브 체크 (자동)

`archive.auto_archive_on_create=true` 시 `EXP-*` 세션 수 확인 → `max_active_sessions` 초과 시 완료 세션 아카이브 후 진행

### Step 1: 초기화

1. `{PROJECT_ROOT}/.gran-maestro/explore/` 확인/생성 →
   **스크립트 우선**: `python3 {PLUGIN_ROOT}/scripts/mst.py counter next --type exp` → EXP-NNN ID 사용
   **Fallback**: `counter.json` 직접 Read/Write로 채번 → `session.json` 작성
2. `session.json` 구조: `id`, `goal`, `focus`, `status:"exploring"`, `created_at`, `explorers:{codex,gemini}`, `claude_synthesis`, `participant_config`
3. `claude`는 `explorers` 제외 → `claude_synthesis`로만 종합; `explorers` 동적 생성은 디버그 동일 규칙 적용

세션 구조: `EXP-NNN/session.json`, `prompts/explore-{key}-prompt.md`, `prompts/synthesis-prompt.md`, `explore-{key}.md`, `explore-report.md`

### Step 1.5: PM 역할 배정

Claude가 탐색 목표 분석 → Codex: 코드 구조/구현 패턴 추적; Gemini: 아키텍처/흐름/연결 관계 분석

### Step 2: 병렬 백그라운드 탐색

`explorers` 키를 순회하여 provider별로 동시 실행합니다.

각 프롬프트에는 **"읽기 전용 탐색만 수행, 파일 수정/생성 금지"**를 명시하고, 결과를 `explore-{key}.md`에 작성합니다.

- `provider: "codex"`:
  ```
  Bash(
    run_in_background: true,
    command: "codex exec --full-auto -m $(python3 {PLUGIN_ROOT}/scripts/mst.py resolve-model codex explore 2>/dev/null || echo \"gpt-5.3-codex\") -C $(pwd) \"$(cat {absolute_path}/prompts/explore-{key}-prompt.md)\" > {absolute_path}/explore-{key}.md 2>&1; EC=$?; echo \"EXIT_CODE:$EC\" >> {absolute_path}/explore-{key}.md; exit $EC"
  )
  ```
- `provider: "gemini"`:
  ```
  Bash(
    run_in_background: true,
    command: "gemini -p \"$(cat {absolute_path}/prompts/explore-{key}-prompt.md)\" --model {config.models.providers.gemini[explore.agents.gemini.tier || default_tier]} --approval-mode yolo --sandbox=false > {absolute_path}/explore-{key}.md 2>&1; EC=$?; echo \"EXIT_CODE:$EC\" >> {absolute_path}/explore-{key}.md; exit $EC"
  )
  ```

(참고: claude는 explore의 explorers에서 제외되므로 dispatch 블록 불필요)

### Step 3: 백그라운드 탐색 완료 대기 & Claude PM 종합

1. **완료 대기 (MANDATORY)**: Step 2에서 `run_in_background: true`로 dispatch한 **모든** 백그라운드 작업이 완료될 때까지 대기한다. 일부만 완료된 상태에서 종합을 시작하는 것은 **절대 금지**한다.
   - 각 `explore-{key}.md` 파일에 `EXIT_CODE:` 행이 기록되었는지 확인하여 완료 여부를 판단한다.
   - 아직 완료되지 않은 작업이 있으면 `TaskOutput`으로 완료를 대기한다.
2. **종합**: 모든 탐색 결과가 준비된 후 `explore-{key}.md`를 읽어 `explore-report.md` 작성. 완료 안내: `plan에서 참조하려면: {PROJECT_ROOT}/.gran-maestro/explore/EXP-NNN/explore-report.md`

### Step 4: 사용자 표시

`explore-report.md` 내용을 출력합니다.


## 스킬 실행 마커 (MANDATORY)

- 모든 응답의 첫 줄 또는 각 Step 시작 줄에 아래 마커를 출력한다.
- 기본 마커 포맷: `[MST skill={name} step={N}/{M} return_to={parent_skill/step | null}]`
- 필드 규칙:
  - `skill`: 현재 실행 중인 스킬 이름
  - `step`: 현재 단계(`N/M`) 또는 서브스킬 종료 시 `returned`
  - `return_to`: 최상위 스킬이면 `null`, 서브스킬이면 `{parent_skill}/{step_number}`
- 서브스킬 종료 마커: `[MST skill={subskill} step=returned return_to={parent/step}]`
- C/D 분리 마커 규칙을 추가로 사용하지 않는다. 반드시 단일 MST 마커만 사용한다.
- 예시:
  - `[MST skill={name} step=1/3 return_to=null]`
  - `[MST skill={subskill} step=returned return_to={parent_skill}/{step_number}]`

## 에러 처리

디버그와 동일 패턴; 과반 미완료 시 Claude 결과 기반으로 보완 종합합니다.
