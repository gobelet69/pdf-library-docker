# PDF Library Docker

Minimal Docker package for the PDF Library web app.

## Run With Docker Hub

```bash
mkdir -p library/sorted_pdfs/_Unsorted
docker run --rm -p 8765:8765 -v "$PWD/library:/app/library" gobelet/pdf-library:latest
```

Then open:

```text
http://localhost:8765
```

## Run With Compose

```bash
mkdir -p library/sorted_pdfs/_Unsorted
docker compose up --build
```

The mounted `library` directory stores PDFs and app state outside the image:

- `library/sorted_pdfs` for PDFs
- `library/app_state/pdf_browser/search_index.json` for the search index
- `library/app_state/pdf_browser/generated_thumbnails` for generated thumbnails

On startup, the container scans the mounted library and rebuilds the search index. Set `PDF_LIBRARY_REBUILD_INDEX=0` to skip startup indexing, or `PDF_LIBRARY_BOOTSTRAP=0` to skip both scan and indexing.

Direct PDF URL imports are supported. Browser-based website-to-PDF capture is intentionally excluded from this minimal Docker image.
