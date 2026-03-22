#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MST_TMP="${PROJECT_ROOT}/.gran-maestro/tmp"
BACKUP_FILE="${HOME}/.claude/mst-statusline-backup.json"
INPUT_JSON="$(cat || true)"

DEFAULT_HUD_COMMAND="$(cat <<'CMD'
bash -c 'plugin_dir=$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/claude-hud/claude-hud/*/ 2>/dev/null | sort -t/ -k$(echo "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/cache/claude-hud/claude-hud/" | tr "/" "\n" | wc -l)n | tail -1); exec "/opt/homebrew/bin/node" "${plugin_dir}/dist/index.js"'
CMD
)"

resolve_hud_command() {
  if [ -f "$BACKUP_FILE" ]; then
    local restored
    restored="$(python3 -c 'import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    print("")
    sys.exit(0)

command = ""
if isinstance(data, dict):
    status_line = data.get("statusLine")
    if isinstance(status_line, dict):
        value = status_line.get("command")
        if isinstance(value, str):
            command = value
if command:
    print(command)
' "$BACKUP_FILE" 2>/dev/null || true)"
    if [ -n "$restored" ]; then
      if [[ "$restored" == *"mst-statusline"* ]]; then
        printf '%s' "$DEFAULT_HUD_COMMAND"
        return 0
      fi
      printf '%s' "$restored"
      return 0
    fi
  fi

  printf '%s' "$DEFAULT_HUD_COMMAND"
}

resolve_stack_file() {
  local by_ppid latest
  by_ppid="${MST_TMP}/mst-call-stack-${PPID}.json"
  if [ -f "$by_ppid" ]; then
    printf '%s' "$by_ppid"
    return 0
  fi

  latest="$(ls -1t "${MST_TMP}"/mst-call-stack-*.json 2>/dev/null | head -n 1 || true)"
  printf '%s' "$latest"
}

build_mst_line() {
  local stack_file="$1"
  python3 -c 'import json, re, sys
from datetime import datetime, timezone

path = sys.argv[1]

def parse_iso(ts: str):
    if not isinstance(ts, str) or not ts:
        return None
    normalized = ts.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

def format_elapsed(ts: str):
    started = parse_iso(ts)
    if started is None:
        return "0s"
    now = datetime.now(timezone.utc)
    total = int((now - started).total_seconds())
    if total < 0:
        total = 0
    if total < 60:
        return f"{total}s"
    if total < 3600:
        return f"{total // 60}m"
    if total < 86400:
        return f"{total // 3600}h"
    return f"{total // 86400}d"

def clean_skill(name):
    if not isinstance(name, str):
        return ""
    return re.sub(r"^mst:", "", name.split("\n", 1)[0].strip())

frames = []
if path:
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
            if isinstance(raw, list):
                frames = raw
    except Exception:
        frames = []

labels = []
context_id = ""

for frame in reversed(frames):
    if isinstance(frame, dict):
        candidate = frame.get("context_id")
        if isinstance(candidate, str) and candidate.strip():
            context_id = candidate.strip()
            break

for frame in frames:
    if not isinstance(frame, dict):
        continue
    skill = clean_skill(frame.get("skill"))
    if not skill:
        continue
    started_at = frame.get("started_at") or frame.get("pushed_at") or ""
    labels.append(f"{skill}({format_elapsed(started_at)})")

if not labels:
    print("MST idle")
    sys.exit(0)

line = " > ".join(labels)
if context_id:
    line += f" ({context_id})"
print(line)
' "$stack_file" 2>/dev/null || printf 'MST idle\n'
}

HUD_COMMAND="$(resolve_hud_command)"
HUD_OUTPUT="$(printf '%s' "$INPUT_JSON" | sh -c "$HUD_COMMAND" 2>/dev/null || true)"
STACK_FILE="$(resolve_stack_file)"
MST_LINE="$(build_mst_line "$STACK_FILE")"

if [ -n "$HUD_OUTPUT" ]; then
  printf '%s\n' "$HUD_OUTPUT"
fi
printf '%s\n' "$MST_LINE"
