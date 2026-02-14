---
name: maestro:list
description: "모든 요청 및 태스크의 현황 목록을 표시합니다"
user-invocable: true
argument-hint: "[--all | --active | --completed]"
aliases: ["ml"]
---

# maestro:list

모든 Gran Maestro 요청과 태스크의 현황을 터미널에 표시합니다.

## 실행 프로토콜

1. `.gran-maestro/requests/` 디렉토리 스캔
2. 각 `request.json` 읽기
3. 상태별 분류 및 포맷팅

## 출력 형식

```
Gran Maestro — 요청 현황
═══════════════════════════════════════

REQ-001  "사용자 인증 기능 추가"
  Phase: 2 (외주 실행)  |  Tasks: 3  |  진행: 1/3
  ├── 01: [codex] 실행 중 — JWT 미들웨어 구현
  ├── 02: [gemini] 대기 — 로그인 UI 구현
  └── 03: [codex] 완료 — 유저 모델 테스트

REQ-002  "로그인 페이지 디자인"
  Phase: 1 (PM 분석)  |  blockedBy: REQ-001-02
  └── 스펙 작성 중...

═══════════════════════════════════════
활성: 2  |  완료: 0  |  전체: 2
```

## 옵션

- `--all`: 완료된 요청 포함 전체 목록
- `--active`: 활성 요청만 (기본값)
- `--completed`: 완료된 요청만

## 한국어 트리거

- "현황", "상태 보여줘", "목록"
