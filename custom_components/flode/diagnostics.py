"""Diagnostics support for FLODE."""
from __future__ import annotations

from typing import Any

from homeassistant.components.frontend import DATA_PANELS
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import __version__ as HA_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import DOMAIN


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a config entry.

    No credentials or entity data are stored on the config entry (FLODE talks
    to HA over the same authenticated frontend connection every other panel
    uses), so nothing here needs redaction.
    """
    integration = await async_get_integration(hass, DOMAIN)

    return {
        "flode_version": integration.version,
        "home_assistant_version": HA_VERSION,
        "config_entry": {
            "title": entry.title,
            "options": dict(entry.options),
        },
        "panel_registered": DOMAIN in hass.data.get(DATA_PANELS, {}),
    }
