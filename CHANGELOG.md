# Changelog

All notable changes to FLODE are documented here.

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
