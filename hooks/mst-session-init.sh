#!/usr/bin/env bash
set -euo pipefail

# SessionStart hook — 새 세션 시작 시 콜스택 + Stop 카운터 + pending 플래그 초기화
# 이전 세션에서 강제 중단(Ctrl+C, 세션 종료) 시 잔여 상태 정리

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MST_TMP="${PROJECT_ROOT}/.gran-maestro/tmp"
mkdir -p "$MST_TMP"

STACK_FILE="${MST_TMP}/mst-call-stack-${PPID}.json"
COUNTER_FILE="${MST_TMP}/mst-stop-hook-count-${PPID}"
PENDING_FILE="${MST_TMP}/mst-pending-continuation-${PPID}"
NEXT_ACTION_FILE="${MST_TMP}/mst-next-action-${PPID}.json"
NEXT_ACTION_COUNTER_FILE="${MST_TMP}/mst-next-action-count-${PPID}"
NEXT_ACTION_STATE_FILE="${MST_TMP}/mst-next-action-state-${PPID}"

# 콜스택 초기화 (빈 배열)
printf '[]' > "$STACK_FILE"

# Stop hook 연속 block 카운터 초기화
printf '0' > "$COUNTER_FILE"

# pending continuation 플래그 및 임시 파일 초기화
rm -f "$NEXT_ACTION_FILE" "${NEXT_ACTION_FILE}.tmp" 2>/dev/null || true
rm -f "$PENDING_FILE" "${PENDING_FILE}.tmp" "${STACK_FILE}.tmp" "${COUNTER_FILE}.tmp" "$NEXT_ACTION_COUNTER_FILE" "${NEXT_ACTION_COUNTER_FILE}.tmp" "$NEXT_ACTION_STATE_FILE" "${NEXT_ACTION_STATE_FILE}.tmp" 2>/dev/null || true

exit 0
