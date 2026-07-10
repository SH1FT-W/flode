<div align="center">
  <img src="custom_components/flode/brand/icon.png" width="100" alt="FLODE Logo" />

  <h1>FLODE</h1>

  <p><strong>Visual Flow + Node Editor for Home Assistant</strong></p>

  [![Release](https://img.shields.io/badge/version-1.4.0-2F81F7?style=flat-square)](https://github.com/SH1FT-W/flode/releases/latest)
  [![HA Version](https://img.shields.io/badge/HA-2025.8%2B-brightgreen?style=flat-square)](https://www.home-assistant.io)
  [![License](https://img.shields.io/badge/license-Apache%202.0-orange?style=flat-square)](LICENSE)
  [![Tests](https://img.shields.io/badge/tests-316%20passing-3FB950?style=flat-square)](https://github.com/SH1FT-W/flode/actions)
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
> **Note:** FLODE is designed not to overwrite any existing data. Nevertheless, we recommend backing up your automations before editing them.

---

## What is FLODE?

**FLODE** is a visual flow editor for Home Assistant automations — inspired by Node-RED, but without an external server. You draw your automations as diagrams and FLODE automatically transpiles them into **100% native Home Assistant YAML**, stored directly in the HA core.

No vendor lock-in. No external service. Automations remain fully editable in HA's built-in editor.

---

## Features

| Feature | Description |
|---|---|
| 🎯 **Visual editor** | Drag and drop triggers, conditions, and actions onto a canvas |
| ↩️ **Undo/Redo** | Cmd+Z / Cmd+Shift+Z on the canvas — rapid changes like a drag or a run of keystrokes coalesce into a single step |
| ⚡ **Quick-add on drop** | Drag a connection onto empty canvas to search and add the next node, auto-wired |
| 📄 **100% native YAML** | No proprietary format — standard HA automation YAML |
| 🔄 **Bidirectional** | Import, edit, and save back existing HA automations |
| 🐛 **Trace overlay** | See a real automation run highlighted directly on the canvas — executed, skipped, and errored nodes, right in the diagram |
| 🔀 **State machines** | Complex loops via an automatic state machine pattern |
| 🧭 **Flow control** | Choose, If/Else, Repeat While, Repeat N×, and Parallel as draggable blocks |
| 🧩 **Native HA UI** | Uses Home Assistant's own theme and native components (pickers, selects, more-info dialogs, etc.) wherever possible |
| 🏷️ **Full metadata & targeting** | Set icon, category, labels, and area on save; target actions by area, device, label, or floor |
| 🔗 **Deep links** | Open FLODE straight into a specific automation from any dashboard button |
| 🩺 **Diagnostics & Repairs** | Native HA diagnostics download, and Repair issues for automations that couldn't be imported losslessly |
| 🌍 **DE & EN** | Full i18n support, with a per-installation language override |
| 🌗 **Dark & light mode** | Follows your configured HA theme by default, or force light/dark independently via the header toggle |

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

## Deep Links

FLODE can be opened straight into a specific automation (or a blank editor)
via URL query parameters on its panel path:

- `/flode?automation=automation.xyz` — opens the editor with that automation loaded
- `/flode?new=1` — starts a blank new automation

This makes "Edit in FLODE" buttons possible from any dashboard, e.g. with a
`button-card` or the built-in **Button Card**'s `navigate` action:

```yaml
type: button-card
name: Edit in FLODE
icon: mdi:pencil
tap_action:
  action: navigate
  navigation_path: /flode?automation=automation.motion_light_entrance
```

FLODE also fires a `flode_automation_saved` event on HA's event bus after
every save, with the automation's `entity_id` in the event data — so other
automations/scripts can react to "this automation was just edited in FLODE".

---

## Native Home Assistant UI

FLODE renders directly inside HA's own document (no iframe) and, wherever
possible, uses HA's **own native components** instead of custom-built ones —
entity/device/area pickers, the service picker, dropdowns, toggles, and most
form fields (text, number, date, time, duration, templates, JSON) all come
straight from Home Assistant, so they get HA's live entity data, icons,
friendly names, and — automatically, no configuration needed — your active
HA theme, including light/dark mode and custom themes.

These are undocumented, internal HA components without a stability
guarantee. FLODE checks for each one before using it and **falls back to its
own equivalent control** if it isn't available (e.g. very old or very new HA
versions, or when running FLODE outside of Home Assistant during
development) — you'll see a one-time notice if that happens, but the editor
keeps working either way. See
[`docs/ha-native-migration.md`](docs/ha-native-migration.md) for the full
technical writeup.

---

## Technology

- **Frontend:** React 18, Vite, Tailwind CSS, React Flow (xyflow), Zustand, i18next
- **Transpiler:** TypeScript, js-yaml, ELK layout engine
- **Validation:** Zod schemas
- **Tests:** Vitest (316 tests)
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
