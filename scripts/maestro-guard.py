#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def find_mode_file(cwd: str):
    path = Path(cwd or ".").resolve()
    while True:
        candidate = path / ".gran-maestro" / "mode.json"
        if candidate.is_file():
            return candidate

        parent = path.parent
        if parent == path:
            return None
        path = parent


def main():
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except Exception:
        return

    cwd = data.get("cwd", "")
    tool_name = data.get("tool_name", "")
    if not isinstance(cwd, str):
        cwd = ""
    if not isinstance(tool_name, str):
        tool_name = ""

    mode_file = find_mode_file(cwd)
    if mode_file is None:
        sys.exit(0)

    try:
        mode = json.loads(mode_file.read_text(encoding="utf-8"))
    except Exception:
        sys.exit(0)

    if mode.get("active") is not True:
        sys.exit(0)

    if tool_name == "Task":
        tool_input = data.get("tool_input", {})
        if not isinstance(tool_input, dict):
            sys.exit(0)

        subagent_type = tool_input.get("subagent_type", "")
        blocked = {
            "oh-my-claudecode:executor",
            "oh-my-claudecode:deep-executor",
            "oh-my-claudecode:verifier",
            "oh-my-claudecode:build-fixer",
        }
        if subagent_type in blocked:
            print(
                f'BLOCKED: Maestro 모드 활성 상태. 금지된 OMC 서브에이전트 호출입니다. '
                f'subagent_type="{subagent_type}"'
            )
            sys.exit(2)
        sys.exit(0)

    skill = "mst:gemini" if "gemini" in tool_name else "mst:codex"
    print(
        f'BLOCKED: Maestro 모드 활성 상태. OMC MCP 직접 호출 금지. '
        f'Skill(skill: "{skill}", args: "...")를 사용하세요.'
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
