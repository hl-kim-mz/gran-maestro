#!/usr/bin/env bash
set -euo pipefail

INSTALLED_JSON="$HOME/.claude/plugins/installed_plugins.json"

CACHE=$(python3 - "$INSTALLED_JSON" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
entries = d.get("plugins", {}).get("mst@gran-maestro") or []
path = (entries[0] if entries else {}).get("installPath", "")
if not path:
    raise SystemExit("installPath를 찾을 수 없습니다")
print(path.rstrip("/"))
PY
)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.gran-maestro' \
  "$REPO_ROOT/" "$CACHE/"

echo "✓ Synced → $CACHE"
echo "  Claude 세션을 재시작해야 변경사항이 반영됩니다."
