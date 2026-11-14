# HA-Annahmen

<!-- Vorlage aus repo-vorlagen/vorlagen/ha-annahmen.md. Liegt im Repo als docs/ha-annahmen.md.
     Der HA-Beta-Bericht (repo-vorlagen/ha-beta-bericht.md) gleicht diese Liste jeden Monat mit den
     Neuerungen der HA-Beta ab. Nur festhalten, was bei einer Änderung in HA still kaputtginge. -->

Worauf sich FLODE bei Home Assistant verlässt. Bei jeder Änderung am Code mitpflegen.

**Getestet mit:** HA 2026.10, Gate gegen 2026.11.0b1 · **Mindestversion:** siehe `hacs.json` (2026.3.0)

## Annahmen

| Annahme | Wo im Code | Abgesichert durch |
|---|---|---|
| HA registriert seine Automations-Editoren (`ha-automation-trigger/-condition/-action`, `…-editor`, `ha-script-editor`, `ha-script-fields`) erst im Config-Panel; FLODE lädt sie über `partial-panel-resolver._getRoutes()` und `ha-panel-config.routerOptions.routes.automation/script.load()` | `packages/frontend/src/ha.ts` `loadAutomationEditors()` | Gate `actions` (Bearbeiten im Inspektor), Gate `visual` |
| Die Hinzufügen-Dialoge sind Methoden des HA-Editors (`ha-automation-editor` / `ha-script-editor` Prototyp), die `this.config` lesen und schreiben | `ha.ts` `runEditorDialog()`, `LEGACY_EDITOR_FIELDS` | Gate `actions` |
| Einzelzeilen-Editoren heißen `ha-automation-<art>-<typ>` (z. B. `ha-automation-trigger-state`); fehlt einer, zeigt FLODE YAML | `packages/frontend/src/ha-step.ts` | Gate `cards`, `actions` |
| HA registriert `ha-selector` erst, wenn ein Karten-Editor geladen wird (`loadCardHelpers()` → `getConfigElement()`) | `ha.ts` `ensureHaSelector()` | Gate `actions` |
| Wenn-dann-Block in der Seitenleiste: `ha-automation-action-editor` rendert `ha-automation-action-if`, darin die Liste `ha-automation-condition` mit `ha-automation-condition-row`s; die Zeilen haben `expand()` (seit mindestens 2026.3). FLODE klappt damit die „Wenn“-Bedingungen auf (#43); fehlt etwas, bleibt es still eingeklappt | `packages/frontend/src/ha.ts` `expandIfConditions()`, `flode-inspector.ts` `updated()` | Gate `actions` (if block, Flow `if-blocks-with-templates`) |
| Startseite nutzt HAs Listen `ha-automation-picker` / `ha-script-picker` | `packages/frontend/src/flode-ha-list.ts` `HA_LIST_TAGS` | Gate `visual` |
| HA-Textmodus der Karten nutzt HAs eigene Beschreibungs-Zeilen (`rowTag(kind)`) | `packages/frontend/src/ha-describe.ts` | Gate `cards` |
| Speichern über REST `POST config/automation/config/<id>` bzw. `config/script/config/<id>`; Konfig-Id = `id:` in automations.yaml | `ha.ts` (Speichern) | Gate `roundtrip` |
| Läufe: Websocket `trace/list`, `trace/get` (`domain`, `item_id`, `run_id`), Logbuch `logbook/get_events` | `ha.ts`, `flode-debug.ts` | Unit-Tests `trace-mapping`, Gate `actions` |
| KI: `ai_task.generate_data` und `ai_task/preferences/get`; KI-Entitäten beginnen mit `ai_task.` | `packages/ui-core/src/ai-task.ts` | Unit-Tests `ai-task` |
| Panel: `panel_custom.async_register_panel` mit `module_url`, `require_admin=True`; Cache-Bust über `?v=<Startzeit>` | `custom_components/flode/panel.py` | Gate (Panel lädt), pytest `tests/test_panel.py` |
| Neu-Laden des Eintrags: `frontend.async_remove_panel` gibt den Pfad frei (sonst „Overwriting panel“-ValueError beim nächsten Setup); statische Pfade lassen sich aus aiohttp nicht entfernen, darum nur einmal je HA-Lauf (Merker in `hass.data`) | `custom_components/flode/panel.py` | pytest `tests/test_panel.py` |
| `single_config_entry: true` im Manifest: HA bricht einen zweiten Einrichtungsversuch mit `single_instance_allowed` ab | `manifest.json`, `config_flow.py` | pytest `tests/test_config_flow.py` |
| Der Panel-Host malt keinen eigenen Hintergrund: Bis 2026.10 (und noch in 2026.11.0b2) malt HAs `ha-panel-custom` die Grundfarbe dahinter, ab 2026.11 HA den Theme-Hintergrund (`--ha-panel-background`, Entwickler-Blog 28.10.2026). Die Arbeitsfläche (`.pane`) behält ihren eigenen | `flode-panel.ts` `:host`, `flode-canvas.ts` `.pane` | keiner (Sichtprüfung 26.10.18) |
| YAML-Formen, die FLODE verlustfrei durchreicht: zweckgebundene Auslöser/Bedingungen (`trigger: zone.entered`, `condition: alarm_control_panel.is_armed`) mit `target:`/`options:`, `target.exclude` (seit 2026.11), `not_from`/`not_to` (null-Werte bleiben stehen) | `packages/transpiler/src` (`raw-step`, `steps.ts` `MEANINGFUL_NULL_KEYS`) | Transpiler-Rundreise-Tests, Gate `roundtrip` |
| Weitere Formen, die FLODE unverändert zurückschreibt: Kurzform-Logik `- and:/or:/not: […]` in `conditions:` (ohne `condition:`), verschachtelte Auslöserliste `- triggers: […]` (ohne eigenen Typ), `delay: 5` (Zahl = Sekunden), unbekannte Schlüssel oben in der Automation (z. B. aus einer neueren HA-Version) | `YamlParser.ts` `parseConditions()`, `parseTriggers()`, `unknownTopLevelKeys()`; `strategies/base.ts` `buildAutomationSettings()` | Unit-Tests `lossless-review-roundtrip`, Gate-Flows `shorthand-logic-conditions`, `nested-trigger-list`, `number-like-strings` |
| HA liest YAML nach YAML 1.1 (`1_000`, `0x_1F`, `0_7` sind Zahlen); FLODE schreibt jedes YAML, das wieder eingelesen wird, mit `dumpHaYaml` (solche Texte in Anführungszeichen) | `packages/transpiler/src/yaml.ts`, `script.ts`, `FlowTranspiler.ts`, `flode-panel.ts` (Öffnen), `flow-yaml.ts` | Unit-Tests `lossless-review-roundtrip`, `yaml-parser-ha-yaml` |
| `!secret`, `!input`, `!include…`, `!env_var` löst nur HAs YAML-Lader in seinen Dateien auf; die Config-API (JSON) kann sie nicht speichern. FLODE lehnt eingefügtes YAML damit mit klarer Meldung ab | `packages/transpiler/src/yaml.ts` `loadHaYaml()` | Unit-Tests `lossless-review-roundtrip` |
| Im Block `conditions:` und bei einem Bedingungs-Schritt der Aktionen kennt HA kein „sonst“; FLODE zeigt dort nur einen Ausgang (#40) | `packages/frontend/src/flow-model.ts` `isGateCondition()`, Transpiler `extractLeadingConditions()` | Unit-Tests `flow-model.test.ts` |
| `hass.language` ist ein BCP-47-Tag; Chinesisch kommt als `zh-Hans` (vereinfacht) bzw. `zh-Hant` (traditionell). FLODE zeigt Chinesisch nur für `zh`, `zh-Hans`, `zh-CN`, `zh-SG`, sonst Englisch | `packages/frontend/src/strings.ts` `uiLanguage()` (auch für `ui-core`-Texte über `i18n.ts`) | Unit-Tests `strings.test.ts` |
| Sonnen-/Kalender-Versatz zeigt FLODE roh an, ohne das Vorzeichen zu deuten (seit 2026.11 entscheidet das Vorzeichen vor/nach, Core #184855) | `packages/ui-core/src/node-summary.ts` | keiner |
| Die Panel-Dateien liefert HAs statischer Pfad über aiohttp aus; liegt `<datei>.gz` / `.br` daneben, schickt aiohttp diese, wenn der Browser sie annimmt (geprüft 2026.10, aiohttp 3.14). Fehlt das, kommen die unkomprimierten Dateien, nur größer | `packages/frontend/vite.config.ts` `precompress()`, `panel.py` | curl mit `Accept-Encoding` gegen das Test-HA (Sichtprüfung 14.11.2026) |
| `ha-button size="small"`: 2026.3 kennt nur `small`/`medium`, ab 2026.10 heißt es `s` (`small` gilt als veraltet, Konsolenwarnung, soll „in der nächsten Hauptversion“ wegfallen). FLODE bleibt bei `small`, bis die Mindestversion `s` kennt oder HA `small` streicht | `flode-panel.ts` (Knopf „Zur Karte“) | keiner |
| HA ersetzt `hass` und seine Teile (`localize`, `locale`, `services`, `devices`, `areas`, `entities`, `states`) als neue Objekte, wenn sie sich ändern, und ändert sie nie an Ort und Stelle. FLODEs Kartentext- und Fehler-Caches erkennen Änderungen an der Objekt-Identität; änderte HA sie in place, blieben Karten veraltet | `packages/frontend/src/i18n.ts` (Summary-Kontext), `node-meta.ts` (Issue-Cache) | Unit-Tests `render-caches.test.ts`, Gate `cards` |
| Diagnose liest HAs internes `homeassistant.components.frontend.DATA_PANELS` (ob das Panel registriert ist) | `custom_components/flode/diagnostics.py` | pytest `tests/test_diagnostics.py` (gegen HA 2026.3.1 und, wöchentlich, die neueste HA) |
| Neue Skript-Id: frei ist nur, was weder eine Skript-Entität hat noch per `GET config/script/config/<id>` eine Konfig liefert (Skripte ohne Entität in scripts.yaml) | `ha.ts` `freeScriptId()` | Unit-Test `ha.test.ts` |

## Fremde Integrationen

Integrationen, deren Entitäten oder Attribute FLODE liest (Domain, was genau, wo):

- `ai_task` (Entitäten, Dienst `generate_data`, Einstellung „bevorzugte Entität“): KI-Assistent, `ui-core/src/ai-task.ts`
- `automation` / `script`: Konfig-API, Traces, `last_triggered`, `ha.ts`
- `logbook`: Läufe ohne Trace, `ha.ts`

## Prüfbefehl

Volles Gate gegen eine andere HA-Version in einem eigenen Ordner (Docker, Port ab 8501):

```sh
FLODE_GATE_DIR=$HOME/Software/flode-beta-test FLODE_GATE_PORT=8501 \
FLODE_GATE_URL=http://localhost:8501 FLODE_GATE_HA_VERSION=beta dev/gate/gate.sh
```
