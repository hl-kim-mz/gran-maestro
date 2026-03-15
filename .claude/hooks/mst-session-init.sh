#!/usr/bin/env bash
set -euo pipefail

# SessionStart hook — 새 세션 시작 시 콜스택 + Stop 카운터 초기화
# 이전 세션에서 강제 중단(Ctrl+C, 세션 종료) 시 잔여 스택/카운터 정리

STACK_FILE="/tmp/mst-call-stack.json"
COUNTER_FILE="/tmp/mst-stop-hook-count"

# 콜스택 초기화 (빈 배열)
printf '[]' > "$STACK_FILE"

# Stop hook 연속 block 카운터 초기화
printf '0' > "$COUNTER_FILE"

exit 0
