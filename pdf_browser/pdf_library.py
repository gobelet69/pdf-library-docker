import json
import os
import hashlib
import re
import shutil
import subprocess
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


class LibraryError(Exception):
    def __init__(self, message, code="library_error", details=None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


class PdfLibrary:
    SEARCH_EXTRACTOR_VERSION = 6
    VALID_METADATA_STATUSES = {"", "to_read", "read", "important", "archive"}
    DOCUMENT_EXTENSIONS = {".pdf"}
    GENERATED_THUMBNAIL_SIZE = "360"
    GENERATED_THUMBNAIL_QUALITY = "58"
    THUMBNAIL_MANIFEST_VERSION = 2

    def __init__(self, root, generate_thumbnails=True, data_root=None):
        self.root = Path(root).resolve()
        self.data_root = Path(data_root).resolve() if data_root else self._default_data_root(self.root)
        self.sorted_root = self.data_root / "sorted_pdfs"
        self.unsorted_name = "_Unsorted"
        self.state_dir = self.data_root / "app_state" / "pdf_browser" if self.data_root != self.root else self.root / "pdf_browser"
        self.state_path = self.state_dir / "state.json"
        self.search_index_path = self.state_dir / "search_index.json"
        self.thumbnail_manifest_path = self.state_dir / "thumbnail_manifest.json"
        self.generated_thumbnail_dir = self.state_dir / "generated_thumbnails"
        self.generate_thumbnails = generate_thumbnails

    @staticmethod
    def _default_data_root(root):
        candidate = root / "library"
        return candidate.resolve() if candidate.exists() else root

    def scan(self, include_thumbnails=True):
        self._ensure_roots()
        state = self._load_state()
        favorites = set(state.get("favorites", []))
        metadata = state.get("metadata", {})
        folders = self._folders(include_empty=False)
        pdfs = []

        documents = [
            path for path in self.sorted_root.rglob("*")
            if path.is_file() and path.suffix.lower() in self.DOCUMENT_EXTENSIONS
        ]
        for path in sorted(documents, key=lambda p: self._rel(p).casefold()):
            rel = self._rel(path)
            document_type = self._document_type_for_path(path)
            thumbnail = self._thumbnail_for(path) if document_type == "pdf" and include_thumbnails else None
            stat = path.stat()
            item_metadata = self._metadata_for(rel, metadata, document_type, path)
            pdfs.append({
                "name": path.name,
                "path": rel,
                "filePath": rel,
                "folder": self._folder_for_rel(rel),
                "size": stat.st_size,
                "fileSize": stat.st_size,
                "modified": stat.st_mtime,
                "createdAt": item_metadata.get("createdAt") or "",
                "documentType": document_type,
                "mimeType": self._mime_type_for_path(path),
                "sourceUrl": item_metadata.get("sourceUrl", ""),
                "favorite": rel in favorites,
                "thumbnail": thumbnail["name"] if thumbnail else None,
                "thumbnailUrl": thumbnail["url"] if thumbnail else None,
                "isUnsorted": rel.startswith(f"{self.unsorted_name}/"),
                "metadata": item_metadata,
            })

        valid_paths = {pdf["path"] for pdf in pdfs}
        tags = sorted(
            {tag for pdf in pdfs for tag in pdf["metadata"].get("tags", [])},
            key=str.casefold,
        )
        clean_metadata = {path: value for path, value in metadata.items() if path in valid_paths}
        if favorites - valid_paths or clean_metadata != metadata:
            favorites = favorites & valid_paths
            state["favorites"] = sorted(favorites, key=str.casefold)
            state["metadata"] = clean_metadata
            self._save_state(state)

        return {
            "root": str(self.data_root),
            "sortedRoot": str(self.sorted_root),
            "canGenerateThumbnails": self.can_generate_thumbnails(),
            "folders": folders,
            "pdfs": pdfs,
            "tags": tags,
            "favorites": sorted(favorites, key=str.casefold),
            "counts": {
                "folders": len(folders),
                "pdfs": len(pdfs),
                "favorites": len(favorites),
                "unsorted": sum(1 for pdf in pdfs if pdf["isUnsorted"]),
                "toRead": sum(1 for pdf in pdfs if pdf["metadata"]["status"] == "to_read"),
                "important": sum(1 for pdf in pdfs if pdf["metadata"]["status"] == "important"),
            },
        }

    def can_generate_thumbnails(self):
        return self.generate_thumbnails and (
            Path("/usr/bin/qlmanage").exists() or shutil.which("pdftoppm") is not None
        )

    def cleanup_report(self):
        data = self.scan()
        state = self._load_state()
        ignored_duplicate_groups = set(state.get("ignored_duplicate_groups", []))
        ignored_cleanup_items = set(state.get("ignored_cleanup_items", []))
        pdfs = data["pdfs"]
        folders = self._folders(include_empty=True)
        issues = {
            "unsorted": [self._cleanup_pdf_item(pdf) for pdf in pdfs if pdf["isUnsorted"]],
            "long_names": [],
            "double_extension": [],
            "archive_leftovers": [],
            "missing_preview": [],
            "empty_folders": [],
            "possible_duplicates": [],
        }

        duplicate_groups = defaultdict(list)
        for pdf in pdfs:
            item = self._cleanup_pdf_item(pdf)
            title = self._display_title(pdf["name"])
            if len(title) > 90:
                item["detail"] = f"{len(title)} characters"
                issues["long_names"].append(item)
            if ".pdf.pdf" in pdf["name"].casefold():
                issues["double_extension"].append(item)
            if pdf["name"].casefold().endswith("-archive.pdf"):
                issues["archive_leftovers"].append(item)
            if not pdf.get("thumbnailUrl"):
                issues["missing_preview"].append(item)
            duplicate_groups[self._duplicate_key(pdf["name"])].append(item)

        pdf_folders = {pdf["folder"] for pdf in pdfs if pdf["folder"]}
        for folder in folders:
            folder_path = folder["path"]
            if folder_path == self.unsorted_name and not any(pdf["isUnsorted"] for pdf in pdfs):
                continue
            has_pdf = any(path == folder_path or path.startswith(f"{folder_path}/") for path in pdf_folders)
            if not has_pdf:
                issues["empty_folders"].append({
                    "path": folder_path,
                    "name": folder["name"],
                    "parent": folder["parent"],
                })

        for key, items in sorted(duplicate_groups.items(), key=lambda pair: pair[0]):
            if key and len(items) > 1:
                signature = self._duplicate_group_signature(key, [item["path"] for item in items])
                if signature in ignored_duplicate_groups:
                    continue
                issues["possible_duplicates"].append({
                    "key": key,
                    "items": sorted(items, key=lambda item: item["path"].casefold()),
                })

        for section, items in issues.items():
            if section == "possible_duplicates":
                continue
            issues[section] = [
                item for item in items
                if self._cleanup_issue_signature(section, item["path"]) not in ignored_cleanup_items
            ]

        counts = {name: len(value) for name, value in issues.items()}
        return {"counts": counts, "issues": issues}

    def create_folder(self, folder_path):
        target = self._safe_dir(folder_path, must_exist=False)
        target.mkdir(parents=True, exist_ok=True)
        return {"path": self._rel(target), "name": target.name}

    def import_pdf(self, content, filename):
        self._ensure_roots()
        if not content:
            raise LibraryError("PDF is empty", code="empty_pdf")
        destination_dir = self.sorted_root / self.unsorted_name
        destination_dir.mkdir(parents=True, exist_ok=True)
        if not str(filename or "").strip().lower().endswith(".pdf"):
            raise LibraryError("Imported file must be a PDF", code="invalid_filename")
        destination = destination_dir / self._safe_pdf_filename(filename)
        if destination.exists():
            destination = self._unique_path(destination)
        destination.write_bytes(content)
        rel = self._rel(destination)
        original_filename = str(filename or destination.name).strip() or destination.name
        self._set_passport_metadata(
            rel,
            {
                "originalFilename": original_filename,
                "importedAt": self._now_iso(),
                "importMethod": "local_upload",
                "contentHash": self._content_hash(destination),
            },
            history_type="imported",
            history_details={"originalFilename": original_filename, "path": rel},
        )
        return {
            "path": rel,
            "name": destination.name,
            "folder": self._rel(destination_dir),
            "size": destination.stat().st_size,
        }

    def import_url(self, url, filename=None):
        normalized_url = self._safe_url(url)
        downloaded = self._download_url(normalized_url)

        final_url = downloaded.get("final_url") or normalized_url
        suggested_name = self._url_import_filename(filename, downloaded.get("filename"), final_url)
        if self._download_looks_like_pdf(downloaded, final_url):
            imported = self.import_pdf(downloaded["content"], suggested_name)
            imported["mode"] = "downloaded_pdf"
            imported["url"] = normalized_url
            self._set_passport_metadata(
                imported["path"],
                {
                    "sourceUrl": normalized_url,
                    "importMethod": "url_pdf",
                    "originalFilename": downloaded.get("filename") or suggested_name,
                },
            )
            return imported

        self._ensure_roots()
        destination_dir = self.sorted_root / self.unsorted_name
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination = destination_dir / self._safe_pdf_filename(suggested_name)
        if destination.exists():
            destination = self._unique_path(destination)
        self._render_url_to_pdf(normalized_url, destination)
        if not destination.exists() or destination.stat().st_size == 0:
            raise LibraryError("Could not render URL to PDF", code="url_render_failed")
        rel = self._rel(destination)
        self._set_passport_metadata(
            rel,
            {
                "sourceUrl": normalized_url,
                "importedAt": self._now_iso(),
                "importMethod": "url_pdf",
                "originalFilename": suggested_name,
                "contentHash": self._content_hash(destination),
            },
            history_type="imported",
            history_details={"originalFilename": suggested_name, "path": rel, "sourceUrl": normalized_url},
        )
        return {
            "path": rel,
            "name": destination.name,
            "folder": self._rel(destination_dir),
            "size": destination.stat().st_size,
            "mode": "rendered_url_pdf",
            "url": normalized_url,
        }

    def prepare_upload_capture(self, content, filename):
        if not content:
            raise LibraryError("PDF is empty", code="empty_pdf")
        if not str(filename or "").strip().lower().endswith(".pdf"):
            raise LibraryError("Imported file must be a PDF", code="invalid_filename")
        content_hash = hashlib.sha256(content).hexdigest()
        return {
            "originalFilename": str(filename or "").strip(),
            "sourceUrl": "",
            "contentHash": content_hash,
            "suggestions": self.filename_suggestions(original_filename=filename),
            "duplicates": self._duplicate_candidates(
                content_hash=content_hash,
                source_url="",
                filename=filename,
            ),
        }

    def prepare_url_capture(self, url):
        normalized_url = self._safe_url(url)
        if not self._url_path_looks_like_pdf(normalized_url):
            filename = self._url_import_filename(None, "", normalized_url)
            return {
                "originalFilename": filename,
                "sourceUrl": normalized_url,
                "contentHash": "",
                "suggestions": self.filename_suggestions(original_filename=filename, source_url=normalized_url),
                "duplicates": [],
            }
        downloaded = self._download_url(normalized_url)
        final_url = downloaded.get("final_url") or normalized_url
        filename = self._url_import_filename(None, downloaded.get("filename"), final_url)
        is_pdf = self._download_looks_like_pdf(downloaded, final_url)
        content = downloaded.get("content") or b""
        content_hash = hashlib.sha256(content).hexdigest() if is_pdf and content else ""
        return {
            "originalFilename": downloaded.get("filename") or filename,
            "sourceUrl": normalized_url,
            "contentHash": content_hash,
            "suggestions": self.filename_suggestions(original_filename=filename, source_url=normalized_url),
            "duplicates": self._duplicate_candidates(
                content_hash=content_hash,
                source_url=normalized_url,
                filename=filename,
            ),
        }

    def filename_suggestions(self, original_filename="", indexed_text="", source_url="", current_name="", metadata_title=""):
        suggestions = []
        current = self._clean_rename_title(current_name)
        self._add_filename_suggestion(suggestions, metadata_title, "PDF title", current)
        indexed_title = self._indexed_title_candidate(indexed_text)
        self._add_filename_suggestion(suggestions, indexed_title, "From PDF text", current)
        self._add_filename_suggestion(suggestions, self._source_date_title_candidate(source_url), "Source date", current)
        self._add_filename_suggestion(suggestions, self._url_title_candidate(source_url), "From URL", current)
        self._add_filename_suggestion(suggestions, self._clean_rename_title(original_filename), "Clean filename", current)
        return suggestions[:3]

    def pdf_filename_suggestions(self, pdf_path, indexed_text=""):
        source = self._safe_file(pdf_path)
        metadata = self._metadata_for(self._rel(source), self._load_state().get("metadata", {}), absolute_path=source)
        return self.filename_suggestions(
            original_filename=metadata.get("originalFilename") or source.name,
            indexed_text=indexed_text,
            source_url=metadata.get("sourceUrl", ""),
            current_name="",
            metadata_title=self._pdf_metadata_title(source),
        )

    def move_pdf(self, pdf_path, destination_folder, on_conflict="error", filename=None):
        source = self._safe_file(pdf_path)
        destination_dir = self._safe_dir(destination_folder, must_exist=True)
        destination_name = self._safe_pdf_filename(filename) if filename is not None else source.name
        destination = destination_dir / destination_name
        state = self._load_state()
        source_rel = self._rel(source)
        if destination.exists():
            if on_conflict == "error":
                raise LibraryError(
                    "A PDF with the same name already exists in this folder",
                    code="name_conflict",
                    details={
                        "source": self._rel(source),
                        "existing": self._rel(destination),
                        "destination": self._rel(destination_dir),
                        "suggested": self._rel(self._unique_path(destination)),
                    },
                )
            if on_conflict == "keep_both":
                destination = self._unique_path(destination)
            elif on_conflict == "delete_source":
                source.unlink()
                if self._remove_state_path(state, source_rel):
                    self._save_state(state)
                return {
                    "action": "deleted_source_duplicate",
                    "path": self._rel(destination),
                    "name": destination.name,
                    "folder": self._rel(destination_dir),
                }
            else:
                raise LibraryError("Invalid conflict choice", code="invalid_conflict_choice")
        shutil.move(str(source), str(destination))

        destination_rel = self._rel(destination)
        if self._move_state_path(state, source_rel, destination_rel):
            self._save_state(state)
        self._append_history(destination_rel, "moved", {"from": source_rel, "to": destination_rel})

        return self._pdf_location_response(destination, destination_dir)

    def rename_pdf(self, pdf_path, filename, on_conflict="error"):
        source = self._safe_file(pdf_path)
        destination = source.with_name(self._safe_pdf_filename(filename))
        if destination == source:
            return self._pdf_location_response(source, source.parent)
        if destination.exists():
            if on_conflict == "error":
                raise LibraryError(
                    "A PDF with the same name already exists in this folder",
                    code="name_conflict",
                    details={
                        "source": self._rel(source),
                        "existing": self._rel(destination),
                        "destination": self._rel(source.parent),
                        "suggested": self._rel(self._unique_path(destination)),
                    },
                )
            if on_conflict == "keep_both":
                destination = self._unique_path(destination)
            else:
                raise LibraryError("Invalid conflict choice", code="invalid_conflict_choice")
        source.rename(destination)

        state = self._load_state()
        source_rel = self._rel(source)
        destination_rel = self._rel(destination)
        if self._move_state_path(state, source_rel, destination_rel):
            self._save_state(state)
        self._append_history(destination_rel, "renamed", {"from": source_rel, "to": destination_rel})

        return self._pdf_location_response(destination, destination.parent)

    def trash_pdf(self, pdf_path):
        source = self._safe_file(pdf_path)
        trash_root = self.data_root / "pdf_trash"
        source_rel, destination = self._move_out_of_library(source, trash_root, "Trash path escapes pdf_trash")
        return {"trashed": source_rel, "trashPath": str(destination)}

    def archive_pdf(self, pdf_path):
        source = self._safe_file(pdf_path)
        if not source.name.casefold().endswith("-archive.pdf"):
            raise LibraryError("Only -archive PDFs can be archived", code="not_archive_pdf")

        archive_root = (self.data_root / "paperless_archive_pdfs").resolve()
        source_rel, destination = self._move_out_of_library(source, archive_root, "Archive path escapes paperless_archive_pdfs")
        return {"archived": source_rel, "archivePath": str(destination)}

    def generate_preview(self, pdf_path):
        source = self._safe_file(pdf_path)
        thumbnail = self._thumbnail_for(source, force_generate=True)
        if not thumbnail:
            raise LibraryError("Could not generate preview", code="preview_generation_failed")
        self._remember_thumbnail(source, thumbnail)
        return {
            "path": self._rel(source),
            "thumbnail": thumbnail["name"],
            "thumbnailUrl": thumbnail["url"],
        }

    def thumbnail_file(self, pdf_path):
        source = self._safe_file(pdf_path)
        thumbnail = self._thumbnail_for(source, force_generate=True)
        if not thumbnail:
            raise LibraryError("Could not generate thumbnail", code="preview_generation_failed")
        self._remember_thumbnail(source, thumbnail)
        if thumbnail["url"].startswith("/thumb/"):
            return self.absolute_thumbnail(thumbnail["name"])
        return self.absolute_generated_thumbnail(thumbnail["name"])

    def rebuild_search_index(self, limit=None, progress_callback=None):
        self._ensure_roots()
        existing = self._load_search_index_documents()
        batch_limit = int(limit) if limit else None
        processed = 0
        remaining = 0
        documents = []
        indexed_at = self._now_iso()
        paths = sorted(self.sorted_root.rglob("*.pdf"), key=lambda p: self._rel(p).casefold())
        total = len(paths)
        for index, path in enumerate(paths, start=1):
            rel = self._rel(path)
            stat = path.stat()
            previous = existing.get(rel)
            fresh = (
                previous
                and previous.get("size") == stat.st_size
                and previous.get("modified") == stat.st_mtime
                and previous.get("extractorVersion") == self.SEARCH_EXTRACTOR_VERSION
                and previous.get("status") != "failed"
            )
            if fresh:
                text = previous.get("text", "")
                status = previous.get("status") or ("indexed" if text else "empty_text")
                error = previous.get("error", "")
                document_indexed_at = previous.get("indexedAt", "")
                extractor_version = self.SEARCH_EXTRACTOR_VERSION
            elif batch_limit is None or processed < batch_limit:
                try:
                    text = self._clean_extracted_text(self._extract_pdf_text(path))
                    status = "indexed" if text else "empty_text"
                    error = ""
                except Exception as exc:
                    text = ""
                    status = "failed"
                    error = f"{type(exc).__name__}: {exc}"
                document_indexed_at = indexed_at
                extractor_version = self.SEARCH_EXTRACTOR_VERSION
                processed += 1
            else:
                text = previous.get("text", "") if previous else ""
                status = "pending"
                error = previous.get("error", "") if previous else ""
                document_indexed_at = previous.get("indexedAt", "") if previous else ""
                extractor_version = previous.get("extractorVersion", 0) if previous else 0
                remaining += 1
            documents.append({
                "path": rel,
                "name": path.name,
                "title": self._display_title(path.name),
                "folder": self._folder_for_rel(rel),
                "size": stat.st_size,
                "modified": stat.st_mtime,
                "extractorVersion": extractor_version,
                "text": text,
                "status": status,
                "error": error,
                "indexedAt": document_indexed_at,
            })
            if progress_callback:
                progress_callback({
                    "current": index,
                    "total": total,
                    "path": rel,
                    "status": status,
                    "processed": processed,
                    "remaining": remaining,
                })

        index = {
            "version": 2,
            "documents": documents,
        }
        self._write_text_replacing_file(
            self.search_index_path,
            json.dumps(index, ensure_ascii=False, indent=2) + "\n",
        )
        with_text = sum(1 for document in documents if document["text"])
        failed = sum(1 for document in documents if document.get("status") == "failed")
        return {
            "indexed": len(documents),
            "processed": processed,
            "remaining": remaining,
            "done": remaining == 0,
            "withText": with_text,
            "failed": failed,
            "path": str(self.search_index_path),
        }

    def search_index_status(self):
        if not self.search_index_path.exists():
            return {
                "indexed": False,
                "documents": 0,
                "withText": 0,
                "emptyText": 0,
                "failed": 0,
                "pending": 0,
                "failures": [],
            }
        try:
            index = json.loads(self.search_index_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {
                "indexed": False,
                "documents": 0,
                "withText": 0,
                "emptyText": 0,
                "failed": 0,
                "pending": 0,
                "failures": [],
            }

        documents = [document for document in index.get("documents", []) if isinstance(document, dict)]
        failures = []
        counts = {"withText": 0, "emptyText": 0, "failed": 0, "pending": 0}
        for document in documents:
            status = document.get("status")
            text = document.get("text", "")
            if not status:
                status = "indexed" if text else "empty_text"
            if text:
                counts["withText"] += 1
            if status == "failed":
                counts["failed"] += 1
                failures.append({
                    "path": document.get("path", ""),
                    "name": document.get("name", ""),
                    "error": document.get("error", ""),
                })
            elif status == "pending":
                counts["pending"] += 1
            elif not text:
                counts["emptyText"] += 1

        return {
            "indexed": True,
            "documents": len(documents),
            "withText": counts["withText"],
            "emptyText": counts["emptyText"],
            "failed": counts["failed"],
            "pending": counts["pending"],
            "failures": failures[:20],
        }

    def search_content(self, query, limit=50):
        normalized_query = str(query or "").strip()
        if len(normalized_query) < 2:
            return {"indexed": self.search_index_path.exists(), "query": normalized_query, "count": 0, "results": []}
        if not self.search_index_path.exists():
            return {"indexed": False, "query": normalized_query, "count": 0, "results": []}

        try:
            index = json.loads(self.search_index_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"indexed": False, "query": normalized_query, "count": 0, "results": []}

        terms = self._search_terms(normalized_query)
        if not terms:
            return {"indexed": True, "query": normalized_query, "count": 0, "results": []}
        results = []
        for document in index.get("documents", []):
            score = self._search_score(document, terms, normalized_query)
            if score <= 0:
                continue
            results.append({
                "path": document.get("path", ""),
                "name": document.get("name", ""),
                "title": document.get("title", ""),
                "folder": document.get("folder", ""),
                "snippet": self._search_snippet(document, terms),
                "score": score,
            })
        results.sort(key=lambda item: (-item["score"], item["title"].casefold(), item["path"].casefold()))
        results = results[:limit]

        return {"indexed": True, "query": normalized_query, "count": len(results), "results": results}

    def delete_empty_folder(self, folder_path):
        if str(folder_path).strip().replace("\\", "/") == self.unsorted_name:
            raise LibraryError("Cannot delete _Unsorted", code="protected_folder")
        target = self._safe_dir(folder_path, must_exist=True)
        if target == self.sorted_root:
            raise LibraryError("Cannot delete library root", code="protected_folder")
        if any(target.iterdir()):
            raise LibraryError("Folder is not empty", code="folder_not_empty")
        rel = self._rel(target)
        target.rmdir()
        return {"deleted": rel}

    def ignore_duplicate_group(self, paths):
        if not isinstance(paths, list) or len(paths) < 2:
            raise LibraryError("Duplicate group needs at least two PDFs", code="invalid_duplicate_group")

        files = [self._safe_file(path) for path in paths]
        keys = {self._duplicate_key(path.name) for path in files}
        if len(keys) != 1 or "" in keys:
            raise LibraryError("PDFs do not belong to the same duplicate group", code="invalid_duplicate_group")

        key = keys.pop()
        rel_paths = [self._rel(path) for path in files]
        signature = self._duplicate_group_signature(key, rel_paths)
        state = self._load_state()
        ignored = set(state.get("ignored_duplicate_groups", []))
        ignored.add(signature)
        state["ignored_duplicate_groups"] = sorted(ignored)
        self._save_state(state)
        return {"ignored": key, "signature": signature}

    def ignore_cleanup_issue(self, section, path):
        allowed_sections = {
            "unsorted",
            "long_names",
            "double_extension",
            "archive_leftovers",
            "missing_preview",
            "empty_folders",
        }
        if section not in allowed_sections:
            raise LibraryError("Invalid cleanup section", code="invalid_cleanup_section")
        if section == "empty_folders":
            self._safe_dir(path, must_exist=True)
        else:
            self._safe_file(path)

        signature = self._cleanup_issue_signature(section, path)
        state = self._load_state()
        ignored = set(state.get("ignored_cleanup_items", []))
        ignored.add(signature)
        state["ignored_cleanup_items"] = sorted(ignored)
        self._save_state(state)
        return {"ignored": path, "section": section, "signature": signature}

    def set_favorite(self, pdf_path, favorite):
        self._safe_file(pdf_path)
        state = self._load_state()
        favorites = set(state.get("favorites", []))
        if favorite:
            favorites.add(pdf_path)
        else:
            favorites.discard(pdf_path)
        state["favorites"] = sorted(favorites, key=str.casefold)
        self._save_state(state)
        return {"favorites": state["favorites"]}

    def set_metadata(self, pdf_path, metadata):
        source = self._safe_file(pdf_path)
        rel = self._rel(source)
        state = self._load_state()
        existing = self._metadata_for(rel, state.get("metadata", {}), absolute_path=source)
        merged = dict(existing)
        merged.update(metadata or {})
        normalized = self._normalize_metadata(merged)
        all_metadata = dict(state.get("metadata", {}))
        if normalized == self._empty_metadata():
            all_metadata.pop(rel, None)
        else:
            all_metadata[rel] = normalized
        state["metadata"] = all_metadata
        self._save_state(state)
        return {"path": rel, "metadata": normalized}

    def absolute_pdf(self, pdf_path):
        return self._safe_file(pdf_path)

    def absolute_thumbnail(self, thumbnail_name):
        if "/" in thumbnail_name or "\\" in thumbnail_name or thumbnail_name.startswith("."):
            raise LibraryError("Invalid thumbnail path")
        path = (self.data_root / thumbnail_name).resolve()
        if path.parent != self.data_root or not path.exists() or path.suffix.lower() != ".webp":
            raise LibraryError("Thumbnail not found")
        return path

    def absolute_generated_thumbnail(self, thumbnail_name):
        if "/" in thumbnail_name or "\\" in thumbnail_name or thumbnail_name.startswith("."):
            raise LibraryError("Invalid generated thumbnail path")
        path = (self.generated_thumbnail_dir / thumbnail_name).resolve()
        if path.parent != self.generated_thumbnail_dir.resolve() or not path.exists() or path.suffix.lower() not in {".webp", ".png"}:
            raise LibraryError("Generated thumbnail not found")
        return path

    def _ensure_roots(self):
        self.sorted_root.mkdir(parents=True, exist_ok=True)
        (self.sorted_root / self.unsorted_name).mkdir(parents=True, exist_ok=True)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.generated_thumbnail_dir.mkdir(parents=True, exist_ok=True)

    def _load_thumbnail_manifest(self):
        if not self.thumbnail_manifest_path.exists():
            return {}
        try:
            data = json.loads(self.thumbnail_manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
        return data if isinstance(data, dict) else {}

    def _save_thumbnail_manifest(self, manifest):
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self._write_text_replacing_file(
            self.thumbnail_manifest_path,
            json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True),
        )

    def _manifest_thumbnail_for(self, pdf_path):
        rel = self._rel(pdf_path)
        entry = self._load_thumbnail_manifest().get(rel)
        if not isinstance(entry, dict):
            return None
        try:
            stat = pdf_path.stat()
        except OSError:
            return None
        if entry.get("sourceSize") != stat.st_size or entry.get("sourceMtime") != stat.st_mtime:
            return None
        if entry.get("version") != self.THUMBNAIL_MANIFEST_VERSION:
            return None
        if entry.get("size") != int(self.GENERATED_THUMBNAIL_SIZE) or entry.get("quality") != int(self.GENERATED_THUMBNAIL_QUALITY):
            return None
        name = entry.get("thumbnail")
        url = entry.get("thumbnailUrl")
        if not name or not url:
            return None
        try:
            if url.startswith("/thumb/"):
                self.absolute_thumbnail(name)
            elif url.startswith("/generated-thumb/"):
                self.absolute_generated_thumbnail(name)
            else:
                return None
        except LibraryError:
            return None
        return {"name": name, "url": url}

    def _remember_thumbnail(self, pdf_path, thumbnail):
        try:
            stat = pdf_path.stat()
        except OSError:
            return
        manifest = self._load_thumbnail_manifest()
        manifest[self._rel(pdf_path)] = {
            "thumbnail": thumbnail["name"],
            "thumbnailUrl": thumbnail["url"],
            "sourceSize": stat.st_size,
            "sourceMtime": stat.st_mtime,
            "size": int(self.GENERATED_THUMBNAIL_SIZE),
            "quality": int(self.GENERATED_THUMBNAIL_QUALITY),
            "version": self.THUMBNAIL_MANIFEST_VERSION,
        }
        self._save_thumbnail_manifest(manifest)

    def _folders(self, include_empty=False):
        pdf_folders = set()
        if not include_empty:
            for pdf_path in self.sorted_root.rglob("*.pdf"):
                if not pdf_path.is_file():
                    continue
                parent = pdf_path.parent
                while parent != self.sorted_root:
                    pdf_folders.add(self._rel(parent))
                    parent = parent.parent
        folders = []
        for path in sorted([self.sorted_root, *self.sorted_root.rglob("*")], key=lambda p: self._rel(p).casefold()):
            if not path.is_dir():
                continue
            rel = "" if path == self.sorted_root else self._rel(path)
            if rel == "":
                continue
            if not include_empty and rel not in pdf_folders:
                continue
            folders.append({
                "name": path.name,
                "path": rel,
                "parent": str(Path(rel).parent).replace(os.sep, "/") if Path(rel).parent != Path(".") else "",
            })
        return folders

    def _cleanup_pdf_item(self, pdf):
        return {
            "name": pdf["name"],
            "title": self._display_title(pdf["name"]),
            "path": pdf["path"],
            "folder": pdf["folder"],
            "size": pdf["size"],
            "thumbnailUrl": pdf.get("thumbnailUrl"),
            "isUnsorted": pdf["isUnsorted"],
        }

    def _folder_for_rel(self, rel_path):
        parent = Path(rel_path).parent
        return "" if parent == Path(".") else str(parent).replace(os.sep, "/")

    def _pdf_location_response(self, path, folder):
        return {"path": self._rel(path), "name": Path(path).name, "folder": self._rel(folder)}

    def _display_title(self, filename):
        title = re.sub(r"\.pdf$", "", filename, flags=re.IGNORECASE)
        title = re.sub(r"^\d{4}-\d{2}-\d{2}\s+", "", title)
        return title

    def _duplicate_key(self, filename):
        key = self._display_title(filename).casefold()
        key = re.sub(r"-archive$", "", key)
        key = re.sub(r"\s+", " ", key).strip()
        return key

    def _duplicate_group_signature(self, key, paths):
        normalized_paths = sorted(str(path) for path in paths)
        return json.dumps({"key": key, "paths": normalized_paths}, ensure_ascii=False, sort_keys=True)

    def _cleanup_issue_signature(self, section, path):
        return json.dumps({"section": section, "path": str(path)}, ensure_ascii=False, sort_keys=True)

    def _empty_metadata(self):
        return {
            "tags": [],
            "note": "",
            "status": "",
            "sourceUrl": "",
            "documentType": "",
            "mimeType": "",
            "filePath": "",
            "fileSize": 0,
            "createdAt": "",
            "originalFilename": "",
            "importedAt": "",
            "importMethod": "",
            "contentHash": "",
            "archive": {},
            "history": [],
            "read": False,
            "readAt": "",
        }

    def _metadata_for(self, path, metadata, document_type=None, absolute_path=None):
        normalized = self._normalize_metadata(metadata.get(path, {}))
        doc_type = document_type or normalized.get("documentType") or self._document_type_for_name(path)
        normalized["documentType"] = doc_type
        normalized["mimeType"] = "application/pdf"
        normalized["filePath"] = str(path)
        if absolute_path and Path(absolute_path).exists():
            stat = Path(absolute_path).stat()
            normalized["fileSize"] = stat.st_size
            normalized["createdAt"] = normalized.get("createdAt") or ""
        type_tag = doc_type
        if type_tag and type_tag not in normalized["tags"]:
            normalized["tags"].insert(0, type_tag)
        return normalized

    def _normalize_metadata(self, metadata):
        tags = []
        raw_tags = metadata.get("tags", []) if isinstance(metadata, dict) else []
        if isinstance(raw_tags, str):
            raw_tags = raw_tags.split(",")
        if not isinstance(raw_tags, list):
            raw_tags = []
        for raw_tag in raw_tags:
            tag = re.sub(r"\s+", " ", str(raw_tag).strip())
            if tag and tag not in tags:
                tags.append(tag[:40])
            if len(tags) >= 12:
                break

        note = str(metadata.get("note", "") if isinstance(metadata, dict) else "").strip()[:2000]
        source_url = str(metadata.get("sourceUrl", "") if isinstance(metadata, dict) else "").strip()[:1000]
        document_type = str(metadata.get("documentType", metadata.get("document_type", "")) if isinstance(metadata, dict) else "").strip().casefold()
        if document_type not in {"", "pdf"}:
            document_type = ""
        mime_type = "application/pdf" if document_type == "pdf" else ""
        file_path = str(metadata.get("filePath", metadata.get("file_path", "")) if isinstance(metadata, dict) else "").strip()[:1000]
        file_size = metadata.get("fileSize", metadata.get("file_size", 0)) if isinstance(metadata, dict) else 0
        try:
            file_size = max(0, int(file_size or 0))
        except (TypeError, ValueError):
            file_size = 0
        created_at = str(metadata.get("createdAt", metadata.get("created_at", "")) if isinstance(metadata, dict) else "").strip()[:80]
        original_filename = str(metadata.get("originalFilename", metadata.get("original_filename", "")) if isinstance(metadata, dict) else "").strip()[:255]
        imported_at = str(metadata.get("importedAt", metadata.get("imported_at", "")) if isinstance(metadata, dict) else "").strip()[:80]
        import_method = str(metadata.get("importMethod", metadata.get("import_method", "")) if isinstance(metadata, dict) else "").strip()
        if import_method not in {"", "local_upload", "url_pdf", "web_archive", "manual", "drive_sync"}:
            import_method = ""
        content_hash = str(metadata.get("contentHash", metadata.get("content_hash", "")) if isinstance(metadata, dict) else "").strip().lower()
        if not re.fullmatch(r"[a-f0-9]{64}", content_hash):
            content_hash = ""
        archive = metadata.get("archive", {}) if isinstance(metadata, dict) else {}
        if not isinstance(archive, dict):
            archive = {}
        history = metadata.get("history", []) if isinstance(metadata, dict) else []
        if not isinstance(history, list):
            history = []
        normalized_history = []
        for entry in history[-50:]:
            if not isinstance(entry, dict):
                continue
            entry_type = str(entry.get("type", "")).strip()[:40]
            at = str(entry.get("at", "")).strip()[:80]
            details = entry.get("details", {})
            if not isinstance(details, dict):
                details = {}
            if entry_type and at:
                normalized_history.append({
                    "type": entry_type,
                    "at": at,
                    "details": {
                        str(key)[:80]: str(value)[:1000]
                        for key, value in details.items()
                        if value is not None
                    },
                })
        status = str(metadata.get("status", "") if isinstance(metadata, dict) else "").strip()
        if status not in self.VALID_METADATA_STATUSES:
            status = ""
        read = bool(metadata.get("read", False)) if isinstance(metadata, dict) else False
        read_at = str(metadata.get("readAt", metadata.get("read_at", "")) if isinstance(metadata, dict) else "").strip()[:80]
        return {
            "tags": tags,
            "note": note,
            "status": status,
            "sourceUrl": source_url,
            "documentType": document_type,
            "mimeType": mime_type,
            "filePath": file_path,
            "fileSize": file_size,
            "createdAt": created_at,
            "originalFilename": original_filename,
            "importedAt": imported_at,
            "importMethod": import_method,
            "contentHash": content_hash,
            "archive": archive,
            "history": normalized_history,
            "read": read,
            "readAt": read_at,
        }

    def _set_source_url(self, pdf_path, url):
        metadata = self._metadata_for(pdf_path, self._load_state().get("metadata", {}))
        metadata["sourceUrl"] = url
        self.set_metadata(pdf_path, metadata)

    def _set_passport_metadata(self, pdf_path, values, history_type=None, history_details=None):
        state = self._load_state()
        metadata = self._metadata_for(pdf_path, state.get("metadata", {}))
        metadata.update(values or {})
        if history_type:
            metadata["history"] = self._history_with(metadata.get("history", []), history_type, history_details or {})
        all_metadata = dict(state.get("metadata", {}))
        all_metadata[pdf_path] = self._normalize_metadata(metadata)
        state["metadata"] = all_metadata
        self._save_state(state)

    def _append_history(self, pdf_path, history_type, details):
        state = self._load_state()
        metadata = self._metadata_for(pdf_path, state.get("metadata", {}))
        metadata["history"] = self._history_with(metadata.get("history", []), history_type, details)
        all_metadata = dict(state.get("metadata", {}))
        all_metadata[pdf_path] = self._normalize_metadata(metadata)
        state["metadata"] = all_metadata
        self._save_state(state)

    def _history_with(self, history, history_type, details):
        entries = list(history or [])
        entries.append({
            "type": history_type,
            "at": self._now_iso(),
            "details": details or {},
        })
        return entries[-50:]

    def _content_hash(self, path):
        digest = hashlib.sha256()
        with Path(path).open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _now_iso(self):
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    def _duplicate_candidates(self, content_hash="", source_url="", filename=""):
        candidates = []
        seen = set()
        normalized_name = self._duplicate_key(filename)
        source_url = str(source_url or "").strip()
        content_hash = str(content_hash or "").strip().lower()
        for pdf in self.scan()["pdfs"]:
            metadata = pdf.get("metadata", {})
            checks = []
            if content_hash and metadata.get("contentHash") == content_hash:
                checks.append("content_hash")
            if source_url and metadata.get("sourceUrl") == source_url:
                checks.append("source_url")
            if normalized_name and self._duplicate_key(pdf["name"]) == normalized_name:
                checks.append("normalized_name")
            for check in checks:
                key = (check, pdf["path"])
                if key in seen:
                    continue
                seen.add(key)
                candidates.append({"type": check, "path": pdf["path"], "name": pdf["name"]})
        return candidates

    def _add_filename_suggestion(self, suggestions, value, reason, current):
        cleaned = self._clean_rename_title(value)
        if not cleaned or len(cleaned) < 4:
            return
        if current and cleaned.casefold() == current.casefold():
            return
        if any(item["value"].casefold() == cleaned.casefold() for item in suggestions):
            return
        suggestions.append({"value": cleaned, "reason": reason})

    def _indexed_title_candidate(self, text):
        for raw_line in re.split(r"[.\n\r]+", str(text or "")):
            line = self._clean_rename_title(raw_line)
            if self._useful_indexed_title(line):
                return line
        return ""

    def _useful_indexed_title(self, line):
        if len(line) < 8 or len(line) > 100:
            return False
        if re.match(r"^[^A-Za-z0-9À-ÿ]", line):
            return False
        if re.match(r"^https?:", line, flags=re.I):
            return False
        if re.search(r"\b(chairman|chairmen|secretary|confidential|publication|page|figure|table)\b", line, flags=re.I):
            return False
        if ":" in line or "," in line or ";" in line:
            return False
        if re.match(r"^(abstract|introduction|references|contents|table of contents|page \d+)$", line, flags=re.I):
            return False
        words = [word for word in line.split() if word]
        return 2 <= len(words) <= 14

    def _url_title_candidate(self, source_url):
        parsed = urllib.parse.urlparse(str(source_url or ""))
        name = Path(urllib.parse.unquote(parsed.path or "")).name
        return self._clean_rename_title(name)

    def _source_date_title_candidate(self, source_url):
        raw = str(source_url or "")
        match = re.search(r"web\.archive\.org/web/(\d{4})\d{10}/(?:https?:)?/*([^/?#]+)", raw, flags=re.I)
        if not match:
            return ""
        year = match.group(1)
        host = match.group(2).removeprefix("www.")
        stem = host.split(":")[0].split(".")[0]
        title = self._clean_rename_title(stem)
        return f"{year} {title}" if title else ""

    def _pdf_metadata_title(self, path):
        try:
            result = subprocess.run(
                ["mdls", "-name", "kMDItemTitle", "-raw", str(path)],
                capture_output=True,
                text=True,
                timeout=2,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            return ""
        if result.returncode != 0:
            return ""
        title = result.stdout.strip()
        if not title or title == "(null)":
            return ""
        return title

    def _clean_rename_title(self, value):
        title = str(value or "").strip()
        if title.casefold().endswith(".pdf"):
            title = title[:-4]
        title = re.sub(r"^(\d{4})[-_. ](\d{2})[-_. ](\d{2})\s*", "", title, flags=re.I)
        title = re.sub(r"\.(aspx?|php)$", "", title, flags=re.I)
        title = re.sub(r"\b(main|fulltext|download|document|article|paper|untitled|index)\b", " ", title, flags=re.I)
        title = re.sub(r"\b[a-f0-9]{12,}\b", " ", title, flags=re.I)
        title = re.sub(r"\b\d{6,}\b", " ", title)
        title = re.sub(r"\s*\((?:copy|\d+)\)\s*$", " ", title, flags=re.I)
        title = re.sub(r"([a-z])([A-Z])", r"\1 \2", title)
        title = re.sub(r"([A-Za-z])(\d)", r"\1 \2", title)
        title = re.sub(r"(\d)([A-Za-z])", r"\1 \2", title)
        title = re.sub(r"[_-]+", " ", title)
        title = re.sub(r"\s+", " ", title).strip()
        words = []
        for word in title.split():
            words.append(word if word.isupper() and len(word) <= 6 else word[:1].upper() + word[1:].lower())
        return " ".join(words)[:120].strip()

    def _set_document_type(self, document_path, document_type, mime_type):
        metadata = self._metadata_for(document_path, self._load_state().get("metadata", {}), document_type)
        metadata["documentType"] = document_type
        metadata["mimeType"] = mime_type
        if document_type not in metadata["tags"]:
            metadata["tags"].insert(0, document_type)
        self.set_metadata(document_path, metadata)

    def _move_out_of_library(self, source, external_root, escape_message):
        source_rel = self._rel(source)
        root = Path(external_root).resolve()
        destination = (root / Path(source_rel)).resolve()
        if destination != root and root not in destination.parents:
            raise LibraryError(escape_message)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            destination = self._unique_path(destination)
        shutil.move(str(source), str(destination))

        state = self._load_state()
        if self._remove_state_path(state, source_rel):
            self._save_state(state)
        return source_rel, destination

    def _move_state_path(self, state, source_rel, destination_rel):
        changed = False
        favorites = set(state.get("favorites", []))
        if source_rel in favorites:
            favorites.remove(source_rel)
            favorites.add(destination_rel)
            state["favorites"] = sorted(favorites, key=str.casefold)
            changed = True

        metadata = dict(state.get("metadata", {}))
        if source_rel in metadata:
            metadata[destination_rel] = metadata.pop(source_rel)
            state["metadata"] = metadata
            changed = True
        return changed

    def _remove_state_path(self, state, source_rel):
        changed = False
        favorites = set(state.get("favorites", []))
        if source_rel in favorites:
            favorites.remove(source_rel)
            state["favorites"] = sorted(favorites, key=str.casefold)
            changed = True

        metadata = dict(state.get("metadata", {}))
        if source_rel in metadata:
            metadata.pop(source_rel, None)
            state["metadata"] = metadata
            changed = True
        return changed

    def _extract_pdf_text(self, pdf_path):
        for extractor in (
            self._extract_pdf_text_with_pdftotext,
            self._extract_pdf_text_with_mdls,
            self._extract_pdf_text_with_pdfkit,
        ):
            text = extractor(pdf_path)
            if text:
                return text
        return ""

    def _safe_url(self, url):
        raw = str(url or "").strip()
        parsed = urllib.parse.urlparse(raw)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise LibraryError("URL must start with http:// or https://", code="invalid_url")
        return urllib.parse.urlunparse(parsed)

    def _download_url(self, url):
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "PDFLibrary/1.0",
                "Accept": "application/pdf,*/*;q=0.2",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                content = response.read(25 * 1024 * 1024)
                content_type = response.headers.get("Content-Type", "")
                filename = self._filename_from_content_disposition(response.headers.get("Content-Disposition", ""))
        except Exception as exc:
            raise LibraryError(f"Could not load URL: {exc}", code="url_load_failed") from exc
        if not content:
            raise LibraryError("URL returned an empty response", code="empty_url_response")
        return {"content": content, "content_type": content_type, "filename": filename, "final_url": response.geturl()}

    def _download_looks_like_pdf(self, downloaded, url):
        content_type = downloaded.get("content_type", "").casefold()
        content = downloaded.get("content", b"")
        return "application/pdf" in content_type or self._url_path_looks_like_pdf(url) or content.startswith(b"%PDF")

    def _url_path_looks_like_pdf(self, url):
        return urllib.parse.urlparse(url).path.casefold().endswith(".pdf")

    def _render_url_to_pdf(self, url, output_path):
        helper = Path(__file__).resolve().parent / "url_to_pdf.js"
        node = self._node_executable()
        if not node or not helper.exists():
            raise LibraryError("Website-to-PDF helper is unavailable", code="url_render_unavailable")
        try:
            result = subprocess.run(
                [node, str(helper), url, str(output_path)],
                cwd=str(helper.parent.parent),
                capture_output=True,
                text=True,
                timeout=90,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise LibraryError("Website-to-PDF rendering timed out", code="url_render_timeout") from exc
        except OSError as exc:
            raise LibraryError(f"Could not start website-to-PDF helper: {exc}", code="url_render_failed") from exc
        if result.returncode != 0:
            output = (result.stderr or result.stdout or "Website-to-PDF rendering failed").strip()
            lines = [line.strip() for line in output.splitlines() if line.strip()]
            message = next((line for line in lines if not line.startswith("at ")), lines[-1] if lines else "Website-to-PDF rendering failed")
            raise LibraryError(message, code="url_render_failed")

    def _node_executable(self):
        found = shutil.which("node")
        if found:
            return found
        for candidate in (
            "/opt/homebrew/opt/node@24/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ):
            if Path(candidate).exists():
                return candidate
        return ""

    def _url_import_filename(self, requested, downloaded, url):
        if requested:
            base = str(requested).strip()
        elif downloaded:
            base = str(downloaded).strip()
        else:
            parsed = urllib.parse.urlparse(url)
            stem = Path(urllib.parse.unquote(parsed.path)).name or parsed.netloc
            base = stem or "Imported URL"
        base = re.sub(r"\.pdf$", "", base, flags=re.IGNORECASE)
        base = self._clean_filename_stem(base)
        return f"{base}.pdf"

    def _filename_from_content_disposition(self, header):
        match = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)', header or "", flags=re.IGNORECASE)
        if not match:
            return ""
        return urllib.parse.unquote(match.group(1).strip())

    def _clean_filename_stem(self, value):
        cleaned = re.sub(r"[/:\\]+", " ", str(value))
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        cleaned = cleaned.strip(".")
        return cleaned[:120] or "Imported URL"

    def _load_search_index_documents(self):
        if not self.search_index_path.exists():
            return {}
        try:
            data = json.loads(self.search_index_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return {
            document.get("path"): document
            for document in data.get("documents", [])
            if isinstance(document, dict) and isinstance(document.get("path"), str)
        }

    def _write_text_replacing_file(self, path, text):
        try:
            path.write_text(text, encoding="utf-8")
        except OSError:
            path.unlink(missing_ok=True)
            path.write_text(text, encoding="utf-8")

    def _extract_pdf_text_with_pdftotext(self, pdf_path):
        extractor = shutil.which("pdftotext")
        if not extractor:
            return ""
        try:
            result = subprocess.run(
                [extractor, "-layout", "-enc", "UTF-8", str(pdf_path), "-"],
                check=False,
                timeout=30,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
            )
        except (subprocess.SubprocessError, OSError):
            return ""
        return result.stdout if result.returncode == 0 else ""

    def _extract_pdf_text_with_mdls(self, pdf_path):
        try:
            result = subprocess.run(
                ["/usr/bin/mdls", "-raw", "-name", "kMDItemTextContent", str(pdf_path)],
                check=False,
                timeout=20,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
            )
        except (subprocess.SubprocessError, OSError):
            return ""
        if result.returncode != 0:
            return ""
        text = result.stdout or ""
        return "" if text.strip() in ("", "(null)", "null") else text

    def _extract_pdf_text_with_pdfkit(self, pdf_path):
        helper = self._pdf_text_extractor_path()
        if not helper:
            return ""
        try:
            result = subprocess.run(
                [str(helper), str(pdf_path)],
                check=False,
                timeout=20,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
            )
        except (subprocess.SubprocessError, OSError):
            return ""
        return result.stdout if result.returncode == 0 else ""

    def _pdf_text_extractor_path(self):
        source = self.state_dir / "pdf_text_extractor.swift"
        bundled_source = Path(__file__).resolve().parent / "pdf_text_extractor.swift"
        binary = self.state_dir / "pdf_text_extractor"
        if not bundled_source.exists():
            return None
        self.state_dir.mkdir(parents=True, exist_ok=True)
        if not source.exists() or source.read_text(encoding="utf-8") != bundled_source.read_text(encoding="utf-8"):
            source.write_text(bundled_source.read_text(encoding="utf-8"), encoding="utf-8")
        if binary.exists() and binary.stat().st_mtime >= source.stat().st_mtime:
            return binary
        try:
            subprocess.run(
                [
                    "/usr/bin/swiftc",
                    "-framework", "PDFKit",
                    "-framework", "AppKit",
                    "-framework", "Vision",
                    str(source),
                    "-o", str(binary),
                ],
                check=True,
                timeout=60,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except (subprocess.SubprocessError, OSError):
            return None
        return binary if binary.exists() else None

    def _clean_extracted_text(self, text):
        cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
        return cleaned[:500_000]

    def _search_terms(self, query):
        normalized = self._normalized_search_text(query)
        return [term for term in normalized.split() if len(term) >= 2]

    def _normalized_search_text(self, value):
        decomposed = unicodedata.normalize("NFKD", str(value or ""))
        asciiish = "".join(char for char in decomposed if not unicodedata.combining(char))
        return re.sub(r"[^a-z0-9]+", " ", asciiish.casefold()).strip()

    def _search_score(self, document, terms, raw_query):
        fields = {
            "title": document.get("title", ""),
            "name": document.get("name", ""),
            "folder": document.get("folder", ""),
            "text": document.get("text", ""),
        }
        normalized_fields = {key: self._normalized_search_text(value) for key, value in fields.items()}
        combined = " ".join(normalized_fields.values())
        if not all(term in combined for term in terms):
            return 0

        normalized_query = self._normalized_search_text(raw_query)
        score = 0
        weights = {"title": 220, "name": 180, "folder": 60, "text": 10}
        for field, normalized in normalized_fields.items():
            weight = weights[field]
            if normalized_query and normalized_query in normalized:
                score += weight * 6
            for term in terms:
                if term in normalized:
                    score += weight
                    score += min(normalized.count(term), 5) * max(1, weight // 12)
        return score

    def _search_snippet(self, document, terms):
        text = document.get("text") or document.get("title") or document.get("name") or document.get("path") or ""
        folded = self._normalized_search_text(text)
        index = -1
        for term in terms:
            index = folded.find(term)
            if index >= 0:
                break
        if index < 0:
            return text[:180]
        start = max(0, index - 80)
        end = min(len(text), index + max((len(term) for term in terms), default=0) + 100)
        prefix = "..." if start > 0 else ""
        suffix = "..." if end < len(text) else ""
        return f"{prefix}{text[start:end]}{suffix}"

    def _thumbnail_for(self, pdf_path, force_generate=False):
        pdf_name = pdf_path.name
        stem = pdf_name[:-4] if pdf_name.lower().endswith(".pdf") else pdf_path.stem
        candidates = [self.data_root / f"{stem}-thumbnail.webp"]
        if stem.endswith("-archive"):
            candidates.append(self.data_root / f"{stem[:-8]}-thumbnail.webp")
        for candidate in candidates:
            if candidate.exists():
                return {"name": candidate.name, "url": f"/thumb/{candidate.name}"}
        manifest_thumbnail = self._manifest_thumbnail_for(pdf_path)
        if manifest_thumbnail:
            return manifest_thumbnail
        generated = self._generated_thumbnail_for(pdf_path, force=force_generate)
        if generated:
            return {"name": generated.name, "url": f"/generated-thumb/{generated.name}"}
        return None

    def _generated_thumbnail_for(self, pdf_path, force=False):
        rel = self._rel(pdf_path)
        digest = hashlib.sha1(rel.encode("utf-8")).hexdigest()
        target = self.generated_thumbnail_dir / f"{digest}.webp"
        legacy_target = self.generated_thumbnail_dir / f"{digest}.png"
        if target.exists():
            target.unlink()
        if legacy_target.exists():
            legacy_target.unlink()
        existing = self._adopt_quicklook_thumbnail(pdf_path, target)
        if existing:
            return existing
        if not (self.generate_thumbnails or force):
            return None
        self.generated_thumbnail_dir.mkdir(parents=True, exist_ok=True)
        generated = self._generate_thumbnail_with_quicklook(pdf_path, target)
        if generated:
            return generated
        return self._generate_thumbnail_with_pdftoppm(pdf_path, target)

    def _generate_thumbnail_with_quicklook(self, pdf_path, target):
        try:
            subprocess.run(
                ["/usr/bin/qlmanage", "-t", "-s", self.GENERATED_THUMBNAIL_SIZE, "-o", str(self.generated_thumbnail_dir), str(pdf_path)],
                check=False,
                timeout=25,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except (subprocess.SubprocessError, OSError):
            return None
        generated_candidates = self._quicklook_thumbnail_candidates(pdf_path)
        if not generated_candidates:
            return None
        return self._store_generated_thumbnail(generated_candidates[-1], target)

    def _generate_thumbnail_with_pdftoppm(self, pdf_path, target):
        renderer = shutil.which("pdftoppm")
        if not renderer:
            return None
        output_prefix = self.generated_thumbnail_dir / f"{target.stem}-poppler"
        generated_png = output_prefix.with_suffix(".png")
        generated_png.unlink(missing_ok=True)
        try:
            subprocess.run(
                [
                    renderer,
                    "-f",
                    "1",
                    "-singlefile",
                    "-png",
                    "-scale-to",
                    self.GENERATED_THUMBNAIL_SIZE,
                    str(pdf_path),
                    str(output_prefix),
                ],
                check=True,
                timeout=25,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except (subprocess.SubprocessError, OSError):
            generated_png.unlink(missing_ok=True)
            return None
        return self._store_generated_thumbnail(generated_png, target)

    def _adopt_quicklook_thumbnail(self, pdf_path, target):
        generated_candidates = self._quicklook_thumbnail_candidates(pdf_path)
        if not generated_candidates:
            return None
        self.generated_thumbnail_dir.mkdir(parents=True, exist_ok=True)
        return self._store_generated_thumbnail(generated_candidates[-1], target)

    def _store_generated_thumbnail(self, source_png, target):
        if not source_png.exists():
            return None
        if self._convert_thumbnail_to_webp(source_png, target):
            source_png.unlink(missing_ok=True)
            return target
        fallback = target.with_suffix(".png")
        try:
            source_png.replace(fallback)
        except FileNotFoundError:
            return None
        return fallback if fallback.exists() else None

    def _convert_thumbnail_to_webp(self, source_png, target):
        encoder = shutil.which("cwebp")
        if not encoder:
            return False
        try:
            subprocess.run(
                [encoder, "-quiet", "-q", self.GENERATED_THUMBNAIL_QUALITY, str(source_png), "-o", str(target)],
                check=True,
                timeout=15,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except (subprocess.SubprocessError, OSError):
            return False
        return target.exists()

    def _quicklook_thumbnail_candidates(self, pdf_path):
        if not self.generated_thumbnail_dir.exists():
            return []
        prefix = f"{pdf_path.name}"
        return sorted(
            path for path in self.generated_thumbnail_dir.iterdir()
            if path.is_file() and path.name.startswith(prefix) and path.suffix.lower() == ".png"
        )

    def _load_state(self):
        self.state_dir.mkdir(parents=True, exist_ok=True)
        if not self.state_path.exists():
            return self._default_state()
        try:
            data = json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return self._default_state()
        if not isinstance(data, dict) or not isinstance(data.get("favorites", []), list):
            return self._default_state()
        return {
            "favorites": [item for item in data.get("favorites", []) if isinstance(item, str)],
            "ignored_duplicate_groups": [
                item for item in data.get("ignored_duplicate_groups", []) if isinstance(item, str)
            ],
            "ignored_cleanup_items": [
                item for item in data.get("ignored_cleanup_items", []) if isinstance(item, str)
            ],
            "metadata": {
                path: self._normalize_metadata(value)
                for path, value in data.get("metadata", {}).items()
                if isinstance(path, str) and isinstance(value, dict)
            } if isinstance(data.get("metadata", {}), dict) else {},
        }

    def _default_state(self):
        return {
            "favorites": [],
            "ignored_duplicate_groups": [],
            "ignored_cleanup_items": [],
            "metadata": {},
        }

    def _save_state(self, state):
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def _safe_file(self, rel_path):
        path = self._resolve_inside_sorted(rel_path)
        if not path.exists() or not path.is_file() or path.suffix.lower() != ".pdf":
            raise LibraryError("PDF not found")
        return path

    def _safe_dir(self, rel_path, must_exist):
        path = self._resolve_inside_sorted(rel_path)
        if must_exist and (not path.exists() or not path.is_dir()):
            raise LibraryError("Folder not found")
        if path.exists() and not path.is_dir():
            raise LibraryError("Destination is not a folder")
        return path

    def _safe_pdf_filename(self, filename):
        name = str(filename or "").strip()
        if not name:
            raise LibraryError("Filename cannot be empty", code="invalid_filename")
        if "/" in name or "\\" in name:
            raise LibraryError("Filename cannot contain folders", code="invalid_filename")
        if name in (".", "..") or name.startswith("."):
            raise LibraryError("Invalid filename", code="invalid_filename")
        if not name.lower().endswith(".pdf"):
            name = f"{name}.pdf"
        if name.lower() == ".pdf":
            raise LibraryError("Filename cannot be empty", code="invalid_filename")
        return name

    def _resolve_inside_sorted(self, rel_path):
        if rel_path is None:
            raise LibraryError("Missing path")
        rel = str(rel_path).strip().replace("\\", "/")
        if rel.startswith("/") or rel == "":
            raise LibraryError("Invalid path")
        path = (self.sorted_root / rel).resolve()
        if path != self.sorted_root and self.sorted_root not in path.parents:
            raise LibraryError("Path escapes sorted_pdfs")
        return path

    def _rel(self, path):
        return str(Path(path).resolve().relative_to(self.sorted_root)).replace(os.sep, "/")

    def _unique_path(self, path):
        stem = path.stem
        suffix = path.suffix
        index = 2
        while True:
            candidate = path.with_name(f"{stem} ({index}){suffix}")
            if not candidate.exists():
                return candidate
            index += 1

    def _document_type_for_path(self, path):
        return self._document_type_for_name(Path(path).name)

    def _document_type_for_name(self, name):
        return "pdf"

    def _mime_type_for_path(self, path):
        return "application/pdf"
