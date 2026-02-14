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
1.5. `--dir` 지정 시 해당 디렉토리 존재 여부 확인. 없으면 에러 메시지 출력 후 중단
2. 작업 디렉토리 결정 (--dir 또는 현재 디렉토리). 경로가 상대경로이면 현재 작업 디렉토리(cwd) 기준으로 해석
3. Codex CLI 실행:
   ```bash
   codex exec --full-auto -C {working_dir} "{prompt}"
   ```
4. 실행 결과를 사용자에게 표시
5. `--output <file>` 지정 시 결과를 해당 경로에 저장 (절대 경로 권장, 상대경로는 cwd 기준)

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

## 주의사항

- Codex CLI가 설치되어 있어야 합니다 (`codex --version`으로 확인)
- `--full-auto` 모드는 파일 수정 권한이 있으므로 주의하여 사용
- Gran Maestro 워크플로우 외부에서 독립 실행되며, 요청 상태에 영향을 주지 않음

## 한국어 트리거

- "코덱스 실행", "코덱스로", "코드 작업"
