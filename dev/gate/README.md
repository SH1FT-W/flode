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

## The result

`gate-<commit>.json` holds, per step, its status and seconds and **one entry per test**
(a fixture in a browser, one editor action, one picture) with its status and, when it was
not ok, the path of its log:

- `ok`
- `failed`: red. The step and the gate are red.
- `flaky`: red once, green when run again on its own (the browser reloads FLODE and the
  test runs once more; a flow that opened only on the second ⌘K counts as flaky too).
  Not red; listed under `flaky` in the JSON and at the end of the output, so a pattern shows
  up. A test that is flaky in several gates needs fixing, not ignoring.
- `new`: a picture without a baseline yet (a flow added to the visual step since the last
  release). Not red; it gets its baseline with `--baseline` after the next release.
- `changed`: a picture that differs from the baseline, for a person to look at. Not red.

Logs: `.gate/logs/<step>.log` has the whole step, `.gate/logs/<step>/<test>.log` the lines
of one test that was not ok (for a flaky one: what went wrong on the first try). The gate's
output ends with one line per step and the totals (`102 tests in all: 101 ok, 1 flaky`).

## What it checks

1. **static**: Biome, type check, all unit tests (incl. the YAML round-trip fixtures), build.
2. **test HA**: copies the build into the test HA, restarts it, waits until HA runs
   and serves FLODE's panel, then puts the gate's flows in: every fixture from
   `__tests__/yaml-automation-fixtures` that HA itself accepts, plus `dev/gate/flows/`
   (one pattern per file, named after it; a file with `sequence:` is seeded as a script).
   A new flow there runs in every step from then on; the visual step photographs only
   the flows listed in `check-visual.mjs`.
3. **cards** (Chromium + WebKit): opens every automation like a user (⌘K) and checks
   - no console or page errors, no unexpected page reload,
   - FLODE read everything (no "parts not recognised" warning; a flow with a step FLODE
     keeps verbatim warns on purpose and is listed under `cards` in `known.json` with the reason),
   - every card has a title, none shows `undefined`, `[object Object]`, `NaN` or HA's describe error,
   - with "Card text like Home Assistant", HA's text arrives on the cards.
4. **roundtrip** (saving without loss): opens every flow (automations and scripts) and saves
   it twice, first **as it is** (nothing touched: the pure open → save path of the real
   editor), then after moving one card (layout only). After each save it compares what HA
   stores (`config/automation/config/<id>` or `config/script/config/<id>`) with the original
   — apart from FLODE's layout metadata and HA's own migration of old keys. What "the same"
   means is defined once, in `packages/transpiler/src/ha-equal.ts` (the unit tests use the
   same definition); FLODE-internal keys (`_raw`, `_step`) in a stored config fail too.
   Accepted differences live under `roundtrip` in `known.json`, with the reason; a listed
   flow that saves unchanged again is reported so the entry gets removed. The original is
   put back after each flow.
5. **actions** (Chromium + WebKit, each on its own copy of `flows/scratch.yaml`): select a
   card (HA's editor opens), duplicate, undo, redo, disable (⌘E) and undo, tidy up, minimap,
   branch cards of "Choose", add a step through HA's add dialog and save (HA must store it),
   the runs view, a phone-sized window and the "What's new" sheet.
6. **visual**: screenshots of a few typical automations in both browsers and both card texts,
   compared with the baseline of the last release. Differences never fail the gate; they are
   shown side by side in `.gate/visual/report.html` for a person to look at.

The gate's flows are removed from the test HA at the end. Failure screenshots of the
actions step go to `.gate/shots/`.

## Setup

- Test HA without Docker: HA Core from a shared venv per version (`tools/ha-venv.sh`, needs
  `uv`), config in `../flode-test/config`, port 8123, URL `http://localhost:8123`; a long-lived
  access token in `../flode-test/.claude-token`. The gate starts it when it is not running and
  restarts it otherwise. Override with `FLODE_GATE_DIR`, `FLODE_GATE_PORT`, `FLODE_GATE_URL`,
  `FLODE_GATE_HA_VERSION` (e.g. `beta`), `FLODE_GATE_TOKEN` / `FLODE_GATE_TOKEN_FILE`.
  `tools/ha-venv.sh stop ../flode-test/config` stops it.
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
  checks that save must not share an automation between browsers, and a flow must be
  closed in FLODE before its original is put back through the API.
- Every check is one test: wrap it in `result.check(name, fn, retry)` (see `report` in
  `lib.mjs`). `fail` calls and a thrown error inside `fn` belong to that test; `retry`
  puts the page back for the second try. Without `retry` a red test is red at once
  (the actions build on each other). Anything a step accepts on purpose goes into
  `known.json` with its reason, never into the check.
