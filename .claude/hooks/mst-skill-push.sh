#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook — Skill(mst:*) 호출 시 콜스택에 push
# stdin: Claude Code PreToolUse JSON (tool_name, tool_input 등)

STACK_FILE="/tmp/mst-call-stack.json"
DEBUG_LOG_FILE="/tmp/mst-hook-debug.log"
INPUT="$(cat || true)"

debug_log() {
  [ "${MST_DEBUG:-0}" = "1" ] || return 0
  local event="${1:-event}"
  shift || true
  local detail="${*:-}"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
  printf '%s event=%s %s\n' "$ts" "$event" "$detail" >> "$DEBUG_LOG_FILE" 2>/dev/null || true
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

# tool_name이 "Skill"인지 확인
TOOL_NAME="$(printf '%s' "$INPUT" | python3 -c 'import json, sys
try:
    data = json.loads(sys.stdin.read() or "{}")
    print(data.get("tool_name") or "")
except Exception:
    print("")
' 2>/dev/null || true)"
if [ "$TOOL_NAME" != "Skill" ]; then
  exit 0
fi

# tool_input.skill에서 스킬명 추출
SKILL_NAME="$(printf '%s' "$INPUT" | python3 -c 'import json, sys
try:
    data = json.loads(sys.stdin.read() or "{}")
    tool_input = data.get("tool_input") or {}
    if isinstance(tool_input, dict):
        print(tool_input.get("skill") or "")
    else:
        print("")
except Exception:
    print("")
' 2>/dev/null || true)"
if [ -z "$SKILL_NAME" ]; then
  exit 0
fi

# mst: 접두사가 있는 스킬만 대상
case "$SKILL_NAME" in
  mst:*) ;;
  *) exit 0 ;;
esac

# 스택 파일 초기화 (없으면)
if [ ! -f "$STACK_FILE" ]; then
  printf '[]' > "$STACK_FILE"
fi

# push: 스킬명 + 타임스탬프
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
MAX_DEPTH="${MST_MAX_DEPTH:-10}"
if ! [[ "$MAX_DEPTH" =~ ^[0-9]+$ ]] || [ "$MAX_DEPTH" -lt 1 ]; then
  MAX_DEPTH=10
fi

PRE_LEN="$(read_stack_length "$STACK_FILE")"
if python3 -c 'import json, sys
path = sys.argv[1]
skill = sys.argv[2]
timestamp = sys.argv[3]
max_depth = int(sys.argv[4])

try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = []

if not isinstance(data, list):
    data = []

# Touch all existing frames to keep parents alive
for frame in data:
    if isinstance(frame, dict):
        frame["pushed_at"] = timestamp

data.append({"skill": skill, "pushed_at": timestamp})
if len(data) > max_depth:
    data = data[-max_depth:]

print(json.dumps(data, ensure_ascii=True))
' "$STACK_FILE" "$SKILL_NAME" "$TIMESTAMP" "$MAX_DEPTH" > "${STACK_FILE}.tmp" 2>/dev/null; then
  mv "${STACK_FILE}.tmp" "$STACK_FILE" || true
else
  rm -f "${STACK_FILE}.tmp"
  exit 0
fi

POST_LEN="$(read_stack_length "$STACK_FILE")"
TRIMMED=0
if [[ "$PRE_LEN" =~ ^[0-9]+$ ]] && [[ "$POST_LEN" =~ ^[0-9]+$ ]]; then
  EXPECTED_LEN=$((PRE_LEN + 1))
  if [ "$EXPECTED_LEN" -gt "$POST_LEN" ]; then
    TRIMMED=$((EXPECTED_LEN - POST_LEN))
  fi
fi

if [ "$TRIMMED" -gt 0 ]; then
  echo "[mst-skill-push] warning: stack depth exceeded max_depth=$MAX_DEPTH, trimmed_oldest=$TRIMMED" >&2
fi

debug_log "push" "skill=$SKILL_NAME depth=$POST_LEN max_depth=$MAX_DEPTH trimmed=$TRIMMED"

# PreToolUse는 allow 반환 (실행을 차단하지 않음)
exit 0
