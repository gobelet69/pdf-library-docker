#!/usr/bin/env python3
import argparse
from email.parser import BytesParser
from email.policy import default
import json
import mimetypes
import os
import subprocess
import sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

from pdf_library import LibraryError, PdfLibrary


APP_DIR = Path(__file__).resolve().parent
ROOT = APP_DIR.parent
LIBRARY = PdfLibrary(ROOT)
DEFAULT_INCLUDE_THUMBNAILS = True


def parse_range_header(header, file_size):
    if not header or not str(header).startswith("bytes="):
        return None
    raw_range = str(header).removeprefix("bytes=").strip()
    if "," in raw_range or "-" not in raw_range:
        return None
    raw_start, raw_end = raw_range.split("-", 1)
    try:
        if raw_start == "":
            suffix_length = int(raw_end)
            if suffix_length <= 0:
                return None
            start = max(0, file_size - suffix_length)
            end = file_size - 1
        else:
            start = int(raw_start)
            end = int(raw_end) if raw_end else file_size - 1
    except ValueError:
        return None
    if start < 0 or end < start or start >= file_size:
        return None
    return start, min(end, file_size - 1)


def content_disposition_header(disposition, filename):
    ascii_filename = (
        str(filename)
        .encode("ascii", "ignore")
        .decode("ascii")
        .replace("\\", "_")
        .replace('"', "'")
        .strip()
    ) or "document.pdf"
    encoded_filename = quote(str(filename), safe="")
    return f'{disposition}; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}'


class Handler(BaseHTTPRequestHandler):
    server_version = "PdfBrowser/1.0"

    def do_GET(self):
        self._handle_get(send_body=True)

    def do_HEAD(self):
        self._handle_get(send_body=False)

    def _handle_get(self, send_body=True):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/library":
                self._json(LIBRARY.scan(include_thumbnails=self._include_thumbnails(parsed.query)), send_body=send_body)
            elif parsed.path == "/api/cleanup":
                self._json(LIBRARY.cleanup_report(), send_body=send_body)
            elif parsed.path == "/api/search":
                params = parse_qs(parsed.query)
                self._json(LIBRARY.search_content(params.get("q", [""])[0]), send_body=send_body)
            elif parsed.path == "/api/search/status":
                self._json(LIBRARY.search_index_status(), send_body=send_body)
            elif parsed.path == "/api/open":
                self._open_file(parsed.query)
            elif parsed.path.startswith("/pdf/"):
                self._serve_library_file(parsed.path, "/pdf/", LIBRARY.absolute_pdf, send_body=send_body)
            elif parsed.path.startswith("/thumbnail/"):
                self._serve_library_file(parsed.path, "/thumbnail/", LIBRARY.thumbnail_file, send_body=send_body, cache_immutable=True)
            elif parsed.path.startswith("/thumb/"):
                self._serve_library_file(parsed.path, "/thumb/", LIBRARY.absolute_thumbnail, send_body=send_body, cache_immutable=True)
            elif parsed.path.startswith("/generated-thumb/"):
                self._serve_library_file(parsed.path, "/generated-thumb/", LIBRARY.absolute_generated_thumbnail, send_body=send_body, cache_immutable=True)
            elif parsed.path == "/search_index.json":
                self._serve_file(LIBRARY.search_index_path, inline=True, send_body=send_body)
            else:
                self._serve_static(parsed.path, send_body=send_body)
        except LibraryError as exc:
            self._json({"error": str(exc)}, status=400, send_body=send_body)
        except FileNotFoundError:
            self._json({"error": "Not found"}, status=404, send_body=send_body)
        except Exception as exc:
            self._json(self._unexpected_error_payload(exc), status=500, send_body=send_body)

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/import":
                self._json({"imported": self._import_payload()}, status=201)
                return
            if parsed.path == "/api/capture/prepare-upload":
                self._json({"candidates": self._prepare_upload_payload()})
                return
            payload = self._payload()
            if parsed.path == "/api/favorites":
                self._json(LIBRARY.set_favorite(payload.get("path"), bool(payload.get("favorite"))))
            elif parsed.path == "/api/capture/prepare-url":
                self._json(LIBRARY.prepare_url_capture(payload.get("url")))
            elif parsed.path == "/api/rename-suggestions":
                pdf_path = payload.get("path")
                if pdf_path:
                    suggestions = LIBRARY.pdf_filename_suggestions(
                        pdf_path,
                        indexed_text=payload.get("indexedText") or "",
                    )
                else:
                    suggestions = LIBRARY.filename_suggestions(
                        original_filename=payload.get("originalFilename") or payload.get("name") or "",
                        indexed_text=payload.get("indexedText") or "",
                        source_url=payload.get("sourceUrl") or "",
                        current_name=payload.get("currentName") or "",
                        metadata_title=payload.get("metadataTitle") or "",
                    )
                self._json({"suggestions": suggestions})
            elif parsed.path == "/api/import-url":
                self._json({"imported": LIBRARY.import_url(payload.get("url"), payload.get("filename"))}, status=201)
            elif parsed.path == "/api/metadata":
                self._json(LIBRARY.set_metadata(payload.get("path"), payload.get("metadata") or {}))
            elif parsed.path == "/api/folders":
                self._json(LIBRARY.create_folder(payload.get("path")), status=201)
            elif parsed.path == "/api/move":
                self._json(LIBRARY.move_pdf(
                    payload.get("path"),
                    payload.get("destination"),
                    payload.get("onConflict", "error"),
                    payload.get("filename"),
                ))
            elif parsed.path == "/api/rename":
                self._json(LIBRARY.rename_pdf(
                    payload.get("path"),
                    payload.get("filename"),
                    payload.get("onConflict", "error"),
                ))
            elif parsed.path == "/api/trash":
                self._json(LIBRARY.trash_pdf(payload.get("path")))
            elif parsed.path == "/api/archive":
                self._json(LIBRARY.archive_pdf(payload.get("path")))
            elif parsed.path == "/api/preview":
                self._json(LIBRARY.generate_preview(payload.get("path")))
            elif parsed.path == "/api/ignore-duplicate":
                self._json(LIBRARY.ignore_duplicate_group(payload.get("paths")))
            elif parsed.path == "/api/ignore-cleanup":
                self._json(LIBRARY.ignore_cleanup_issue(payload.get("section"), payload.get("path")))
            elif parsed.path == "/api/delete-folder":
                self._json(LIBRARY.delete_empty_folder(payload.get("path")))
            elif parsed.path == "/api/search/rebuild":
                self._json(LIBRARY.rebuild_search_index(payload.get("limit")))
            else:
                self._json({"error": "Unknown endpoint"}, status=404)
        except LibraryError as exc:
            self._json({"error": str(exc), "code": exc.code, "details": exc.details}, status=409 if exc.code == "name_conflict" else 400)
        except json.JSONDecodeError:
            self._json({"error": "Invalid JSON"}, status=400)
        except Exception as exc:
            self._json(self._unexpected_error_payload(exc), status=500)

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))

    def _open_file(self, query):
        params = parse_qs(query)
        pdf_path = params.get("path", [""])[0]
        path = LIBRARY.absolute_pdf(pdf_path)
        subprocess.Popen(["open", str(path)])
        self._json({"opened": pdf_path})

    def _include_thumbnails(self, query):
        params = parse_qs(query)
        raw_value = params.get("thumbnails", [str(int(DEFAULT_INCLUDE_THUMBNAILS))])[0]
        return raw_value.casefold() not in {"0", "false", "no"}

    def _serve_library_file(self, request_path, prefix, resolver, send_body=True, cache_immutable=False):
        library_path = unquote(request_path.removeprefix(prefix))
        self._serve_file(resolver(library_path), inline=True, send_body=send_body, cache_immutable=cache_immutable)

    def _serve_static(self, request_path, send_body=True):
        route = request_path if request_path not in ("", "/") else "/index.html"
        clean = unquote(route.lstrip("/"))
        path = (APP_DIR / clean).resolve()
        if path != APP_DIR and APP_DIR not in path.parents:
            raise FileNotFoundError
        if not path.exists() or not path.is_file():
            raise FileNotFoundError
        self._serve_file(path, inline=True, send_body=send_body)

    def _serve_file(self, path, inline, send_body=True, cache_immutable=False):
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        file_size = path.stat().st_size
        byte_range = parse_range_header(self.headers.get("Range"), file_size)
        handle = None
        first_chunk = b""
        if byte_range:
            start, end = byte_range
            status = 206
            content_range = f"bytes {start}-{end}/{file_size}"
            content_length = end - start + 1
        elif self.headers.get("Range"):
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{file_size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        else:
            status = 200
            content_range = None
            start, end = 0, file_size - 1
            content_length = file_size
        if send_body and content_length:
            handle = path.open("rb")
            handle.seek(start)
            first_chunk = handle.read(min(1024 * 256, content_length))
            if not first_chunk:
                handle.close()
                raise OSError("Could not read file")
        self.send_response(status)
        if content_range:
            self.send_header("Content-Range", content_range)
        self.send_header("Content-Type", mime)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(content_length))
        if cache_immutable:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        if path.suffix.lower() == ".pdf":
            disposition = "inline" if inline else "attachment"
            self.send_header("Content-Disposition", content_disposition_header(disposition, path.name))
        self.end_headers()
        if not send_body:
            return
        try:
            if first_chunk:
                self.wfile.write(first_chunk)
            remaining = content_length - len(first_chunk)
            while remaining > 0:
                chunk = handle.read(min(1024 * 256, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)
        finally:
            if handle:
                handle.close()

    def _payload(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _import_payload(self):
        imported = []
        for filename, content in self._multipart_files():
            imported.append(LIBRARY.import_pdf(content, filename))
        if not imported:
            raise LibraryError("No PDFs uploaded", code="empty_upload")
        return imported

    def _prepare_upload_payload(self):
        candidates = []
        for filename, content in self._multipart_files():
            candidates.append(LIBRARY.prepare_upload_capture(content, filename))
        if not candidates:
            raise LibraryError("No PDFs uploaded", code="empty_upload")
        return candidates

    def _multipart_files(self):
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            raise LibraryError("Expected multipart form data", code="invalid_upload")
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        message = BytesParser(policy=default).parsebytes(
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + raw
        )
        files = []
        for part in message.iter_parts():
            filename = part.get_filename()
            if not filename:
                continue
            files.append((filename, part.get_payload(decode=True) or b""))
        return files

    def _json(self, data, status=200, send_body=True):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if send_body:
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return

    def _unexpected_error_payload(self, exc):
        return {
            "error": "Library unavailable",
            "details": {
                "type": type(exc).__name__,
                "message": str(exc),
            },
        }


def main(argv=None):
    global DEFAULT_INCLUDE_THUMBNAILS
    parser = argparse.ArgumentParser(description="Local PDF browser")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    parser.add_argument("--no-preload", action="store_true", help="Start serving before scanning the library.")
    parser.add_argument("--fast-library", action="store_true", help="Skip thumbnail lookup on /api/library by default.")
    args = parser.parse_args(argv)
    DEFAULT_INCLUDE_THUMBNAILS = not args.fast_library
    if not args.no_preload:
        try:
            LIBRARY.scan(include_thumbnails=DEFAULT_INCLUDE_THUMBNAILS)
        except Exception as exc:
            print(f"Startup scan failed; continuing without preload: {exc}", file=sys.stderr)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"PDF browser running at http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
