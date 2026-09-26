<div align="center">
  <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/custom_components/flode/brand/icon.png" width="88" alt="FLODE Logo" />

  <h1>FLODE</h1>

  <p><strong>See your Home Assistant automations — as a flow, inside Home Assistant.</strong></p>

  [![Release](https://img.shields.io/badge/version-3.0.2-2F81F7?style=flat-square)](https://github.com/SH1FT-W/flode/releases/latest)
  [![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2026.3%2B-41BDF5?style=flat-square&logo=homeassistant&logoColor=white)](https://www.home-assistant.io)
  [![License](https://img.shields.io/badge/license-Apache%202.0-orange?style=flat-square)](https://github.com/SH1FT-W/flode/blob/main/LICENSE)
  [![HACS](https://img.shields.io/badge/HACS-default-41BDF5?style=flat-square)](https://hacs.xyz)

  **[Website](https://sh1ft-w.github.io/flode)** &nbsp;·&nbsp; [Installation](#installation) &nbsp;·&nbsp; [Changelog](https://github.com/SH1FT-W/flode/blob/main/CHANGELOG.md) &nbsp;·&nbsp; [Issues](https://github.com/SH1FT-W/flode/issues)

  <br/>

  <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-editor-dark.png" alt="FLODE inside Home Assistant: a flow with two triggers, a condition and actions; the selected If-then block is edited with Home Assistant's own editor." />
</div>

<br/>

FLODE shows your automations and scripts as a flow you can **read, test and understand**. Every step is edited with **Home Assistant's own editors** — the same forms, pickers and dialogs as in Settings — and saved as **plain Home Assistant YAML**. No server, no account, no lock-in: uninstall FLODE and every automation keeps working.

| Runs on the canvas | Why did it fail? *(optional AI)* |
|:---:|:---:|
| <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-runs.png" width="420" alt="A real run: Home Assistant's trace timeline and the steps that ran highlighted on the canvas." /> | <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-explain.png" width="420" alt="The AI explains a failed run in plain words." /> |
| **Relations between automations** | **From a sentence to a flow** *(optional AI)* |
| <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-relations.png" width="420" alt="Conflicts, self-triggering automations, chains and what controls a light." /> | <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-draft.png" width="420" alt="A draft automation built by the AI, not yet saved." /> |

<details>
<summary><strong>More screenshots</strong></summary>
<br/>

| Light theme | Start screen |
|:---:|:---:|
| <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-editor-light.png" width="420" alt="The editor in Home Assistant's light theme." /> | <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-home.png" width="420" alt="Start screen with automations, scripts and relations." /> |
| **AI assistant** | **Create with AI** |
| <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-assistant.png" width="420" alt="The AI assistant lists problems in the open flow." /> | <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-create.png" width="420" alt="Describing an automation in plain words." /> |
| **Template workshop** | **Commands (⌘K)** |
| <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-templates.png" width="420" alt="Template workshop with a live-rendered result." /> | <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-palette.png" width="420" alt="Command palette." /> |
| **Right-click menu** | **On a phone** |
| <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-context-menu.png" width="420" alt="Right-click menu on a card." /> | <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-phone.png" width="200" alt="FLODE on a phone with the editor as a bottom sheet." /> |

</details>

## What it does

- **Home Assistant's own editors** for every trigger, condition and action — adding steps, renaming (area, category, labels), mode and saving included. *If-then*, *Choose*, *Repeat* and *Parallel* stay single blocks.
- **Automations and scripts**, several open in tabs, each with its own undo.
- **Runs** — Home Assistant's trace timeline next to the canvas, the path drawn on the cards, and *Run from here* for any step.
- **Relations** — conflicting automations, self-triggering ones, chains, missing entities, and *where is this used?* for any entity.
- **Template workshop** (⌘J) — Jinja rendered live by Home Assistant, with the variables of a real run.
- **Fast to work with** — ⌘K for everything, right-click menus, copy/paste, minimap, tidy up, keyboard shortcuts (`?`), YAML import/export and merging automations.
- **Careful with your data** — opens and saves your existing automations unchanged, and warns if it can't read part of one.
- **Follows Home Assistant** — your language, light or dark theme, and works on a phone.

### Optional: AI help

If you've set up an AI in Home Assistant (Anthropic, OpenAI, Google Gemini, Ollama …) and chosen it as the default for *AI tasks*, FLODE can use it:

- **Explain a run** — why an automation did or didn't do its job, in plain words.
- **Assistant** — ask about the open flow, find mistakes, get a better version (shown first, one step to undo).
- **Create with AI** — describe what should happen, get a draft built from your real entities.

FLODE uses Home Assistant's own `ai_task` — no extra key, no extra service. Without an AI task these buttons simply don't appear; everything else works the same.

## Installation

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=SH1FT-W&repository=flode&category=integration)

1. HACS → search for **FLODE** → Download.
2. Restart Home Assistant.
3. Settings → Devices & services → Add integration → **FLODE**. It appears in the sidebar (admins only).

Requires **Home Assistant 2026.3** or newer. To install by hand, copy `flode.zip` from the [latest release](https://github.com/SH1FT-W/flode/releases/latest) into `config/custom_components/flode/`.

### Coming from FLODE 2.x?

Your automations open and save as before. FLODE 3 replaces the old editor: the simulation is replaced by real runs and *Run from here*, and FLODE now follows Home Assistant's language and theme instead of its own settings. Details in the [changelog](https://github.com/SH1FT-W/flode/blob/main/CHANGELOG.md).

> FLODE is a fork of [C.A.F.E.](https://github.com/FezVrasta/cafe-hass) by [@FezVrasta](https://github.com/FezVrasta). It never overwrites anything it wasn't asked to save — but back up your automations before big edits anyway.

## License

Apache 2.0 — see [LICENSE](https://github.com/SH1FT-W/flode/blob/main/LICENSE)

<br/>

<div align="center">
  <sub>Fork by <strong>SH1FT-W</strong>, based on <a href="https://github.com/FezVrasta/cafe-hass">C.A.F.E.</a> by Federico Zivolo · Built with <a href="https://claude.ai">Claude (Anthropic)</a></sub>
</div>
