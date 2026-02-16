#!/bin/bash
# maestro-status.sh — Query Gran Maestro mode status from the shell.
# Usage: maestro-status.sh [--json | -q | --field <name>]
# Exit codes: 0 = active, 1 = inactive or not found.

MODE_FILE=""
DIR="${MAESTRO_PROJECT_DIR:-$(pwd)}"
while [ "$DIR" != "/" ] && [ -n "$DIR" ]; do
  if [ -f "$DIR/.gran-maestro/mode.json" ]; then
    MODE_FILE="$DIR/.gran-maestro/mode.json"
    break
  fi
  DIR=$(dirname "$DIR")
done

if [ -z "$MODE_FILE" ]; then
  case "${1:-}" in
    --json) echo '{"active":false,"error":"mode.json not found"}' ;;
    -q|--quiet) ;;
    --field) echo "null" ;;
    *) echo "off" ;;
  esac
  exit 1
fi

ACTIVE=$(jq -r '.active // false' "$MODE_FILE" 2>/dev/null)

case "${1:-}" in
  --json)
    jq '.' "$MODE_FILE" 2>/dev/null
    ;;
  -q|--quiet)
    ;;
  --field)
    FIELD="${2:-active}"
    jq -r ".$FIELD // empty" "$MODE_FILE" 2>/dev/null
    ;;
  *)
    if [ "$ACTIVE" = "true" ]; then
      REQS=$(jq -r '.active_requests | length' "$MODE_FILE" 2>/dev/null)
      echo "on (requests: ${REQS:-0})"
    else
      echo "off"
    fi
    ;;
esac

[ "$ACTIVE" = "true" ] && exit 0 || exit 1
