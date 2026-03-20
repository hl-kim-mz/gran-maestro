import json
import subprocess
from argparse import Namespace
from pathlib import Path

import pytest

from scripts import mst


def _write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _seed_request(
    base_dir: Path,
    req_id: str,
    *,
    phase: int,
    status: str,
    blocked_by=None,
) -> None:
    _write_json(
        base_dir / "requests" / req_id / "request.json",
        {
            "id": req_id,
            "current_phase": phase,
            "status": status,
            "dependencies": {
                "blockedBy": blocked_by or [],
                "blocks": [],
            },
        },
    )


def _seed_plan(base_dir: Path, pln_id: str, linked_requests) -> None:
    _write_json(
        base_dir / "plans" / pln_id / "plan.json",
        {
            "id": pln_id,
            "linked_requests": linked_requests,
        },
    )


def test_next_action():
    # Arrange
    mapping = [
        ((1, "phase1_analysis"), "mst:approve"),
        ((1, "spec_ready"), "mst:approve"),
        ((2, "phase2_execution"), "mst:approve"),
        ((3, "phase3_review"), "mst:approve"),
        ((5, "phase5_pending"), "mst:accept"),
        ((2, "done"), None),
        ((2, "completed"), None),
        ((2, "accepted"), None),
        ((2, "cancelled"), None),
    ]

    # Act / Assert
    for (phase, status), expected in mapping:
        assert mst.next_action(phase, status) == expected


def test_stall_detection(tmp_path, monkeypatch, capsys):
    # Arrange
    base_dir = tmp_path / ".gran-maestro"
    _seed_request(base_dir, "REQ-001", phase=2, status="phase2_execution")
    monkeypatch.setattr(mst, "BASE_DIR", base_dir)
    calls = []

    def fake_run(cmd, capture_output, text, cwd):
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(mst.subprocess, "run", fake_run)

    # Act
    return_code = mst.cmd_workflow_run(Namespace(target="REQ-001"))
    captured = capsys.readouterr()

    # Assert
    assert return_code == 1
    assert len(calls) == 3
    assert "[workflow] Stalled: (phase=2, status=phase2_execution) unchanged for 3 iterations" in captured.err


@pytest.mark.parametrize(
    ("phase", "status"),
    [(5, "done"), (5, "completed"), (5, "accepted"), (2, "cancelled")],
)
def test_exit_conditions(tmp_path, monkeypatch, phase, status):
    # Arrange
    base_dir = tmp_path / ".gran-maestro"
    _seed_request(base_dir, "REQ-010", phase=phase, status=status)
    monkeypatch.setattr(mst, "BASE_DIR", base_dir)

    def fail_run(*_args, **_kwargs):
        raise AssertionError("subprocess.run should not be called for terminal states")

    monkeypatch.setattr(mst.subprocess, "run", fail_run)

    # Act
    return_code = mst.cmd_workflow_run(Namespace(target="REQ-010"))

    # Assert
    assert return_code == 0


def test_pln_mode(tmp_path, monkeypatch):
    # Arrange
    base_dir = tmp_path / ".gran-maestro"
    _seed_plan(base_dir, "PLN-001", [])
    monkeypatch.setattr(mst, "BASE_DIR", base_dir)
    calls = []

    def fake_run(cmd, capture_output, text, cwd):
        calls.append(cmd)
        if cmd[1] == "/mst:request":
            _seed_request(base_dir, "REQ-200", phase=2, status="phase2_execution")
            _seed_plan(base_dir, "PLN-001", ["REQ-200"])
        elif cmd[1] == "/mst:approve":
            _seed_request(base_dir, cmd[2], phase=5, status="phase5_pending")
        elif cmd[1] == "/mst:accept":
            _seed_request(base_dir, cmd[2], phase=5, status="done")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(mst.subprocess, "run", fake_run)

    # Act
    return_code = mst.cmd_workflow_run(Namespace(target="PLN-001"))

    # Assert
    assert return_code == 0
    assert calls[0] == ["claude", "/mst:request", "--plan", "PLN-001", "-a"]
    assert [cmd[1] for cmd in calls if cmd[1] in {"/mst:approve", "/mst:accept"}] == [
        "/mst:approve",
        "/mst:accept",
    ]


def test_dag_chain(tmp_path, monkeypatch):
    # Arrange
    base_dir = tmp_path / ".gran-maestro"
    _seed_plan(base_dir, "PLN-010", ["REQ-302", "REQ-301"])
    _seed_request(base_dir, "REQ-301", phase=2, status="phase2_execution", blocked_by=[])
    _seed_request(base_dir, "REQ-302", phase=2, status="phase2_execution", blocked_by=["REQ-301"])
    monkeypatch.setattr(mst, "BASE_DIR", base_dir)
    calls = []

    def fake_run(cmd, capture_output, text, cwd):
        calls.append(cmd)
        if cmd[1] == "/mst:approve":
            _seed_request(base_dir, cmd[2], phase=5, status="phase5_pending")
        elif cmd[1] == "/mst:accept":
            _seed_request(base_dir, cmd[2], phase=5, status="done")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(mst.subprocess, "run", fake_run)

    # Act
    return_code = mst.cmd_workflow_run(Namespace(target="PLN-010"))

    # Assert
    assert return_code == 0
    approve_order = [cmd[2] for cmd in calls if cmd[1] == "/mst:approve"]
    assert approve_order == ["REQ-301", "REQ-302"]


def test_max_iterations(tmp_path, monkeypatch, capsys):
    # Arrange
    base_dir = tmp_path / ".gran-maestro"
    req_id = "REQ-777"
    req_path = base_dir / "requests" / req_id / "request.json"
    _seed_request(base_dir, req_id, phase=2, status="phase2_execution")
    monkeypatch.setattr(mst, "BASE_DIR", base_dir)
    calls = []
    toggle = {"value": False}

    def fake_run(cmd, capture_output, text, cwd):
        calls.append(cmd)
        data = json.loads(req_path.read_text(encoding="utf-8"))
        if toggle["value"]:
            data["current_phase"] = 2
            data["status"] = "phase2_execution"
        else:
            data["current_phase"] = 3
            data["status"] = "phase3_review"
        toggle["value"] = not toggle["value"]
        req_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(mst.subprocess, "run", fake_run)

    # Act
    return_code = mst.cmd_workflow_run(Namespace(target=req_id))
    captured = capsys.readouterr()

    # Assert
    assert return_code == 1
    assert len(calls) == mst.WORKFLOW_MAX_ITERATIONS
    assert f"[workflow] Max iterations ({mst.WORKFLOW_MAX_ITERATIONS}) reached" in captured.err
