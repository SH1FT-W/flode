"""Shared fixtures for the FLODE integration tests."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.flode.const import DOMAIN

PANEL_FILE = "flode-panel.js"
_real_is_file = Path.is_file


def fake_is_file(self: Path) -> bool:
    """Pretend the built panel exists: www/ is a build output and missing in CI."""
    if self.name == PANEL_FILE:
        return True
    return _real_is_file(self)


@pytest.fixture(autouse=True)
def static_paths(
    enable_custom_integrations: None, hass: HomeAssistant
) -> Generator[AsyncMock]:
    """Load custom_components/flode with a stubbed HTTP server.

    The manifest depends on frontend and http. Setting those up for real needs the
    hass_frontend package and a web server, so mark them as loaded instead and give
    hass a fake http object. Yields the mock that records static path registrations;
    panel registration itself runs through HA's real frontend helpers.
    """
    hass.config.components.update({"frontend", "http"})
    register = AsyncMock()
    hass.http = MagicMock(async_register_static_paths=register)
    with patch.object(Path, "is_file", fake_is_file):
        yield register


@pytest.fixture
def entry(hass: HomeAssistant) -> MockConfigEntry:
    """A FLODE config entry added to hass but not set up yet."""
    entry = MockConfigEntry(domain=DOMAIN, title="FLODE", unique_id=DOMAIN, data={})
    entry.add_to_hass(hass)
    return entry
