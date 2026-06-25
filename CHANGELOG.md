# Changelog

All notable changes to FLODE are documented here.

---

## [1.1.0] — 2026-06-25 — Flow-Control Blocks, Performance & Hardening

### Added
- **Flow-control blocks in the node palette** — the Home Assistant control structures that previously couldn't be added from the palette are now first-class draggable blocks: **Choose** (Fallunterscheidung), **If / Else** (Wenn / Sonst), **Repeat While** (Wiederholen solange), **Repeat N×** (N× Wiederholen) and **Parallel**. They are created as ready-to-wire compound blocks (correct nodes, edges and handles) and round-trip to the matching HA YAML (`choose:` / `if`-`then`-`else` / `repeat.while` / `repeat.count` / `parallel:`)
- **Grouped palette section** — the new blocks live under an "Ablauf-Steuerung / Flow Control" heading, sub-grouped logically into *Branching*, *Loops* and *Concurrency*
- **Dedicated "repeat count" field** — the N× Repeat block now has a proper number input in the properties panel instead of requiring raw JSON editing
- **Labelled exit button** — the bare back-arrow in the header is now an explicit "Exit / Beenden" button

### Changed
- **Much faster initial load via code-splitting** — the main bundle shrank from ~3.3 MB to ~408 KB. The transpiler + ELK layout engine and the YAML code editor are now lazy-loaded on demand, and React / React Flow / Radix / i18next are split into long-term cacheable vendor chunks
- **Cleaner loop rendering** — the Repeat-While block now lays out as *action → condition* with the loop-back edge routed cleanly *around* the nodes (a detour over the top) instead of cutting diagonally through them, even when the loop body contains multiple nodes
- The "Beta" status markers were removed from the README and landing page now that the project is stable and well-covered by tests

### Fixed
- **Type-safety hardening in the Home Assistant bridge** — `contexts/HassContext.tsx` no longer relies on any `as` / `as unknown as` casts (13 → 0). Frontend-only fields the editor never reads are now optional on the `HomeAssistant` type, registry fetches use the generic `sendMessagePromise<T>` boundary, and the duplicated registry-loading logic was consolidated

### Internal
- Added round-trip tests for the palette block factories (structural + transpile checks for all five blocks); the suite now stands at **292 tests** across all packages
- Migrated the Biome configuration to 2.5.0 and applied a repo-wide safe autofix (formatting / import & class sorting only)

---

## [1.0.0] — 2026-06-20 — Major Dependency Overhaul & Choose Block Fixes

### Changed
- **Major dependency upgrade across the whole monorepo**: React 18 → 19, Tailwind CSS 3 → 4, Vite 5 → 8, Vitest 2 → 4, TypeScript 5.7 → 6.0, `@vitejs/plugin-react` 4 → 6, i18next 25 → 26, react-i18next 16 → 17, `custom-card-helpers` 1.9 → 2.0, `lucide-react` 0.577 → 1.21, `uuid` 13 → 14, `commander` 12 → 15
- **Building from source now requires Node.js ≥20.19** (Vite 7+ requirement) — only affects contributors building the frontend, not end users
- Migrated `vitest.workspace.ts` to the `test.projects` field in a root `vitest.config.ts` (the standalone workspace file was removed in Vitest 4)
- Migrated Tailwind config from `tailwind.config.ts` to CSS-native `@theme` in `index.css`, switched from the PostCSS plugin to `@tailwindcss/vite`

### Fixed
- **Choose block: first case had no visible connection to its trigger** — every other case showed a fan-out hint edge back to the trigger, but the first case's structural edge was invisible by design with no visible substitute. All cases now consistently show the connection (gap noticed while verifying cafe-hass #201)
- **Choose block: a choice with `conditions: []` was silently dropped on import** — Home Assistant treats an empty conditions array as vacuously true, but FLODE filtered such choices out before processing, discarding their actions with no warning. They're now folded into the default branch; a genuinely ambiguous case (multiple empty-condition choices, or a clash with an explicit `default:`) produces a warning instead of silent data loss (fixes cafe-hass #181)
- **Tailwind v4 dark mode was broken** — the canvas stayed on the light background/grid colors instead of switching to dark. Root cause: `@theme { --color-background: hsl(var(--background)) }` gets resolved against `:root` at build time in Tailwind v4 instead of being re-evaluated per element; switched to `@theme inline`
- Two latent bugs surfaced by the Vitest 4 upgrade: an ineffective `tsconfig.json` exclude pattern (`__tests__` only matched the project root, not nested folders, so compiled test files leaked into `dist/`), and missing `node` ambient types in the transpiler's `tsconfig.json`

### Tests
- 282 tests, all green across the full dependency upgrade

---

## [0.9.7] — 2026-06-16 — Sun Trigger Offset Fix & Choose Block Layout

### Fixed
- **#9 — Sun trigger `offset` as a number**: Numeric offsets like `offset: -1800` (seconds as integer) were rejected by Zod with `expected string, received number`, preventing import of any sun-trigger automation with a numeric offset. The schema now accepts `string | number | Record<string, number>` — mirrors the fix applied to delay/wait fields in #221
- Minor bug fixes
- **Choose block: misleading direct lines when a root condition gates the block**: When a top-level condition (e.g. a template gate) precedes a choose block, FLODE previously drew visible hint edges directly from the triggers to each case condition node — visually bypassing the gate and implying an independent execution path. Hint edges are now only created when triggers are direct predecessors of the choose block (no intermediate condition node)

### Added
- **Choose default "Otherwise" edge**: The default branch of a choose block is now connected via a visible dashed edge labelled "Otherwise" (DE: "Sonst") — previously the default node appeared disconnected with no visible incoming edge
- **Choose fan-out visualization**: From the second case onward, FLODE draws a direct edge from the entry node (gate condition / trigger) to each case — all cases appear as equal branches from a common entry point instead of an invisible chain
- **ELK port constraints for condition nodes**: Condition nodes now carry explicit ELK ports (`true` top, `false` bottom) with `FIXED_ORDER` constraint — eliminates edge crossings between yes/no paths in the automatic layout

### Tests
- New fixture `35-sun-trigger-numeric-offset.yaml` covering numeric offsets `0`, `-1800`, `3600` and string offset `"-00:30:00"`
- 282 tests total (278 + 4 new)

---

## [0.9.6] — 2026-06-15 — Templated Delay & Top-Level Keys Round-Trip

### Fixed
- **#221 — Templated delay / wait timeout (object form)**: Delay and wait fields (`hours`, `minutes`, `seconds`, `milliseconds`) now accept `string | number` — template strings like `{{ states('input_number.delay_minutes') | int(5) }}` were previously rejected by Zod and prevented importing the automation
- **#220 — Top-level automation keys lost on save**: `trigger_variables`, `initial_state: false` and `trace` were not written back on export. The root cause was a hardcoded 7-field object in `createAutomation`/`updateAutomation` (ha-api.ts) that silently discarded all other keys. Fixed by fully spreading the config object

### Tests
- `issue-221-templated-delay.test.ts` (5 tests)
- `issue-220-toplevel-keys-roundtrip.test.ts` (6 tests)

---

## [0.9.5] — 2026-06-14 — Choose Block Visualization, State Dropdown & Dependency Updates

### Added
- **Choose block case labels**: The first condition node of each choose case now shows an indigo pill badge ("Case 1/3", "Case 2/3", "Case 3/3") — makes it easier to visually distinguish multiple branches in the same choose block
- **State dropdown in condition fields**: The state field in state conditions now shows a dropdown list with matching states for the selected entity (analogous to triggers)
- **Translated state values**: State values are displayed in the UI language (on→On, off→Off, home→Home, etc.) with an optional English suffix when values differ
- **GitHub Actions Node.js 24**: All workflows now use `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` to avoid the Node.js 20 deprecation warning

### Fixed
- **react-error-boundary 6.1.x**: Fixed breaking change (`error: Error` → `error: unknown`) in `FallbackComponent`

### Changed
- Dependency updates (minor/patch): `@xyflow/react`, `zustand`, `react-hook-form`, `react-error-boundary`, `fuse.js`, all `@radix-ui/*`, `zod`, `elkjs`, `@biomejs/biome`, `turbo`, `tsx`, `glob`

---

## [0.9.4] — 2026-06-14 — Stop Action & Variables Bugfixes

### Fixed
- **Stop action node**: Stop nodes (`stop: "Message"`) are now rendered in orange with an OctagonX icon instead of green like regular actions
- **Stop action properties panel**: Stop nodes now show the correct type "Stop execution" in the panel with a dedicated stop message input and "Mark as error" toggle
- **Stop/Error in "Additional properties"**: `stop` and `error` were incorrectly shown in the additional properties panel — now correctly configured as handled properties
- **Top-level `variables:` round-trip** (C.A.F.E. #210): `variables:` section at the automation level was preserved during YAML export — previously these were removed on export
- **Version number in UI**: `manifest.json` version was never updated — all builds incorrectly showed "v0.9.2"

### Added
- i18n: `nodes:types.stop`, `nodes:actions.stopExecution`, `nodes:actions.stopError`, `nodes:actions.stopMessageLabel`, `nodes:actions.markAsError`, `nodes:actions.actionTypes.stop` (DE + EN)
- Test fixture `34-toplevel-variables.yaml` for variables round-trip
- Tests: `toplevel-variables-roundtrip.test.ts` (3 tests)

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

## [0.9.2] — 2026-06-12 — Lint & Code Quality

### Fixed
- Fixed all Biome lint errors and formatting issues (19 files auto-formatted)
- Added `type="button"` to collapse/expand buttons in `ConditionNode` (a11y)
- JSX literals correctly escaped in `App.tsx` and `ConditionNode.tsx`
- Fixed `noEmptyBlockStatements` in `App.tsx`
- Added `aria-hidden="true"` to decorative SVG in `LoopBackEdge` (a11y)
- Added `biome-ignore` comment for unavoidably complex graph traversal function in `native.ts`

---

## [0.9.1] — 2026-06-12 — Code Quality & HA Integration Cleanup

### Fixed
- `ConfigFlowResult` instead of deprecated `FlowResult` from `homeassistant.data_entry_flow` (deprecated since HA 2024.4)
- Minimum HA version in `manifest.json` and `hacs.json` corrected to `2024.6.0` (`StaticPathConfig` requires 2024.6)
- Removed unused `import os` and dead `PANEL_URL` constant from `panel.py`
- Removed empty `async_setup` function from `__init__.py` (not needed for config flow integrations)
- Replaced hacky preemptive panel removal via `hass.data` with clean lifecycle logic

---

## [0.9.0] — 2026-06-12 — OR/AND Condition Visualization & i18n

### Added
- **OR/AND/NOT container nodes**: Group conditions now show their nested sub-conditions directly as mini cards in the node — no click required to understand the logic
- **OR/AND separator**: Between sub-condition cards, the group type (OR/AND/NOT) is displayed as a visual separator
- **Collapse for many conditions**: With 4+ sub-conditions, a "+X more" button appears to toggle expansion

### Improved
- **Full i18n for all node cards**: All type labels in trigger, condition, action, delay, wait and setVariables nodes are now displayed dynamically according to the selected language (previously hardcoded English)
- Condition types: `State`, `Numeric state`, `OR (Any)`, `AND (All)` etc.
- Trigger platforms: `State change`, `Time`, `Event` etc.
- Fallback node titles: `Delay`, `Wait for`, `Set variables`, `Action`
- All node components now use the `useTranslation` hook instead of the i18next singleton

---

## [0.8.0] — 2026-06-11 — Screenshots & Documentation

### Added
- Light and dark mode screenshots added to README and `docs/images/`
- README: Side-by-side preview of both modes directly in the header

---

## [0.7.9] — 2026-06-11 — Choose Block Trigger Routing Fix

### Bug Fixes
- **Crossed lines in trigger-based choose blocks** — Automations with multiple triggers and trigger-ID conditions (e.g. iPad battery automation) showed crossed blue lines because all triggers were connected to the first case. Now each trigger is only connected to its matching case (via hint edge). Internal flow edges are invisible (`choose-entry` type).
- **Backward detection too sensitive** — Minor x-differences in saved metadata (e.g. 15 px) triggered unnecessary ELK recalculations; threshold increased to 100 px.

### Technical
- New edge type `choose-entry`: semantic, invisible connection Trigger→Case1 (required for topology/serializer)
- ELK layout now includes `hint` edges (for correct layer assignment in trigger-based choose blocks)
- `fixChooseChainLayout` restored as fallback for fresh layouts without metadata

---

## [0.7.8] — 2026-06-11 — Choose Block Visualization

### Bug Fixes
- **Choose block: cases not connected** — After the entry condition, all options of a `choose:` block appeared as separate trees; FLODE now shows a separate line from the common entry point for each option (like the HA editor)
- **Choose block: red dot on condition nodes** — Condition nodes of cases incorrectly showed the FALSE handle (red dot) because the internal `choose-chain` edge ran through the FALSE handle; now correctly hidden
- **Choose block: default option alone** — The default actions (`default:`) of a choose block appeared as a standalone, unconnected block; now directly connected to the entry point
- **Stale `_flode_metadata` positions** — Outdated saved positions that placed a choose case to the left of the previous one triggered a new ELK layout (backwards-choose-chain detection)
- **Bezier curves** — All connection lines between nodes are now rendered as smooth Bezier curves instead of with corners

### Technical
- New edge types: `choose-hint` (visible connection Entry→Case2+/Default), `choose-default` (semantic, invisible edge Last-Case→Default)
- ELK layout accounts for `choose-hint` for correct layer assignment of all cases
- Zod schema and graph validator extended for new edge types

---

## [0.7.7] — 2026-06-11 — Bugfixes & Repo Cleanup

### Bug Fixes
- **Import crash with `conditions: []`** — Choose cases with an empty conditions array (valid HA syntax for empty default branches) caused an `undefined is not an object` crash; filter now explicitly checks for non-empty arrays
- **Red dot on while condition** — FALSE handle on the condition node is now only shown when an edge is actually attached to it; the misleading red dot disappears for `repeat:while:`
- **Loop arrow visual improvement** — Back edges for `repeat:while/until/count` are now rendered as a dashed arrow (`loop-back` type) so the loop character is recognizable at a glance

### Repo Cleanup (no functional changes)
- All remaining `cafe_debug`, `cafe_hass_config`, `cafeLogger`, `CAFE_TOGGLE_SIDEBAR` references updated to FLODE branding
- Unguarded `console.log` calls removed from production code
- `manifest.json`: removed invalid `documentation_url` field, `iot_class` → `calculated`
- `hacs.json`: added `"domain": "flode"`
- Issue template, CONTRIBUTING.md, CLAUDE.md, DEBUG.md updated to FLODE
- Fake test file with hardcoded automation ID deleted
- HACS validation now runs automatically on push/PR
- `LICENSE`: copyright line added

---

## [0.7.6] — 2026-06-11 — Trigger Routing & Layout

### Added
- **Visual trigger routing lines for `choose:` blocks** — Each trigger is now visually connected to its corresponding condition, making the assignment recognizable at a glance
- **New edge type `hint`** — Purely visual connection (not deletable, ignored by the transpiler)
- **New edge type `choose-chain`** (invisible) — Technical edge for choose detection, not rendered

### Bug Fixes
- **`id:` field empty in properties panel** — HA API returns condition IDs as an array (`['battery_above_80']`); parser now normalizes directly on import to string (affects `choose:` and `if/then/else` blocks)
- **Edge `type` was discarded on import/export** — `flow-store` was not passing through the `type` field; fixed in `loadFlow` and `toFlowGraph`
- **Grey arrow overlap on nodes** — Custom SVG marker in HintEdge replaced with React Flow's built-in marker system
- **Topology analyzer ignores visual edges** — `hint` edges are now filtered from topology analysis and `findBackEdges`

### Improvements
- **Automatic layout (ELK)** — Hint edges are used for layer assignment, choose-chain edges excluded → clean 3-column layout (Triggers | Conditions | Actions)
- **`fitView` after import** — Delay increased from 50ms to 150ms, `maxZoom: 0.75` set for consistent centering after loading

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
