# Changelog

All notable changes to FLODE are documented here.

---

## [0.9.6] — 2026-06-15 — Templated Delay & Top-Level Keys Round-Trip

### Fixed
- **#221 — Templated delay / wait timeout (Objekt-Form)**: Delay- und Wait-Felder (`hours`, `minutes`, `seconds`, `milliseconds`) akzeptieren jetzt `string | number` — Template-Strings wie `{{ states('input_number.delay_minutes') | int(5) }}` wurden bisher von Zod abgelehnt und verhinderten den Import der Automation
- **#220 — Top-Level Automations-Keys gehen beim Speichern verloren**: `trigger_variables`, `initial_state: false` und `trace` wurden beim Export nicht zurückgeschrieben. Ursache war ein hartkodiertes 7-Felder-Objekt in `createAutomation`/`updateAutomation` (ha-api.ts) das alle anderen Keys stillschweigend verwarf. Behoben durch vollständiges Spread des Config-Objekts

### Tests
- `issue-221-templated-delay.test.ts` (5 Tests)
- `issue-220-toplevel-keys-roundtrip.test.ts` (6 Tests)

---

## [0.9.5] — 2026-06-14 — Choose-Block Visualisierung, State-Dropdown & Dependency-Updates

### Added
- **Choose-Block Case Labels**: Erstes Bedingungsknoten jedes Choose-Falls zeigt jetzt einen Indigo-Pill-Badge ("Fall 1/3", "Fall 2/3", "Fall 3/3") — erleichtert die visuelle Unterscheidung mehrerer Branches im selben Choose-Block
- **State-Dropdown in Bedingungsfeldern**: Zustand-Feld in Zustandsbedingungen zeigt jetzt eine Dropdown-Liste mit passenden Zuständen für die gewählte Entität (analog zu Auslösern)
- **Übersetzte Zustandswerte**: Zustandswerte werden in der UI-Sprache angezeigt (on→An, off→Aus, home→Zuhause, etc.) mit optionalem englischen Suffix bei abweichenden Werten
- **GitHub Actions Node.js 24**: Alle Workflows nutzen jetzt `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` um die Deprecation-Warnung für Node.js 20 zu vermeiden

### Fixed
- **react-error-boundary 6.1.x**: Breaking Change (`error: Error` → `error: unknown`) in `FallbackComponent` behoben

### Changed
- Dependency-Updates (minor/patch): `@xyflow/react`, `zustand`, `react-hook-form`, `react-error-boundary`, `fuse.js`, alle `@radix-ui/*`, `zod`, `elkjs`, `@biomejs/biome`, `turbo`, `tsx`, `glob`

---

## [0.9.4] — 2026-06-14 — Stop Action & Variables Bugfixes

### Fixed
- **Stop Action Node**: Stop-Nodes (`stop: "Meldung"`) werden jetzt orange mit OctagonX-Icon dargestellt statt grün wie reguläre Aktionen
- **Stop Action Properties Panel**: Stop-Nodes zeigen jetzt den korrekten Typ "Ausführung stoppen" im Panel mit eigenem Stop-Meldung-Input und "Als Fehler markieren"-Toggle
- **Stop/Error in "Zusätzliche Eigenschaften"**: `stop` und `error` wurden fälschlicherweise im Zusätzliche-Eigenschaften-Panel angezeigt — jetzt korrekt als behandelte Properties konfiguriert
- **Top-Level `variables:` Round-Trip** (C.A.F.E. #210): `variables:` Section auf Automation-Ebene blieb beim YAML-Export erhalten — bisher wurden diese beim Exportieren entfernt
- **Versionsnummer in UI**: `manifest.json` Version war nie aktualisiert worden — alle Builds zeigten fälschlicherweise "v0.9.2"

### Added
- i18n: `nodes:types.stop`, `nodes:actions.stopExecution`, `nodes:actions.stopError`, `nodes:actions.stopMessageLabel`, `nodes:actions.markAsError`, `nodes:actions.actionTypes.stop` (DE + EN)
- Test-Fixture `34-toplevel-variables.yaml` für Variables-Round-Trip
- Tests: `toplevel-variables-roundtrip.test.ts` (3 Tests)

---

## [0.9.3] — 2026-06-13 — CI & Manifest Fixes

### Fixed
- `homeassistant` key removed from `manifest.json` (not a valid manifest field, belongs in `hacs.json` only)
- Manifest keys sorted per hassfest requirements (domain, name, then alphabetical)
- HACS validation workflow: removed `ignore` flags to comply with HACS submission requirements
- Added hassfest validation workflow for integration compliance

---

All notable changes to FLODE are documented here.

---

## [0.9.2] — 2026-06-12 — Lint & Code-Qualität

### Fixed
- Alle Biome-Lint-Fehler und Formatierungsprobleme behoben (19 Dateien auto-formatiert)
- `type="button"` auf Collapse/Expand-Buttons in `ConditionNode` gesetzt (a11y)
- JSX-Literale in `App.tsx` und `ConditionNode.tsx` korrekt escaped
- `noEmptyBlockStatements` in `App.tsx` behoben
- `aria-hidden="true"` auf dekorativen SVG in `LoopBackEdge` gesetzt (a11y)
- `biome-ignore` Kommentar für unvermeidbar komplexe Graph-Traversal-Funktion in `native.ts`

---

## [0.9.1] — 2026-06-12 — Code-Qualität & HA-Integration Cleanup

### Fixed
- `ConfigFlowResult` statt veraltetes `FlowResult` aus `homeassistant.data_entry_flow` (deprecated seit HA 2024.4)
- Minimale HA-Version in `manifest.json` und `hacs.json` auf `2024.6.0` korrigiert (`StaticPathConfig` erfordert 2024.6)
- Ungenutzten `import os` und tote `PANEL_URL`-Konstante aus `panel.py` entfernt
- Leere `async_setup`-Funktion aus `__init__.py` entfernt (bei Config-Flow-Integrationen nicht benötigt)
- Hacky Panel-Vorab-Entfernung via `hass.data` durch saubere Lifecycle-Logik ersetzt

---

## [0.9.0] — 2026-06-12 — OR/AND Condition Visualisierung & i18n

### Added
- **OR/AND/NOT Container-Nodes**: Gruppen-Bedingungen zeigen ihre verschachtelten Sub-Conditions direkt als Mini-Karten im Node — kein Klick mehr notwendig um die Logik zu verstehen
- **OR/AND Separator**: Zwischen den Sub-Condition-Karten wird der Gruppen-Typ (OR/AND/NOT) als visueller Trenner angezeigt
- **Collapse bei vielen Bedingungen**: Ab 4+ Sub-Conditions erscheint ein „+X weitere"-Button zum Ein-/Ausklappen

### Improved
- **Vollständige i18n für alle Node-Karten**: Alle Typ-Labels in Trigger-, Condition-, Action-, Delay-, Wait- und SetVariables-Nodes werden jetzt dynamisch nach der gewählten Sprache angezeigt (war zuvor hardcoded Englisch)
- Condition-Typen: `Zustand`, `Numerischer Zustand`, `ODER (Beliebige)`, `UND (Alle)` etc.
- Trigger-Plattformen: `Zustandsänderung`, `Zeit`, `Ereignis` etc.
- Fallback-Node-Titel: `Verzögerung`, `Warten auf`, `Variablen setzen`, `Aktion`
- Alle Node-Komponenten nutzen jetzt den `useTranslation`-Hook statt dem i18next-Singleton

---

## [0.8.0] — 2026-06-11 — Screenshots & Dokumentation

### Added
- Light- und Dark-Mode-Screenshots in README und `docs/images/` hinzugefügt
- README: Side-by-Side-Vorschau beider Modi direkt im Header

---

## [0.7.9] — 2026-06-11 — Choose-Block Trigger-Routing Fix

### Bug Fixes
- **Gekreuzte Linien bei Trigger-basierten Choose-Blöcken** — Automationen mit mehreren Triggern und trigger-ID-Conditions (z. B. iPad-Akku-Automation) zeigten gekreuzte blaue Linien, weil alle Trigger mit dem ersten Case verbunden wurden. Jetzt wird jeder Trigger nur noch mit seinem passenden Case verbunden (via hint-Edge). Die internen Fluss-Kanten sind unsichtbar (`choose-entry`-Typ).
- **Backward-Detection zu sensitiv** — Minimale x-Unterschiede in gespeicherten Metadaten (z. B. 15 px) lösten unnötige ELK-Neuberechnungen aus; Schwellenwert auf 100 px erhöht.

### Technisch
- Neuer Edge-Typ `choose-entry`: semantische, unsichtbare Verbindung Trigger→Case1 (für Topology/Serializer notwendig)
- ELK-Layout schließt jetzt `hint`-Edges ein (für korrekte Layer-Zuweisung bei trigger-basierten Choose-Blöcken)
- `fixChooseChainLayout` als Fallback für frische Layouts ohne Metadaten wiederhergestellt

---

## [0.7.8] — 2026-06-11 — Choose-Block Visualisierung

### Bug Fixes
- **Choose-Block: Cases nicht verbunden** — Nach der Eingangs-Bedingung erschienen alle Optionen eines `choose:`-Blocks als getrennte Bäume; jetzt zeigt FLODE für jede Option eine separate Linie vom gemeinsamen Einstiegspunkt (wie im HA-Editor)
- **Choose-Block: roter Punkt auf Condition-Nodes** — Condition-Nodes der Cases zeigten fälschlicherweise den FALSE-Handle (roter Punkt), weil die interne `choose-chain`-Kante über den FALSE-Handle lief; wird jetzt korrekt ausgeblendet
- **Choose-Block: Default-Option alleine** — Die Standard-Aktionen (`default:`) eines Choose-Blocks erschienen als eigenständiger, nicht verbundener Block; sind jetzt direkt mit dem Einstiegspunkt verbunden
- **Stale `_flode_metadata` Positionen** — Veraltete gespeicherte Positionen die einen Choose-Case links vom vorherigen platzierten lösten neu ELK-Layout aus (backwards-choose-chain-Detection)
- **Bezier-Kurven** — Alle Verbindungslinien zwischen Nodes werden jetzt als sanfte Bezier-Kurve dargestellt statt mit Ecken

### Technisch
- Neue Edge-Typen: `choose-hint` (sichtbare Verbindung Entry→Case2+/Default), `choose-default` (semantische, unsichtbare Kante Last-Case→Default)
- ELK-Layout berücksichtigt `choose-hint` für korrektes Layer-Assignment aller Cases
- Zod-Schema und Graph-Validator für neue Edge-Typen erweitert

---

## [0.7.7] — 2026-06-11 — Bugfixes & Repo Cleanup

### Bug Fixes
- **Import crash bei `conditions: []`** — Choose-Cases mit leerem Conditions-Array (gültige HA-Syntax für leere Default-Weichen) haben einen `undefined is not an object`-Crash verursacht; Filter prüft jetzt explizit auf nicht-leere Arrays
- **Roter Punkt an while-Bedingung** — FALSE-Handle am Condition-Node wird nur noch angezeigt wenn tatsächlich eine Edge daran hängt; bei `repeat:while:` verschwindet der irreführende rote Punkt
- **Loop-Pfeil visuelle Verbesserung** — Back-Edges bei `repeat:while/until/count` werden jetzt als gestrichelter Pfeil (`loop-back`-Typ) gerendert, damit der Loop-Charakter auf einen Blick erkennbar ist

### Repo Cleanup (keine funktionalen Änderungen)
- Alle verbleibenden `cafe_debug`, `cafe_hass_config`, `cafeLogger`, `CAFE_TOGGLE_SIDEBAR` Referenzen auf FLODE-Branding umgestellt
- Ungeschützte `console.log`-Aufrufe aus Produktionscode entfernt
- `manifest.json`: ungültiges `documentation_url`-Feld entfernt, `iot_class` → `calculated`
- `hacs.json`: `"domain": "flode"` ergänzt
- Issue-Template, CONTRIBUTING.md, CLAUDE.md, DEBUG.md auf FLODE aktualisiert
- Fake-Testdatei mit hardcoded Automation-ID gelöscht
- HACS-Validierung läuft jetzt automatisch bei Push/PR
- `LICENSE`: Copyright-Zeile ergänzt

---

## [0.7.6] — 2026-06-11 — Trigger Routing & Layout

### Added
- **Visuelle Trigger-Routing-Linien für `choose:`-Blöcke** — Jeder Trigger wird jetzt mit seiner zugehörigen Condition visuell verbunden, sodass die Zuordnung auf einen Blick erkennbar ist
- **Neuer Edge-Typ `hint`** — Rein visuelle Verbindung (nicht löschbar, wird vom Transpiler ignoriert)
- **Neuer Edge-Typ `choose-chain`** (unsichtbar) — Technische Kante für Choose-Erkennung, wird nicht gerendert

### Bug Fixes
- **`id:`-Feld leer im Properties-Panel** — HA API liefert Condition-IDs als Array (`['akku_ueber_80']`); Parser normalisiert jetzt direkt beim Import zu String (betrifft `choose:`- und `if/then/else`-Blöcke)
- **Edge-`type` wurde beim Import/Export verworfen** — `flow-store` hat `type`-Feld nicht weitergegeben; Fix in `loadFlow` und `toFlowGraph`
- **Grauer Pfeil-Überlappung auf Nodes** — Custom SVG-Marker in HintEdge ersetzt durch React Flow's eingebautes Marker-System
- **Topology-Analyzer ignoriert visuelle Kanten** — `hint`-Edges werden jetzt aus Topology-Analyse und `findBackEdges` gefiltert

### Improvements
- **Automatisches Layout (ELK)** — Hint-Edges werden für Layer-Zuweisung genutzt, Choose-Chain-Edges ausgeschlossen → sauberes 3-Spalten-Layout (Trigger | Conditions | Actions)
- **`fitView` nach Import** — Delay von 50ms auf 150ms erhöht, `maxZoom: 0.75` gesetzt für konsistentes Zentrieren nach dem Laden

---

## [0.7.5] — 2026-06-10 — FLODE Rename

### Breaking Changes
- **Project renamed from C.A.F.E. to FLODE** (Flow + Node Editor)
- HA domain changed: `cafe` → `flode` — existing users must remove the old integration and reinstall
- IndexedDB storage renamed: `cafe-flow-storage` → `flode-flow-storage`

### Added
- New brand icon (`custom_components/flode/brand/icon.png`) — F-shaped node graph on dark background
- New SVG favicon for browser tab (`flode.svg`)
- German translation for HA setup dialog (`translations/de.json`)
- Sidebar icon changed to `mdi:graph-outline`

---

## [0.7.4] — 2026-06-10

### Bug Fixes
- **#154** — Save dialog now scrollable on small screens (`max-h-[90vh] overflow-y-auto`)
- **#161** — Text cursor now visible in input fields in light mode (`caret-foreground`)
- **#204** — Fixed React error #31: legacy `{label, value}` option objects are now safely coerced to strings in `DynamicFieldRenderer`
- **#215** — Time trigger with `at: {entity_id, offset}` now displays as `entity_id (offset)` instead of `[object Object]`

---

## [0.7.3] — 2026-06-10

### Bug Fixes
- **#218** — Added Apache 2.0 `LICENSE` file
- **#209** — OR/AND/NOT condition nodes now show a validation error when no sub-conditions are defined
- Fixed TypeScript type: `conditions?: ConditionNodeData[]` explicitly declared in `ConditionNodeData` interface
- Added i18n keys: `validation.condition.groupConditionsRequired` (de + en)

### Tests
- New fixtures: `31-or-condition-node.yaml`, `32-or-at-root-conditions.yaml`
- Fixed 5 pre-existing test failures: assertions updated from hardcoded strings to i18n keys

---

## [0.7.1] — 2026-06-10

### Bug Fixes
- Fixed device trigger label showing UUID instead of device name
- `HassContext.tsx`: new `getDeviceNameById()` function for direct device registry lookup
- `DeviceTriggerFields.tsx`: device name used as fallback when entity lookup returns UUID

---

## [0.7.0] — 2026-06-10

### Improvements
- Full UI translation — German and English (FR, IT, ZH-Hans removed)
- `DynamicFieldRenderer`: field descriptions and placeholders now translated via `nodes:fieldDescriptions.*` and `nodes:fieldPlaceholders.*`
- `EntitySelector`: domain labels now translated via `nodes:serviceDomains.*`
- `WaitFields`, `DeviceConditionFields`: fully localized

---

## [0.6.9] — 2026-06-10

### Bug Fixes
- **#216** — Fixed crash when selecting `after`/`before` in Time Condition node
  - `ConditionNode.tsx`: object values safely coerced via `String()`
  - `ConditionFields.tsx`: old field values are cleared on condition type change
  - `TriggerFields.tsx`: same fix applied for trigger type changes

---

## [0.6.8] — 2026-06-10

### Improvements
- Action service dropdown shows friendly names (`Turn on` instead of `light.turn_on`)
- Search works for both friendly name and service ID

---

## [0.6.7] — 2026-06-10

### Improvements
- All validation error messages translated (~27 error strings → i18n keys)
- `useNodeErrors.ts`: errors resolved via `useTranslation`
- `flow-store.ts`: save validation messages via `i18next.t()`

---

## [0.6.6] — 2026-06-10

### Bug Fixes
- **#219** — Fixed "Graph must have at least one trigger node" error on every import
  - Non-standard trigger formats (dict-keyed, missing `platform:`) are now parsed correctly
  - `createFallbackTriggerNode()` added as safe fallback
  - `HATriggerSchema` made more robust for edge-case formats

---

## [0.6.5] — 2026-06-10

### Improvements
- All remaining English-only UI strings translated to German
- `fieldOptions` section added to `de/nodes.json`: weekdays, sunrise/sunset, enter/leave
- `DynamicFieldRenderer`: option labels looked up via `nodes:fieldOptions.{field}.{value}`

---

## [0.6.4] — 2026-06-10

### Improvements
- German translations for all action node fields (`de/nodes.json`)
- `DynamicFieldRenderer`: field labels looked up via `nodes:fieldLabels.{fieldName}` with English fallback

---

## [0.6.3] — 2026-06-10

### Bug Fixes
- **#210** — Fixed: `variables:` section was overwritten on save/import cycle
  - `userVariables` now correctly persisted in `FlowState` and round-tripped via `fromFlowGraph()` / `toFlowGraph()`

---

## [0.6.2] — 2026-06-10

### Bug Fixes
- **#205** — Added "Back to Home Assistant" button in panel mode (`ArrowLeft` icon)
  - Only visible in embedded panel mode
  - Calls `window.parent.history.back()`

---

## [0.6.1] — 2026-06-10

### Bug Fixes
- **#214** — Fixed: `stop:` actions shown as "Unknown node"
  - New `isStopAction()` type guard in `YamlParser.ts`
  - Stop actions correctly parsed and exported with `stop`, `error`, `alias` fields

---

## [0.6.0] — Baseline

Initial fork state — base version before FLODE development began.
