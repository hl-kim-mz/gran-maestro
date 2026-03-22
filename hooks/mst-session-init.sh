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
DEBUG_LOG_FILE="${MST_TMP}/mst-hook-debug-${PPID}.log"

debug_log() {
  [ "${MST_DEBUG:-0}" = "1" ] || return 0
  local event="${1:-event}"
  shift || true
  local detail="${*:-}"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%FT%TZ)"
  printf '%s event=%s %s\n' "$ts" "$event" "$detail" >> "$DEBUG_LOG_FILE" 2>/dev/null || true
}

clear_next_action_from_plan_json() {
  local clear_info clear_status clear_count clear_scanned clear_failed
  clear_info="$(python3 -c 'import glob, json, os, sys

project_root = sys.argv[1]

if not project_root or not os.path.isdir(project_root):
    print("no_project_root\t0\t0\t0")
    sys.exit(0)

plans_root = os.path.join(project_root, ".gran-maestro", "plans")
if not os.path.isdir(plans_root):
    print("no_plans_root\t0\t0\t0")
    sys.exit(0)

targets = sorted(glob.glob(os.path.join(plans_root, "PLN-*", "plan.json")), reverse=True)
cleared = 0
scanned = 0
failed = 0

for path in targets:
    scanned += 1
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        failed += 1
        continue

    if not isinstance(data, dict) or "next_action" not in data:
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
        failed += 1
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        continue

print(f"ok\t{cleared}\t{scanned}\t{failed}")
' "$PROJECT_ROOT" 2>/dev/null || echo "error\t0\t0\t1")"

  clear_status="$(printf '%s' "$clear_info" | cut -f1)"
  clear_count="$(printf '%s' "$clear_info" | cut -f2)"
  clear_scanned="$(printf '%s' "$clear_info" | cut -f3)"
  clear_failed="$(printf '%s' "$clear_info" | cut -f4)"

  if ! [[ "$clear_count" =~ ^[0-9]+$ ]]; then
    clear_count=0
  fi
  if ! [[ "$clear_scanned" =~ ^[0-9]+$ ]]; then
    clear_scanned=0
  fi
  if ! [[ "$clear_failed" =~ ^[0-9]+$ ]]; then
    clear_failed=0
  fi

  if [ "$clear_status" = "error" ] || [ "$clear_failed" -gt 0 ]; then
    echo "[mst-session-init] warning: failed to clear next_action from plan.json (status=$clear_status failed=$clear_failed scanned=$clear_scanned)." >&2
  fi

  debug_log "session_init_plan_cleanup" "status=$clear_status cleared=$clear_count scanned=$clear_scanned failed=$clear_failed project_root=$PROJECT_ROOT"
}

cleanup_session_stale_state() {
  # 1) /tmp marker 정리 (hook-check-done 제외)
  rm -f \
    "$NEXT_ACTION_FILE" \
    "${NEXT_ACTION_FILE}.tmp" \
    "$PENDING_FILE" \
    "${PENDING_FILE}.tmp" \
    "${MST_TMP}/mst-next-action-"*.json \
    "${MST_TMP}/mst-next-action-"*.json.tmp \
    "${MST_TMP}/mst-next-action-count-"* \
    "${MST_TMP}/mst-next-action-count-"*.tmp \
    "${MST_TMP}/mst-next-action-state-"* \
    "${MST_TMP}/mst-next-action-state-"*.tmp \
    "${MST_TMP}/mst-pending-continuation-"* \
    "${MST_TMP}/mst-pending-continuation-"*.tmp \
    "${STACK_FILE}.tmp" \
    "${COUNTER_FILE}.tmp" \
    "$NEXT_ACTION_COUNTER_FILE" \
    "${NEXT_ACTION_COUNTER_FILE}.tmp" \
    "$NEXT_ACTION_STATE_FILE" \
    "${NEXT_ACTION_STATE_FILE}.tmp" \
    2>/dev/null || true

  debug_log "session_init_tmp_cleanup" "tmp_dir=$MST_TMP"

  # 2) plan.json next_action 정리 (best-effort)
  clear_next_action_from_plan_json
}

# 콜스택 초기화 (빈 배열)
printf '[]' > "$STACK_FILE"

# Stop hook 연속 block 카운터 초기화
printf '0' > "$COUNTER_FILE"

# pending/next_action 잔여 마커 + plan.json next_action 정리
cleanup_session_stale_state

exit 0
