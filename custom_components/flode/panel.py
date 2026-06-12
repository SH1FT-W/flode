"""Panel for FLODE."""
import logging
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig

from .const import DOMAIN, PANEL_TITLE, PANEL_ICON

_LOGGER = logging.getLogger(__name__)

PANEL_NAME = f"{DOMAIN}-panel"


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register the FLODE panel."""
    www_path = Path(__file__).parent / "www"

    await hass.http.async_register_static_paths([
        StaticPathConfig("/flode-hass", str(www_path), False)
    ])

    wrapper_path = www_path / "assets" / "panel-wrapper.js"
    if not wrapper_path.exists():
        _LOGGER.error("panel-wrapper.js not found in assets directory")
        _LOGGER.error(f"www path: {www_path}, assets exist: {(www_path / 'assets').exists()}")
        return

    import time
    cache_bust = int(time.time())
    module_url = f"/flode-hass/assets/panel-wrapper.js?v={cache_bust}"

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_NAME,
        frontend_url_path=DOMAIN,
        module_url=module_url,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=True,
        config={},
        config_panel_domain=DOMAIN,
    )

    _LOGGER.info("FLODE panel registered successfully")


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Unregister the FLODE panel."""
    frontend.async_remove_panel(hass, DOMAIN)
    _LOGGER.info("FLODE panel unregistered")
