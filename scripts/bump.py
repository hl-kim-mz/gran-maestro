#!/usr/bin/env python3
"""
scripts/bump.py — Gran Maestro 버전 범프 스크립트

사용법:
    python3 scripts/bump.py <patch|minor|major>

역할:
    - 3파일 버전 일치 검증
    - 다음 버전 계산 및 3파일 수정
    - 직전 "Bump version to" 커밋 이후 git log 출력

CHANGELOG 작성·커밋·푸시는 Claude가 담당한다.
"""

import json
import re
import sys
import subprocess
from pathlib import Path

DIVIDER = "─" * 35

# 프로젝트 루트: 이 스크립트의 부모 디렉토리 (scripts/ → root)
ROOT = Path(__file__).resolve().parent.parent

FILE_PACKAGE = ROOT / "package.json"
FILE_PLUGIN = ROOT / ".claude-plugin" / "plugin.json"
FILE_MARKETPLACE = ROOT / ".claude-plugin" / "marketplace.json"


def read_version_package() -> str:
    with open(FILE_PACKAGE, encoding="utf-8") as f:
        return json.load(f)["version"]


def read_version_plugin() -> str:
    with open(FILE_PLUGIN, encoding="utf-8") as f:
        return json.load(f)["version"]


def read_version_marketplace() -> str:
    with open(FILE_MARKETPLACE, encoding="utf-8") as f:
        return json.load(f)["plugins"][0]["version"]


def bump_version(version: str, bump_type: str) -> str:
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", version)
    if not match:
        print(f"에러: 버전 형식이 잘못됨: {version}", file=sys.stderr)
        sys.exit(1)
    major, minor, patch = int(match.group(1)), int(match.group(2)), int(match.group(3))
    if bump_type == "patch":
        patch += 1
    elif bump_type == "minor":
        minor += 1
        patch = 0
    elif bump_type == "major":
        major += 1
        minor = 0
        patch = 0
    return f"{major}.{minor}.{patch}"


def write_version_package(new_version: str) -> None:
    with open(FILE_PACKAGE, encoding="utf-8") as f:
        data = json.load(f)
    data["version"] = new_version
    with open(FILE_PACKAGE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def write_version_plugin(new_version: str) -> None:
    with open(FILE_PLUGIN, encoding="utf-8") as f:
        data = json.load(f)
    data["version"] = new_version
    with open(FILE_PLUGIN, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def write_version_marketplace(new_version: str) -> None:
    with open(FILE_MARKETPLACE, encoding="utf-8") as f:
        data = json.load(f)
    data["plugins"][0]["version"] = new_version
    with open(FILE_MARKETPLACE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def get_git_log_since_last_bump(old_version: str) -> list[str]:
    """직전 'Bump version to' 커밋 이후 git log --oneline 반환."""
    try:
        # 직전 Bump 커밋 해시 탐지
        result = subprocess.run(
            ["git", "log", "--oneline", "--grep=^Bump version to"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
        lines = result.stdout.strip().splitlines()
        if lines:
            bump_hash = lines[0].split()[0]
            # 해당 커밋 이후 로그
            log_result = subprocess.run(
                ["git", "log", "--oneline", f"{bump_hash}..HEAD"],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=True,
            )
            log_lines = log_result.stdout.strip().splitlines()
            return log_lines if log_lines else ["(직전 버전 이후 커밋 없음)"]
        else:
            # Bump 커밋이 없으면 전체 로그
            log_result = subprocess.run(
                ["git", "log", "--oneline"],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=True,
            )
            return log_result.stdout.strip().splitlines()
    except subprocess.CalledProcessError as e:
        return [f"(git log 실패: {e})"]


def main() -> None:
    valid_types = ("patch", "minor", "major")

    if len(sys.argv) != 2 or sys.argv[1] not in valid_types:
        print(f"사용법: python3 scripts/bump.py <{'|'.join(valid_types)}>")
        sys.exit(1)

    bump_type = sys.argv[1]

    # 현재 버전 읽기
    v_package = read_version_package()
    v_plugin = read_version_plugin()
    v_marketplace = read_version_marketplace()

    # 3파일 버전 일치 검증
    if not (v_package == v_plugin == v_marketplace):
        print("에러: 3파일의 버전이 일치하지 않습니다. 수동으로 확인 후 맞춰주세요.")
        print(f"  package.json:              {v_package}")
        print(f"  .claude-plugin/plugin.json: {v_plugin}")
        print(f"  .claude-plugin/marketplace.json: {v_marketplace}")
        sys.exit(1)

    old_version = v_package
    new_version = bump_version(old_version, bump_type)

    # git log 수집 (파일 수정 전에)
    log_lines = get_git_log_since_last_bump(old_version)

    # 3파일 버전 수정
    write_version_package(new_version)
    write_version_plugin(new_version)
    write_version_marketplace(new_version)

    # 결과 출력
    print(f"버전: {old_version} → {new_version}")
    print(DIVIDER)
    print("파일 업데이트:")
    print(f"  ✓ package.json")
    print(f"  ✓ .claude-plugin/plugin.json")
    print(f"  ✓ .claude-plugin/marketplace.json")
    print()
    print(f"직전 버전({old_version}) 이후 커밋 로그:")
    print(DIVIDER)
    for line in log_lines:
        print(line)
    print(DIVIDER)
    print("다음 단계:")
    print("  1. CHANGELOG.md 업데이트 (위 커밋 로그 참고)")
    print(f'  2. git commit -am "Bump version to {new_version}"')
    print("  3. git push origin master")


if __name__ == "__main__":
    main()
