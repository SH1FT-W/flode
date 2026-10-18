<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/readme-title-dark.png" />
  <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/readme-title-light.png" alt="FLODE: See your automations. The editor inside Home Assistant with a flow of two triggers, a condition and actions." />
</picture>

<p>FLODE shows Home Assistant automations and scripts as a flow you can read, test and understand.<br/>
Edited with Home Assistant's own editors, saved as plain Home Assistant YAML. No server, no lock-in.</p>

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FSH1FT-W%2Fflode%2Fmain%2Fcustom_components%2Fflode%2Fmanifest.json&query=%24.version&label=version&style=flat-square&color=4CC9FB&labelColor=0B1220)](https://github.com/SH1FT-W/flode/releases/latest) [![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2026.3%2B-4CC9FB?style=flat-square&labelColor=0B1220&logo=homeassistant&logoColor=white)](https://www.home-assistant.io) [![HACS](https://img.shields.io/badge/HACS-default-4CC9FB?style=flat-square&labelColor=0B1220)](https://hacs.xyz) [![License](https://img.shields.io/badge/license-Apache%202.0-4CC9FB?style=flat-square&labelColor=0B1220)](LICENSE)

<p><a href="https://sh1ft-w.github.io/flode"><b>Website</b></a> &nbsp;·&nbsp; <a href="#new">New</a> &nbsp;·&nbsp; <a href="#how-it-works">How it works</a> &nbsp;·&nbsp; <a href="#runs-and-relations">Runs</a> &nbsp;·&nbsp; <a href="#ai-help">AI</a> &nbsp;·&nbsp; <a href="#everything-else">Features</a> &nbsp;·&nbsp; <a href="#install">Install</a> &nbsp;·&nbsp; <a href="docs/architecture.md">Internals</a> &nbsp;·&nbsp; <a href="CHANGELOG.md">Changelog</a></p>

</div>

<br/>

<a id="new"></a>
<sub><b>JUST ARRIVED</b></sub>
## Branches on the canvas. Flows top to bottom.

The last releases opened up the blocks: Choose and If-then show their branches as cards, flows can run top to bottom, and touch screens got menus of their own.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/readme-cards-new-dark.png" />
  <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/readme-cards-new-light.png" alt="Top to bottom (3.4.0): every flow runs left to right or top to bottom, the direction is saved with the flow. Branches as cards (3.2.0): Choose and If-then draw each branch as cards, nested as deep as you like, in YAML it stays a plain choose or if. Run this card (26.10.15): runs one step for real in Home Assistant, without everything after it, inside branches too. Made for fingers (26.10.11): press and hold opens a card's menu on touch screens, on the iPhone too." />
</picture>

Also new: a "+" on an output that already leads on asks whether the step goes **in between or in parallel**, dragging a connection onto a free card **pulls it into the branch**, a toolbar toggle shows **card text in Home Assistant's own wording**, and when Home Assistant refuses to save, FLODE **marks the card red and takes you there**. Every change, release by release, in the [changelog](CHANGELOG.md).

<br/>

<a id="how-it-works"></a>
<sub><b>MADE OF HOME ASSISTANT</b></sub>
## Nothing new to learn. It's the editor you already know.

Every trigger, condition and action opens in Home Assistant's own editor, with the same forms, pickers and dialogs as in Settings. FLODE adds the canvas, so you see how it all connects. *Repeat* and *Parallel* stay single blocks; *Choose* and *If-then* show their branches as cards.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/readme-cards-made-dark.png" />
  <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/readme-cards-made-light.png" alt="Home Assistant's editors: every step opens in Home Assistant's own editor, with the same forms, pickers and dialogs as in Settings. Your icons, language, theme: cards show the entity's own icon with its live state, light or dark, on desktop, tablet and phone. Plain YAML, both ways: open any automation, change it visually, save it back, it stays editable in Home Assistant's own editor. Home Assistant's table: the start page is the same table as under Settings, with filters, grouping, labels and bulk actions." />
</picture>

<details>
<summary><b>What a flow looks like in YAML</b></summary>
<br/>

FLODE saves exactly what Home Assistant's own editor would save. Uninstall FLODE and every automation keeps working. A step that calls an action or entity Home Assistant does not have turns red on the canvas.

```yaml
alias: Evening light
triggers:
  - trigger: sun
    event: sunset
    offset: "-00:15:00"
conditions:
  - condition: state
    entity_id: input_boolean.evening_mode
    state: "on"
actions:
  - action: light.turn_on
    target:
      entity_id: light.bedroom
    data:
      brightness_pct: 40
  - if:
      - condition: state
        entity_id: switch.string_lights
        state: "off"
    then:
      - action: switch.turn_on
        target:
          entity_id: switch.string_lights
mode: restart
```

</details>

<br/>

<a id="runs-and-relations"></a>
<sub><b>RUNS AND RELATIONS</b></sub>
## Know what happened. And why.

**Runs.** Home Assistant's trace timeline next to the canvas, the path drawn on the cards, the branch that ran marked, and *Run from here* for any step, with the data of the last trigger. **Relations.** Conflicting automations, self-triggering ones, chains, missing entities, and *where is this used?* for any entity.

<p align="center">
<picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-runs-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-runs-light.png" width="49%" alt="A real run: Home Assistant's trace timeline and the steps that ran highlighted on the canvas." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-relations-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-relations-light.png" width="49%" alt="Conflicts, self-triggering automations, chains and what controls a light." /></picture>
</p>

<br/>

<a id="ai-help"></a>
<sub><b>AI HELP</b></sub>
## Stuck? Ask.

If you have set up an AI in Home Assistant (Anthropic, OpenAI, Google Gemini, Ollama and others) and chosen it as the default for *AI tasks*, FLODE can use it. It uses Home Assistant's own `ai_task`, no extra key, no extra service. Without an AI task these buttons simply do not appear; everything else works the same.

**Explain a run.** Why an automation did or did not do its job, in plain words. **Assistant.** Ask about the open flow, find mistakes, get a better version (shown first, one step to undo). **Create with AI.** Describe what should happen, get a draft built from your real entities.

<p align="center">
<picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-explain-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-explain-light.png" width="49%" alt="The AI explains a failed run in plain words." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-draft-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-draft-light.png" width="49%" alt="A draft automation built by the AI, not yet saved." /></picture>
</p>

<br/>

<a id="everything-else"></a>
<sub><b>EVERYTHING ELSE</b></sub>
## Small things that add up.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/readme-cards-else-dark.png" />
  <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/readme-cards-else-light.png" alt="Scripts, too: with fields, a run button that asks for them, and Run from here for any step. Template workshop (⌘J): Jinja rendered live by Home Assistant, with the result type and the variables of a real run. Commands and shortcuts (⌘K): everything in one search, right-click menus, copy, paste, duplicate, and an overview on ?. Tabs and minimap: several flows open at once, each with its own undo, a minimap for big ones, tidy up in one click. Import, export, merge: paste YAML, save as copy, FLODE files, and merge several automations into one. Careful with your data: warns when it cannot read part of an automation, keeps unknown fields as written, opens blueprints read-only. Readable zoomed out: below 60 percent the cards show icon, title and one line in large type, below 35 percent just the icon. On the go: on a phone the tools move into a swipeable strip and the editor slides up as a sheet." />
</picture>

<details>
<summary><b>More screenshots</b></summary>
<br/>

<p align="center">
<picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-home-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-home-light.png" width="49%" alt="Start screen with Home Assistant's own table of automations and scripts." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-assistant-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-assistant-light.png" width="49%" alt="The AI assistant lists problems in the open flow." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-create-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-create-light.png" width="49%" alt="Describe an automation in a sentence and get a draft." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-templates-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-templates-light.png" width="49%" alt="The template workshop renders Jinja live." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-palette-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-palette-light.png" width="49%" alt="The command palette." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-context-menu-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-context-menu-light.png" width="49%" alt="The right-click menu on a card." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-phone-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-phone-light.png" width="32%" alt="FLODE on a phone: the editor as a sheet." /></picture>
</p>

</details>

<br/>

<a id="install"></a>
<sub><b>INSTALL</b></sub>
## Three steps. Then it's in your sidebar.

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=SH1FT-W&repository=flode&category=integration)

1. HACS → search for **FLODE** → Download.
2. Restart Home Assistant.
3. Settings → Devices & services → Add integration → **FLODE**. It appears in the sidebar (admins only).

Requires **Home Assistant 2026.3** or newer. To install by hand, unzip `flode.zip` from the [latest release](https://github.com/SH1FT-W/flode/releases/latest) into `config/custom_components/flode/`.

<details>
<summary><b>Versions and coming from 2.x</b></summary>
<br/>

Since October 2026 FLODE uses calendar versions **`YY.M.N`**: year, month, and the number of the release within that month. `26.10.15` is the 15th release of October 2026. Every release, feature or fix, gets the next number. Tags, release titles and the version badge are just the number, without a leading "v". Calendar versions count as newer than every 3.x version, so updates through HACS work as before.

Coming from FLODE 2.x? Your automations open and save as before. FLODE 3 replaced the old editor: the simulation gave way to real runs and *Run from here*, and FLODE follows Home Assistant's language and theme instead of its own settings. Details in the [changelog](CHANGELOG.md).

</details>

<br/>

<sub><b>CREDITS</b></sub>
## Built on C.A.F.E.

FLODE is a fork of [C.A.F.E.](https://github.com/FezVrasta/cafe-hass) by [Federico Zivolo](https://github.com/FezVrasta). It never overwrites anything it was not asked to save. Back up your automations before big edits anyway.

How FLODE reads, draws, edits, writes and runs automations is described in [docs/architecture.md](docs/architecture.md). FLODE is an independent project and is not affiliated with Home Assistant or Nabu Casa. Licensed under [Apache 2.0](LICENSE).

<br/>

<div align="center">
  <sub>A <a href="https://sh1ft-w.github.io"><b>SH1FT-W</b></a> project &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/casora">Casora</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/pulse">Pulse</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/evenlight">Evenlight</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/agentbar">AgentBar</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/sharemount">ShareMount</a> &nbsp;·&nbsp; Built with <a href="https://claude.ai">Claude</a></sub>
</div>
