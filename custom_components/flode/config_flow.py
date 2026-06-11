"""Config flow for FLODE integration."""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema({})


class FlodeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for FLODE."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        if user_input is not None:
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()

            return self.async_create_entry(
                title="FLODE",
                data={}
            )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            description_placeholders={
                "name": "FLODE",
                "description": "Visual automation editor for Home Assistant"
            }
        )

    async def async_step_import(self, user_input: dict[str, Any]) -> FlowResult:
        """Handle import from configuration.yaml."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        return self.async_create_entry(title="FLODE", data={})
