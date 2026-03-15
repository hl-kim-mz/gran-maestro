#!/usr/bin/env bash
set -euo pipefail

# Stop hook — 콜스택 depth 기반 판단 + 기존 패턴 매칭 보조
# 1계층: 콜스택 depth >= 2 → block (부모 스킬로 복귀 강제)
# 2계층: 텍스트 패턴 매칭 fallback (스택 파일 미존재/오류 시)

STACK_FILE="/tmp/mst-call-stack.json"
COUNTER_FILE="/tmp/mst-stop-hook-count"
DEBUG_LOG_FILE="/tmp/mst-hook-debug.log"

MAX_BLOCKS="${MST_MAX_BLOCKS:-3}"
if ! [[ "$MAX_BLOCKS" =~ ^[0-9]+$ ]] || [ "$MAX_BLOCKS" -lt 1 ]; then
  MAX_BLOCKS=3
fi

FRAME_TTL="${MST_FRAME_TTL:-600}"
if ! [[ "$FRAME_TTL" =~ ^[0-9]+$ ]] || [ "$FRAME_TTL" -lt 0 ]; then
  FRAME_TTL=600
fi

last_assistant_message="$(cat || true)"
TTL_REMOVED=0

# --- 유틸리티 함수 ---

debug_log() {
  [ "${MST_DEBUG:-0}" = "1" ] || return 0
  local event="${1:-event}"
  shift || true
  local detail="${*:-}"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
  printf '%s event=%s %s\n' "$ts" "$event" "$detail" >> "$DEBUG_LOG_FILE" 2>/dev/null || true
}

contains_pattern() {
  local pattern="$1"
  printf '%s' "$last_assistant_message" | grep -Eiq -- "$pattern"
}

read_stack_length() {
  local file="$1"
  local length
  length="$(python3 -c 'import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []
if not isinstance(data, list):
    data = []
print(len(data))
' "$file" 2>/dev/null || true)"
  if [[ "$length" =~ ^[0-9]+$ ]]; then
    printf '%s' "$length"
  else
    printf '0'
  fi
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
  local reason="${1:-allow}"
  local stack_depth="${2:-0}"
  write_counter 0
  debug_log "allow" "reason=$reason stack_depth=$stack_depth ttl_removed=$TTL_REMOVED max_blocks=$MAX_BLOCKS"
  exit 0
}

cleanup_expired_frames() {
  [ -f "$STACK_FILE" ] || return 0

  local before after tmp_file
  before="$(read_stack_length "$STACK_FILE")"
  tmp_file="${STACK_FILE}.tmp"

  if python3 -c 'import json, sys
from datetime import datetime, timezone

path = sys.argv[1]
ttl = int(sys.argv[2])
now = datetime.now(timezone.utc)

try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []

if not isinstance(data, list):
    data = []

kept = []
for frame in data:
    if not isinstance(frame, dict):
        kept.append(frame)
        continue
    pushed_at = frame.get("pushed_at")
    if not isinstance(pushed_at, str):
        kept.append(frame)
        continue
    try:
        dt = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age = (now - dt.astimezone(timezone.utc)).total_seconds()
        if age > ttl:
            continue
    except Exception:
        pass
    kept.append(frame)

print(json.dumps(kept, ensure_ascii=True))
' "$STACK_FILE" "$FRAME_TTL" > "$tmp_file" 2>/dev/null; then
    mv "$tmp_file" "$STACK_FILE" || true
  else
    rm -f "$tmp_file"
    return 0
  fi

  after="$(read_stack_length "$STACK_FILE")"
  if [[ "$before" =~ ^[0-9]+$ ]] && [[ "$after" =~ ^[0-9]+$ ]] && [ "$before" -gt "$after" ]; then
    TTL_REMOVED=$((before - after))
    echo "[mst-continuation-guard] warning: removed stale frames ttl=${FRAME_TTL}s removed=$TTL_REMOVED" >&2
  fi
}

# --- 1. 명시적 허용 패턴 (최우선 — 스택 무관) ---

if contains_pattern 'AskUserQuestion|"tool_name"[[:space:]]*:[[:space:]]*"AskUserQuestion"'; then
  reset_counter_and_allow "explicit_allow_pattern:ask_user_question" 0
fi

if contains_pattern 'MST_STOP_ALLOW|MST_ALLOW_STOP|EXPLICIT_STOP|종료 요청|중단 요청|작업 종료|workflow complete|final answer delivered|user requested stop'; then
  reset_counter_and_allow "explicit_allow_pattern:stop_signal" 0
fi

# --- 2. 콜스택 기반 판단 (핵심 로직) ---

STACK_DEPTH=0
if [ -f "$STACK_FILE" ]; then
  cleanup_expired_frames
  STACK_DEPTH="$(read_stack_length "$STACK_FILE")"
fi

# depth <= 1: 최상위 스킬이거나 스택 비어있음 → Stop 허용
if [ "$STACK_DEPTH" -le 1 ]; then
  reset_counter_and_allow "stack_depth_le_1" "$STACK_DEPTH"
fi

# depth >= 2: 서브스킬 내부이므로 부모로 돌아가야 함 → block 시도

# --- 3. 안전장치: 연속 block 횟수 제한 (무한 루프 방지) ---

counter="$(read_counter)"
counter=$((counter + 1))

if [ "$counter" -gt "$MAX_BLOCKS" ]; then
  write_counter 0
  echo "[mst-continuation-guard] warning: consecutive block limit reached ($MAX_BLOCKS), forcing allow. stack_depth=$STACK_DEPTH" >&2
  debug_log "allow" "reason=consecutive_block_limit stack_depth=$STACK_DEPTH ttl_removed=$TTL_REMOVED max_blocks=$MAX_BLOCKS"
  exit 0
fi

write_counter "$counter"

# 부모 스킬 정보 추출
PARENT_SKILL="$(python3 -c 'import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []
if isinstance(data, list) and len(data) >= 2 and isinstance(data[-2], dict):
    print(data[-2].get("skill") or "unknown")
else:
    print("unknown")
' "$STACK_FILE" 2>/dev/null || true)"
CURRENT_SKILL="$(python3 -c 'import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []
if isinstance(data, list) and len(data) >= 1 and isinstance(data[-1], dict):
    print(data[-1].get("skill") or "unknown")
else:
    print("unknown")
' "$STACK_FILE" 2>/dev/null || true)"

debug_log "block" "reason=stack_depth stack_depth=$STACK_DEPTH current=$CURRENT_SKILL parent=$PARENT_SKILL counter=$counter max_blocks=$MAX_BLOCKS ttl_removed=$TTL_REMOVED"

printf '%s\n' "{\"decision\":\"block\",\"reason\":\"Call stack depth=$STACK_DEPTH ($CURRENT_SKILL inside $PARENT_SKILL). Return to parent skill $PARENT_SKILL and continue with the next step. Do not stop — emit the next tool call immediately.\"}"
