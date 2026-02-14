---
name: maestro:gemini
description: "Gemini CLI를 직접 호출하여 대용량 컨텍스트 작업을 실행합니다"
user-invocable: true
argument-hint: "<프롬프트> [--files <패턴>] [--sandbox]"
aliases: ["mg"]
---

# maestro:gemini

Gran Maestro 워크플로우 외부에서 Gemini CLI를 직접 호출합니다.
대용량 문서, 프론트엔드, 넓은 컨텍스트가 필요한 작업에 적합합니다.
이 스킬은 모드에 관계없이 사용 가능합니다 (OMC 모드, Maestro 모드 모두).

## 실행 프로토콜

1. `$ARGUMENTS`에서 프롬프트와 옵션 파싱
2. 파일 패턴 지정 시 해당 파일들을 컨텍스트로 포함
3. Gemini CLI 실행:
   ```bash
   gemini -p "{prompt}" --approval-mode yolo
   ```
4. 실행 결과를 사용자에게 표시

## 옵션

- `--files <pattern>`: 컨텍스트에 포함할 파일 패턴 (예: `src/**/*.ts`)
- `--sandbox`: 샌드박스 환경에서 실행
- `-y`: 자동 승인 모드

## CLI 커맨드

```bash
# 기본 실행
gemini -p "{prompt}" --approval-mode yolo

# 자동 승인
gemini -p "{prompt}" -y

# 샌드박스
gemini -p "{prompt}" --sandbox
```

## 예시

```
/mg "전체 코드베이스의 문서를 생성해줘"
/mg --files src/**/*.ts "이 파일들의 API 문서를 작성해줘"
/mg "대규모 리팩토링 영향 분석"
/mg --sandbox "이 코드의 보안 취약점을 분석해줘"
```
