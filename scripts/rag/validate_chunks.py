#!/usr/bin/env python3
"""Validate the JSONL contract expected by the Nomic dataset uploader."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REQUIRED_FIELDS = {"id", "text", "source", "issue", "headings", "pages"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("data/processed"))
    parser.add_argument("--min-issues", type=int, default=10)
    args = parser.parse_args()

    files = sorted(args.input_dir.glob("traveling*.jsonl"))
    if len(files) < args.min_issues:
        print(
            f"ERROR: found {len(files)} JSONL files; expected at least {args.min_issues}.",
            file=sys.stderr,
        )
        return 2

    ids: set[str] = set()
    rows = 0
    issues: set[int] = set()
    errors: list[str] = []
    for path in files:
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            rows += 1
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                errors.append(f"{path}:{line_number}: invalid JSON ({error})")
                continue

            missing = REQUIRED_FIELDS - row.keys()
            if missing:
                errors.append(f"{path}:{line_number}: missing {sorted(missing)}")
                continue
            if not isinstance(row["id"], str) or not row["id"]:
                errors.append(f"{path}:{line_number}: id must be non-empty")
            elif row["id"] in ids:
                errors.append(f"{path}:{line_number}: duplicate id {row['id']}")
            ids.add(row["id"])
            if not isinstance(row["text"], str) or len(row["text"].strip()) < 40:
                errors.append(f"{path}:{line_number}: text is too short")
            if not isinstance(row["issue"], int):
                errors.append(f"{path}:{line_number}: issue must be an integer")
            else:
                issues.add(row["issue"])
            if not isinstance(row["headings"], list):
                errors.append(f"{path}:{line_number}: headings must be an array")
            if not isinstance(row["pages"], list) or not all(
                isinstance(page, int) and page > 0 for page in row["pages"]
            ):
                errors.append(f"{path}:{line_number}: pages must be positive integers")

    if errors:
        print("\n".join(errors[:20]), file=sys.stderr)
        if len(errors) > 20:
            print(f"... and {len(errors) - 20} more errors", file=sys.stderr)
        return 1

    print(f"Valid chunks: {rows}; issues: {len(issues)}; files: {len(files)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
