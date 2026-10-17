<div align="center">

<img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/custom_components/flode/brand/icon.png" width="96" alt="FLODE icon" />

<h1>FLODE</h1>

<p><sub><b>FLOW EDITOR FOR HOME ASSISTANT</b></sub></p>

<p><b>See your automations.</b><br/>
FLODE shows Home Assistant automations and scripts as a flow you can read, test and understand.<br/>
Edited with Home Assistant's own editors, saved as plain Home Assistant YAML. No server, no lock-in.</p>

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FSH1FT-W%2Fflode%2Fmain%2Fcustom_components%2Fflode%2Fmanifest.json&query=%24.version&label=version&style=flat-square&color=4CC9FB&labelColor=0B1220)](https://github.com/SH1FT-W/flode/releases/latest) [![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2026.3%2B-4CC9FB?style=flat-square&labelColor=0B1220&logo=homeassistant&logoColor=white)](https://www.home-assistant.io) [![HACS](https://img.shields.io/badge/HACS-default-4CC9FB?style=flat-square&labelColor=0B1220)](https://hacs.xyz) [![License](https://img.shields.io/badge/license-Apache%202.0-4CC9FB?style=flat-square&labelColor=0B1220)](LICENSE)

<p><a href="https://sh1ft-w.github.io/flode"><b>Website</b></a> &nbsp;·&nbsp; <a href="#new">New</a> &nbsp;·&nbsp; <a href="#how-it-works">How it works</a> &nbsp;·&nbsp; <a href="#runs-and-relations">Runs</a> &nbsp;·&nbsp; <a href="#ai-help">AI</a> &nbsp;·&nbsp; <a href="#everything-else">Features</a> &nbsp;·&nbsp; <a href="#install">Install</a> &nbsp;·&nbsp; <a href="docs/architecture.md">Internals</a> &nbsp;·&nbsp; <a href="CHANGELOG.md">Changelog</a></p>

<br/>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-editor-dark.png" />
  <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-editor-light.png" alt="FLODE inside Home Assistant: a flow with two triggers, a condition and actions; the selected If-then block is edited with Home Assistant's own editor." />
</picture>

</div>

<br/>

<a id="new"></a>
<sub><b>JUST ARRIVED</b></sub>
## Branches on the canvas. Flows top to bottom.

The last releases opened up the blocks: Choose and If-then show their branches as cards, flows can run top to bottom, and touch screens got menus of their own.

| | |
|:--|:--|
| **Top to bottom flows** <sub>3.4.0</sub> | Every flow runs left to right or top to bottom. The arrow next to *Tidy up* turns it, the direction is saved with the flow, and a setting opens every flow top to bottom by default. |
| **Branches as cards** <sub>3.2.0 + 3.2.1</sub> | Choose and If-then get one named output per option, the steps of each branch are drawn as cards, and all branches meet again after the block. Nested as deep as you like, branch cards can be dragged one by one. In YAML it stays a plain `choose` or `if`. |
| **In between, in parallel, into a branch** <sub>3.4.0 + 26.10.12</sub> | A "+" on an output that already leads on asks whether the new step goes in between or in parallel. A block at the end gets a "+" for the step after all its branches. Dragging a connection from a branch onto a free card pulls it into the branch. |
| **Card text like Home Assistant** <sub>3.2.2</sub> | A toggle in the toolbar shows each card in the wording of Home Assistant's own automation editor. The text comes from Home Assistant itself, so it always matches the installed version. |
| **Made for fingers** <sub>26.10.11</sub> | Press and hold on a card or a connection opens just its menu on touch screens, on the iPhone too. A connection has a menu of its own, a step inside a branch offers *Disconnect*. |
| **Save errors point to the card** <sub>3.3.0</sub> | When Home Assistant refuses to save, FLODE explains in plain words what is missing, marks the card red and takes you there. Blueprint automations open read-only. Before saving over a version changed in Home Assistant meanwhile, FLODE asks. |
| **Run this card** <sub>26.10.15</sub> | Next to *Run from here*, in the card menu, in ⌘K and in the editor: runs one step for real in Home Assistant, without everything after it. Works for steps inside an If-then or Choose branch too. The run is listed under *Runs* with only that card marked. |
| **Cleaner lines, cards keep their place** <sub>26.10.11 to 26.10.14</sub> | Each branch runs straight in its own lane and only turns at the end of the block. A line back to an earlier step runs around the cards with rounded corners. Cards after a drawn condition keep their place on the next open. |

Every change, release by release, in the [changelog](CHANGELOG.md).

<br/>

<a id="how-it-works"></a>
<sub><b>MADE OF HOME ASSISTANT</b></sub>
## Nothing new to learn. It's the editor you already know.

Every trigger, condition and action opens in Home Assistant's own editor, with the same forms, pickers and dialogs as in Settings. FLODE adds the canvas, so you see how it all connects.

- **Home Assistant's editors, dialogs and menus.** Adding steps, renaming, area, category, labels, mode, saving: all Home Assistant's own. *Repeat* and *Parallel* stay single blocks; *Choose* and *If-then* show their branches as cards.
- **Home Assistant's icons, your language, your theme.** Cards show the entity's own icon with its live state. Numbers and times follow your Home Assistant profile, light or dark, on desktop, tablet and phone.
- **Plain YAML, both ways.** Open any existing automation, change it visually, save it back. It stays editable in Home Assistant's own editor, and a step that calls an action or entity Home Assistant does not have turns red.
- **Home Assistant's table.** The start page is the same table as under Settings: filters, grouping, sorting, labels, the on/off switch and bulk actions. One click opens the flow.

<details>
<summary><b>What a flow looks like in YAML</b></summary>
<br/>

FLODE saves exactly what Home Assistant's own editor would save. Uninstall FLODE and every automation keeps working.

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

| Runs on the canvas | Relations between automations |
|:---:|:---:|
| <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-runs-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-runs-light.png" width="420" alt="A real run: Home Assistant's trace timeline and the steps that ran highlighted on the canvas." /></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-relations-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-relations-light.png" width="420" alt="Conflicts, self-triggering automations, chains and what controls a light." /></picture> |

- **Runs.** Home Assistant's trace timeline next to the canvas, the path drawn on the cards, the branch that ran marked, and *Run from here* for any step, with the data of the last trigger.
- **Relations.** Conflicting automations, self-triggering ones, chains, missing entities, and *where is this used?* for any entity.

<br/>

<a id="ai-help"></a>
<sub><b>AI HELP</b></sub>
## Stuck? Ask.

If you have set up an AI in Home Assistant (Anthropic, OpenAI, Google Gemini, Ollama and others) and chosen it as the default for *AI tasks*, FLODE can use it. It uses Home Assistant's own `ai_task`, no extra key, no extra service. Without an AI task these buttons simply do not appear; everything else works the same.

| Why did it fail? | From a sentence to a flow |
|:---:|:---:|
| <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-explain-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-explain-light.png" width="420" alt="The AI explains a failed run in plain words." /></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-draft-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-draft-light.png" width="420" alt="A draft automation built by the AI, not yet saved." /></picture> |

- **Explain a run.** Why an automation did or did not do its job, in plain words.
- **Assistant.** Ask about the open flow, find mistakes, get a better version (shown first, one step to undo).
- **Create with AI.** Describe what should happen, get a draft built from your real entities.

<br/>

<a id="everything-else"></a>
<sub><b>EVERYTHING ELSE</b></sub>
## Small things that add up.

- **Scripts, too.** With fields, a run button that asks for them, and *Run from here* for any step.
- **Template workshop** (⌘J). Jinja rendered live by Home Assistant, with the result type, what it reacts to and the variables of a real run.
- **Commands and shortcuts.** Everything in one search (⌘K), right-click menus (also on a connection and on a step inside a branch), copy, paste, duplicate, and an overview on `?`.
- **Tabs and minimap.** Several flows open at once, each with its own undo. A minimap for big ones, tidy up in one click.
- **Import, export, merge.** Paste YAML, save as copy, FLODE files, and merge several automations into one.
- **Careful with your data.** Warns when it cannot read part of an automation, keeps fields it does not model as written, and opens blueprint automations read-only.
- **Readable zoomed out.** Below 60 percent the cards show only icon, title and one line in large type; below 35 percent just a large icon.
- **On the go.** On a phone the tools move into a swipeable strip and the editor slides up as a sheet. Press and hold opens a card's menu, "+" buttons are easy to hit, a tablet opens flows at a readable zoom.

<details>
<summary><b>More screenshots</b></summary>
<br/>

| Start screen | AI assistant |
|:---:|:---:|
| <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-home-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-home-light.png" width="420" alt="Start screen with Home Assistant's own table of automations and scripts." /></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-assistant-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-assistant-light.png" width="420" alt="The AI assistant lists problems in the open flow." /></picture> |
| **Create with AI** | **Template workshop** |
| <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-create-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-ai-create-light.png" width="420" alt="Describe an automation in a sentence and get a draft." /></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-templates-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-templates-light.png" width="420" alt="The template workshop renders Jinja live." /></picture> |
| **Commands (⌘K)** | **Right-click menu** |
| <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-palette-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-palette-light.png" width="420" alt="The command palette." /></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-context-menu-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-context-menu-light.png" width="420" alt="The right-click menu on a card." /></picture> |
| **On a phone** | |
| <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-phone-dark.png" /><img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/flode-phone-light.png" width="420" alt="FLODE on a phone: the editor as a sheet." /></picture> | |

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

### Versions

Since October 2026 FLODE uses calendar versions **`YY.M.N`**: year, month, and the number of the release within that month. `26.10.15` is the 15th release of October 2026. Every release, feature or fix, gets the next number. Tags, release titles and the version badge are just the number, without a leading "v". Calendar versions count as newer than every 3.x version, so updates through HACS work as before.

Coming from FLODE 2.x? Your automations open and save as before. FLODE 3 replaced the old editor: the simulation gave way to real runs and *Run from here*, and FLODE follows Home Assistant's language and theme instead of its own settings. Details in the [changelog](CHANGELOG.md).

<br/>

<sub><b>CREDITS</b></sub>
## Built on C.A.F.E.

FLODE is a fork of [C.A.F.E.](https://github.com/FezVrasta/cafe-hass) by [Federico Zivolo](https://github.com/FezVrasta). It never overwrites anything it was not asked to save. Back up your automations before big edits anyway.

How FLODE reads, draws, edits, writes and runs automations is described in [docs/architecture.md](docs/architecture.md). FLODE is an independent project and is not affiliated with Home Assistant or Nabu Casa. Licensed under [Apache 2.0](LICENSE).

<br/>

<div align="center">
  <sub>A <a href="https://sh1ft-w.github.io"><b>SH1FT-W</b></a> project &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/casora">Casora</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/pulse">Pulse</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/evenlight">Evenlight</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/agentbar">AgentBar</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/sharemount">ShareMount</a> &nbsp;·&nbsp; Built with <a href="https://claude.ai">Claude</a></sub>
</div>
