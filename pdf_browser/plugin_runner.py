#!/usr/bin/env python3
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

from plugin_registry import manifest_for
from plugin_store import PluginConfigError, PluginStore


APP_ROOT = Path(__file__).resolve().parent.parent


def check_browser_runtime(app_root):
    if shutil.which("node") is None or not (app_root / "pdf_browser" / "url_to_pdf.js").is_file():
        return False
    if not (app_root / manifest_for("discord")["entrypoint"]).is_file():
        return False
    probe = "const fs=require('fs');const {chromium}=require('playwright');process.exit(fs.existsSync(chromium.executablePath())?0:1)"
    try:
        result = subprocess.run(["node", "-e", probe], cwd=app_root, timeout=15,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


class PluginRunner:
    def __init__(self, store, spawn=subprocess.Popen, clock=time.time, preflight=None, app_root=APP_ROOT):
        self.store = store
        self.spawn = spawn
        self.clock = clock
        self.app_root = Path(app_root)
        self.preflight = preflight or (lambda: check_browser_runtime(self.app_root))
        self.process = None
        self.active_revision = None
        self.ready_seen = False
        self.failures = 0
        self.retry_at = 0.0

    def tick(self):
        now = self.clock()
        try:
            settings = self.store.read_settings()
        except PluginConfigError:
            self._stop_child()
            self._status(now, 0, "error")
            return

        revision = settings["revision"]
        config = settings["plugins"]["discord"]
        if not config["enabled"]:
            self._stop_child()
            self.failures = 0
            self.retry_at = 0.0
            self._status(now, revision, "waiting_for_token")
            return
        try:
            token_present = bool(self.store.token_path.read_text(encoding="utf-8").strip())
        except (OSError, UnicodeError):
            token_present = False
        if not token_present:
            self._stop_child()
            self._status(now, revision, "waiting_for_token")
            return

        if self.process is not None and self.active_revision != revision:
            self._stop_child()
            self.failures = 0
            self.retry_at = 0.0
        if self.process is not None and self.process.poll() is not None:
            self.process = None
            self.ready_seen = False
            self.failures += 1
            self.retry_at = now + min(60, 2 ** min(self.failures, 6))

        if self.process is None:
            if now < self.retry_at:
                self._status(now, revision, "error")
                return
            if not self.preflight():
                self.retry_at = now + 30
                self._status(now, revision, "error")
                return
            self.store.ready_path.unlink(missing_ok=True)
            environment = os.environ.copy()
            environment.pop("DISCORD_BOT_TOKEN", None)
            environment["DISCORD_BOT_TOKEN_FILE"] = str(self.store.token_path)
            environment["DISCORD_PLUGIN_READY_FILE"] = str(self.store.ready_path)
            environment["DISCORD_INGEST_STARTUP_SCAN_LIMIT"] = str(config["startupScanLimit"])
            environment["PDF_LIBRARY_ROOT"] = str(self.app_root)
            command = [sys.executable, "-u", str(self.app_root / manifest_for("discord")["entrypoint"])]
            try:
                self.process = self.spawn(command, cwd=self.app_root, env=environment, start_new_session=True)
            except OSError:
                self.failures += 1
                self.retry_at = now + min(60, 2 ** min(self.failures, 6))
                self._status(now, revision, "error")
                return
            self.active_revision = revision
            self.ready_seen = False

        if self._ready_marker_matches():
            self.ready_seen = True
            self.failures = 0
            state = "running"
        else:
            state = "reconnecting" if self.ready_seen else "starting"
        self._status(now, revision, state)

    def _ready_marker_matches(self):
        if self.process is None:
            return False
        try:
            data = json.loads(self.store.ready_path.read_text(encoding="utf-8"))
            return data.get("pid") == self.process.pid and type(data.get("readyAt")) in (int, float)
        except (OSError, ValueError, TypeError, AttributeError):
            return False

    def _status(self, now, revision, state):
        self.store.write_status({"updatedAt": now, "appliedRevision": revision,
                                 "plugins": {"discord": {"state": state}}})

    def _stop_child(self):
        if self.process is None:
            return
        process = self.process
        self.process = None
        self.active_revision = None
        self.ready_seen = False
        self.store.ready_path.unlink(missing_ok=True)
        try:
            if isinstance(process, subprocess.Popen):
                os.killpg(process.pid, signal.SIGTERM)
            else:
                process.terminate()
            process.wait(timeout=5)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            if isinstance(process, subprocess.Popen):
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            else:
                process.kill()
            process.wait(timeout=5)

    def stop(self):
        self._stop_child()


def main():
    store = PluginStore(Path(os.environ.get("PDF_LIBRARY_DATA_ROOT", "/app/library")))
    runner = PluginRunner(store)
    stopping = False

    def request_stop(_signal, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    try:
        while not stopping:
            runner.tick()
            time.sleep(2)
    finally:
        runner.stop()


if __name__ == "__main__":
    main()
