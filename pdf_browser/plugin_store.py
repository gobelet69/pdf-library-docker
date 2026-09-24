import json
import os
import tempfile
import threading
import time
from pathlib import Path

from plugin_registry import PluginConfigError, public_manifests


DEFAULT_SETTINGS = {
    "schemaVersion": 1,
    "revision": 0,
    "plugins": {"discord": {"enabled": False, "startupScanLimit": 100}},
}
STATUS_MESSAGES = {
    "starting": "Connexion a Discord...",
    "reconnecting": "Reconnexion a Discord...",
    "running": "Connecte a Discord",
    "error": "Le bot Discord a rencontre une erreur.",
    "pending": "Application des changements...",
    "runner_unavailable": "Service de plugins indisponible.",
    "waiting_for_token": "Jeton Discord requis.",
    "disabled": "Desactive",
}


class PluginStore:
    def __init__(self, data_root):
        self.directory = Path(data_root) / "app_state" / "plugins"
        self.settings_path = self.directory / "settings.json"
        self.token_path = self.directory / "discord.token"
        self.status_path = self.directory / "status.json"
        self.ready_path = self.directory / "discord.ready.json"
        self._lock = threading.RLock()

    def read_settings(self):
        with self._lock:
            if not self.settings_path.exists():
                return json.loads(json.dumps(DEFAULT_SETTINGS))
            try:
                data = json.loads(self.settings_path.read_text(encoding="utf-8"))
                if not isinstance(data, dict) or set(data) != {"schemaVersion", "revision", "plugins"}:
                    raise ValueError("Invalid settings shape")
                if data["schemaVersion"] != 1 or type(data["revision"]) is not int or data["revision"] < 0:
                    raise ValueError("Invalid settings version")
                plugins = data["plugins"]
                if not isinstance(plugins, dict) or set(plugins) != {"discord"}:
                    raise ValueError("Invalid plugin set")
                discord = plugins["discord"]
                if not isinstance(discord, dict) or set(discord) != {"enabled", "startupScanLimit"}:
                    raise ValueError("Invalid Discord settings")
                if type(discord["enabled"]) is not bool or not self._valid_limit(discord["startupScanLimit"]):
                    raise ValueError("Invalid Discord values")
                return data
            except (OSError, UnicodeError, ValueError, TypeError) as exc:
                raise PluginConfigError("Invalid plugin settings") from exc

    @staticmethod
    def _valid_limit(value):
        return type(value) is int and 0 <= value <= 1000

    def update_discord(self, patch):
        if not isinstance(patch, dict) or not set(patch) <= {"enabled", "token", "clearToken", "startupScanLimit"}:
            raise PluginConfigError("Invalid plugin settings")
        with self._lock:
            data = self.read_settings()
            current = data["plugins"]["discord"]
            if "enabled" in patch and type(patch["enabled"]) is not bool:
                raise PluginConfigError("Invalid enabled value")
            if "startupScanLimit" in patch and not self._valid_limit(patch["startupScanLimit"]):
                raise PluginConfigError("Invalid history limit")
            if "clearToken" in patch and patch["clearToken"] is not True:
                raise PluginConfigError("Invalid token action")
            if "token" in patch and "clearToken" in patch:
                raise PluginConfigError("Choose one token action")
            token = None
            if "token" in patch:
                if not isinstance(patch["token"], str):
                    raise PluginConfigError("Invalid token")
                token = patch["token"].strip()
                if not token or len(token) > 4096 or "\n" in token or "\r" in token:
                    raise PluginConfigError("Invalid token")
            enabled = patch.get("enabled", current["enabled"])
            token_present = bool(token) or (self._has_token() and "clearToken" not in patch)
            if enabled and not token_present:
                raise PluginConfigError("A Discord token is required")
            previous_token = self.token_path.read_bytes() if self.token_path.exists() else None
            next_token = (token + "\n").encode("utf-8") if token is not None else previous_token
            if patch.get("clearToken"):
                next_token = None
            next_limit = patch.get("startupScanLimit", current["startupScanLimit"])
            if (enabled == current["enabled"] and next_limit == current["startupScanLimit"]
                    and next_token == previous_token):
                return self._public_discord(data, time.time())
            previous_settings = json.dumps(data, sort_keys=True).encode("utf-8")
            settings_existed = self.settings_path.exists()
            current["enabled"] = enabled
            current["startupScanLimit"] = next_limit
            data["revision"] += 1
            if next_token is not None and next_token != previous_token:
                self._atomic_write(self.token_path, next_token)
            settings_written = False
            try:
                self._atomic_write(self.settings_path, json.dumps(data, sort_keys=True).encode("utf-8"))
                settings_written = True
                if patch.get("clearToken"):
                    self.token_path.unlink(missing_ok=True)
            except OSError:
                if previous_token is not None and next_token != previous_token:
                    self._atomic_write(self.token_path, previous_token)
                elif previous_token is None and next_token is not None:
                    self.token_path.unlink(missing_ok=True)
                if settings_written:
                    if settings_existed:
                        self._atomic_write(self.settings_path, previous_settings)
                    else:
                        self.settings_path.unlink(missing_ok=True)
                raise
            return self._public_discord(data, time.time())

    def public_snapshot(self, now=None):
        now = time.time() if now is None else now
        with self._lock:
            try:
                settings = self.read_settings()
            except PluginConfigError:
                item = public_manifests()[0]
                item.update({"enabled": False, "startupScanLimit": 100, "tokenPresent": self._has_token(),
                             "state": "error", "message": "Configuration des plugins invalide."})
                return [item]
            return [self._public_discord(settings, now)]

    def _public_discord(self, settings, now):
        item = public_manifests()[0]
        current = settings["plugins"]["discord"]
        item.update({"enabled": current["enabled"], "startupScanLimit": current["startupScanLimit"],
                     "tokenPresent": self._has_token()})
        if not current["enabled"]:
            state = "disabled"
        elif not item["tokenPresent"]:
            state = "waiting_for_token"
        else:
            status = self._read_status()
            if status is None or now - status["updatedAt"] > 10 or status["updatedAt"] > now + 10:
                state = "runner_unavailable"
            elif status["appliedRevision"] != settings["revision"]:
                state = "pending"
            else:
                state = status["plugins"]["discord"]["state"]
        item.update({"state": state, "message": STATUS_MESSAGES[state]})
        return item

    def _read_status(self):
        try:
            data = json.loads(self.status_path.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or type(data.get("updatedAt")) not in (int, float):
                return None
            if type(data.get("appliedRevision")) is not int:
                return None
            plugin = data.get("plugins", {}).get("discord", {})
            if plugin.get("state") not in {"starting", "reconnecting", "running", "error", "waiting_for_token"}:
                return None
            return data
        except (OSError, ValueError, TypeError, AttributeError):
            return None

    def write_status(self, status):
        if not isinstance(status, dict):
            raise PluginConfigError("Invalid plugin status")
        if type(status.get("updatedAt")) not in (int, float) or type(status.get("appliedRevision")) is not int:
            raise PluginConfigError("Invalid plugin status")
        plugin = status.get("plugins", {}).get("discord", {})
        if plugin.get("state") not in {"starting", "reconnecting", "running", "error", "waiting_for_token"}:
            raise PluginConfigError("Invalid plugin status")
        safe = {"updatedAt": status["updatedAt"], "appliedRevision": status["appliedRevision"],
                "plugins": {"discord": {"state": plugin["state"]}}}
        self._atomic_write(self.status_path, json.dumps(safe, sort_keys=True).encode("utf-8"))

    def _has_token(self):
        try:
            return bool(self.token_path.read_text(encoding="utf-8").strip())
        except (OSError, UnicodeError):
            return False

    def _atomic_write(self, path, content):
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.directory.chmod(0o700)
        descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=self.directory)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
