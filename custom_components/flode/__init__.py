"""FLODE - Visual automation editor for Home Assistant."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .panel import async_register_panel, async_unregister_panel

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the FLODE component."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Set up FLODE from a config entry."""
    await async_register_panel(hass)
    _LOGGER.info("FLODE integration set up successfully")
    return True


async def async_unload_entry(hass: HomeAssistant, entry) -> bool:
    """Unload a config entry."""
    async_unregister_panel(hass)
    return True
