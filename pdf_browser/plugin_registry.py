from copy import deepcopy


class PluginConfigError(ValueError):
    pass


BUILTIN_PLUGINS = {
    "discord": {
        "id": "discord",
        "name": "Discord",
        "description": "Importe les PDF et les liens partages sur Discord.",
        "version": 1,
        "entrypoint": "discord_ingest_bot.py",
        "fields": ["startupScanLimit", "token"],
    },
}


def manifest_for(plugin_id):
    try:
        return deepcopy(BUILTIN_PLUGINS[plugin_id])
    except (KeyError, TypeError) as exc:
        raise PluginConfigError("Unknown plugin") from exc


def public_manifests():
    return [{key: deepcopy(value) for key, value in manifest.items() if key != "entrypoint"}
            for manifest in BUILTIN_PLUGINS.values()]
