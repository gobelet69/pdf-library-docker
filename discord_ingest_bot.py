from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

URL_RE = re.compile(r"https?://[^\s<>\"]+", re.IGNORECASE)
TRAILING_URL_CHARS = ".,;:!?)]]}"
LOGGER = logging.getLogger("discord_ingest_bot")


@dataclass(frozen=True)
class BotConfig:
    token: str
    root: Path
    inbox: Path
    state_path: Path
    converter: Path
    startup_scan_limit: int


def extract_urls(text: str) -> list[str]:
    urls = []
    for match in URL_RE.findall(text or ""):
        cleaned = match.rstrip(TRAILING_URL_CHARS)
        if cleaned:
            urls.append(cleaned)
    return urls


def is_pdf_attachment(attachment: object) -> bool:
    filename = str(getattr(attachment, "filename", "") or "")
    content_type = str(getattr(attachment, "content_type", "") or "")
    return filename.lower().endswith(".pdf") or content_type.lower() == "application/pdf"


def safe_filename(filename: str, default: str = "discord-import.pdf") -> str:
    name = Path(filename or "").name.strip()
    name = re.sub(r"[^A-Za-z0-9._ -]+", "", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name:
        name = default
    if not name.lower().endswith(".pdf"):
        name = f"{name}.pdf"
    return name


def url_output_name(url: str, created_at: datetime) -> str:
    parsed = urlparse(url)
    domain = re.sub(r"[^a-z0-9]+", "-", (parsed.netloc or "url").lower()).strip("-") or "url"
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:10]
    timestamp = created_at.strftime("%Y%m%d-%H%M%S")
    return f"discord-url-{timestamp}-{domain}-{digest}.pdf"


def confirmation_summary(items: list[dict[str, Any]]) -> str:
    lines = []
    for item in items:
        status = item.get("status")
        kind = item.get("kind")
        if status == "success" and kind == "attachment":
            output_path = Path(str(item.get("output_path", "")))
            lines.append(f"✅ PDF ajouté : {output_path.name or 'PDF'}")
        elif status == "success" and kind == "url":
            source = str(item.get("source", ""))
            domain = urlparse(source).netloc or source
            lines.append(f"✅ Lien converti en PDF : {domain}")
        elif status == "failed":
            error = str(item.get("error", "erreur inconnue")).splitlines()[0]
            lines.append(f"⚠️ Échec : {error[:180]}")
    return "\n".join(lines)


def unique_output_path(directory: Path, filename: str) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    candidate = directory / safe_filename(filename)
    if not candidate.exists():
        return candidate
    stem = candidate.stem
    suffix = candidate.suffix
    index = 2
    while True:
        numbered = directory / f"{stem} ({index}){suffix}"
        if not numbered.exists():
            return numbered
        index += 1


class JsonStateStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.data = self._load()

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"messages": {}}
        with self.path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict) or not isinstance(data.get("messages"), dict):
            return {"messages": {}}
        return data

    def is_processed(self, message_id: int) -> bool:
        return str(message_id) in self.data["messages"]

    def record_message(
        self,
        *,
        message_id: int,
        channel_id: int,
        guild_id: int | None,
        items: list[dict[str, Any]],
    ) -> None:
        self.data["messages"][str(message_id)] = {
            "message_id": message_id,
            "channel_id": channel_id,
            "guild_id": guild_id,
            "items": items,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }
        self.save()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(self.data, handle, indent=2, sort_keys=True)
        temporary.replace(self.path)


class DiscordIngestService:
    def __init__(
        self,
        *,
        root: Path,
        inbox: Path,
        state: JsonStateStore,
        converter: Path | None = None,
        node_executable: str = "node",
    ) -> None:
        self.root = root
        self.inbox = inbox
        self.state = state
        self.converter = converter or root / "pdf_browser" / "url_to_pdf.js"
        self.node_executable = node_executable
        self._inflight_messages: set[int] = set()

    async def process_message(self, message: object) -> list[dict[str, Any]]:
        if getattr(getattr(message, "author", None), "bot", False):
            return []
        message_id = int(getattr(message, "id"))
        if self.state.is_processed(message_id) or message_id in self._inflight_messages:
            LOGGER.info("Skipping already processed Discord message id=%s", message_id)
            return []
        self._inflight_messages.add(message_id)
        try:
            attachments = getattr(message, "attachments", []) or []
            urls = extract_urls(str(getattr(message, "content", "") or ""))
            LOGGER.info(
                "Received Discord message id=%s channel=%s attachments=%d urls=%d",
                message_id,
                getattr(getattr(message, "channel", None), "id", ""),
                len(attachments),
                len(urls),
            )

            items: list[dict[str, Any]] = []
            for attachment in attachments:
                if is_pdf_attachment(attachment):
                    items.append(await self._save_attachment(attachment))
                else:
                    LOGGER.info(
                        "Ignoring non-PDF Discord attachment filename=%s content_type=%s",
                        getattr(attachment, "filename", ""),
                        getattr(attachment, "content_type", ""),
                    )

            for url in urls:
                items.append(await self._convert_url_item(url, getattr(message, "created_at")))

            channel = getattr(message, "channel", None)
            guild = getattr(message, "guild", None)
            self.state.record_message(
                message_id=message_id,
                channel_id=int(getattr(channel, "id", 0) or 0),
                guild_id=int(getattr(guild, "id")) if guild is not None else None,
                items=items,
            )
            await self._reply_with_confirmation(message, items)
            return items
        finally:
            self._inflight_messages.discard(message_id)

    async def scan_startup_history(self, channels: object, limit: int = 100) -> int:
        processed = 0
        for channel in channels:
            history = getattr(channel, "history", None)
            if history is None:
                continue
            try:
                async for message in history(limit=limit, oldest_first=True):
                    if self.state.is_processed(int(getattr(message, "id"))):
                        continue
                    items = await self.process_message(message)
                    if items:
                        processed += 1
            except Exception:
                LOGGER.exception("Failed to scan Discord startup history for channel=%s", getattr(channel, "id", ""))
        return processed

    async def _reply_with_confirmation(self, message: object, items: list[dict[str, Any]]) -> None:
        summary = confirmation_summary(items)
        if not summary:
            return
        reply = getattr(message, "reply", None)
        if reply is None:
            return
        try:
            await reply(summary, mention_author=False)
        except Exception:
            LOGGER.exception("Failed to send Discord confirmation reply")

    async def _save_attachment(self, attachment: object) -> dict[str, Any]:
        filename = safe_filename(str(getattr(attachment, "filename", "") or "discord-import.pdf"))
        target = unique_output_path(self.inbox, filename)
        with tempfile.NamedTemporaryFile(prefix="discord-pdf-", suffix=".pdf", delete=False) as handle:
            temporary = Path(handle.name)
        try:
            await attachment.save(temporary)
            shutil.move(str(temporary), target)
            LOGGER.info("Imported Discord PDF attachment to %s", target)
            return {
                "kind": "attachment",
                "source": str(getattr(attachment, "url", "")),
                "output_path": str(target),
                "status": "success",
            }
        except Exception as error:
            temporary.unlink(missing_ok=True)
            LOGGER.exception("Failed to import Discord PDF attachment %s", filename)
            return {
                "kind": "attachment",
                "source": str(getattr(attachment, "url", "")),
                "status": "failed",
                "error": str(error),
            }

    async def _convert_url_item(self, url: str, created_at: datetime) -> dict[str, Any]:
        target = unique_output_path(self.inbox, url_output_name(url, created_at))
        with tempfile.NamedTemporaryFile(prefix="discord-url-", suffix=".pdf", delete=False) as handle:
            temporary = Path(handle.name)
        try:
            await self.convert_url(url, temporary)
            shutil.move(str(temporary), target)
            LOGGER.info("Converted Discord URL to %s", target)
            return {
                "kind": "url",
                "source": url,
                "output_path": str(target),
                "status": "success",
            }
        except Exception:
            temporary.unlink(missing_ok=True)
            LOGGER.error("Failed to convert Discord URL to %s", target.name)
            return {
                "kind": "url",
                "source": url,
                "status": "failed",
                "error": "URL conversion failed",
            }

    async def convert_url(self, url: str, output_path: Path) -> None:
        environment = os.environ.copy()
        for key in ("DISCORD_BOT_TOKEN", "DISCORD_BOT_TOKEN_FILE", "DISCORD_PLUGIN_READY_FILE"):
            environment.pop(key, None)
        privileges = {}
        renderer_uid = os.environ.get("PDF_RENDERER_UID")
        if renderer_uid is not None:
            if os.geteuid() != 0:
                raise RuntimeError("Renderer isolation requires root supervisor")
            uid = int(renderer_uid)
            gid = int(os.environ["PDF_RENDERER_GID"])
            if uid <= 0 or gid <= 0:
                raise RuntimeError("Invalid renderer identity")
            os.chown(output_path, uid, gid)
            privileges = {"user": uid, "group": gid}
        try:
            process = await asyncio.create_subprocess_exec(
                self.node_executable,
                str(self.converter),
                url,
                str(output_path),
                cwd=str(self.root),
                env=environment,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                **privileges,
            )
            stdout, stderr = await process.communicate()
        finally:
            if privileges and output_path.exists():
                os.chown(output_path, os.geteuid(), os.getegid())
        if process.returncode != 0 or not output_path.exists():
            raise RuntimeError("URL conversion failed")


def load_config() -> BotConfig:
    if "DISCORD_BOT_TOKEN_FILE" in os.environ:
        token_file = os.environ["DISCORD_BOT_TOKEN_FILE"]
        try:
            token = Path(token_file).read_text(encoding="utf-8").strip() if token_file else ""
        except (OSError, UnicodeError):
            token = ""
    else:
        token = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit(64)

    root = Path(os.environ.get("PDF_LIBRARY_ROOT", Path(__file__).resolve().parent)).expanduser().resolve()
    inbox = root / "library" / "sorted_pdfs" / "_Unsorted"
    state_path = Path(
        os.environ.get("DISCORD_INGEST_STATE", root / "library" / "app_state" / "discord_ingest_bot.json")
    ).expanduser()
    if not state_path.is_absolute():
        state_path = root / state_path
    converter = root / "pdf_browser" / "url_to_pdf.js"
    if not converter.exists():
        raise SystemExit(66)
    if shutil.which("node") is None:
        raise SystemExit(69)
    try:
        startup_scan_limit = int(os.environ.get("DISCORD_INGEST_STARTUP_SCAN_LIMIT", "100"))
    except ValueError:
        startup_scan_limit = 100
    startup_scan_limit = max(0, startup_scan_limit)
    return BotConfig(
        token=token,
        root=root,
        inbox=inbox,
        state_path=state_path,
        converter=converter,
        startup_scan_limit=startup_scan_limit,
    )


def write_ready_marker(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            os.fchmod(stream.fileno(), 0o600)
            json.dump({"pid": os.getpid(), "readyAt": datetime.now(timezone.utc).timestamp()}, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def build_client(service: DiscordIngestService, startup_scan_limit: int = 100, ready_path: Path | None = None):
    try:
        import discord
    except ImportError as error:
        raise SystemExit("discord.py is not installed. Run: python3 -m pip install -r pdf_browser/requirements.txt") from error

    intents = discord.Intents.default()
    intents.message_content = True
    client = discord.Client(intents=intents)
    startup_scan_done = False

    @client.event
    async def on_ready():
        nonlocal startup_scan_done
        LOGGER.info("Discord ingest bot connected as %s", client.user)
        if ready_path is not None:
            write_ready_marker(ready_path)
        if startup_scan_done or startup_scan_limit <= 0:
            return
        startup_scan_done = True
        channels = getattr(client, "get_all_channels", lambda: [])()
        processed = await service.scan_startup_history(channels, limit=startup_scan_limit)
        LOGGER.info("Discord startup history scan processed %d message(s)", processed)

    @client.event
    async def on_disconnect():
        if ready_path is not None:
            ready_path.unlink(missing_ok=True)

    @client.event
    async def on_message(message):
        await service.process_message(message)

    return client


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config = load_config()
    LOGGER.info("Starting Discord ingest bot with root=%s inbox=%s state=%s", config.root, config.inbox, config.state_path)
    state = JsonStateStore(config.state_path)
    service = DiscordIngestService(root=config.root, inbox=config.inbox, state=state, converter=config.converter)
    ready_path_value = os.environ.get("DISCORD_PLUGIN_READY_FILE")
    ready_path = Path(ready_path_value) if ready_path_value else None
    client = build_client(service, startup_scan_limit=config.startup_scan_limit, ready_path=ready_path)
    try:
        client.run(config.token)
    finally:
        if ready_path is not None:
            ready_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
