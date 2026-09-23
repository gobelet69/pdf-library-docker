# PDF Library Docker

Minimal Docker package for the PDF Library web app.

## Run With Docker Hub

```bash
mkdir -p library/sorted_pdfs/_Unsorted
docker run -d --name pdf-library -p 127.0.0.1:8765:8765 -v "$PWD/library:/app/library" gobelet/pdf-library:latest
```

Use any absolute host directory in place of `$PWD/library`. Put existing PDFs in its `sorted_pdfs/_Unsorted` subdirectory, or organize them in subfolders under `sorted_pdfs`.

The first launch creates the admin password in the mounted directory. Read it with:

```bash
docker exec pdf-library cat /app/library/app_state/pdf_browser/admin_password
```

The username is `admin`. Then open:

```text
http://localhost:8765
```

## Run With Compose

```bash
mkdir -p library/sorted_pdfs/_Unsorted
docker compose up -d --build
```

To use a host directory elsewhere, set `PDF_LIBRARY_DIR` to its absolute path, either in a local `.env` file or on the command line:

```bash
PDF_LIBRARY_DIR=/absolute/path/to/pdf-bank docker compose up -d --build
```

Read the password with `docker compose exec pdf-library cat /app/library/app_state/pdf_browser/admin_password`. The mounted directory stores PDFs and app state outside the image:

- `sorted_pdfs` for PDFs
- `app_state/pdf_browser/search_index.json` for the search index
- `app_state/pdf_browser/generated_thumbnails` for generated thumbnails
- `pdf_trash` and `paperless_archive_pdfs` for removed or archived PDFs

Compose listens on `127.0.0.1:8765` by default. Use an HTTPS reverse proxy on the same host for access over the internet. For direct access on a trusted private network, set `PDF_LIBRARY_BIND=0.0.0.0`; Basic authentication does not encrypt HTTP traffic.

On startup, the container scans the mounted library and rebuilds the search index. Set `PDF_LIBRARY_REBUILD_INDEX=0` to skip startup indexing, or `PDF_LIBRARY_BOOTSTRAP=0` to skip both scan and indexing.

The release workflow builds `linux/amd64` and `linux/arm64` images. To publish to Docker Hub, configure the GitHub Actions secret `DOCKERHUB_TOKEN` for the `gobelet` account and run the workflow manually or push a version tag.

Direct PDF URL imports are supported. Browser-based website-to-PDF capture is intentionally excluded from this minimal Docker image.
