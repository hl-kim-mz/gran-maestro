#!/usr/bin/env bash
set -euo pipefail

# Stop hook — 콜스택 depth 기반 판단 + 기존 패턴 매칭 보조
# 1계층: 콜스택 depth >= 2 → block (부모 스킬로 복귀 강제)
# 2계층: 텍스트 패턴 매칭 fallback (스택 파일 미존재/오류 시)

STACK_FILE="/tmp/mst-call-stack.json"
COUNTER_FILE="/tmp/mst-stop-hook-count"
MAX_BLOCKS=3

last_assistant_message="$(cat || true)"

# --- 유틸리티 함수 ---

contains_pattern() {
  local pattern="$1"
  printf '%s' "$last_assistant_message" | grep -Eiq -- "$pattern"
}

read_counter() {
  local current=0
  if [ -f "$COUNTER_FILE" ]; then
    local raw
    raw="$(cat "$COUNTER_FILE" 2>/dev/null || true)"
    if [[ "$raw" =~ ^[0-9]+$ ]]; then
      current="$raw"
    fi
  fi
  printf '%s' "$current"
}

write_counter() {
  local value="$1"
  printf '%s' "$value" > "$COUNTER_FILE"
}

reset_counter_and_allow() {
  write_counter 0
  exit 0
}

# --- 1. 명시적 허용 패턴 (최우선 — 스택 무관) ---

if contains_pattern 'AskUserQuestion|"tool_name"[[:space:]]*:[[:space:]]*"AskUserQuestion"'; then
  reset_counter_and_allow
fi

if contains_pattern 'MST_STOP_ALLOW|MST_ALLOW_STOP|EXPLICIT_STOP|종료 요청|중단 요청|작업 종료|workflow complete|final answer delivered|user requested stop'; then
  reset_counter_and_allow
fi

# --- 2. 콜스택 기반 판단 (핵심 로직) ---

STACK_DEPTH=0
if [ -f "$STACK_FILE" ]; then
  STACK_DEPTH="$(jq 'length' "$STACK_FILE" 2>/dev/null || echo 0)"
fi

# depth <= 1: 최상위 스킬이거나 스택 비어있음 → Stop 허용
if [ "$STACK_DEPTH" -le 1 ]; then
  reset_counter_and_allow
fi

# depth >= 2: 서브스킬 내부이므로 부모로 돌아가야 함 → block 시도

# --- 3. 안전장치: 연속 block 횟수 제한 (무한 루프 방지) ---

counter="$(read_counter)"
counter=$((counter + 1))

if [ "$counter" -gt "$MAX_BLOCKS" ]; then
  write_counter 0
  echo "[mst-continuation-guard] warning: consecutive block limit reached ($MAX_BLOCKS), forcing allow. stack_depth=$STACK_DEPTH" >&2
  exit 0
fi

write_counter "$counter"

# 부모 스킬 정보 추출
PARENT_SKILL="$(jq -r '.[-2].skill // "unknown"' "$STACK_FILE" 2>/dev/null || echo "unknown")"
CURRENT_SKILL="$(jq -r '.[-1].skill // "unknown"' "$STACK_FILE" 2>/dev/null || echo "unknown")"

printf '%s\n' "{\"decision\":\"block\",\"reason\":\"Call stack depth=$STACK_DEPTH ($CURRENT_SKILL inside $PARENT_SKILL). Return to parent skill $PARENT_SKILL and continue with the next step. Do not stop — emit the next tool call immediately.\"}"
