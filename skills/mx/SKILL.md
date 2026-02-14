---
name: maestro:codex
description: "Codex CLI를 직접 호출하여 코드 작업을 실행합니다"
user-invocable: true
argument-hint: "<프롬프트> [--dir <경로>] [--json]"
aliases: ["mx"]
---

# maestro:codex

Gran Maestro 워크플로우 외부에서 Codex CLI를 직접 호출합니다.
결과는 터미널에 출력되며, 선택적으로 파일로 저장 가능합니다.
이 스킬은 모드에 관계없이 사용 가능합니다 (OMC 모드, Maestro 모드 모두).

## 실행 프로토콜

1. `$ARGUMENTS`에서 프롬프트와 옵션 파싱
2. 작업 디렉토리 결정 (--dir 또는 현재 디렉토리)
3. Codex CLI 실행:
   ```bash
   codex exec --full-auto -C {working_dir} "{prompt}"
   ```
4. 실행 결과를 사용자에게 표시

## 옵션

- `--dir <path>`: 작업 디렉토리 지정 (기본: 현재 디렉토리)
- `--json`: JSON 형태로 구조화된 출력
- `--ephemeral`: 상태를 보존하지 않는 일회성 실행
- `--output <file>`: 결과를 파일로 저장

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
/mx "이 프로젝트의 아키텍처를 분석해줘"
/mx --dir ./src "이 모듈의 의존성을 리팩토링해줘"
/mx --json "package.json 의존성 분석"
/mx --output analysis.md "전체 코드 품질 리포트 작성"
```
