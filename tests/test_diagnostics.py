"""Diagnostics: expected keys, nothing from entry.data."""

from __future__ import annotations

import json
from pathlib import Path

from homeassistant.const import __version__ as HA_VERSION
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.flode.const import DOMAIN
from custom_components.flode.diagnostics import async_get_config_entry_diagnostics

# Read at import time: file access inside a test would run in the event loop.
MANIFEST = json.loads(
    (
        Path(__file__).parents[1] / "custom_components" / DOMAIN / "manifest.json"
    ).read_text()
)

SECRET = "s3cret-token-value"


async def test_diagnostics_keys_and_no_secrets(hass: HomeAssistant) -> None:
    """Diagnostics report versions, title, options and panel state, but never entry.data."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="FLODE",
        unique_id=DOMAIN,
        # FLODE stores nothing in data; plant a secret to prove it is not exported.
        data={"access_token": SECRET},
        options={"theme": "dark"},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)

    result = await async_get_config_entry_diagnostics(hass, entry)

    assert result == {
        "flode_version": MANIFEST["version"],
        "home_assistant_version": HA_VERSION,
        "config_entry": {"title": "FLODE", "options": {"theme": "dark"}},
        "panel_registered": True,
    }
    assert SECRET not in json.dumps(result)
    assert "access_token" not in json.dumps(result)
