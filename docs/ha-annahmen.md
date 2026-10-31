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
| Startseite nutzt HAs Listen `ha-automation-picker` / `ha-script-picker` | `packages/frontend/src/flode-ha-list.ts` `HA_LIST_TAGS` | Gate `visual` |
| HA-Textmodus der Karten nutzt HAs eigene Beschreibungs-Zeilen (`rowTag(kind)`) | `packages/frontend/src/ha-describe.ts` | Gate `cards` |
| Speichern über REST `POST config/automation/config/<id>` bzw. `config/script/config/<id>`; Konfig-Id = `id:` in automations.yaml | `ha.ts` (Speichern) | Gate `roundtrip` |
| Läufe: Websocket `trace/list`, `trace/get` (`domain`, `item_id`, `run_id`), Logbuch `logbook/get_events` | `ha.ts`, `flode-debug.ts` | Unit-Tests `trace-mapping`, Gate `actions` |
| KI: `ai_task.generate_data` und `ai_task/preferences/get`; KI-Entitäten beginnen mit `ai_task.` | `packages/ui-core/src/ai-task.ts` | Unit-Tests `ai-task` |
| Panel: `panel_custom.async_register_panel` mit `module_url`, `require_admin=True`; Cache-Bust über `?v=<Startzeit>` | `custom_components/flode/panel.py` | Gate (Panel lädt) |
| Der Panel-Host malt keinen eigenen Hintergrund: Bis 2026.10 (und noch in 2026.11.0b2) malt HAs `ha-panel-custom` die Grundfarbe dahinter, ab 2026.11 HA den Theme-Hintergrund (`--ha-panel-background`, Entwickler-Blog 28.10.2026). Die Arbeitsfläche (`.pane`) behält ihren eigenen | `flode-panel.ts` `:host`, `flode-canvas.ts` `.pane` | keiner (Sichtprüfung 26.10.18) |
| YAML-Formen, die FLODE verlustfrei durchreicht: zweckgebundene Auslöser/Bedingungen (`trigger: zone.entered`, `condition: alarm_control_panel.is_armed`) mit `target:`/`options:`, `target.exclude` (seit 2026.11), `not_from`/`not_to` (null-Werte bleiben stehen) | `packages/transpiler/src` (`raw-step`, `steps.ts` `MEANINGFUL_NULL_KEYS`) | Transpiler-Rundreise-Tests, Gate `roundtrip` |
| Im Block `conditions:` und bei einem Bedingungs-Schritt der Aktionen kennt HA kein „sonst“; FLODE zeigt dort nur einen Ausgang (#40) | `packages/frontend/src/flow-model.ts` `isGateCondition()`, Transpiler `extractLeadingConditions()` | Unit-Tests `flow-model.test.ts` |
| Sonnen-/Kalender-Versatz zeigt FLODE roh an, ohne das Vorzeichen zu deuten (seit 2026.11 entscheidet das Vorzeichen vor/nach, Core #184855) | `packages/ui-core/src/node-summary.ts` | keiner |

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
