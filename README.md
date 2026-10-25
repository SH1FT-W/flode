<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/readme-title-dark.webp" />
  <img src="https://raw.githubusercontent.com/SH1FT-W/flode/main/docs/images/readme-title-light.webp" alt="FLODE: See your automations. The editor inside Home Assistant with a flow of two triggers, a condition and actions." />
</picture>

<p>FLODE shows Home Assistant automations and scripts as a flow you can read, test and understand.<br/>
Edited with Home Assistant's own editors, saved as plain Home Assistant YAML. No server, no lock-in.</p>

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FSH1FT-W%2Fflode%2Fmain%2Fcustom_components%2Fflode%2Fmanifest.json&query=%24.version&label=version&style=flat-square&color=4CC9FB&labelColor=0B1220)](https://github.com/SH1FT-W/flode/releases/latest) [![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2026.3%2B-4CC9FB?style=flat-square&labelColor=0B1220&logo=homeassistant&logoColor=white)](https://www.home-assistant.io) [![HACS](https://img.shields.io/badge/HACS-default-4CC9FB?style=flat-square&labelColor=0B1220)](https://hacs.xyz) [![License](https://img.shields.io/badge/license-Apache%202.0-4CC9FB?style=flat-square&labelColor=0B1220)](LICENSE)

<p><a href="https://sh1ft-w.github.io/flode"><b>Website</b></a> &nbsp;·&nbsp; <a href="#new">New</a> &nbsp;·&nbsp; <a href="#how-it-works">How it works</a> &nbsp;·&nbsp; <a href="#runs-and-relations">Runs</a> &nbsp;·&nbsp; <a href="#ai-help">AI</a> &nbsp;·&nbsp; <a href="#everything-else">Features</a> &nbsp;·&nbsp; <a href="#install">Install</a> &nbsp;·&nbsp; <a href="#thanks">Thanks</a> &nbsp;·&nbsp; <a href="docs/architecture.md">Internals</a> &nbsp;·&nbsp; <a href="CHANGELOG.md">Changelog</a></p>

</div>

<br/>

<a id="new"></a>
<sub><b>JUST ARRIVED</b></sub>
## Branches on the canvas. Flows top to bottom.

The last releases opened up the blocks: Choose and If-then show their branches as cards, flows can run top to bottom, and touch screens got menus of their own.

<!-- cards:new -->
<table>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/arrow-down-dark.svg"><img src="docs/images/icons/arrow-down-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Top to bottom</b> <code>3.4.0</code><br>Every flow runs left to right or top to bottom. The direction is saved with the flow.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/source-branch-dark.svg"><img src="docs/images/icons/source-branch-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Branches as cards</b> <code>3.2.0</code><br>Choose and If-then draw each branch as cards, nested as deep as you like. In YAML it stays a plain choose or if.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/play-circle-outline-dark.svg"><img src="docs/images/icons/play-circle-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Run this card</b> <code>26.10.15</code><br>Runs one step for real in Home Assistant, without everything after it. Inside branches too.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/gesture-tap-dark.svg"><img src="docs/images/icons/gesture-tap-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Made for fingers</b> <code>26.10.11</code><br>Press and hold opens a card's menu on touch screens, on the iPhone too.</td></tr>
</table>
<!-- /cards:new -->

Also new: a "+" on an output that already leads on asks whether the step goes **in between or in parallel**, dragging a connection onto a free card **pulls it into the branch**, a toolbar toggle shows **card text in Home Assistant's own wording**, and when Home Assistant refuses to save, FLODE **marks the card red and takes you there**. Every change, release by release, in the [changelog](CHANGELOG.md).

<br/>

<a id="how-it-works"></a>
<sub><b>MADE OF HOME ASSISTANT</b></sub>
## Nothing new to learn. It's the editor you already know.

Every trigger, condition and action opens in Home Assistant's own editor, with the same forms, pickers and dialogs as in Settings. FLODE adds the canvas, so you see how it all connects. *Repeat* and *Parallel* stay single blocks; *Choose* and *If-then* show their branches as cards.

<!-- cards:made -->
<table>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/form-select-dark.svg"><img src="docs/images/icons/form-select-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Home Assistant's editors</b><br>Every step opens in Home Assistant's own editor, with the same forms, pickers and dialogs as in Settings.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/palette-outline-dark.svg"><img src="docs/images/icons/palette-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Your icons, language, theme</b><br>Cards show the entity's own icon with its live state. Light or dark, on desktop, tablet and phone.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/code-braces-dark.svg"><img src="docs/images/icons/code-braces-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Plain YAML, both ways</b><br>Open any automation, change it visually, save it back. It stays editable in Home Assistant's own editor.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/table-large-dark.svg"><img src="docs/images/icons/table-large-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Home Assistant's table</b><br>The start page is the same table as under Settings: filters, grouping, labels and bulk actions.</td></tr>
</table>
<!-- /cards:made -->

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

<!-- cards:else -->
<table>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/script-text-outline-dark.svg"><img src="docs/images/icons/script-text-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Scripts, too</b><br>With fields, a run button that asks for them, and Run from here for any step.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/code-tags-dark.svg"><img src="docs/images/icons/code-tags-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Template workshop</b> <code>⌘J</code><br>Jinja rendered live by Home Assistant, with the result type and the variables of a real run.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/keyboard-outline-dark.svg"><img src="docs/images/icons/keyboard-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Commands and shortcuts</b> <code>⌘K</code><br>Everything in one search, right-click menus, copy, paste, duplicate, and an overview on ?.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/tab-dark.svg"><img src="docs/images/icons/tab-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Tabs and minimap</b><br>Several flows open at once, each with its own undo. A minimap for big ones, tidy up in one click.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/swap-horizontal-dark.svg"><img src="docs/images/icons/swap-horizontal-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Import, export, merge</b><br>Paste YAML, save as copy, FLODE files, and merge several automations into one.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/shield-check-outline-dark.svg"><img src="docs/images/icons/shield-check-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Careful with your data</b><br>Warns when it cannot read part of an automation, keeps unknown fields as written, opens blueprints read-only.</td></tr>
<tr><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/magnify-minus-outline-dark.svg"><img src="docs/images/icons/magnify-minus-outline-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>Readable zoomed out</b><br>Below 60 percent the cards show icon, title and one line in large type; below 35 percent just the icon.</td><td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/cellphone-dark.svg"><img src="docs/images/icons/cellphone-light.svg" width="22" height="22" align="absmiddle" alt=""></picture> <b>On the go</b><br>On a phone the tools move into a swipeable strip and the editor slides up as a sheet.</td></tr>
</table>
<!-- /cards:else -->

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

<a id="thanks"></a>
<sub><b>HALL OF FAME</b></sub>
## Made better by you.

FLODE gets better with every bug report and every idea. A big thank you to everyone who tests, reports and keeps asking for more:

- [**@bartbutenaers**](https://github.com/bartbutenaers): the most reports of all, from wires and branch dragging to touch and context menus, always with precise steps.
- [**@Hedda**](https://github.com/Hedda): the push to English as the main language, the Lit rebuild and the labels like Home Assistant.
- [**@srsly88**](https://github.com/srsly88): nested AND/OR conditions, the save dialog and the sidebar editor.
- [**@jlpnea**](https://github.com/jlpnea): `choose` blocks that render all the way down and `script.stop`.
- [**@NullScope**](https://github.com/NullScope), [**@pkejval**](https://github.com/pkejval): parallel steps after `scene.create` and the vertical flow.
- [**@Home-Wizz**](https://github.com/Home-Wizz), [**@JoHeyr**](https://github.com/JoHeyr), [**@oscarallo**](https://github.com/oscarallo), [**@HL-Apprentice**](https://github.com/HL-Apprentice), [**@DeKaN**](https://github.com/DeKaN), [**@Daniel-wendan**](https://github.com/Daniel-wendan), [**@bramcardon-alt**](https://github.com/bramcardon-alt), [**@dgarrison63**](https://github.com/dgarrison63): reports and ideas that made it into FLODE.

Found something or missing a feature? [Open an issue](https://github.com/SH1FT-W/flode/issues/new/choose). You might be next on this list.

<br/>

<sub><b>CREDITS</b></sub>
## Built on C.A.F.E.

FLODE is a fork of [C.A.F.E.](https://github.com/FezVrasta/cafe-hass) by [Federico Zivolo](https://github.com/FezVrasta). It never overwrites anything it was not asked to save. Back up your automations before big edits anyway.

How FLODE reads, draws, edits, writes and runs automations is described in [docs/architecture.md](docs/architecture.md). FLODE is an independent project and is not affiliated with Home Assistant or Nabu Casa. Licensed under [Apache 2.0](LICENSE).

<br/>

<div align="center">
  <sub>A <a href="https://sh1ft-w.github.io"><b>SH1FT-W</b></a> project &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/casora">Casora</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/pulse">Pulse</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/evenlight">Evenlight</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/agentbar">AgentBar</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/sharemount">ShareMount</a> &nbsp;·&nbsp; Built with <a href="https://claude.ai">Claude</a></sub>
</div>
