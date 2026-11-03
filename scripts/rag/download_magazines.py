#!/usr/bin/env python3
"""Download the Traveling Magazine PDF corpus without committing PDFs.

The course handout gives a predictable URL pattern, but several issues can be
unavailable. The script is intentionally resumable and records a local
manifest so the exact input corpus can be reproduced.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_ISSUES = tuple(range(58, 79))
DEFAULT_URL = "https://www.tienda-revistatraveling.es/descargas/traveling{issue}.pdf"


def download_issue(issue: int, destination: Path, timeout: int) -> dict[str, object]:
    url = DEFAULT_URL.format(issue=issue)
    target = destination / f"traveling{issue}.pdf"
    started = time.monotonic()
    row: dict[str, object] = {
        "issue": issue,
        "url": url,
        "path": str(target),
        "status": "error",
    }

    try:
        request = Request(
            url,
            headers={"User-Agent": "IntegraTrip-Tarea3/1.0"},
        )
        with urlopen(request, timeout=timeout) as response:
            content_type = response.headers.get_content_type()
            body = response.read()
            if response.status != 200 or not body.startswith(b"%PDF"):
                row.update(
                    {
                        "status": "invalid",
                        "http_status": response.status,
                        "content_type": content_type,
                        "bytes": len(body),
                    }
                )
                return row

        target.write_bytes(body)
        row.update(
            {
                "status": "downloaded",
                "http_status": 200,
                "content_type": content_type,
                "bytes": len(body),
            }
        )
    except HTTPError as error:
        row.update({"status": "http_error", "http_status": error.code})
    except (URLError, TimeoutError, OSError) as error:
        row.update({"status": "error", "error": str(error)})
    finally:
        row["elapsed_ms"] = round((time.monotonic() - started) * 1000)
    return row


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--issues",
        nargs="+",
        type=int,
        default=list(DEFAULT_ISSUES),
        help="Issue numbers to download (default: 58 through 78).",
    )
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/raw"),
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("data/raw/manifest.json"),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Download again even when the target already looks like a PDF.",
    )
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, object]] = []
    for issue in sorted(set(args.issues)):
        target = args.output_dir / f"traveling{issue}.pdf"
        if target.exists() and target.stat().st_size > 0 and not args.force:
            row = {
                "issue": issue,
                "url": DEFAULT_URL.format(issue=issue),
                "path": str(target),
                "status": "already_present",
                "bytes": target.stat().st_size,
            }
        else:
            print(f"Downloading issue {issue}...", flush=True)
            row = download_issue(issue, args.output_dir, args.timeout)
        rows.append(row)
        print(f"  {row['status']} ({row.get('bytes', 0)} bytes)", flush=True)

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(
        json.dumps(
            {
                "source": "Traveling Magazine",
                "url_template": DEFAULT_URL,
                "issues_requested": sorted(set(args.issues)),
                "records": rows,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    valid = sum(row["status"] in {"downloaded", "already_present"} for row in rows)
    print(f"Valid local PDFs: {valid}/{len(rows)}", flush=True)
    if valid < 10:
        print("ERROR: the task requires at least 10 valid editions.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
