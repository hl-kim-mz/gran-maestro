#!/usr/bin/env bash
set -euo pipefail

COUNTER_FILE="/tmp/mst-stop-hook-count"
MAX_BLOCKS=3

last_assistant_message="$(cat || true)"

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

if contains_pattern 'AskUserQuestion|"tool_name"[[:space:]]*:[[:space:]]*"AskUserQuestion"'; then
  reset_counter_and_allow
fi

if contains_pattern 'MST_STOP_ALLOW|MST_ALLOW_STOP|EXPLICIT_STOP|종료 요청|중단 요청|작업 종료|workflow complete|final answer delivered|user requested stop'; then
  reset_counter_and_allow
fi

if ! contains_pattern 'step[[:space:]]*=[[:space:]]*returned|"step"[[:space:]]*:[[:space:]]*"returned"'; then
  reset_counter_and_allow
fi

if contains_pattern 'return_to[[:space:]]*=[[:space:]]*null|"return_to"[[:space:]]*:[[:space:]]*null|"return_to"[[:space:]]*:[[:space:]]*"null"'; then
  reset_counter_and_allow
fi

if ! contains_pattern 'return_to[[:space:]]*=[[:space:]]*[^][[:space:]]+|"return_to"[[:space:]]*:[[:space:]]*"[^"]+"'; then
  reset_counter_and_allow
fi

counter="$(read_counter)"
counter=$((counter + 1))

if [ "$counter" -gt "$MAX_BLOCKS" ]; then
  write_counter 0
  echo "[mst-continuation-guard] warning: consecutive block limit reached (3), allowing stop." >&2
  exit 0
fi

write_counter "$counter"
printf '%s\n' '{"decision":"block","reason":"Sub-skill returned with non-null return_to. Continue immediately: emit NEXT_ACTION and call the next tool in the same turn (text-only response is not allowed)."}'
