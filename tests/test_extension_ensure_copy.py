import json
import sys
from pathlib import Path

from scripts.mst import _dir_content_hash, _ensure_copy_impl


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
    dst = home_dir / "chrome-extension"
    assert (dst / ".content-hash").exists()
    assert (dst / ".content-hash").read_text(encoding="utf-8") == _dir_content_hash(
        plugin_root / "extension"
    )


def test_extension_ensure_copy_updated_by_content(tmp_path, capsys):
    plugin_root = tmp_path / "plugin"
    plugin_root.mkdir()
    _make_extension(plugin_root, "2.0")
    home_dir = tmp_path / "home"

    _ensure_copy_impl(plugin_root, home_dir)
    capsys.readouterr()
    (plugin_root / "extension" / "asset.txt").write_text("updated", encoding="utf-8")

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()

    assert return_code == 0
    assert captured.out.strip() == "updated"
    assert captured.err == ""
    assert json.loads((home_dir / "chrome-extension" / "manifest.json").read_text())["version"] == "2.0"
    assert (home_dir / "chrome-extension" / "asset.txt").read_text(encoding="utf-8") == "updated"


def test_extension_ensure_copy_unchanged(tmp_path, capsys):
    plugin_root = tmp_path / "plugin"
    plugin_root.mkdir()
    _make_extension(plugin_root, "1.0")
    home_dir = tmp_path / "home"

    first_call = _ensure_copy_impl(plugin_root, home_dir)
    first_captured = capsys.readouterr()
    assert first_call == 0
    assert first_captured.out.strip() == "created"

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()

    assert return_code == 0
    assert captured.out.strip() == "unchanged"
    assert captured.err == ""
    dst = home_dir / "chrome-extension"
    (dst / "keep-me.txt").write_text("keep", encoding="utf-8")

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()
    assert return_code == 0
    assert captured.out.strip() == "unchanged"
    assert captured.err == ""
    assert (dst / "keep-me.txt").exists()


def test_extension_ensure_copy_no_hash_file(tmp_path, capsys):
    plugin_root = tmp_path / "plugin"
    plugin_root.mkdir()
    _make_extension(plugin_root, "1.0")
    home_dir = tmp_path / "home"
    _ensure_copy_impl(plugin_root, home_dir)
    capsys.readouterr()
    dst = home_dir / "chrome-extension"
    (dst / ".content-hash").unlink()

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()

    assert return_code == 0
    assert captured.out.strip() == "updated"
    assert captured.err == ""
    assert (dst / ".content-hash").exists()
    assert json.loads((dst / "manifest.json").read_text(encoding="utf-8"))["version"] == "1.0"


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


def test_extension_ensure_copy_excludes_ignored_dirs(tmp_path, capsys):
    plugin_root = tmp_path / "plugin"
    plugin_root.mkdir()
    _make_extension(plugin_root, "1.0")
    extension_root = plugin_root / "extension"
    (extension_root / "node_modules" / "package" / "file.txt").parent.mkdir(parents=True, exist_ok=True)
    (extension_root / "node_modules" / "package" / "file.txt").write_text(
        "ignored-node",
        encoding="utf-8",
    )
    (extension_root / ".git" / "objects" / "object.txt").parent.mkdir(parents=True, exist_ok=True)
    (extension_root / ".git" / "objects" / "object.txt").write_text(
        "ignored-git",
        encoding="utf-8",
    )
    (extension_root / ".omc" / "cache" / "state.bin").parent.mkdir(parents=True, exist_ok=True)
    (extension_root / ".omc" / "cache" / "state.bin").write_text(
        "ignored-omc",
        encoding="utf-8",
    )
    (extension_root / ".content-hash").write_text("stale", encoding="utf-8")
    home_dir = tmp_path / "home"

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()
    assert return_code == 0
    assert captured.out.strip() == "created"

    (extension_root / "node_modules" / "package" / "file.txt").write_text(
        "ignored-node-v2",
        encoding="utf-8",
    )
    (extension_root / ".git" / "objects" / "object.txt").write_text(
        "ignored-git-v2",
        encoding="utf-8",
    )
    (extension_root / ".omc" / "cache" / "state.bin").write_text(
        "ignored-omc-v2",
        encoding="utf-8",
    )
    (extension_root / ".content-hash").write_text("changed", encoding="utf-8")

    return_code = _ensure_copy_impl(plugin_root, home_dir)
    captured = capsys.readouterr()

    assert return_code == 0
    assert captured.out.strip() == "unchanged"
    assert captured.err == ""
    dst = home_dir / "chrome-extension"
    assert (dst / "node_modules" / "package" / "file.txt").exists()
    assert (dst / "node_modules" / "package" / "file.txt").read_text(encoding="utf-8") == "ignored-node"
    assert (dst / ".git" / "objects" / "object.txt").exists()
    assert (dst / ".git" / "objects" / "object.txt").read_text(encoding="utf-8") == "ignored-git"
    assert (dst / ".omc" / "cache" / "state.bin").exists()
    assert (dst / ".omc" / "cache" / "state.bin").read_text(encoding="utf-8") == "ignored-omc"
