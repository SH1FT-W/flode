"""FLODE - Visual automation editor for Home Assistant."""
from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import issue_registry as ir

from .const import DOMAIN
from .panel import async_register_panel, async_unregister_panel

_LOGGER = logging.getLogger(__name__)

SERVICE_REPORT_IMPORT_ISSUE = "report_import_issue"

REPORT_IMPORT_ISSUE_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): str,
        vol.Required("warnings"): [str],
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up FLODE from a config entry."""
    await async_register_panel(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    async def _handle_report_import_issue(call: ServiceCall) -> None:
        """Create a Repair issue for an automation FLODE couldn't round-trip losslessly."""
        entity_id = call.data["entity_id"]
        warnings = call.data["warnings"]
        ir.async_create_issue(
            hass,
            DOMAIN,
            f"lossy_import_{entity_id}",
            is_fixable=False,
            severity=ir.IssueSeverity.WARNING,
            translation_key="lossy_import",
            translation_placeholders={
                "entity_id": entity_id,
                "details": "\n".join(f"- {warning}" for warning in warnings),
            },
        )

    hass.services.async_register(
        DOMAIN,
        SERVICE_REPORT_IMPORT_ISSUE,
        _handle_report_import_issue,
        schema=REPORT_IMPORT_ISSUE_SCHEMA,
    )

    _LOGGER.info("FLODE integration set up successfully")
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Re-register the panel so option changes (e.g. language) take effect."""
    async_unregister_panel(hass)
    await async_register_panel(hass, entry)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    async_unregister_panel(hass)
    hass.services.async_remove(DOMAIN, SERVICE_REPORT_IMPORT_ISSUE)
    return True
