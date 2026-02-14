---
name: maestro:priority
description: "태스크 우선순위 및 실행 순서를 변경합니다"
user-invocable: true
argument-hint: "<TASK-ID> --before <TASK-ID>"
aliases: ["mp"]
---

# maestro:priority

태스크의 우선순위나 실행 순서를 변경합니다.
PM이 자동 결정한 순서를 사용자가 오버라이드할 때 사용합니다.

## 실행 프로토콜

1. `$ARGUMENTS`에서 태스크 ID와 순서 지정 파싱
2. `request.json`의 `execution_order` 배열 변경
3. 종속성 충돌 확인 (blockedBy 관계 위반 시 경고)
4. 변경 결과를 사용자에게 표시

## 사용법

```
/mp REQ-001-02 --before REQ-001-01    # 02를 01보다 먼저 실행
/mp REQ-001-03 --after REQ-001-01     # 03을 01 다음에 실행
/mp REQ-001 --reorder 03,01,02        # 전체 순서 지정
```

## 출력 형식

```
실행 순서 변경됨:

REQ-001 태스크 실행 순서:
  1. REQ-001-02  로그인 UI 구현 [gemini]
  2. REQ-001-01  JWT 미들웨어 구현 [codex]
  3. REQ-001-03  유저 모델 테스트 [codex]

⚠️ 종속성 경고: REQ-001-01은 REQ-001-03에 의존합니다.
```

## 한국어 트리거

- "우선순위 변경", "순서 변경", "먼저 실행"
