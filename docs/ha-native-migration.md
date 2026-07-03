# FLODE → native HA Web Components: Migrationsplan

Status: **Phase 0 + Phase 1 abgeschlossen**. Diese Datei wird in jeder Folgephase fortgeschrieben.

> **Hinweis 03.07.2026:** Der erste Anlauf von Phase 0/1 wurde versehentlich
> gegen einen 62 Commits veralteten lokalen Checkout gemacht (v0.7.9 statt
> tatsächlichem `origin/main`-Stand v1.1.0, inkl. Tailwind v3→v4-Migration).
> Nach `git reset --hard origin/main` wurden Audit und Theming-Implementierung
> gegen den echten aktuellen Code wiederholt. Der Architektur-Befund in
> Abschnitt 0 (Iframe-Blocker) blieb dabei gültig — `panel-wrapper.ts` und
> `main.tsx` waren zwischen beiden Ständen unverändert.

Ziel: FLODE (React, `panel_custom` in Home Assistant) soll sich nativ anfühlen —
(a) vollständiges Theming über HA-CSS-Variablen, (b) HAs eigene Web Components
(`ha-entity-picker`, `ha-selector`, ...) statt Eigenbau-Picker, wo sinnvoll.
Canvas (xyflow) bleibt unangetastet. YAML-Transpiler-Output bleibt identisch.

---

## 0. Architektur-Befund (blockierend für Phase 2) — Entscheidung getroffen

**Problem:** FLODE läuft aktuell in einem `<iframe>` (`panel-wrapper.ts` → lädt
`/flode-hass/index.html`, `hass` kommt per `window.parent.hass` +
`window.setHass`-Bridge in `main.tsx`). Iframes haben eine eigene
`customElements`-Registry und ein eigenes `window` — HAs native Web Components,
die im Eltern-Dokument (HA-Frontend) registriert sind, sind im Iframe schlicht
nicht verfügbar. `window.loadCardHelpers()` existiert dort nicht. Phase 2 (native
Picker) ist mit der aktuellen Architektur **nicht umsetzbar**.

**Historie:** Der Iframe wurde in Commit `afe62cb` ("refactor app panel to use
iframe", Anfang 2026) eingeführt, um eine CSS-Kollision zwischen Tailwinds
globalem Reset und HAs eigenem Frontend zu lösen. Der Vorgänger-Ansatz
(`CSSInjector.tsx`, `PortalContainer.tsx`, Commit `3588a18`) hatte **kein
echtes** `attachShadow()` verwendet, sondern nur einen Text-Hack
(`:root` → `:host` String-Replace via `dangerouslySetInnerHTML`) ohne echte
Kapselung — daher unzuverlässig und verworfen.

**Entscheidung (User, 03.07.2026): Shadow-DOM-Umbau.** Iframe wird entfernt,
`flode-panel` bekommt einen echten Shadow Root (`attachShadow({mode:'open'})`),
React wird direkt hineingemountet. `customElements`-Registry ist dokumentweit
geteilt → native HA-Komponenten funktionieren. CSS-Custom-Properties kaskadieren
automatisch durch die Shadow-Boundary (Bonus für Phase 1 Theming).

**Machbarkeit (bestätigt):**
- `custom_components/flode/panel.py` registriert nur `module_url` für die
  `flode-panel`-Custom-Element-Definition — DOM-Struktur-agnostisch, **kein
  Umbau in Python nötig**.
- Radix-Portale (`dialog.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `select.tsx`)
  haben bereits einen `container`-Prop, der bislang nirgends gesetzt wird
  (Default: `document.body`, würde die Shadow-Boundary durchbrechen). Muss an
  allen Call-Sites (Dialog: 6, Dropdown: 2, Popover: 2, Select: 14 Call-Sites)
  auf den Shadow Root gesetzt werden — Plumbing dafür (`PortalContainer.tsx`-
  Äquivalent) existierte schon einmal und wird sinngemäß wiederhergestellt.
- `index.css`-Block `@layer cafe-overrides` (Zeilen 7–56, `!important`-Hacks
  gegen HA-Styles, Selektor sogar noch auf altes `cafe-panel`-Element bezogen —
  bereits tot) entfällt komplett durch echte Shadow-DOM-Kapselung.
- React 18 (`createRoot`) ist mit Shadow-Root-Mounting grundsätzlich
  kompatibel (Event-Delegation seit React 17 am Root-Container, nicht mehr
  `document`).
- Vite-Build: `vite-plugin-css-injected-by-js` ist bereits als Dependency
  vorhanden, aber nicht in `vite.config.ts` eingebunden — wird für
  Shadow-DOM-taugliches CSS-Inlining reaktiviert. `main.tsx`s
  Iframe/Standalone-Verzweigung (`isInHaIframe`) wird durch direktes
  Property-Setting auf dem Custom Element ersetzt; `index.html`-Entry bleibt nur
  für Standalone-Dev-Vorschau.

**Offene Verifikation für Phase 2:** Ob HAs Picker-Elemente (selbst
Shadow-DOM-Custom-Elements) sauber *innerhalb* eines weiteren Shadow Roots
rendern (verschachtelte Shadow Roots), ist Web-Components-Standard und sollte
funktionieren, wird aber explizit in Phase 2 als erstes geprüft, bevor die
Wrapper-Schicht darauf aufbaut.

---

## 1. Picker-Inventar (Phase 3 Grundlage)

### Bereits vorhandene wiederverwendete Eigenbau-Selektoren

| Komponente | Datei | HA-Konzept | Genutzt von | Ziel-HA-Komponente |
|---|---|---|---|---|
| `EntitySelector` | `components/ui/EntitySelector.tsx` | entity_id (einzeln) | `ServiceDataFields.tsx`, `DynamicFieldRenderer.tsx` (entity/zone) | `ha-entity-picker` |
| `MultiEntitySelector` | `components/ui/MultiEntitySelector.tsx` | entity_id (mehrfach) | `ActionFields.tsx` (target), `ServiceDataFields.tsx`, `StateTriggerFields.tsx`, `DynamicFieldRenderer.tsx` | `ha-selector` (entity, multiple) |
| `Combobox` | `components/ui/Combobox.tsx` | generisch (Basis für EntitySelector + Service-Picker) | s.o. + `ActionFields.tsx` (Service) | — (Basis-Primitive, kein 1:1-Ersatz) |
| `DeviceSelector` | `components/ui/DeviceSelector.tsx` | device_id (einzeln) | `DeviceTriggerFields.tsx`, `DeviceConditionFields.tsx` | `ha-device-picker` |

### Bespoke/inline Inputs ohne wiederverwendbaren Selektor

| Ort | HA-Konzept | Aktueller Zustand | Ziel-HA-Komponente | Priorität |
|---|---|---|---|---|
| `ActionFields.tsx:178-208` | service/action | Inline `Combobox` + `getAllServices()` | `ha-selector` (action-Selector) | 1 (größter Gewinn) |
| `ActionFields.tsx:230-249` | device_id/area_id (target) | `IdList` — reines Freitext-Tag-Input, **keine Autocomplete** | `ha-selector` (device/area) bzw. `ha-device-picker`/`ha-area-picker` | 1 (reiner Gewinn, nichts zu erhalten) |
| `StateTriggerFields.tsx:102-179` | Attribut-/State-Wert | Bespoke `StateValueCombobox`, hardcoded `DOMAIN_STATES`-Map | `ha-selector` (falls State-Selector passt) oder Fallback | 3 |
| `DeviceConditionFields.tsx:34-53` | Device-Automation Domain/Type | Freitext `Input` | ggf. `ha-selector` (device-Capability, falls verfügbar) | 4 |
| `conditionFields.ts` / `DynamicFieldRenderer.tsx` (`case 'text'`) | Attributname (state/numeric_state) | Freitext `Input`, **keine Autocomplete echter Attributnamen** | `ha-selector` (attribute) | 3 |
| — (nirgends vorhanden) | Icon | Kein Picker existiert | `ha-icon-picker` | 2 |
| — (nirgends vorhanden) | Automation-Icon | Kein Feld in `AutomationSettingsPanel.tsx` | `ha-icon-picker` (neues Feld) | 5 (nice-to-have) |

### Registry-Datenfluss (wichtig für Wrapper-Schicht)

- `contexts/HassContext.tsx` liefert `hass` in zwei Modi: **Panel-Modus**
  (`externalHass` = echtes HA-`hass`-Objekt mit nativen `.states/.entities/
  .devices/.areas`) und **Remote-Modus** (eigener WebSocket, synthetisches
  `hass` **ohne** `.entities`/`.areas`).
- `HassContext` holt zusätzlich **redundant** `area_registry`/`device_registry`/
  `entity_registry` per eigenem WebSocket-Call in lokale `Map`s — unabhängig von
  `hass.entities`/`hass.areas`, die im Panel-Modus bereits vorhanden wären.
- **Zu klären in Phase 2:** `types/hass.ts` um `.entities`/`.areas` erweitern
  und im Panel-Modus direkt `externalHass.entities/.areas` durchreichen statt
  doppelt zu fetchen; im Remote-Modus die eigenen Registry-Maps als
  `.entities`/`.areas`-kompatible Struktur exponieren, damit `ha-entity-picker`
  in beiden Modi funktioniert.

---

## 2. Farb-Inventar → HA-Variablen-Mapping (Phase 1 Grundlage)

### Aktuelles Theming

- `index.css`: shadcn-Konvention, HSL-Tripel als CSS-Vars (`--background`,
  `--primary`, `--card`, `--destructive`, `--border`, `--radius`, ...) +
  FLODE-eigene `--trigger`/`--condition`/`--action` (definiert, aber **nicht
  genutzt** — Nodes greifen stattdessen auf rohe Tailwind-Farbklassen zurück).
- `tailwind.config.ts`: mappt shadcn-Vars, aber **keine** Zuordnung zu
  `--trigger`/`--condition`/`--action` oder zu HA-Variablen.
- HA-Theme-Sync: **nur** `hass.themes.darkMode` (Boolean) wird gelesen
  (`hooks/useDarkMode.ts` → `App.tsx` togglet `document.body.classList('dark')`).
  Die eigentlichen HA-Theme-Farben (`--primary-color` etc.) werden **nicht**
  gelesen oder gespiegelt — das ist in Phase 1 nachzuholen.

### Ziel-Mapping

| FLODE/shadcn-Variable | HA-Variable (mit Fallback) |
|---|---|
| `--background`, `--card` | `var(--card-background-color, ...)`, `var(--primary-background-color, ...)` |
| `--foreground` | `var(--primary-text-color, ...)` |
| Sekundärtext | `var(--secondary-text-color, ...)` |
| Deaktiviert | `var(--disabled-text-color, ...)` |
| `--primary` | `var(--primary-color, #03a9f4)` |
| `--accent` | `var(--accent-color, ...)` |
| `--border` | `var(--divider-color, ...)` |
| `--radius` | `var(--ha-card-border-radius, ...)` |
| `--destructive` | `var(--error-color, ...)` |
| Warnung (YamlEditor gelb) | `var(--warning-color, ...)` |
| Erfolg (YamlPreview grün) | `var(--success-color, ...)` |
| Transparenzen | `rgba(var(--rgb-primary-color), 0.12)` etc. |

### Hardcodierte Farben — nach Kategorie (Fundstellen, nicht erschöpfend)

1. **Node-Typ-Farben** (`components/nodes/*.tsx`, 6 Dateien, ~126 Stellen):
   Trigger=amber, Condition=blue, Action=green, Delay=purple, Wait=orange,
   SetVariables=cyan — jeweils eigene Tailwind-Klassen statt der bereits
   existierenden `--trigger`/`--condition`/`--action`-Vars. **Zusätzlich**
   dupliziert `NodePalette.tsx` (Zeilen 21–69) dieselbe Farbzuordnung ein
   zweites Mal als eigene Quelle der Wahrheit → in Phase 1 zusammenführen.
   → Ziel: `--flode-node-trigger` etc., abgeleitet von HA-Variablen, aber
   themebar.
2. **Edge-Farben** (`components/edges/*.tsx`, 2 Dateien, 7 Hex-Literale):
   `LoopBackEdge.tsx`, `DeletableEdge.tsx` — manuell JS-verzweigte Hex-Werte
   (`#94a3b8`/`#64748b`/`#3b82f6`) statt CSS-Vars.
3. **Generische UI** (`components/ui/*.tsx`, ~139 Stellen, Schwerpunkt
   `EntitySelector.tsx` Domain-Icon-Farben): eigene Light/Dark-Klassenpaare
   statt `dark:`-Variante oder CSS-Vars.
4. **Panels** (~37 Stellen): `NodePalette.tsx` (s.o.), `YamlEditor.tsx`/
   `YamlPreview.tsx` Status-Farben (error/warning/success), jeweils mit
   inkonsistenten Farbtönen (z. B. `red-500` in Nodes vs. `red-600` in
   YamlEditor) — in Phase 1 auf `--error-color`/`--warning-color`/
   `--success-color` vereinheitlichen.
5. Sonstiges: `index.css:174,178` `rgba(255,193,7,...)` im `save-pulse`-Keyframe.

### Dark-Mode-Mechanik

`darkMode: ['class']` (Tailwind), Toggle-Punkt `App.tsx` via
`document.body.classList.toggle('dark', isDark)`. `FlowCanvas.tsx` übergibt
zusätzlich `colorMode` direkt an xyflow. Wird durch Shadow-DOM-Umbau nicht
beeinträchtigt, muss aber ggf. auf `shadowRoot.host.classList` umgestellt
werden (Phase 1, in Koordination mit dem Shadow-DOM-Umbau aus Phase 2).

---

## 3. Status-Tracking (wird pro Phase fortgeschrieben)

| Bereich | Status |
|---|---|
| Architektur-Entscheidung (Shadow DOM) | ✅ entschieden (03.07.2026) |
| Panel-Umbau Iframe → Shadow DOM | ✅ umgesetzt + im Browser verifiziert (03.07.2026) |
| Theming (HA-CSS-Variablen) | ✅ migriert (03.07.2026) |
| `haComponentLoader.ts` | ✅ fertig (03.07.2026) |
| `HaElement.tsx` + Convenience-Wrapper | ✅ fertig (03.07.2026) |
| `HaEntityPicker` | ✅ fertig, im Browser verifiziert (Autocomplete/Icons/Friendly Names) |
| `HaIconPicker` | Wrapper fertig, kein Einsatzort — FLODE hat kein `icon`-Feld im Schema, Neuanlage wäre Scope-Erweiterung (nicht umgesetzt) |
| `HaServicePicker` (neu, `ha-service-picker`) | ✅ fertig, im Browser verifiziert — ersetzt Service-Combobox in `ActionFields.tsx` |
| `HaSelector` (entity/device/area) | ✅ fertig, im Browser verifiziert — Trigger/Condition/Action-Entity-Felder, Device-Trigger/-Condition, Action-Targets |
| `HaSelector` (state/attribute) | ✅ fertig, im Browser verifiziert — "Zu/Von Zustand" (Trigger), "Zustand"/"Attribut" (Condition) |
| `HaSelector` (action) | **bewusst nicht verwendet** — recherchiert und verworfen, siehe Phase-3-Ergebnis |
| Attribut-Autocomplete | ✅ fertig für State-Condition; `numeric_state`-Attribut (via `DynamicFieldRenderer`) bleibt Freitext (kein `entity_id`-Kontext dort verfügbar, nicht umgesetzt) |
| `HaSwitch` (neu, `ha-switch`) | ✅ fertig, im Browser verifiziert — alle 9 Toggle-Stellen app-weit migriert |
| `HaSelect` (neu, `ha-select`) | ✅ fertig, im Browser verifiziert — 10 Stellen (Modus, Aktionstyp, Bedingungstyp, Trigger-Plattform, Device-Trigger-Typ, Wait-Typ, Property-Typ u. a.) |
| `HaSelector` (text/number/template/object/date/time/duration/select-multiple) | ✅ fertig, im Browser verifiziert — deckt praktisch den kompletten `DynamicFieldRenderer` ab, plus Delay/Wait-Timeout/Set-Variables |
| Ecken-Radius (HA-Design-Tokens) | ✅ fertig, im HA-Quellcode verifizierte Werte (`core.globals.ts`) — Buttons=Pill, Dialoge=24px, Karten/Inputs=4–16px-Skala |
| **Kritischer Fix: `:root` matcht nichts im Shadow DOM** | ✅ behoben (03.07.2026) — siehe Abschnitt 7 |
| Dialoge (`ha-dialog`) | offen (Phase 4, optional) |
| Textfelder/Select (`ha-textfield`/`ha-select`) | offen (Phase 4, optional) |

## 4. Phase 1 — Ergebnis (03.07.2026)

- **`lib/color.ts`**: Canvas-basierter Farb-Normalizer, wandelt beliebige CSS-Farbwerte
  (hex/rgb/hsl/named) in das "H S% L%"-Triplet-Format um, das Tailwinds
  `hsl(var(--x))`-Konvention und die Opacity-Modifier-Syntax (`bg-primary/20`)
  benötigen.
- **`lib/ha-theme.ts`**: `applyHaTheme(target, hass)` — mappt `hass.themes`
  (aktives Custom-Theme inkl. `modes.light`/`modes.dark`, sonst HA-Default-
  Fallback-Konstanten) auf unsere lokalen CSS-Variablen. Wird bei jedem
  `hass`-Update aufgerufen (`hooks/useHaThemeSync.ts`, in `App.tsx` verdrahtet),
  da CSS-Variablen den Iframe nicht automatisch überqueren (siehe Abschnitt 0).
  **Nach dem Shadow-DOM-Umbau (Phase 2) bleibt dieser Mechanismus als
  Sicherheitsnetz bestehen**, wird dann aber ggf. redundant zur nativen
  CSS-Vererbung durch die Shadow-Boundary.
- **`types/hass.ts`**: `HomeAssistant['themes']` von `{darkMode: boolean}` auf
  eine vollständige `HassThemes`-Typisierung erweitert (`themes`, `theme`,
  `modes.light`/`modes.dark`).
- **Neue Tokens**: `--warning`/`--success`/`--info` (+ Foreground-Pendants) und
  FLODE-eigene Node-Typ-Variablen `--delay`/`--wait`/`--variables` (kein
  HA-Äquivalent, feste Werte) ergänzen die bereits vorhandenen, jetzt aber
  tatsächlich genutzten `--trigger`/`--condition`/`--action`.
- **`lib/node-colors.ts`**: Einzige Quelle der Wahrheit für Node-Typ-Styling,
  ersetzt die bisher doppelte Farbdefinition (Node-Komponenten UND
  `NodePalette.tsx` hatten unabhängige Tailwind-Klassen-Listen).
- **Migriert**: alle 6 Node-Komponenten, `NodePalette.tsx`, `LoopBackEdge.tsx` +
  `DeletableEdge.tsx` (Hex-Literale → `hsl(var(--x))`, `isDarkMode`-Branching
  dadurch teils überflüssig und entfernt), `YamlEditor.tsx`, `YamlPreview.tsx`,
  `DeviceSelector.tsx`, `EntitySelector.tsx` (Unknown-Flag), `index.css`
  (`save-pulse`-Keyframe, `.node-active`).
- **Bewusst nicht migriert**: `EntitySelector.tsx`s Domain-Icon-Farbmap (Zeilen
  ~34–45, z. B. `light`→rot, `climate`→cyan) — das ist Domain-spezifisches
  Branding ohne HA-Variable-Äquivalent, kein Theme-Bezug. `dialog.tsx`s
  `bg-black/80`-Overlay — universeller Scrim, keine Theme-Farbe.
- **Totes CSS entfernt**: `@layer cafe-overrides`-Block in `index.css`
  (referenzierte das längst umbenannte `cafe-panel`-Element, war bereits vor
  dieser Änderung wirkungslos).
- **Verifikation**: `yarn typecheck` und `yarn lint:biome` grün (keine neuen
  Lint-Findings ggü. Baseline). Build erfolgreich, neue CSS-Variablen im
  ausgelieferten Bundle bestätigt (`curl` gegen `ha-test`). **Nicht
  browser-visuell verifiziert** (kein Browser-Automatisierungs-Tool verfügbar) —
  manueller Check von Nutzer empfohlen: FLODE-Panel öffnen, HA-Theme
  hell/dunkel umschalten, Node-Farben/Hintergrund/Status-Farben beobachten.

**Nachtrag nach Reset auf `origin/main` (v1.1.0):**
- Tailwind wurde dort bereits von v3 auf **v4** migriert; `tailwind.config.ts`
  existiert nicht mehr, Farb-Tokens werden per `@theme inline { --color-x:
  hsl(var(--x)); }` direkt in `index.css` definiert. Alle neuen Tokens wurden
  dort statt in einer (nicht mehr existenten) Config-Datei ergänzt.
  `!important`-Syntax ist in v4 `klasse!` (Suffix) statt `!klasse` (Präfix) —
  `lib/node-colors.ts`s `handle`-Klassen wurden entsprechend angepasst.
- `ActionNode.tsx` hat inzwischen 3 Varianten (normal/Stop/Repeat) und
  `ConditionNode.tsx` verschachtelte Sub-Bedingungen (Choose/If-Else/And/Or/Not)
  bekommen — beide sauber mit den bestehenden Tokens abgedeckt (Stop→`wait`,
  Repeat→`delay`, Sub-Conditions→`condition`-Varianten mit Opacity-Modifiern).
  `NodePalette.tsx`s neue `compoundTypes`-Liste (Choose/If-Else/Repeat-While/
  Repeat-Count/Parallel) nutzt dieselben Tokens (`condition`/`delay`/`action`).
- Neue `ChooseDefaultEdge.tsx` (4 Hex-Literale für Linie/Label) ebenfalls auf
  `hsl(var(--muted))`/`hsl(var(--muted-foreground))`/`hsl(var(--border))`
  migriert, `isDarkMode`-Branching entfernt.

## 5. Phase 2 — Ergebnis (03.07.2026)

**Panel-Umbau (Iframe → Shadow DOM):**
- `panel-wrapper.ts`: kein `<iframe>` mehr, stattdessen `attachShadow({mode:'open'})`
  auf dem `flode-panel`-Custom-Element. Kompiliertes CSS wird per
  `import cssText from './index.css?inline'` (Vite-Bordmittel) als `<style>`
  direkt in den Shadow Root injiziert.
- **`app-mount.tsx`** (neu): geteilte Mount-Logik, von `panel-wrapper.ts`
  (Panel-Modus, echtes `hass`) UND `main.tsx` (Standalone-Dev, Remote-Modus)
  genutzt — beide rendern exakt denselben Baum in einen Container, der immer
  als "App-Root" fungiert (siehe unten). `main.tsx` ist dadurch auf ~10 Zeilen
  geschrumpft, die komplette `isInHaIframe()`/`window.setHass`-Bridge-Logik
  ist weg.
- **`contexts/AppRootContext.tsx`** (neu): stellt das Mount-Element bereit,
  dient als (a) Ziel für `useHaThemeSync`/`.dark`-Klasse (ersetzt
  `document.documentElement`/`document.body`, die im Panel-Modus jetzt HAs
  eigenes, geteiltes `<html>`/`<body>` wären — dürfen nicht mutiert werden),
  (b) Default-Portal-Container für Radix-Overlays.
- **Radix-Portale**: `dialog.tsx`/`dropdown-menu.tsx`/`popover.tsx`/`select.tsx`
  nutzen jetzt `usePortalContainer()` als Default für ihren bereits
  vorhandenen `container`-Prop (vorher: nirgends gesetzt → Radix' Default
  `document.body`, hätte die Shadow-Boundary durchbrochen). Betrifft
  transitiv auch `Combobox.tsx` (nutzt `PopoverContent` intern) und damit
  `EntitySelector`/Service-Picker in `ActionFields.tsx` — kein Einzel-Umbau
  an den ~24 Call-Sites nötig.
- **`App.tsx`**: `window.parent.postMessage(...)` für den Sidebar-Toggle
  ersetzt durch ein direktes `CustomEvent('hass-toggle-menu', {bubbles:true,
  composed:true})` auf dem App-Root-Element — `composed:true` lässt es die
  Shadow-Boundary automatisch überqueren, HAs eigener Listener fängt es wie
  bei jeder anderen Karte/jedem Panel. `window.parent ?? window`-Fallbacks
  (Resize-Listener, `history.back()`) entfernt, da es ohne Iframe keine
  Fenster-Grenze mehr gibt.
- **`types/global.d.ts`**: `window.hass`/`window.setHass` entfernt (obsolet).
- **Verifiziert im Browser** (Nutzer, 03.07.2026): Panel rendert korrekt
  gestylt, Dialoge/Dropdowns/Selects rendern sauber an der richtigen Stelle,
  Sidebar-Toggle funktioniert, Theme-Wechsel funktioniert weiterhin. Ein
  initialer Fehlalarm (Standalone-Verbindungsdialog erschien) stellte sich
  als Browser-Cache heraus (alter Bundle vor dem Neu-Deploy), nicht als Bug.

**Wrapper-Infrastruktur (`src/ha/`):**
- `haComponentLoader.ts`: `ensureHaComponents(names)` — Cache + In-Flight-
  Dedupe pro Komponentenname, `window.loadCardHelpers()` + Config-Element
  einer Probe-Card (`entities` für Picker, `button` für Icon/Selector) zum
  Erzwingen der Registrierung, `customElements.whenDefined()` mit 3s-Timeout,
  löst nie ab (immer `Promise<boolean>`, nie reject) — Aufrufer fallen bei
  `false` auf Eigenbau-Komponenten zurück.
- `HaElement.tsx`: generischer Wrapper — setzt `properties` (inkl. `hass`
  aus Context) als echte JS-Properties bei jedem Render neu, verdrahtet
  `events` (`value-changed` u. a.) per `addEventListener`/Cleanup.
- `HaEntityPicker`, `HaIconPicker`, `HaSelector` (generisch, deckt
  Entity/Device/Area/Action/Number/Boolean/Select-Selectors über den
  `selector`-Prop ab): jeweils mit `fallback`-Prop, Default `null`.
- `useHaComponentsAvailable(names)`: kapselt `ensureHaComponents` als Hook,
  von jedem Wrapper genutzt, um zwischen nativer Komponente und `fallback`
  zu entscheiden.
- **Demo/Akzeptanztest**: `AutomationSettingsPanel.tsx`, Abschnitt "Native
  HA-Komponenten" — `HaEntityPicker` mit `EntitySelector` (Eigenbau) als
  Fallback, plus Live-Status-Text. Im Browser verifiziert: im Panel-Modus
  erscheint der native Picker mit funktionierendem Autocomplete/Icons/
  Friendly Names.
- **Noch offen**: `HaIconPicker`/`HaSelector` sind fertig, aber noch in
  keinem echten Formularfeld verbaut (folgt in Phase 3 bei der eigentlichen
  Picker-Migration). Standalone-Dev-Fallback (kein Browser, daher nicht
  browser-visuell geprüft) — Build/Typecheck bestätigen nur, dass der Code
  korrekt kompiliert, nicht, dass die Konsole im Standalone-Modus fehlerfrei
  bleibt.
- **Fehlerbehandlung**: bewusst noch ohne Error Boundary um die Wrapper —
  das ist explizit Phase 5 ("Error Boundary um jeden HA-Wrapper").

## 6. Phase 3 — Ergebnis (03.07.2026)

**Wichtiger Zwischenfund — `ha-selector`'s `action`-Selector ist NICHT das,
was man für eine Service-Auswahl erwartet:** Im Quellcode von
home-assistant/frontend nachgeschlagen (`src/data/selector.ts`): der
`action`-Selector bildet eine ganze **Aktions-Sequenz** ab (Liste von
Action-Configs, wie in Blueprint-Inputs), nicht einen einzelnen
`domain.service`-String. Für "welchen Service ruft dieser Node auf" gibt es
stattdessen die eigenständige Komponente **`ha-service-picker`**
(`value: string`, Format `"domain.service"`, `value-changed` mit
`ev.detail.value`) — dafür wurde ein neuer Wrapper `HaServicePicker`
ergänzt. Registrierung läuft über dieselbe `button`-Card-Probe wie
`ha-selector`, da `hui-button-card-editor` transitiv `hui-action-editor` →
`ha-service-control` → `ha-service-picker` importiert (verifiziert per
`gh search code` gegen home-assistant/frontend).

**Weiterer Fund während der Nutzer-Verifikation:** HA hat native `state`-
und `attribute`-Selektoren (`selector: { state: { entity_id, attribute? } }`,
`selector: { attribute: { entity_id } }`), die Zustands- bzw.
Attributvorschläge für eine gegebene Entität liefern — deckt genau das ab,
was ursprünglich als "Attribut-Autocomplete, keine native Komponente
gefunden" auf offen gesetzt war. Nachträglich ergänzt in
`StateTriggerFields.tsx` (Zu/Von-Zustand) und `StateConditionFields.tsx`
(Zustand + Attribut).

**Migriert (alle mit Fallback auf die bisherige Eigenbau-Komponente,
im Browser vom Nutzer verifiziert):**
- `DynamicFieldRenderer.tsx`: `entity`- und `zone`-Fälle (einzeln + mehrfach)
  → `HaEntityPicker`/`HaSelector`
- `ActionFields.tsx`: Service-Auswahl → `HaServicePicker`; Target-Entities/
  -Devices/-Areas → `HaSelector`
- `StateTriggerFields.tsx`, `StateConditionFields.tsx`: Entity-Feld, Zu/Von-
  Zustand bzw. Zustand+Attribut → `HaSelector`
- `DeviceTriggerFields.tsx`, `DeviceConditionFields.tsx`: Device-Auswahl
  → `HaSelector`
- `ServiceDataFields.tsx`: dynamische `entity`-Service-Parameter (einzeln +
  mehrfach) → `HaSelector`/`HaEntityPicker`

**Bewusst nicht migriert:**
- **Icon-Picker**: kein `icon`-Feld im Datenmodell — Neuanlage wäre eine
  Schema-/Transpiler-Änderung, außerhalb des Scopes "bestehende Picker
  migrieren".
- **`numeric_state`-Condition-Attribut** (`DynamicFieldRenderer.tsx`, Case
  `'text'`): bleibt Freitext. `DynamicFieldRenderer` kennt nur den Wert des
  eigenen Feldes, nicht das `entity_id` des Geschwister-Feldes, das der
  `attribute`-Selector zum Scoping bräuchte — eine saubere Lösung würde
  `DynamicFieldRenderer`s Prop-Schnittstelle erweitern; zurückgestellt.
- **`ServiceDataFields.tsx`s andere Typen** (number/select/boolean): HA
  liefert für jedes Service-Feld bereits ein echtes `field.selector`-Objekt
  aus der Registry — das ließe sich pauschal 1:1 an `HaSelector` durchreichen
  statt die Typen einzeln von Hand zu behandeln. Größerer, sauberer Schnitt
  als das aktuelle Scope (nur Entity-Picker), daher nicht in dieser Phase
  gemacht — guter Kandidat für einen späteren Aufräum-Pass.

**Verifikation:** `yarn typecheck`/`yarn lint:biome` durchgehend auf
Baseline (4 Errors/25 Warnings, keine neuen), `yarn workspace @flode/frontend
test --run` durchgehend 74/74 grün (Transpiler-Roundtrip-Tests unverändert
bestanden — bestätigt, dass die Picker-Migration den Datenfluss/
Store-Contract nicht verändert hat, nur die Eingabe-UI). Build + Deploy nach
jedem Schritt, alle Schritte vom Nutzer im Browser gegengecheckt (inkl.
False-Positive-Analyse: orange Hover-Färbung auf Buttons ist HAs echte
`accent-color`, kein CSS-Leck).

## 7. Phase 4 — Ergebnis (03.07.2026)

**`HaSwitch`** (neu, `ha-switch`): eigenes Event-Muster (`change`-Event statt
`value-changed`, `checked`-Property statt `detail.value`) — dokumentiert in
`HaSwitch.tsx`. Alle 9 Toggle-Stellen app-weit migriert (Node
aktiviert/deaktiviert, Response-Variable, Dauer-Modus, boolesche
Property-/Service-Data-Felder, Stop-Action-Fehlerflag,
Automation-Import-Aktiviert-Toggle).

**`HaSelect`** (neu, `ha-select`): `selected`-Event (nicht `value-changed`),
nimmt ein `options`-Array direkt als Property. 10 Stellen migriert (Modus,
Aktionstyp, Bedingungstyp, Trigger-Plattform, Device-Trigger-Typ,
Wait-Typ+Trigger-Plattform, Property-Typ, Bedingungsgruppen-Typ,
Service-Data-Select-Feld über `HaSelector` statt `HaSelect`, da dort bereits
ein echtes HA-`selector`-Objekt vorliegt).

**Wichtiger Fund — `ha-selector` deckt fast alles über den `button`-Card-Probe
ab, kein `ha-textfield`:** Im HA-Quellcode nachgeschlagen (`src/data/selector.ts`):
`ha-textfield` existiert in aktuellen HA-Versionen nicht mehr als eigenständige
Komponente (nur `ha-textarea`, aber ohne verlässlichen Lovelace-Lade-Pfad).
Stattdessen deckt `ha-selector` über die Selector-Typen `text`, `number`,
`template`, `object`, `date`, `time`, `duration` praktisch alle verbleibenden
Feldtypen ab — da `ha-selector` seine Untertypen selbst dynamisch nachlädt,
reicht die bereits vorhandene Registrierung (`button`-Card-Probe), keine
weiteren Einträge in der Probe-Tabelle nötig. Migriert in
`DynamicFieldRenderer.tsx` (text einzeln/mehrfach, number, template, object,
date, time, select-mehrfach), `DurationField.tsx` (Dauer-Objektmodus),
`WaitFields.tsx` (wait_template), `SetVariablesFields.tsx` (Name+Wert).

**Ecken-Radius:** Im HA-Quellcode verifizierte Design-Tokens
(`core.globals.ts`, `--ha-border-radius-*`) statt geschätzter Werte:
Buttons/`ha-button` → Pill-Form (verifiziert), Dialoge/`ha-dialog` → 24px
(verifiziert), Karten/Inputs/Dropdowns → 4–16px-Skala. Umgesetzt in
`index.css` (neue `--ha-radius-*`-Variablen) und den zentralen Primitives
(`button.tsx`, `dialog.tsx`).

**Kritischer Bugfix — zwei verschachtelte Probleme, beide vom Nutzer im
Browser gefunden:**
1. *Native Zeit-Eingabe ließ sich nicht antippen:* `HaElement.tsx` setzte bei
   jedem React-Render ALLE Properties neu, auch Objekte/Arrays aus frischen
   Inline-Literalen (`selector={{time: {...}}}`). Lit-Komponenten wie
   `ha-selector` erkennen Referenzänderungen als "Property geändert" und
   bauen ihre interne Unterkomponente komplett neu auf — bei jedem
   Tastendruck-bedingten Re-Render, was Nutzereingaben in mehrteiligen
   Feldern (Stunde/Minute) sofort wieder verwarf. **Fix:** `HaElement.tsx`
   vergleicht jetzt Property-Werte inhaltlich (JSON-Vergleich für
   Objekte/Arrays) gegen den zuletzt tatsächlich gesetzten Wert und schreibt
   nur bei echten Änderungen — betraf potenziell alle Wrapper, nicht nur
   Zeit, war dort durch die mehrteilige Tastatureingabe nur am sichtbarsten.
2. *Verzögerung/Warten/Variablen-Einträge im Node-Palette-Sidebar waren
   weiß/unsichtbar:* `:root { --delay: ...; }` in `index.css` matcht seit dem
   Shadow-DOM-Umbau (Phase 2) **nichts mehr** — `:root` trifft laut
   CSS-Spezifikation ausschließlich das echte `<html>`-Element, niemals ein
   Element innerhalb eines Shadow Roots. Farben, die zusätzlich per
   `lib/ha-theme.ts` als Inline-Style auf ein echtes Element im Shadow-Baum
   geschrieben werden (background/foreground/primary/trigger/condition/
   action/…), funktionierten dadurch "zufällig" weiter; alle nicht
   HA-synchronisierten, rein statischen Variablen (`--delay`/`--wait`/
   `--variables`, auch die neuen `--ha-radius-*`) waren seit Phase 2 witzlos
   und fielen auf ungültige/leere CSS-Werte zurück. **Fix:** `:root` →
   `:root, :host` in `index.css` — `:host` matcht das `flode-panel`-Element,
   wenn das Stylesheet im Shadow Root läuft; `:root` bleibt für den
   Standalone-Dev-Modus (kein Shadow Root) zuständig. Browser bzw. CSS-Parser
   ignorieren nicht-treffende Teile einer Selektor-Liste automatisch, daher
   funktioniert dieselbe Regel in beiden Kontexten.

**String/Objekt-Toggle bei Dauer-Feldern entfernt:** Nutzer-Nachfrage, warum
der Switch überhaupt nötig ist. HA erlaubt in YAML sowohl
`delay: "00:00:05"` als auch `delay: {hours: 0, minutes: 0, seconds: 5}` —
beide Formate sind für HA gleichwertig, aber nur die Objekt-Form hat einen
nativen Picker. `DurationInput` parst bestehende String-Werte beim Laden
automatisch ins Objekt, schreibt aber ab jetzt immer die Objekt-Form —
Switch/Zeichenketten-Eingabe komplett entfernt, vereinfacht sowohl UI als
auch Code.

**Test-Themes:** Zwei HA-Themes mit deutlich anderen Farben installiert
(`ha-test/config/themes/graphite_purple.yaml`,
`ha-test/config/themes/sunset_forest.yaml`, beide mit `modes.light`/
`modes.dark`) — zum Gegenchecken, dass FLODEs Theme-Sync auch mit
Nutzer-Themes (nicht nur HAs Default) korrekt funktioniert.

**`ha-dialog` geprüft und bewusst nicht migriert:** Quellcode nachgeschlagen
(`src/components/ha-dialog.ts`) — nutzt intern `wa-dialog` aus der separaten
`@home-assistant/webawesome`-Bibliothek, Komposition über benannte Slots
(`header`/`headerTitle`/`footer`/…) statt einfacher Kinder, eigene Events
(`opened`/`closed`/`after-show`, kein einheitliches `onOpenChange`). Zusätzlich
kein Lade-Pfad über `loadCardHelpers()` gefunden — Dialoge werden von keinem
Lovelace-Karten-Editor importiert (anders als `ha-selector`/`ha-switch`/
`ha-select`). FLODEs eigener Radix-Dialog bleibt, ist bereits auf HAs echten
Eckenradius gestylt (Phase 4, Abschnitt 7).

**Zwei weitere Select-Stellen migriert:** Simulator-Bedingungs-Override
(dabei in eine eigene `ConditionOverrideSelect`-Komponente ausgelagert, um
eine versehentliche IIFE zu vermeiden — laut `CLAUDE.md` in diesem Repo
verboten), YAML-Export-Strategie. **Bewusst nicht migriert:**
`AutomationTraceViewer.tsx`s Trace-Auswahl — Optionen zeigen Icon +
Zeitstempel + farbiges Status-Badge, `ha-select` kann nur Klartext-Labels
(+ optionale Sekundärzeile), eine Migration würde die Statusfarbe verlieren.
`DeviceSelector.tsx` bleibt unverändert (ist bereits nur noch
`HaSelector`-Fallback, sich selbst darin nativ zu machen wäre zirkulär).

**Noch offen:** `ha-dialog` (siehe oben), `numeric_state`-Attribut
(Freitext, siehe Phase 3), Icon-Picker (kein Schema-Feld).

## 8. Phase 5 — Ergebnis (03.07.2026)

**Fehlerbehandlung:** `HaElement.tsx` fängt jetzt Fehler beim Setzen von
Properties per `try/catch` ab (kein React-`ErrorBoundary`, da der Fehler in
einem `useEffect` auftritt — Error Boundaries fangen das nicht) und rendert
bei einem Fehler dauerhaft den `fallback` der jeweiligen typisierten
Komponente. Alle sechs Wrapper (`HaEntityPicker`, `HaIconPicker`,
`HaSelector`, `HaServicePicker`, `HaSelect`, `HaSwitch`) reichen ihren
`fallback` jetzt sowohl für "nicht verfügbar" (Ladefehler,
`useHaComponentsAvailable`) als auch für "zur Laufzeit kaputtgegangen"
(neuer Mechanismus) an `HaElement` durch.

**Einmalige UI-Notice:** `src/ha/haAvailabilityNotice.ts` — zeigt beim
ersten Lade- oder Laufzeitfehler einen dezenten Sonner-Toast ("Native
HA-Komponenten nicht verfügbar"), danach nur noch Logging (`logger.warn`,
selbst hinter FLODEs Debug-Flag). Fehlendes `window.loadCardHelpers`
(Standalone-Dev-Modus, erwartet) löst bewusst **keine** Notice aus — nur ein
Fehlschlag, obwohl wir nachweislich in HA laufen, gilt als echtes Problem.

**Versions-Guard:** `App.tsx` loggt einmalig `hass.config.version` beim
ersten Empfang eines echten `hass`-Objekts (`logger.info`, per Ref-Flag
entprellt gegen die häufigen `hass`-Objekt-Neuerstellungen).

**Doku:** README um Abschnitt "Native Home Assistant UI" ergänzt (Nutzer-
perspektive: was ist nativ, was passiert beim Fallback, Link hierher).
CHANGELOG.md bewusst nicht von Hand ergänzt — wird laut Repo-Konvention erst
beim tatsächlichen Release aus der Commit-Historie generiert; die Commit-
Messages dieser fünf Phasen sind dafür bereits ausführlich genug.

### Manuelle Test-Checkliste (vor einem Release durchzugehen)

- [ ] **Hell/Dunkel:** HA-Theme in den Nutzereinstellungen zwischen hell und
      dunkel umschalten, FLODE-Panel beobachten (kein Reload nötig)
- [ ] **Custom Theme:** Eines der Test-Themes
      (`ha-test/config/themes/graphite_purple.yaml` oder
      `sunset_forest.yaml`, oder ein eigenes) aktivieren, Farben in FLODE
      gegenchecken (Primär-/Akzentfarbe, Node-Farben, Status-Farben)
- [ ] **Entity-Picker mit vielen Entities (Performance):** In einer
      HA-Instanz mit >500 Entities einen Trigger-/Action-Node öffnen,
      Entity-Feld antippen — Tippgeschwindigkeit/Scroll-Performance der
      nativen Dropdown-Liste prüfen
- [ ] **Standalone-Dev-Modus:** `yarn dev` außerhalb von HA starten,
      Browser-Konsole auf Fehler prüfen — alle Felder sollten sauber auf
      FLODEs Eigenbau-Fallback zurückfallen, keine Crashes
- [ ] **Mobile (Companion App):** Panel in der HA-Companion-App öffnen,
      native Picker/Dialoge/Toggles auf Touch-Bedienbarkeit prüfen
      (insbesondere Zeit-/Dauer-Eingabe, Mehrfachauswahl)
- [ ] **YAML-Snapshot-Tests grün:** `yarn workspace @flode/frontend test
      --run` — insbesondere die Transpiler-Roundtrip-Fixtures
      (`lib/__tests__/roundtrip-integration.test.ts`) müssen unverändert
      bestehen bleiben
