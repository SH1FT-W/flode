<div align="center">
  <img src="custom_components/flode/brand/icon.png" alt="FLODE Logo" width="120" />
  <h1>FLODE</h1>
  <p><strong>Flow + Node Editor for Home Assistant</strong></p>

  <p>
    <img alt="Version" src="https://img.shields.io/badge/version-0.7.5-blue?style=flat-square" />
    <img alt="HA Version" src="https://img.shields.io/badge/HA-2024.1%2B-brightgreen?style=flat-square" />
    <img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-orange?style=flat-square" />
    <img alt="Status" src="https://img.shields.io/badge/status-beta-yellow?style=flat-square" />
  </p>
</div>

---

> **Beta:** FLODE is designed to be non-destructive. Back up your automations before editing them with FLODE.

## What is FLODE?

**FLODE** is a visual flow editor for Home Assistant automations — inspired by Node-RED, but without the external engine. You design your automations as diagrams and FLODE transpiles them into **100% native Home Assistant YAML**, stored directly in the HA core system. No vendor lock-in. No external runtime. Automations stay fully editable in HA's built-in editor.

## Features

- **Visual flow editor** — Drag-and-drop triggers, conditions and actions onto a canvas
- **100% native YAML** — Output is standard HA automation YAML, no proprietary format
- **Bidirectional** — Import existing HA automations, edit visually, save back
- **Trace-integrated** — Debug flows using HA's official Trace View
- **State-machine support** — Complex loops and branching via automatic state-machine pattern
- **German & English UI** — Full i18n support
- **Dark & Light mode** — Follows your HA theme

## Installation

### Via HACS (recommended)

1. Open HACS → Integrations → Custom repositories
2. Add `https://github.com/SH1FT-W/flode` as type **Integration**
3. Search for **FLODE** and install
4. Restart Home Assistant
5. Go to **Settings → Integrations → Add Integration → FLODE**

### Manual

1. Copy `custom_components/flode/` into your HA `config/custom_components/` folder
2. Restart Home Assistant
3. Go to **Settings → Integrations → Add Integration → FLODE**

## Usage

After setup, **FLODE** appears in the HA sidebar. Click it to open the flow editor.

- **New automation** — Start with a trigger node, add conditions and actions
- **Import existing** — Click the folder icon to load any existing HA automation
- **Save** — Saves directly to Home Assistant as a native automation
- **Export YAML** — View or copy the generated YAML at any time

## Node Types

| Node | Color | Description |
|---|---|---|
| Trigger | Yellow | What starts the automation (state, time, event, ...) |
| Condition | Blue | Filter — only continues if condition is true |
| Action | Green | What happens (call service, fire event, delay, ...) |
| OR / AND / NOT | Purple | Group multiple conditions |

## Project Structure

```
flode/
├── custom_components/flode/   # HA integration (Python)
│   ├── brand/                 # Integration icons
│   ├── translations/          # de + en setup strings
│   └── www/                   # Built frontend assets
├── packages/
│   ├── frontend/              # React/Vite UI (@flode/frontend)
│   ├── transpiler/            # YAML ↔ Graph logic (@flode/transpiler)
│   └── shared/                # Zod schemas + types (@flode/shared)
└── __tests__/                 # YAML round-trip fixtures
```

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, React Flow (xyflow), Zustand, i18next
- **Transpiler:** TypeScript, js-yaml, ELK layout engine
- **Validation:** Zod schemas
- **Tests:** Vitest (256 tests)
- **HA Integration:** Python, custom panel via `panel_custom`

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

## License

Apache 2.0 — see [LICENSE](LICENSE)

---

<div align="center">
  <sub>Built with ❤️ by <strong>SH1FT-W</strong></sub>
</div>
