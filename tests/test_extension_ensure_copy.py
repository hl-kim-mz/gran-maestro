import json
import sys
from pathlib import Path

from scripts.mst import _ensure_copy_impl


def _make_extension(plugin_root: Path, version: str) -> None:
    extension_root = plugin_root / "extension"
    extension_root.mkdir(parents=True)
    (extension_root / "manifest.json").write_text(
        json.dumps({"version": version}), encoding="utf-8"
    )
    (extension_root / "asset.txt").write_text("source", encoding="utf-8")


def _make_home_extension(home_dir: Path, version: str, *, extra_file: str = "") -> Path:
    dst = home_dir / "chrome-extension"
    dst.mkdir(parents=True)
    (dst / "manifest.json").write_text(
        json.dumps({"version": version}), encoding="utf-8"
    )
    if extra_file:
        (dst / extra_file).write_text("existing", encoding="utf-8")
    return dst


def test_extension_ensure_copy_created(tmp_path, capsys):
    plugin_root = tmp_path / "plugin"
    plugin_root.mkdir()
    _make_extension(plugin_root, "1.0")
    home_dir = tmp_path / "home"

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()

    assert return_code == 0
    assert captured.out.strip() == "created"
    assert captured.err == ""
    assert (home_dir / "chrome-extension" / "manifest.json").exists()


def test_extension_ensure_copy_updated(tmp_path, capsys):
    plugin_root = tmp_path / "plugin"
    plugin_root.mkdir()
    _make_extension(plugin_root, "2.0")
    home_dir = tmp_path / "home"
    dst = _make_home_extension(home_dir, "1.0", extra_file="old-only.txt")

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()

    assert return_code == 0
    assert captured.out.strip() == "updated"
    assert captured.err == ""
    assert json.loads((dst / "manifest.json").read_text())["version"] == "2.0"
    assert (dst / "asset.txt").exists()
    assert not (dst / "old-only.txt").exists()


def test_extension_ensure_copy_unchanged(tmp_path, capsys):
    plugin_root = tmp_path / "plugin"
    plugin_root.mkdir()
    _make_extension(plugin_root, "1.0")
    home_dir = tmp_path / "home"
    dst = _make_home_extension(home_dir, "1.0", extra_file="keep-me.txt")

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()

    assert return_code == 0
    assert captured.out.strip() == "unchanged"
    assert captured.err == ""
    assert (dst / "keep-me.txt").exists()


def test_extension_ensure_copy_skipped_for_project_install(tmp_path, capsys):
    plugin_root = tmp_path / "plugin"
    plugin_root.mkdir()
    _make_extension(plugin_root, "1.0")
    (plugin_root / ".git").touch()
    home_dir = tmp_path / "home"

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()

    assert return_code == 0
    assert captured.out.strip() == "skipped"
    assert "프로젝트 설치 감지" in captured.err
    assert not (home_dir / "chrome-extension").exists()


def test_extension_ensure_copy_stale_when_src_missing(tmp_path, capsys):
    plugin_root = tmp_path / "plugin"
    plugin_root.mkdir()
    home_dir = tmp_path / "home"
    home_dir.mkdir()
    dst = home_dir / "chrome-extension"
    dst.mkdir()
    (dst / "manifest.json").write_text(json.dumps({"version": "1.0"}), encoding="utf-8")

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()

    assert return_code == 0
    assert captured.out.strip() == "unchanged"
    assert "stale 상태일 수 있습니다." in captured.err
    assert (dst / "manifest.json").exists()


def test_extension_ensure_copy_windows_not_supported(tmp_path, capsys, monkeypatch):
    plugin_root = tmp_path / "plugin"
    plugin_root.mkdir()
    _make_extension(plugin_root, "1.0")
    home_dir = tmp_path / "home"
    monkeypatch.setattr(sys, "platform", "win32")

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()

    assert return_code == 1
    assert captured.out == ""
    assert captured.err.strip() == "미지원 OS"
