#!/usr/bin/env python3
"""Offline contract test for the processed corpus and Nomic upload rows."""

from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/rag/upload_nomic.py"
spec = importlib.util.spec_from_file_location("upload_nomic", MODULE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load {MODULE_PATH}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

rows = module.load_rows(ROOT / "data/processed")
assert len(rows) == 7366, f"unexpected row count: {len(rows)}"
assert len({row["id"] for row in rows}) == len(rows), "chunk IDs must be unique"

required = {"id", "text", "source", "issue", "headings", "pages"}
for row in rows:
    assert required == set(row), f"unexpected Atlas columns: {set(row)}"
    assert isinstance(row["id"], str) and row["id"]
    assert isinstance(row["text"], str) and row["text"].strip()
    assert isinstance(row["source"], str) and row["source"].endswith(".pdf")
    assert isinstance(row["issue"], int) and 58 <= row["issue"] <= 78
    assert isinstance(row["headings"], str)
    assert isinstance(row["pages"], str) and row["pages"]

print(f"Contract OK: {len(rows)} Atlas rows; {len({row['issue'] for row in rows})} issues")
