"""Config flow for FLODE integration."""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant, callback
from homeassistant.config_entries import ConfigEntry, ConfigFlowResult

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema({})

LANGUAGE_OPTIONS = ["auto", "de", "en"]


class FlodeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for FLODE."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
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

    async def async_step_import(self, user_input: dict[str, Any]) -> ConfigFlowResult:
        """Handle import from configuration.yaml."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        return self.async_create_entry(title="FLODE", data={})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> FlodeOptionsFlow:
        """Create the options flow."""
        return FlodeOptionsFlow()


class FlodeOptionsFlow(config_entries.OptionsFlow):
    """Handle FLODE options — currently just a language override for FLODE's own UI."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        current_language = self.config_entry.options.get("language", "auto")

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        "language", default=current_language
                    ): vol.In(LANGUAGE_OPTIONS),
                }
            ),
        )
