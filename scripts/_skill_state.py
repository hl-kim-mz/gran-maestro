from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional


def timestamp_now() -> str:
    """Return current UTC ISO-8601 timestamp."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def snapshot_path(base_dir: Path, session_id: str = "default") -> Path:
    """Return snapshot.json path for a session."""
    return base_dir / "state" / session_id / "snapshot.json"


def load_snapshot(base_dir: Path, session_id: str = "default") -> Optional[Dict[str, Any]]:
    """Load snapshot JSON. Return None when absent or invalid."""
    path = snapshot_path(base_dir, session_id)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _atomic_write_json(path: Path, data: Dict[str, Any]) -> None:
    """Write JSON atomically via temp file and os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def _base_snapshot(session_id: str) -> Dict[str, Any]:
    return {
        "sessionId": session_id,
        "currentSkill": "",
        "currentStep": 0,
        "totalSteps": 0,
        "skillStack": [],
        "status": "idle",
        "updatedAt": timestamp_now(),
    }


def _normalize_stack(value: Any) -> list:
    if not isinstance(value, list):
        return []
    normalized = []
    for item in value:
        if not isinstance(item, dict):
            continue
        skill = item.get("skill")
        step = item.get("step")
        if isinstance(skill, str) and isinstance(step, int):
            normalized.append({"skill": skill, "step": step})
    return normalized


def _parse_return_to(value: Optional[str]) -> Optional[Dict[str, Any]]:
    if not value:
        return None
    skill, sep, step_text = value.partition("/")
    if not skill:
        return None
    parsed: Dict[str, Any] = {"skill": skill}
    if sep and step_text.isdigit():
        parsed["step"] = int(step_text)
    return parsed


def apply_event(
    snapshot: Optional[Dict[str, Any]],
    event: str,
    *,
    session_id: str = "default",
    skill: Optional[str] = None,
    step: Optional[int] = None,
    total: Optional[int] = None,
    return_to: Optional[str] = None,
) -> Dict[str, Any]:
    """Apply enter/commit/fail event and return new snapshot."""
    data = dict(snapshot or _base_snapshot(session_id))
    data["sessionId"] = session_id
    stack = _normalize_stack(data.get("skillStack"))

    if event == "enter":
        if not isinstance(skill, str) or not skill:
            raise ValueError("skill is required for enter")
        if not isinstance(step, int) or not isinstance(total, int):
            raise ValueError("step and total are required for enter")

        current_skill = data.get("currentSkill")
        current_step = data.get("currentStep")
        if isinstance(current_skill, str) and current_skill and isinstance(current_step, int):
            stack.append({"skill": current_skill, "step": current_step})

        data["currentSkill"] = skill
        data["currentStep"] = step
        data["totalSteps"] = total
        data["status"] = "active"

        parsed_return_to = _parse_return_to(return_to)
        if parsed_return_to:
            data["returnTo"] = parsed_return_to
        else:
            data.pop("returnTo", None)

    elif event in ("commit", "fail"):
        frame = stack.pop() if stack else None
        if isinstance(frame, dict):
            data["currentSkill"] = frame.get("skill", "")
            data["currentStep"] = frame.get("step", 0)
        data["status"] = "committed" if event == "commit" else "failed"
    else:
        raise ValueError(f"unknown event: {event}")

    data["skillStack"] = stack
    data["updatedAt"] = timestamp_now()
    return data


def enter(
    base_dir: Path,
    *,
    skill: str,
    step: int,
    total: int,
    session_id: str = "default",
    return_to: Optional[str] = None,
) -> Dict[str, Any]:
    snapshot = load_snapshot(base_dir, session_id)
    updated = apply_event(
        snapshot,
        "enter",
        session_id=session_id,
        skill=skill,
        step=step,
        total=total,
        return_to=return_to,
    )
    _atomic_write_json(snapshot_path(base_dir, session_id), updated)
    return updated


def commit(base_dir: Path, session_id: str = "default") -> Dict[str, Any]:
    snapshot = load_snapshot(base_dir, session_id)
    if snapshot is None:
        raise FileNotFoundError("snapshot not found")
    updated = apply_event(snapshot, "commit", session_id=session_id)
    _atomic_write_json(snapshot_path(base_dir, session_id), updated)
    return updated


def fail(base_dir: Path, session_id: str = "default") -> Dict[str, Any]:
    snapshot = load_snapshot(base_dir, session_id)
    if snapshot is None:
        raise FileNotFoundError("snapshot not found")
    updated = apply_event(snapshot, "fail", session_id=session_id)
    _atomic_write_json(snapshot_path(base_dir, session_id), updated)
    return updated


def set_snapshot(
    base_dir: Path,
    *,
    skill: str,
    step: int,
    total: int,
    return_to: Optional[str] = None,
    session_id: str = "default",
) -> Dict[str, Any]:
    """CLI helper for state set."""
    return enter(
        base_dir,
        skill=skill,
        step=step,
        total=total,
        return_to=return_to,
        session_id=session_id,
    )


def get_snapshot(base_dir: Path, session_id: str = "default") -> Optional[Dict[str, Any]]:
    return load_snapshot(base_dir, session_id)


def clear_snapshot(base_dir: Path, session_id: str = "default") -> None:
    path = snapshot_path(base_dir, session_id)
    if path.exists():
        path.unlink()


if __name__ == "__main__":
    raise SystemExit("Do not run directly. Use python3 scripts/mst.py state ...")
