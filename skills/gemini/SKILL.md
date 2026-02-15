---
name: gemini
description: "Gemini CLI를 호출하여 대용량 컨텍스트 작업을 실행합니다. 사용자가 '제미니 실행', '제미니로', '대용량 분석'을 말하거나 /mst:gemini를 호출할 때 사용. Gran Maestro 워크플로우 내 모든 Gemini 호출은 이 스킬을 경유합니다."
user-invocable: true
argument-hint: "{프롬프트} [--files {패턴}] [--sandbox]"
---

# maestro:gemini

Gemini CLI 호출의 단일 진입점입니다. Gran Maestro 워크플로우 내·외부 모든 Gemini 호출이 이 스킬을 경유합니다.
대용량 문서, 프론트엔드, 넓은 컨텍스트가 필요한 작업에 적합합니다.
이 스킬은 모드에 관계없이 사용 가능합니다 (OMC 모드, Maestro 모드 모두).

## 실행 프로토콜

1. `$ARGUMENTS`에서 프롬프트와 옵션 파싱
2. 파일 패턴 지정 시 해당 파일들을 컨텍스트로 포함
3. `--files` 옵션의 패턴으로 파일 목록 확인. 매칭 파일이 없으면 경고 출력
4. Gemini CLI 실행:
   ```bash
   gemini -p "{prompt}" --approval-mode yolo
   ```
5. 실행 결과를 사용자에게 표시

## 옵션

- `--files {pattern}`: 컨텍스트에 포함할 파일 패턴 (예: `src/**/*.ts`)
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
/mst:gemini "전체 코드베이스의 문서를 생성해줘"
/mst:gemini --files src/**/*.ts "이 파일들의 API 문서를 작성해줘"
/mst:gemini "대규모 리팩토링 영향 분석"
/mst:gemini --sandbox "이 코드의 보안 취약점을 분석해줘"
```

## 주의사항

- Gemini CLI가 설치되어 있어야 합니다 (`gemini --version`으로 확인)
- Gemini의 컨텍스트 윈도우는 최대 1M 토큰입니다. 대용량 파일은 분할 처리를 권장합니다
- `--approval-mode yolo` / `-y` 옵션은 모든 작업을 자동 승인하므로 주의하여 사용
- 워크플로우 외부에서 독립 호출 시 요청 상태에 영향을 주지 않음. 워크플로우 내에서는 PM Conductor가 컨텍스트를 전달

## 문제 해결

- "gemini: command not found" → Gemini CLI가 설치되지 않았습니다. `npm install -g @google/gemini-cli`로 설치
- "파일 패턴 매칭 없음" → `--files` 패턴이 올바른지 확인. glob 패턴 사용 (예: `src/**/*.ts`)
- "컨텍스트 윈도우 초과" → 파일 수를 줄이거나 특정 디렉토리로 범위 한정. `--files` 패턴을 더 구체적으로 지정
- "샌드박스 실행 실패" → Docker가 설치/실행 중인지 확인. `--sandbox` 옵션은 Docker 기반 격리 환경을 사용
