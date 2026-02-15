---
name: codex
description: "Codex CLI를 호출하여 코드 작업을 실행합니다. 사용자가 '코덱스 실행', '코덱스로', '코드 작업'을 말하거나 /mst:codex를 호출할 때 사용. Gran Maestro 워크플로우 내 모든 Codex 호출은 이 스킬을 경유합니다."
user-invocable: true
argument-hint: "{프롬프트} [--dir {경로}] [--json]"
---

# maestro:codex

Codex CLI 호출의 단일 진입점입니다. Gran Maestro 워크플로우 내·외부 모든 Codex 호출이 이 스킬을 경유합니다.
결과는 터미널에 출력되며, 선택적으로 파일로 저장 가능합니다.
이 스킬은 모드에 관계없이 사용 가능합니다 (OMC 모드, Maestro 모드 모두).

## 실행 프로토콜

1. `$ARGUMENTS`에서 프롬프트와 옵션 파싱
2. `--dir` 지정 시 해당 디렉토리 존재 여부 확인. 없으면 에러 메시지 출력 후 중단
3. 작업 디렉토리 결정 (--dir 또는 현재 디렉토리). 경로가 상대경로이면 현재 작업 디렉토리(cwd) 기준으로 해석
4. Codex CLI 실행:
   ```bash
   codex exec --full-auto -C {working_dir} "{prompt}"
   ```
5. 실행 결과를 사용자에게 표시
6. `--output {file}` 지정 시 결과를 해당 경로에 저장 (절대 경로 권장, 상대경로는 cwd 기준)

## 옵션

- `--dir {path}`: 작업 디렉토리 지정 (기본: 현재 디렉토리)
- `--json`: JSON 형태로 구조화된 출력
- `--ephemeral`: 상태를 보존하지 않는 일회성 실행
- `--output {file}`: 결과를 파일로 저장

## CLI 커맨드

```bash
# 기본 실행
codex exec --full-auto -C {working_dir} "{prompt}"

# JSON 출력
codex exec --full-auto --json -C {working_dir} "{prompt}"

# 파일 출력
codex exec --full-auto -C {working_dir} -o {output_file} "{prompt}"
```

## 예시

```
/mst:codex "이 프로젝트의 아키텍처를 분석해줘"
/mst:codex --dir ./src "이 모듈의 의존성을 리팩토링해줘"
/mst:codex --json "package.json 의존성 분석"
/mst:codex --output analysis.md "전체 코드 품질 리포트 작성"
```

## 주의사항

- Codex CLI가 설치되어 있어야 합니다 (`codex --version`으로 확인)
- `--full-auto` 모드는 파일 수정 권한이 있으므로 주의하여 사용
- 워크플로우 외부에서 독립 호출 시 요청 상태에 영향을 주지 않음. 워크플로우 내에서는 PM Conductor가 컨텍스트를 전달

## 문제 해결

- "codex: command not found" → Codex CLI가 설치되지 않았습니다. `npm install -g @openai/codex`로 설치
- "작업 디렉토리를 찾을 수 없음" → `--dir` 경로가 존재하는지 확인. 상대경로는 현재 디렉토리 기준으로 해석됨
- "타임아웃" → 대규모 작업 시 `/mst:settings timeouts.cli_large_task_ms`로 타임아웃 값 확인. 필요 시 증가
- "실행 결과 없음" → Codex CLI의 `--json` 출력을 확인. 프롬프트가 명확한지 검토
