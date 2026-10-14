# Release gate

No release without a green gate for exactly the commit that goes out.

```sh
dev/gate/gate.sh                # full gate, about 3 minutes — the only run that counts for a release
dev/gate/gate.sh --only cards   # one step while working on something (doesn't count)
dev/gate/gate.sh --no-restart   # skip restarting the test HA (frontend-only changes; doesn't count)
dev/gate/gate.sh --baseline     # right after a release: its pictures become the visual baseline
```

The result lands in `.gate/gate-<commit>.json`. It counts for a release only with
`"counts_for_release": true`: all steps green, full run, HA restarted, and nothing
uncommitted in `packages/`, `custom_components/` or `dev/`.

## What it checks

1. **static**: Biome, type check, all unit tests (incl. the YAML round-trip fixtures), build.
2. **test HA**: copies the build into the Docker test HA, restarts it, waits until HA runs
   and serves FLODE's panel, then puts the gate's automations in: every fixture from
   `__tests__/yaml-automation-fixtures` that HA itself accepts, plus `dev/gate/flows/`.
3. **cards** (Chromium + WebKit): opens every automation like a user (⌘K) and checks
   - no console or page errors, no unexpected page reload,
   - FLODE read everything (no "parts not recognised" warning),
   - every card has a title, none shows `undefined`, `[object Object]`, `NaN` or HA's describe error,
   - with "Card text like Home Assistant", HA's text arrives on the cards.
4. **roundtrip**: moves one card in every automation (layout only), saves, and compares
   what HA stores with the original — apart from FLODE's layout metadata and HA's own
   migration of old keys. Accepted differences live in `known.json`, with the reason;
   a listed automation that saves unchanged again is reported so the entry gets removed.
5. **actions** (Chromium + WebKit, each on its own copy of `flows/scratch.yaml`): select a
   card (HA's editor opens), duplicate, undo, redo, disable (⌘E) and undo, tidy up, minimap,
   branch cards of "Choose", add a step through HA's add dialog and save (HA must store it),
   the runs view, a phone-sized window and the "What's new" sheet.
6. **visual**: screenshots of a few typical automations in both browsers and both card texts,
   compared with the baseline of the last release. Differences never fail the gate; they are
   shown side by side in `.gate/visual/report.html` for a person to look at.

The gate's automations are removed from the test HA at the end. Failure screenshots
go to `.gate/shots/`, logs to `.gate/logs/`.

## Setup

- Docker test HA (default container `flode-test`, config in `../flode-test/config`, URL
  `http://localhost:8123`); a long-lived access token in `../flode-test/.claude-token`.
  Override with `FLODE_GATE_CONTAINER`, `FLODE_GATE_DIR`, `FLODE_GATE_URL`,
  `FLODE_GATE_TOKEN` / `FLODE_GATE_TOKEN_FILE`.
- Playwright browsers for the pinned version (`npx playwright@1.61.1 install chromium webkit`).
  `gate.sh` installs the gate's own `node_modules` on first run.
- `FLODE_GATE_ENGINES=chromium` runs a step in one browser only (for debugging).

## Notes for writing checks

- A fresh browser installs HA's service worker on its first visit, and HA reloads the
  page as soon as the worker takes over (`controllerchange`, 1–12 s later). `openBrowser`
  waits for a page that was controlled from its start; an unexpected reload after that
  fails the check, with the last console and WebSocket messages before it.
- Don't navigate between checks without need: a reload cuts off HA's downloads, which
  WebKit reports as errors. `gotoPanel` only loads the page when it isn't on FLODE yet.
- A flow that HA changes while it's open in FLODE is reloaded by FLODE (correctly) —
  checks that save must not share an automation between browsers.
