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
    command: "codex exec --full-auto -C $(pwd) \"$(cat {absolute_path}/prompts/explore-{key}-prompt.md)\" > {absolute_path}/explore-{key}.md 2>&1; echo 'EXIT_CODE:'$? >> {absolute_path}/explore-{key}.md"
  )
  ```
- `provider: "gemini"`:
  ```
  Bash(
    run_in_background: true,
    command: "gemini -p \"$(cat {absolute_path}/prompts/explore-{key}-prompt.md)\" --model {config.models.gemini.default} --approval-mode yolo > {absolute_path}/explore-{key}.md 2>&1; echo 'EXIT_CODE:'$? >> {absolute_path}/explore-{key}.md"
  )
  ```

(참고: claude는 explore의 explorers에서 제외되므로 dispatch 블록 불필요)

### Step 3: Claude PM 종합

`explore-{key}.md` 읽어 `explore-report.md` 작성. 완료 안내: `plan에서 참조하려면: {PROJECT_ROOT}/.gran-maestro/explore/EXP-NNN/explore-report.md`

### Step 4: 사용자 표시

`explore-report.md` 내용을 출력합니다.

## 에러 처리

디버그와 동일 패턴; 과반 미완료 시 Claude 결과 기반으로 보완 종합합니다.
