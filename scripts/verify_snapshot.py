#!/usr/bin/env python3
"""Verify recovered file bytes only; this is not an application test runner."""
from hashlib import sha256
from pathlib import Path
import sys


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    errors = []
    checked = 0
    try:
        lines = (root / "MANIFEST.sha256").read_text(encoding="utf-8").splitlines()
        for line in lines:
            if not line.strip():
                continue
            expected, relative = line.split("  ", 1)
            path = (root / relative).resolve()
            if not path.is_relative_to(root) or path.is_symlink():
                raise ValueError("Unsafe manifest path")
            if len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected):
                raise ValueError("Invalid SHA-256 in manifest")
            if not path.is_file():
                errors.append("Missing: " + relative)
            elif sha256(path.read_bytes()).hexdigest() != expected:
                errors.append("Changed: " + relative)
            else:
                checked += 1
        if not lines:
            raise ValueError("Empty manifest")
    except (OSError, ValueError) as error:
        errors.append(str(error))
    for error in errors:
        print(error, file=sys.stderr)
    print(f"{checked} recovered files verified; {len(errors)} errors.")
    print("Integrity only. Application tests and native builds were NOT run.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
