"""Panel for FLODE."""
import logging
import time
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PANEL_ICON, PANEL_TITLE

_LOGGER = logging.getLogger(__name__)

PANEL_NAME = f"{DOMAIN}-panel"
STATIC_URL = "/flode-hass"


async def async_register_panel(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Register the FLODE panel."""
    www_path = Path(__file__).parent / "www"
    if not (www_path / "flode-panel.js").exists():
        _LOGGER.error("flode-panel.js not found in %s", www_path)
        return

    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(www_path), False)]
    )
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
