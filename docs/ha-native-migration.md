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
| Panel-Umbau Iframe → Shadow DOM | offen |
| Theming (HA-CSS-Variablen) | ✅ migriert (03.07.2026) |
| `haComponentLoader.ts` | offen |
| `HaElement.tsx` + Convenience-Wrapper | offen |
| `HaEntityPicker` | offen |
| `HaIconPicker` | offen |
| `HaSelector` (action) | offen |
| `HaSelector` (device/area) | offen |
| Attribut-Autocomplete | offen |
| Dialoge (`ha-dialog`) | offen (Phase 4, optional) |

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
