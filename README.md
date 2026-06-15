<div align="center">
  <img src="custom_components/flode/brand/icon.png" width="100" alt="FLODE Logo" />

  <h1>FLODE</h1>

  <p><strong>Visueller Flow + Node Editor für Home Assistant</strong></p>

  [![Release](https://img.shields.io/github/v/release/SH1FT-W/flode?style=flat-square&color=2F81F7&label=version)](https://github.com/SH1FT-W/flode/releases/latest)
  [![HA Version](https://img.shields.io/badge/HA-2024.1%2B-brightgreen?style=flat-square)](https://www.home-assistant.io)
  [![Lizenz](https://img.shields.io/badge/lizenz-Apache%202.0-orange?style=flat-square)](LICENSE)
  [![Status](https://img.shields.io/badge/status-beta-yellow?style=flat-square)](https://github.com/SH1FT-W/flode/releases)
  [![Tests](https://img.shields.io/badge/tests-278%20passing-3FB950?style=flat-square)](https://github.com/SH1FT-W/flode/actions)
  [![HACS](https://img.shields.io/badge/HACS-custom-blueviolet?style=flat-square)](https://hacs.xyz)

  <br/>

  **[🌐 Website](https://sh1ft-w.github.io/flode)** &nbsp;·&nbsp; [Installation](#installation) &nbsp;·&nbsp; [Changelog](CHANGELOG.md) &nbsp;·&nbsp; [Issues](https://github.com/SH1FT-W/flode/issues)

  <br/>

  | Light Mode | Dark Mode |
  |:---:|:---:|
  | ![FLODE Light Mode](docs/images/flode-light.png) | ![FLODE Dark Mode](docs/images/flode-dark.png) |

</div>

---

> **Fork-Hinweis:** FLODE basiert auf [C.A.F.E.](https://github.com/FezVrasta/cafe-hass) von [@FezVrasta](https://github.com/FezVrasta) — mit zahlreichen Bugfixes, neuen Features und vollständiger Umbenennung. Alle Änderungen sind im [CHANGELOG](CHANGELOG.md) dokumentiert.
>
> **⚠️ Beta:** FLODE ist darauf ausgelegt, keine bestehenden Daten zu überschreiben. Trotzdem empfehlen wir, Automatisierungen vor der Bearbeitung zu sichern.

---

## Was ist FLODE?

**FLODE** ist ein visueller Flow-Editor für Home Assistant Automatisierungen — inspiriert von Node-RED, aber ohne externen Server. Du zeichnest deine Automatisierungen als Diagramme und FLODE übersetzt sie automatisch in **100 % natives Home Assistant YAML**, das direkt im HA-Kern gespeichert wird.

Kein Vendor Lock-in. Kein externer Dienst. Automatisierungen bleiben vollständig im integrierten HA-Editor bearbeitbar.

---

## Funktionen

| Feature | Beschreibung |
|---|---|
| 🎯 **Visueller Editor** | Trigger, Bedingungen und Aktionen per Drag-and-Drop auf einer Leinwand |
| 📄 **100 % natives YAML** | Kein proprietäres Format — Standard HA-Automatisierungs-YAML |
| 🔄 **Bidirektional** | Bestehende HA-Automatisierungen importieren, bearbeiten, zurückspeichern |
| 🐛 **Trace-Integration** | Flows mit der offiziellen HA Trace-Ansicht debuggen |
| 🔀 **State Machines** | Komplexe Schleifen via automatischem State-Machine-Muster |
| 🌍 **DE & EN** | Vollständige i18n-Unterstützung |
| 🌗 **Dark & Light Mode** | Folgt automatisch dem eingestellten HA-Theme |

---

## Knotentypen

| Knoten | Farbe | Beschreibung |
|---|---|---|
| **Trigger** | 🟡 Gelb | Was die Automatisierung startet — Zustand, Zeit, Ereignis, … |
| **Bedingung** | 🔵 Blau | Filter — läuft nur weiter, wenn die Bedingung erfüllt ist |
| **Aktion** | 🟢 Grün | Was passiert — Dienst aufrufen, Ereignis, Verzögerung, … |
| **OR / AND / NOT** | 🟣 Lila | Mehrere Bedingungen und Trigger logisch verknüpfen |

---

## Installation

### Via HACS (empfohlen)

[![In HACS öffnen](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=SH1FT-W&repository=flode&category=integration)

**Manuell in HACS:**

1. HACS öffnen → Integrationen → ⋮ → **Benutzerdefinierte Repositories**
2. URL `https://github.com/SH1FT-W/flode` eingeben, Typ **Integration** → Hinzufügen
3. HACS → Integrationen → Nach **FLODE** suchen → Installieren
4. Home Assistant **neu starten**
5. Einstellungen → Integrationen → Integration hinzufügen → **FLODE**

### Manuell (ohne HACS)

1. Neueste Version von der [Releases-Seite](https://github.com/SH1FT-W/flode/releases) herunterladen (`flode.zip`)
2. Ordner `flode/` nach `config/custom_components/flode/` kopieren
3. Home Assistant neu starten
4. Einstellungen → Integrationen → Integration hinzufügen → **FLODE**

---

## Verwendung

Nach der Einrichtung erscheint **FLODE** in der HA-Seitenleiste.

- **Neue Automatisierung** — Mit einem Trigger-Knoten beginnen, Bedingungen und Aktionen verbinden
- **Bestehende importieren** — Über das Ordner-Symbol eine vorhandene HA-Automatisierung laden
- **Speichern** — Speichert direkt in Home Assistant als native Automatisierung
- **YAML exportieren** — Generierten YAML-Code jederzeit ansehen oder kopieren

---

## Projektstruktur

```
flode/
├── custom_components/flode/   # HA-Integration (Python)
│   ├── brand/                 # Integrations-Icons
│   ├── translations/          # DE + EN Einrichtungstexte
│   └── www/                   # Gebaute Frontend-Dateien
├── packages/
│   ├── frontend/              # React/Vite UI (@flode/frontend)
│   ├── transpiler/            # YAML ↔ Graph Logik (@flode/transpiler)
│   └── shared/                # Zod-Schemas + Typen (@flode/shared)
└── __tests__/                 # YAML Round-Trip Fixtures
```

## Technologie

- **Frontend:** React 18, Vite, Tailwind CSS, React Flow (xyflow), Zustand, i18next
- **Transpiler:** TypeScript, js-yaml, ELK Layout-Engine
- **Validierung:** Zod Schemas
- **Tests:** Vitest (278 Tests)
- **HA-Integration:** Python, Custom Panel via `panel_custom`

---

## Changelog

Alle Änderungen findest du in der [CHANGELOG.md](CHANGELOG.md).

---

## Lizenz

Apache 2.0 — siehe [LICENSE](LICENSE)

---

<div align="center">
  <sub>Fork von <strong>SH1FT-W</strong>, basierend auf <a href="https://github.com/FezVrasta/cafe-hass">C.A.F.E.</a> von Federico Zivolo · Aktiv weiterentwickelt mit <a href="https://claude.ai">Claude (Anthropic)</a></sub>
</div>
