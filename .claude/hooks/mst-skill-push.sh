#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook — Skill(mst:*) 호출 시 콜스택에 push
# stdin: Claude Code PreToolUse JSON (tool_name, tool_input 등)

STACK_FILE="/tmp/mst-call-stack-${PPID}.json"
PENDING_FILE="/tmp/mst-pending-continuation-${PPID}"
NEXT_ACTION_FILE="/tmp/mst-next-action-${PPID}.json"
NEXT_ACTION_COUNTER_FILE="/tmp/mst-next-action-count-${PPID}"
NEXT_ACTION_STATE_FILE="/tmp/mst-next-action-state-${PPID}"
DEBUG_LOG_FILE="/tmp/mst-hook-debug-${PPID}.log"
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

read_next_action_marker_meta() {
  [ -f "$NEXT_ACTION_FILE" ] || {
    printf '\t\t\n'
    return 0
  }
  python3 -c 'import json, sys
path = sys.argv[1]
project_root = ""
source_id = ""
expected_skill = ""

try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    print("\t\t")
    sys.exit(0)

if isinstance(data, dict):
    pr = data.get("project_root")
    sid = data.get("source_id")
    es = data.get("expected_skill")
    if isinstance(pr, str) and pr.strip():
        project_root = pr.strip()
    if isinstance(sid, str) and sid.strip():
        source_id = sid.strip()
    if isinstance(es, str) and es.strip():
        expected_skill = es.strip()

print(f"{project_root}\t{source_id}\t{expected_skill}")
' "$NEXT_ACTION_FILE" 2>/dev/null || printf '\t\t\n'
}

clear_next_action_on_request_push() {
  local marker_info project_root source_id expected_skill
  marker_info="$(read_next_action_marker_meta)"
  project_root="$(printf '%s' "$marker_info" | cut -f1)"
  source_id="$(printf '%s' "$marker_info" | cut -f2)"
  expected_skill="$(printf '%s' "$marker_info" | cut -f3)"

  # 1) /tmp marker + 관련 카운터/상태 정리 (authoritative clear)
  rm -f \
    "$NEXT_ACTION_FILE" \
    "${NEXT_ACTION_FILE}.tmp" \
    "$NEXT_ACTION_COUNTER_FILE" \
    "${NEXT_ACTION_COUNTER_FILE}.tmp" \
    "$NEXT_ACTION_STATE_FILE" \
    "${NEXT_ACTION_STATE_FILE}.tmp" \
    2>/dev/null || true

  debug_log "next_action_clear_tmp" "skill=mst:request expected_skill=${expected_skill:-unknown} source_id=${source_id:-unknown} project_root=${project_root:-unknown}"

  # 2) project_root를 사용해 plan.json next_action 클리어 (순차 best-effort)
  [ -n "$project_root" ] || {
    debug_log "next_action_clear_plan_skip" "reason=missing_project_root source_id=${source_id:-unknown}"
    return 0
  }

  local clear_info clear_status clear_count clear_scanned
  clear_info="$(python3 -c 'import glob, json, os, sys

project_root = sys.argv[1]
source_id = sys.argv[2] if len(sys.argv) > 2 else ""

if not project_root or not os.path.isdir(project_root):
    print("no_project_root\t0\t0")
    sys.exit(0)

plans_root = os.path.join(project_root, ".gran-maestro", "plans")
if not os.path.isdir(plans_root):
    print("no_plans_root\t0\t0")
    sys.exit(0)

targets = []
if source_id:
    hinted = os.path.join(plans_root, source_id, "plan.json")
    if os.path.isfile(hinted):
        targets.append(hinted)
if not targets:
    targets = sorted(glob.glob(os.path.join(plans_root, "PLN-*", "plan.json")), reverse=True)

cleared = 0
scanned = 0
for path in targets:
    scanned += 1
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        continue
    if not isinstance(data, dict):
        continue
    if "next_action" not in data:
        continue
    data.pop("next_action", None)
    tmp_path = f"{path}.tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as wf:
            json.dump(data, wf, ensure_ascii=False, indent=2)
            wf.write("\n")
        os.replace(tmp_path, path)
        cleared += 1
    except Exception:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        continue

print(f"ok\t{cleared}\t{scanned}")
' "$project_root" "$source_id" 2>/dev/null || echo "error\t0\t0")"

  clear_status="$(printf '%s' "$clear_info" | cut -f1)"
  clear_count="$(printf '%s' "$clear_info" | cut -f2)"
  clear_scanned="$(printf '%s' "$clear_info" | cut -f3)"
  debug_log "next_action_clear_plan" "status=$clear_status cleared=$clear_count scanned=$clear_scanned source_id=${source_id:-unknown} project_root=$project_root"
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

# Skill 호출은 부모 복귀 이후 "다음 행동 진행" 신호로 간주하므로 pending 플래그 제거
rm -f "$PENDING_FILE" "${PENDING_FILE}.tmp" 2>/dev/null || true

# tool_input.skill + args에서 스킬명 및 return_step 힌트 추출
SKILL_INFO="$(printf '%s' "$INPUT" | python3 -c 'import json, sys, re
try:
    data = json.loads(sys.stdin.read() or "{}")
    tool_input = data.get("tool_input") or {}
    if not isinstance(tool_input, dict):
        tool_input = {}
    skill = tool_input.get("skill") or ""
    args = tool_input.get("args") or ""
    # --trace 패턴에서 현재 Step 힌트 추론: --trace "Step 5: ..." 또는 args 내 Step N 패턴
    return_step = ""
    if isinstance(args, str):
        m = re.search(r"--trace\s+[\"'"'"']?([^\"'"'"']+)", args)
        if m:
            return_step = m.group(1).strip()
        elif not return_step:
            m = re.search(r"(Step\s+\d+[^,;]*)", args, re.IGNORECASE)
            if m:
                return_step = m.group(1).strip()
    print(f"{skill}\t{return_step}")
except Exception:
    print("\t")
' 2>/dev/null || true)"
SKILL_NAME="$(printf '%s' "$SKILL_INFO" | cut -f1)"
RETURN_STEP_HINT="$(printf '%s' "$SKILL_INFO" | cut -f2)"
if [ -z "$SKILL_NAME" ]; then
  exit 0
fi

# mst: 접두사가 있는 스킬만 대상
case "$SKILL_NAME" in
  mst:*) ;;
  *) exit 0 ;;
esac

if [ "$SKILL_NAME" = "mst:request" ]; then
  clear_next_action_on_request_push
fi

# --- mst:plan 진입 시 Hook 버전 게이트 (세션당 1회) ---
if [ "$SKILL_NAME" = "mst:plan" ]; then
  HOOK_CHECK_DONE="/tmp/mst-hook-check-done-${PPID}"
  if [ ! -f "$HOOK_CHECK_DONE" ]; then
    touch "$HOOK_CHECK_DONE"
    PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
    if [ -n "$PROJECT_ROOT" ]; then
      HOOK_VER_FILE="$PROJECT_ROOT/.claude/hooks/.mst-hook-version"
      HOOK_VER=""
      [ -f "$HOOK_VER_FILE" ] && HOOK_VER="$(tr -d '[:space:]' < "$HOOK_VER_FILE" 2>/dev/null || true)"

      PLUGIN_VER="$(python3 -c 'import glob,json,os
home=os.path.expanduser("~")
for p in sorted(glob.glob(os.path.join(home,".claude/plugins/cache/gran-maestro/mst/*/plugin.json")),reverse=True):
    try:
        with open(p) as f: print(json.load(f).get("version","")); break
    except: continue
else: print("")
' 2>/dev/null || true)"

      if [ -n "$PLUGIN_VER" ] && [ "$PLUGIN_VER" != "$HOOK_VER" ]; then
        HOOK_DISPLAY="${HOOK_VER:-미설치}"
        printf '{"decision":"block","reason":"[Hook 업데이트 필요] hook: v%s → plugin: v%s. AskUserQuestion으로 선택지를 제시하세요: (1) /mst:on 실행하여 Hook 갱신 후 plan 재실행 (2) 이대로 plan 진행"}\n' "$HOOK_DISPLAY" "$PLUGIN_VER"
        exit 0
      fi
    fi
  fi
fi

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
return_step = sys.argv[5] if len(sys.argv) > 5 else ""

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

frame_obj = {"skill": skill, "pushed_at": timestamp}
if return_step:
    frame_obj["return_step"] = return_step
data.append(frame_obj)
if len(data) > max_depth:
    data = data[-max_depth:]

print(json.dumps(data, ensure_ascii=True))
' "$STACK_FILE" "$SKILL_NAME" "$TIMESTAMP" "$MAX_DEPTH" "$RETURN_STEP_HINT" > "${STACK_FILE}.tmp" 2>/dev/null; then
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

debug_log "push" "skill=$SKILL_NAME depth=$POST_LEN max_depth=$MAX_DEPTH trimmed=$TRIMMED return_step=$RETURN_STEP_HINT"

# PreToolUse는 allow 반환 (실행을 차단하지 않음)
exit 0
