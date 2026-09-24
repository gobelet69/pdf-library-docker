# PDF Library Docker

Portable PDF library with an optional, disabled-by-default Discord plugin. Web Archive and the macOS menu bar are not included.

## Start

```bash
mkdir -p library/sorted_pdfs/_Unsorted
docker compose up -d
```

Open `http://localhost:8765`. The username is `admin`; Docker writes the initial password to `library/app_state/pdf_browser/admin_password`. To read it without printing it here:

```bash
docker compose exec pdf-library cat /app/library/app_state/pdf_browser/admin_password
```

The `library` directory is a bind mount, not part of either image. PDFs go in `library/sorted_pdfs` and can be organized in subfolders. The search index, thumbnails, plugin configuration, and bot import history remain in `library/app_state` across container upgrades.

To use a PDF bank elsewhere on the host, set an absolute `PDF_LIBRARY_DIR` in a local `.env` file or run:

```bash
PDF_LIBRARY_DIR=/absolute/path/to/pdf-bank docker compose up -d
```

Put PDFs in `/absolute/path/to/pdf-bank/sorted_pdfs/_Unsorted` or another folder under `sorted_pdfs`. The app scans and indexes them on startup; the first launch may take time. Set `PDF_LIBRARY_REBUILD_INDEX=0` to skip startup indexing, or `PDF_LIBRARY_BOOTSTRAP=0` to skip both scan and indexing.

## Discord plugin

Both services start with the same `docker compose up -d`, but the bot remains disabled until configured. Enable the Message Content intent for your bot in the Discord developer portal and give it access to the channels it should read. In **Options > Plugins**, save the Discord bot token, then enable the bot. It imports PDF attachments and URL-to-PDF captures into `_Unsorted`. Its processed-message record prevents reimporting old messages after restart.

URL captures accept public HTTP(S) sites only; private network addresses and local files are blocked. The plugin service runs the browser as an unprivileged user with Chromium sandboxing. Its Compose security profile is based on the [Playwright Docker seccomp example](https://github.com/microsoft/playwright/blob/main/utils/docker/seccomp_profile.json) (Playwright is licensed under Apache-2.0). Keep `seccomp_profile.json` alongside the Compose file.

The token is stored separately in `library/app_state/plugins/discord.token` with owner-only permissions, never in `.env` or the image. The browser sees only whether one is saved. Use Options to disable the bot, replace the token, or clear it. Plugin errors do not stop the web app. Third-party plugin installation is not available yet.

The web image alone can be run with `docker run`, but plugins require the second Compose service. To pin a compatible pair of prebuilt images, set `PDF_LIBRARY_VERSION` in `.env`; the same tag is applied to both images. Use `docker compose up -d --build` to build from this repository instead of pulling published images.

## Network and updates

Compose binds `127.0.0.1:8765` by default. Put an HTTPS reverse proxy in front of it for internet access; Basic authentication does not encrypt HTTP. Set `PDF_LIBRARY_BIND=0.0.0.0` only on a trusted private network.

For updates, pull both images with `docker compose pull` and restart with `docker compose up -d`. The host PDF directory stays untouched. The images are built for `linux/amd64` and `linux/arm64` by the release workflow when published.

For repeatable deployments, set `PDF_LIBRARY_VERSION` to a published commit SHA. The workflow publishes both images under that SHA before updating `latest`.
