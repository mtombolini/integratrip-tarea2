#!/usr/bin/env python3
"""Upload processed magazine chunks and create the Atlas index.

The Nomic API key is read only from NOMIC_API_KEY. It must never be placed in
the repository, a README, the Next.js client, or a Generate request.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


DEFAULT_DATASET = "integratrip-traveling-rag"
EMBEDDING_MODEL = "gte-multilingual-base"


def load_rows(input_dir: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for path in sorted(input_dir.glob("traveling*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            # Keep a stable, flat schema in Atlas. The original JSONL retains
            # arrays for pages/headings; the dataset stores readable strings.
            rows.append(
                {
                    "id": row["id"],
                    "text": row["text"],
                    "source": row["source"],
                    "issue": row["issue"],
                    "headings": " > ".join(row["headings"]),
                    "pages": ",".join(str(page) for page in row["pages"]),
                }
            )
    if not rows:
        raise ValueError(f"No JSONL chunks found in {input_dir}")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("data/processed"))
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--description", default="Traveling Magazine chunks for IntegraTrip RAG")
    parser.add_argument("--index-name", default="traveling-rag")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--embedding-model", default=EMBEDDING_MODEL)
    args = parser.parse_args()

    api_key = os.environ.get("NOMIC_API_KEY")
    if not api_key:
        print("ERROR: set NOMIC_API_KEY in the shell environment.", file=sys.stderr)
        return 2

    try:
        from nomic import AtlasDataset, login

        login(api_key)
        rows = load_rows(args.input_dir)
        dataset = AtlasDataset(
            args.dataset,
            description=args.description,
            unique_id_field="id",
            is_public=True,
        )
        print(f"Dataset: {dataset.identifier} (id={dataset.id})")
        for start in range(0, len(rows), args.batch_size):
            batch = rows[start : start + args.batch_size]
            dataset.add_data(batch)
            print(f"Uploaded {min(start + len(batch), len(rows))}/{len(rows)}")

        projection = dataset.create_index(
            name=args.index_name,
            indexed_field="text",
            embedding_model=args.embedding_model,
        )
        if projection is None:
            print("Index creation submitted, but Atlas did not return a map yet.")
        else:
            print(f"Projection ID: {projection.id}")
            print(f"Map name: {projection.name}")
            print(f"Dataset URL: {projection.dataset_link}")
            print(f"Map URL: {projection.map_link}")
        return 0
    except Exception as error:
        print(f"ERROR: Nomic upload failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
