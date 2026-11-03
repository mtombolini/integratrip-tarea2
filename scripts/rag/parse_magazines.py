#!/usr/bin/env python3
"""Parse Traveling Magazine PDFs into JSONL chunks with Docling.

OCR is deliberately not enabled: the course PDFs contain a text layer. The
metadata extraction follows Docling's chunk provenance so every record keeps
its source issue, headings, and page numbers.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any


TOKENIZER_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MIN_TEXT_CHARS = 40


def issue_from_path(path: Path) -> int:
    match = re.search(r"traveling[-_ ]?(\d+)", path.stem, re.IGNORECASE)
    if not match:
        raise ValueError(f"Could not infer issue number from {path.name}")
    return int(match.group(1))


def pages_for_chunk(chunk: Any) -> list[int]:
    pages: set[int] = set()
    for item in getattr(getattr(chunk, "meta", None), "doc_items", []) or []:
        for provenance in getattr(item, "prov", []) or []:
            page_no = getattr(provenance, "page_no", None)
            if isinstance(page_no, int):
                pages.add(page_no)
    return sorted(pages)


def headings_for_chunk(chunk: Any) -> list[str]:
    headings = getattr(getattr(chunk, "meta", None), "headings", []) or []
    return [str(value).strip() for value in headings if str(value).strip()]


def chunk_id(issue: int, ordinal: int, text: str) -> str:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
    return f"traveling{issue}:{ordinal:05d}:{digest}"


def parse_pdf(pdf_path: Path, output_path: Path, tokenizer: Any) -> int:
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter
    from docling.document_converter import PdfFormatOption
    from docling.chunking import HybridChunker

    issue = issue_from_path(pdf_path)
    # The handout explicitly says these PDFs contain a text layer. Disable OCR
    # so the parser never silently changes the extraction method.
    pipeline_options = PdfPipelineOptions(do_ocr=False)
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
        }
    )
    document = converter.convert(str(pdf_path)).document
    chunker = HybridChunker(tokenizer=tokenizer)

    records: list[dict[str, object]] = []
    for ordinal, chunk in enumerate(chunker.chunk(document)):
        text = chunker.contextualize(chunk).strip()
        if len(text) < MIN_TEXT_CHARS:
            continue
        pages = pages_for_chunk(chunk)
        headings = headings_for_chunk(chunk)
        records.append(
            {
                "id": chunk_id(issue, ordinal, text),
                "text": text,
                "source": pdf_path.name,
                "issue": issue,
                "headings": headings,
                "pages": pages,
            }
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return len(records)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("data/raw"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/processed"))
    parser.add_argument(
        "--issues",
        nargs="+",
        type=int,
        help="Only parse these issue numbers; default parses every local PDF.",
    )
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()

    logging.basicConfig(level=args.log_level.upper(), format="%(levelname)s %(message)s")
    try:
        from transformers import AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
    except ImportError as error:
        print(
            "Missing parser dependencies. Install scripts/rag/requirements.txt first.",
            file=sys.stderr,
        )
        print(error, file=sys.stderr)
        return 2

    paths = sorted(args.input_dir.glob("traveling*.pdf"))
    if args.issues:
        selected = set(args.issues)
        paths = [path for path in paths if issue_from_path(path) in selected]
    if not paths:
        print("ERROR: no matching PDFs were found.", file=sys.stderr)
        return 2
    if not args.issues and len(paths) < 10:
        print(
            f"ERROR: found only {len(paths)} PDFs; at least 10 are required.",
            file=sys.stderr,
        )
        return 2

    total = 0
    for pdf_path in paths:
        issue = issue_from_path(pdf_path)
        output_path = args.output_dir / f"traveling{issue}.jsonl"
        logging.info("Parsing %s", pdf_path.name)
        count = parse_pdf(pdf_path, output_path, tokenizer)
        logging.info("Wrote %d chunks to %s", count, output_path)
        total += count

    print(f"Parsed {len(paths)} issues into {total} chunks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
