# Project Overview

**FLODE** (Flow + Node Editor) is a visual flow editor for Home Assistant automations, inspired by Node-RED. Users design automations as diagrams; FLODE transpiles them to 100% native Home Assistant YAML (no vendor lock-in), so they stay editable in HA's built-in editor. Users' automations must round-trip losslessly; HA blocks like if/choose stay HA blocks.

# Repository Structure

- `packages/shared` (`@flode/shared`): Zod schemas, TypeScript types, validation
- `packages/transpiler` (`@flode/transpiler`): YAML parsing, topology analysis, transpilation strategies
- `packages/ui-core` (`@flode/ui-core`): framework-free logic (card texts + i18next locales, AI via HA `ai_task`, traces, dependency map, template preview, automation merge)
- `packages/frontend` (`@flode/frontend`): the HA panel (Lit), built into `custom_components/flode/www`; canvas pan/zoom/minimap from `@xyflow/system`
- `custom_components/flode/`: Home Assistant integration (Python)

Yarn 4 workspaces + Turbo, TypeScript strict, Vite, Vitest (always with `--run`, watch mode causes issues), Biome for lint and format.

# Coding Conventions

- **Zod for Schema Validation**: all data structures use Zod schemas in `@flode/shared`
- **HA-native UI**: use Home Assistant's own elements and dialogs wherever one exists (`ha-dialog`, `ha-dropdown`, `ha-automation-*` editors …); no own design system. Minimum HA version is in `hacs.json`; check new HA internals against it
- **Lit Patterns**: one element per file (`flode-*.ts`), state via reactive properties, the panel (`flode-panel.ts`) owns the open flows and undo history
- **Strings**: UI text lives in `packages/frontend/src/strings.ts` (de + en) and `packages/frontend/src/locales/<lang>.ts` (nl, fr, es, it, pt); card texts in `@flode/ui-core` locales (same seven languages); HA's config flow in `custom_components/flode/translations`. A new key goes into every language; `strings.test.ts` and `locales.test.ts` check keys, placeholders and plural forms
- **Import Aliases**: `@flode/*` for packages

# Common Commands

```bash
yarn dev          # Watch mode (rebuilds the panel into custom_components/flode/www)
yarn build        # Build all packages
yarn build:ha     # Build + copy to custom_components
yarn test --run   # Run tests
yarn typecheck    # Type checking
yarn biome ci .   # Lint + format + import order as in CI (yarn lint:biome misses import sorting)
dev/gate/gate.sh  # Release gate: browser checks against the test HA (Docker via tools/ha-docker.sh; FLODE_HA_BACKEND=venv for tools/ha-venv.sh) (before every release, always in full)
dev/next-version  # Next release version (calendar version YY.M.N)
```

# Rules

- **Ask before** commits, pushes, version bumps, tags, releases or any other git operation that changes the repository.
- **Never copy FLODE into the production HA** (`/Volumes/config/custom_components/flode`), not even after a release:
  Daniel updates through HACS to see the real update path. Only on his explicit request; test deploys go to
  `~/Software/flode-test`.
- **TypeScript:** strict, zero errors. No `any` (use `unknown` + type guards), no `as` casts except at external API
  boundaries, no `@ts-ignore`/`@ts-expect-error`, no IIFEs (use a named helper, method or element).
- **No duplication:** search for existing logic before writing code and extend it. Same logic twice → shared helper;
  shared types/schemas only in `@flode/shared`; framework-free logic in `@flode/ui-core`; a UI pattern used twice →
  reusable element; constants defined once. Duplication found while working → refactor it first.

# Cutting a Release

Only with explicit user approval.

- **Version:** calendar version `YY.M.N` from `dev/next-version` (rules in the global CLAUDE.md), no leading zeros
  (they break `package.json`), tags and titles without "v". Betas: `YY.M.N-beta.K` as GitHub prerelease; they do
  not count for `dev/next-version`.
- **Notes:** compiled from user-facing changes in the git history since the last release (features, fixes, breaking
  changes), in English, without asking the user for them. They go into `CHANGELOG.md` as
  `## [<version>] — <YYYY-MM-DD> — <title>`, starting directly with `### Added/Fixed/Changed`; `release.yml` copies
  that section into the GitHub release body (overwrites what `gh release create` set).

1. **"What's new"** (`packages/frontend/src/flode-welcome.ts`): replace `WHATS_NEW` with 2–4 entries (icon + title +
   text), add their `newXYZ…` strings in every language (`strings.ts` + `locales/*.ts`), drop the previous ones.
2. **Version** in `custom_components/flode/manifest.json` and `packages/frontend/package.json` (the sheet shows once
   per version; `release.yml` checks both against the tag), CHANGELOG section, `yarn biome ci .`, commit
   `Release: <version> - <short description>`.
3. **Release gate (mandatory):** after the release commit, before tagging or pushing, run `dev/gate/gate.sh` (see
   `dev/gate/README.md`). Release only if `.gate/gate-<commit>.json` says `"counts_for_release": true` for exactly
   that commit. `flaky` tests (green on the second try) and `new` pictures are not red, but mention them. Visual
   differences → show `.gate/visual/report.html` to the user first.
4. `git tag "$(dev/next-version)"`, `git push origin main && git push origin --tags`.
5. `gh release create <version> --title "<version>" --notes "<notes>"` (real newlines, not literal `\n`), then check
   the Releases page and watch the workflows until green.
6. After the release: `dev/gate/gate.sh --baseline` so the next release is compared with this one.
