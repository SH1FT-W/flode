"""Panel registration: event-loop safety and repeated setup/unload."""

from __future__ import annotations

import threading
from pathlib import Path
from unittest.mock import AsyncMock, patch

from conftest import PANEL_FILE, fake_is_file
from homeassistant.components.frontend import DATA_PANELS
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.flode import panel
from custom_components.flode.const import DOMAIN


async def test_panel_file_check_runs_off_the_event_loop(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    """Path.is_file() on the panel file must run in the executor, not in the loop thread.

    HA's blocking-call detector only catches open/listdir/scandir, so is_file/stat
    in the loop would slip through (HACS review hacs/default#13079).
    """
    loop_thread = threading.get_ident()
    calls: list[bool] = []

    def is_file(self: Path) -> bool:
        if self.name == PANEL_FILE:
            calls.append(threading.get_ident() == loop_thread)
        return fake_is_file(self)

    with patch.object(Path, "is_file", is_file):
        await panel.async_register_panel(hass, entry)

    assert calls, "panel file was not checked"
    assert not any(calls), "panel file checked in the event-loop thread"


async def test_setup_unload_setup_registers_static_path_once(
    hass: HomeAssistant, entry: MockConfigEntry, static_paths: AsyncMock
) -> None:
    """A reload must not raise "Overwriting panel" or register /flode-hass twice."""
    assert await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.LOADED

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert entry.state is ConfigEntryState.NOT_LOADED

    # A second setup in the same HA run: the panel is registered again, the
    # static route (which aiohttp cannot remove) is not.
    assert await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.LOADED
    assert DOMAIN in hass.data[DATA_PANELS]

    assert static_paths.await_count == 1
    (configs,) = static_paths.await_args.args
    assert [c.url_path for c in configs] == [panel.STATIC_URL]
    assert hass.data[panel.DATA_STATIC_REGISTERED] is True


async def test_unload_removes_panel(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    """Unloading the entry removes the sidebar panel."""
    assert await hass.config_entries.async_setup(entry.entry_id)
    panel_config = hass.data[DATA_PANELS][DOMAIN]
    assert panel_config.require_admin is True
    assert panel_config.config["_panel_custom"]["name"] == panel.PANEL_NAME

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert DOMAIN not in hass.data[DATA_PANELS]


async def test_missing_panel_build_fails_setup(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    """Without flode-panel.js the setup fails permanently instead of retrying."""

    def is_file(self: Path) -> bool:
        return False if self.name == PANEL_FILE else fake_is_file(self)

    with patch.object(Path, "is_file", is_file):
        assert not await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.SETUP_ERROR
    assert DOMAIN not in hass.data.get(DATA_PANELS, {})
