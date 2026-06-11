<div align="center">
  <img src="custom_components/flode/brand/icon.png" alt="FLODE Logo" width="120" />
  <h1>FLODE</h1>
  <p><strong>Visueller Flow + Node Editor für Home Assistant</strong></p>

  <p>
    <img alt="Version" src="https://img.shields.io/badge/version-0.7.7-blue?style=flat-square" />
    <img alt="HA Version" src="https://img.shields.io/badge/HA-2024.1%2B-brightgreen?style=flat-square" />
    <img alt="Lizenz" src="https://img.shields.io/badge/lizenz-Apache%202.0-orange?style=flat-square" />
    <img alt="Status" src="https://img.shields.io/badge/status-beta-yellow?style=flat-square" />
  </p>
</div>

---

> **Fork-Hinweis:** FLODE basiert auf [C.A.F.E.](https://github.com/FezVrasta/cafe-hass) von [@FezVrasta](https://github.com/FezVrasta). Dieses Repository ist ein Fork mit zahlreichen Bugfixes, Verbesserungen und der vollständigen Umbenennung auf FLODE. Änderungen gegenüber dem Original sind im [CHANGELOG](CHANGELOG.md) dokumentiert.

> **Beta:** FLODE ist darauf ausgelegt, keine bestehenden Daten zu überschreiben. Trotzdem empfehlen wir, Automatisierungen vor der Bearbeitung zu sichern.

## Was ist FLODE?

**FLODE** ist ein visueller Flow-Editor für Home Assistant Automatisierungen — inspiriert von Node-RED, aber ohne externen Server. Du zeichnest deine Automatisierungen als Diagramme und FLODE übersetzt sie automatisch in **100 % natives Home Assistant YAML**, das direkt im HA-Kern gespeichert wird. Kein Vendor Lock-in. Kein externer Dienst. Automatisierungen bleiben vollständig im integrierten HA-Editor bearbeitbar.

## Funktionen

- **Visueller Flow-Editor** — Trigger, Bedingungen und Aktionen per Drag-and-Drop auf einer Leinwand
- **100 % natives YAML** — Die Ausgabe ist Standard-HA-Automatisierungs-YAML, kein proprietäres Format
- **Bidirektional** — Bestehende HA-Automatisierungen importieren, visuell bearbeiten und zurückspeichern
- **Trace-Integration** — Flows mit der offiziellen HA Trace-Ansicht debuggen
- **State-Machine-Unterstützung** — Komplexe Schleifen und Verzweigungen via automatischem State-Machine-Muster
- **Deutsch & Englisch** — Vollständige i18n-Unterstützung
- **Dark & Light Mode** — Folgt dem eingestellten HA-Theme

## Installation

### Über HACS (empfohlen)

**Schaltfläche (ein Klick):**

[![In HACS öffnen](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=SH1FT-W&repository=flode&category=integration)

**Manuell in HACS:**

1. HACS öffnen → Integrationen → ⋮ → Benutzerdefinierte Repositories
2. URL `https://github.com/SH1FT-W/flode` eingeben, Typ **Integration** wählen → Hinzufügen
3. HACS → Integrationen → Nach **FLODE** suchen → Installieren
4. Home Assistant neu starten
5. **Einstellungen → Integrationen → Integration hinzufügen → FLODE**

### Manuell (ohne HACS)

1. Neueste Version von der [Releases-Seite](https://github.com/SH1FT-W/flode/releases) herunterladen (`flode.zip`)
2. Archiv entpacken und den Ordner `flode/` nach `config/custom_components/flode/` kopieren
3. Home Assistant neu starten
4. **Einstellungen → Integrationen → Integration hinzufügen → FLODE**

## Verwendung

Nach der Einrichtung erscheint **FLODE** in der HA-Seitenleiste. Einfach anklicken, um den Flow-Editor zu öffnen.

- **Neue Automatisierung** — Mit einem Trigger-Knoten beginnen, Bedingungen und Aktionen hinzufügen
- **Bestehende importieren** — Über das Ordner-Symbol eine vorhandene HA-Automatisierung laden
- **Speichern** — Speichert direkt in Home Assistant als native Automatisierung
- **YAML exportieren** — Generierten YAML-Code jederzeit ansehen oder kopieren

## Knotentypen

| Knoten | Farbe | Beschreibung |
|---|---|---|
| Trigger | Gelb | Was die Automatisierung startet (Zustand, Zeit, Ereignis, ...) |
| Bedingung | Blau | Filter — läuft nur weiter, wenn die Bedingung erfüllt ist |
| Aktion | Grün | Was passiert (Dienst aufrufen, Ereignis auslösen, Verzögerung, ...) |
| OR / AND / NOT | Lila | Mehrere Bedingungen gruppieren |

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
- **Tests:** Vitest (187 Tests)
- **HA-Integration:** Python, Custom Panel via `panel_custom`

## Changelog

Alle Änderungen findest du in der [CHANGELOG.md](CHANGELOG.md).

## Lizenz

Apache 2.0 — siehe [LICENSE](LICENSE)

---

<div align="center">
  <sub>Entwickelt von <strong>SH1FT-W</strong> · Aktiv weiterentwickelt mit <a href="https://claude.ai">Claude (Anthropic)</a></sub>
</div>
