#!/usr/bin/env python3
import os
import sys
from pathlib import Path

from pdf_library import PdfLibrary


APP_DIR = Path(__file__).resolve().parent
ROOT = APP_DIR.parent


def truthy_env(name, default=True):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().casefold() not in {"0", "false", "no", "off"}


def bootstrap_library(root, rebuild_index=True):
    library = PdfLibrary(root, generate_thumbnails=False)
    data = library.scan(include_thumbnails=False)
    count = data.get("counts", {}).get("pdfs", 0)
    print(f"PDF Library bootstrap: scanned {count} PDF(s)", flush=True)
    if rebuild_index:
        def log_progress(progress):
            current = int(progress.get("current") or 0)
            total = int(progress.get("total") or 0)
            if current == total or current == 1 or current % 10 == 0:
                print(
                    "PDF Library bootstrap: indexing "
                    f"{current}/{total} "
                    f"({progress.get('status', 'unknown')}) "
                    f"{progress.get('path', '')}",
                    flush=True,
                )

        result = library.rebuild_search_index(progress_callback=log_progress)
        print(
            "PDF Library bootstrap: indexed "
            f"{result.get('indexed', 0)} PDF(s), "
            f"{result.get('failed', 0)} failed, "
            f"{result.get('remaining', 0)} pending",
            flush=True,
        )


def main():
    if truthy_env("PDF_LIBRARY_BOOTSTRAP", True):
        bootstrap_library(ROOT, rebuild_index=truthy_env("PDF_LIBRARY_REBUILD_INDEX", True))

    host = os.environ.get("PDF_LIBRARY_HOST", "0.0.0.0")
    port = os.environ.get("PDF_LIBRARY_PORT", "8765")
    args = [
        sys.executable,
        "-u",
        str(APP_DIR / "server.py"),
        "--host",
        host,
        "--port",
        port,
        "--fast-library",
    ]
    os.execv(sys.executable, args)


if __name__ == "__main__":
    main()
