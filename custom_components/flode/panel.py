"""Panel for FLODE."""
import logging
import time
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError

from .const import DOMAIN, PANEL_ICON, PANEL_TITLE

_LOGGER = logging.getLogger(__name__)

PANEL_NAME = f"{DOMAIN}-panel"
STATIC_URL = "/flode-hass"
# Static routes cannot be removed from aiohttp, so register them only once per HA run.
DATA_STATIC_REGISTERED = f"{DOMAIN}_static_registered"


async def async_register_panel(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Register the FLODE panel."""
    www_path = Path(__file__).parent / "www"
    panel_file = www_path / "flode-panel.js"
    if not await hass.async_add_executor_job(panel_file.is_file):
        # A missing build does not heal itself, so fail the setup instead of retrying.
        raise ConfigEntryError(
            f"flode-panel.js not found in {www_path}, reinstall FLODE"
        )

    if not hass.data.get(DATA_STATIC_REGISTERED):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(www_path), False)]
        )
        hass.data[DATA_STATIC_REGISTERED] = True

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_NAME,
        frontend_url_path=DOMAIN,
        # Cache-bust per start so an update is picked up without clearing the browser cache.
        module_url=f"{STATIC_URL}/flode-panel.js?v={int(time.time())}",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=True,
    )
    _LOGGER.info("FLODE panel registered successfully")


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Unregister the FLODE panel."""
    frontend.async_remove_panel(hass, DOMAIN)
    _LOGGER.info("FLODE panel unregistered")
