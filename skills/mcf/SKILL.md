---
name: maestro:config
description: "Gran Maestro 설정을 조회하거나 변경합니다"
user-invocable: true
argument-hint: "[<key> [<value>]]"
aliases: ["mcf"]
---

# maestro:config

Gran Maestro의 설정을 조회하거나 변경합니다.
`.gran-maestro/config.json` 파일을 관리합니다.

## 실행 프로토콜

1. 인자 없이 호출 시: 전체 설정 표시
2. key만 지정 시: 해당 설정값 표시
3. key와 value 모두 지정 시: 설정 변경

## 설정 항목

| 키 | 설명 | 기본값 | 타입 |
|----|------|--------|------|
| `workflow.max_feedback_rounds` | 최대 피드백 반복 횟수 | `5` | number |
| `workflow.auto_approve_spec` | 스펙 자동 승인 여부 | `false` | boolean |
| `workflow.default_agent` | 기본 실행 에이전트 | `codex-dev` | string |
| `server.port` | 대시보드 포트 | `3847` | number |
| `worktree.root_directory` | worktree 루트 경로 | `.gran-maestro/worktrees` | string |
| `notifications.terminal` | 터미널 알림 활성화 | `true` | boolean |
| `notifications.dashboard` | 대시보드 알림 활성화 | `true` | boolean |

## 예시

```
/mcf                                        # 전체 설정 표시
/mcf workflow.max_feedback_rounds            # 특정 설정 조회
/mcf workflow.max_feedback_rounds 3          # 최대 피드백 3회로 변경
/mcf workflow.auto_approve_spec true         # 스펙 자동 승인 활성화
/mcf workflow.default_agent gemini-dev       # 기본 에이전트를 Gemini로 변경
```
