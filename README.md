<div align="center">
  <img src="custom_components/flode/brand/icon.png" width="100" alt="FLODE Logo" />

  <h1>FLODE</h1>

  <p><strong>Visual Flow + Node Editor for Home Assistant</strong></p>

  [![Release](https://img.shields.io/badge/version-0.9.6-2F81F7?style=flat-square)](https://github.com/SH1FT-W/flode/releases/latest)
  [![HA Version](https://img.shields.io/badge/HA-2024.6%2B-brightgreen?style=flat-square)](https://www.home-assistant.io)
  [![License](https://img.shields.io/badge/license-Apache%202.0-orange?style=flat-square)](LICENSE)
  [![Status](https://img.shields.io/badge/status-beta-yellow?style=flat-square)](https://github.com/SH1FT-W/flode/releases)
  [![Tests](https://img.shields.io/badge/tests-278%20passing-3FB950?style=flat-square)](https://github.com/SH1FT-W/flode/actions)
  [![HACS](https://img.shields.io/badge/HACS-custom-blueviolet?style=flat-square)](https://hacs.xyz)

  <br/>

  **[🌐 Website](https://sh1ft-w.github.io/flode)** &nbsp;·&nbsp; [Installation](#installation) &nbsp;·&nbsp; [Changelog](CHANGELOG.md) &nbsp;·&nbsp; [Issues](https://github.com/SH1FT-W/flode/issues)

  <br/>

  | Light Mode | Dark Mode |
  |:---:|:---:|
  | ![FLODE Light Mode](docs/images/flode-light.png) | ![FLODE Dark Mode](docs/images/flode-dark.png) |

</div>

---

> **Fork notice:** FLODE is based on [C.A.F.E.](https://github.com/FezVrasta/cafe-hass) by [@FezVrasta](https://github.com/FezVrasta) — with numerous bug fixes, new features, and a complete rebranding. All changes are documented in the [CHANGELOG](CHANGELOG.md).
>
> **⚠️ Beta:** FLODE is designed not to overwrite any existing data. Nevertheless, we recommend backing up your automations before editing them.

---

## What is FLODE?

**FLODE** is a visual flow editor for Home Assistant automations — inspired by Node-RED, but without an external server. You draw your automations as diagrams and FLODE automatically transpiles them into **100% native Home Assistant YAML**, stored directly in the HA core.

No vendor lock-in. No external service. Automations remain fully editable in HA's built-in editor.

---

## Features

| Feature | Description |
|---|---|
| 🎯 **Visual editor** | Drag and drop triggers, conditions, and actions onto a canvas |
| 📄 **100% native YAML** | No proprietary format — standard HA automation YAML |
| 🔄 **Bidirectional** | Import, edit, and save back existing HA automations |
| 🐛 **Trace integration** | Debug flows with the official HA trace view |
| 🔀 **State machines** | Complex loops via an automatic state machine pattern |
| 🌍 **DE & EN** | Full i18n support |
| 🌗 **Dark & light mode** | Automatically follows your configured HA theme |

---

## Node Types

| Node | Color | Description |
|---|---|---|
| **Trigger** | 🟡 Yellow | What starts the automation — state, time, event, … |
| **Condition** | 🔵 Blue | Filter — only continues if the condition is met |
| **Action** | 🟢 Green | What happens — call a service, fire an event, delay, … |
| **OR / AND / NOT** | 🟣 Purple | Logically combine multiple conditions and triggers |

---

## Installation

### Via HACS (recommended)

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=SH1FT-W&repository=flode&category=integration)

**Manually in HACS:**

1. Open HACS → Integrations → ⋮ → **Custom repositories**
2. Enter the URL `https://github.com/SH1FT-W/flode`, select type **Integration** → Add
3. HACS → Integrations → Search for **FLODE** → Install
4. **Restart** Home Assistant
5. Settings → Integrations → Add Integration → **FLODE**

### Manually (without HACS)

1. Download the latest version from the [Releases page](https://github.com/SH1FT-W/flode/releases) (`flode.zip`)
2. Copy the `flode/` folder to `config/custom_components/flode/`
3. Restart Home Assistant
4. Settings → Integrations → Add Integration → **FLODE**

---

## Usage

After setup, **FLODE** appears in the HA sidebar.

- **New automation** — Start with a trigger node, then connect conditions and actions
- **Import existing** — Load an existing HA automation via the folder icon
- **Save** — Saves directly to Home Assistant as a native automation
- **Export YAML** — View or copy the generated YAML code at any time

---

## Project Structure

```
flode/
├── custom_components/flode/   # HA integration (Python)
│   ├── brand/                 # Integration icons
│   ├── translations/          # DE + EN setup texts
│   └── www/                   # Built frontend files
├── packages/
│   ├── frontend/              # React/Vite UI (@flode/frontend)
│   ├── transpiler/            # YAML ↔ graph logic (@flode/transpiler)
│   └── shared/                # Zod schemas + types (@flode/shared)
└── __tests__/                 # YAML round-trip fixtures
```

## Technology

- **Frontend:** React 18, Vite, Tailwind CSS, React Flow (xyflow), Zustand, i18next
- **Transpiler:** TypeScript, js-yaml, ELK layout engine
- **Validation:** Zod schemas
- **Tests:** Vitest (278 tests)
- **HA integration:** Python, custom panel via `panel_custom`

---

## Changelog

All changes can be found in the [CHANGELOG.md](CHANGELOG.md).

---

## License

Apache 2.0 — see [LICENSE](LICENSE)

---

<div align="center">
  <sub>Fork by <strong>SH1FT-W</strong>, based on <a href="https://github.com/FezVrasta/cafe-hass">C.A.F.E.</a> by Federico Zivolo · Actively developed with <a href="https://claude.ai">Claude (Anthropic)</a></sub>
</div>
