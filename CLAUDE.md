# Project Overview

**FLODE** (Flow + Node Editor) is a visual flow editor for Home Assistant automations, inspired by Node-RED. It allows users to design automations as diagrams and transpiles them to 100% native Home Assistant YAML—no vendor lock-in. Automations remain editable in HA's built-in editor.

# Repository Structure

```
flode/
├── packages/
│   ├── shared/          # @flode/shared - Types and Zod schemas
│   ├── transpiler/      # @flode/transpiler - YAML parser/generator
│   ├── ui-core/         # @flode/ui-core - Framework-free UI logic (card texts, AI, traces, dependency map)
│   └── frontend/        # @flode/frontend - The HA panel (Lit + HA's own components), built into custom_components/flode/www
├── custom_components/flode/  # Home Assistant integration (Python)
└── .github/workflows/        # CI/CD pipelines
```

# Package Descriptions

- **@flode/shared**: Zod schemas, TypeScript types, validation utilities
- **@flode/transpiler**: YAML parsing, topology analysis, transpilation strategies
- **@flode/ui-core**: Logic without UI framework — card summaries + i18next locales, AI assist/draft via HA `ai_task`, trace mapping, dependency map, template preview, automation merge
- **@flode/frontend**: Lit web components; canvas pan/zoom/minimap from `@xyflow/system`; every form, dialog, picker and menu is Home Assistant's own element (`ha-dialog`, `ha-dropdown`, `ha-automation-*` editors …)

# Key Domains/Features

- Flow Canvas (trigger, condition, action, delay, wait nodes; HA blocks like if/choose stay HA blocks)
- YAML Parsing & Transpilation (YamlParser, FlowTranspiler) — must round-trip users' automations losslessly
- Home Assistant Integration (WebSocket API, HA's automation/script editor dialogs, traces, logbook)
- Runs & debugging (HA traces, run from here), AI assistant (HA `ai_task`), dependency map, template workshop

# Build System & Tooling

- Yarn 4 workspaces + Turbo for orchestration
- TypeScript 6 with strict mode
- Vite for frontend builds
- Vitest for testing, make sure to use the --run flag to avoid issues with watch mode
- Biome for linting, and for formatting

# Coding Conventions

In addition to strict TypeScript rules:

- **Zod for Schema Validation**: All data structures use Zod schemas in `@flode/shared`
- **HA-native UI**: Use Home Assistant's own elements and dialogs wherever one exists; no own design system. Minimum HA version is in `hacs.json` — check new HA internals against it
- **Lit Patterns**: One element per file (`flode-*.ts`), state via reactive properties, the panel (`flode-panel.ts`) owns the open flows and undo history
- **Strings**: UI text lives in `packages/frontend/src/strings.ts` (de + en) and `packages/frontend/src/locales/<lang>.ts` (nl, fr, es, it, pt); card texts in `@flode/ui-core` locales (same seven languages); HA's config flow in `custom_components/flode/translations`. A new key goes into every language — `strings.test.ts` and `locales.test.ts` check keys, placeholders and plural forms
- **Import Aliases**: `@flode/*` for packages

# Common Commands

```bash
yarn dev          # Watch mode (rebuilds the panel into custom_components/flode/www)
yarn build        # Build all packages
yarn build:ha     # Build + copy to custom_components
yarn test         # Run tests
yarn typecheck    # Type checking
yarn lint:biome   # Linting
dev/gate/gate.sh  # Release gate: browser checks against the test HA (Docker via tools/ha-docker.sh; FLODE_HA_BACKEND=venv for tools/ha-venv.sh) (before every release, always in full)
dev/next-version  # Next release version (calendar version YY.M.N)
```

# Rules

- **Ask before** commits, pushes, version bumps, tags, releases or any other git operation that changes the repository.
- **TypeScript:** strict, zero errors. No `any` (use `unknown` + type guards), no `as` casts except at external API
  boundaries, no `@ts-ignore`/`@ts-expect-error`, no IIFEs (use a named helper, method or element).
- **No duplication:** search for existing logic before writing code and extend it. Same logic twice → shared helper;
  shared types/schemas only in `@flode/shared`; framework-free logic in `@flode/ui-core`; a UI pattern used twice →
  reusable element; constants defined once. Duplication found while working → refactor it first.

# Cutting a Release

Only with explicit user approval.

- **Version:** calendar version `YY.M.N` from `dev/next-version` (rules in the global CLAUDE.md), no leading zeros
  (they break `package.json`), tags and titles without "v".
- **Notes:** compiled from user-facing changes in the git history since the last release (features, fixes, breaking
  changes), in English, without asking the user for them. Changelog only in the GitHub release, **no CHANGELOG.md file**.

1. **"What's new"** (`packages/frontend/src/flode-welcome.ts`): replace `WHATS_NEW` with 2–4 entries (icon + title +
   text), add their `newXYZ…` strings in every language (`strings.ts` + `locales/*.ts`), drop the previous ones.
2. **Version** in `custom_components/flode/manifest.json` and `packages/frontend/package.json` (the sheet shows once
   per version), commit `Release: <version> - <short description>`.
3. **Release gate (mandatory):** after the release commit, before tagging or pushing, run `dev/gate/gate.sh` (see
   `dev/gate/README.md`). Release only if `.gate/gate-<commit>.json` says `"counts_for_release": true` for exactly
   that commit. `flaky` tests (green on the second try) and `new` pictures are not red, but mention them. Visual
   differences → show `.gate/visual/report.html` to the user first.
4. `git tag "$(dev/next-version)"`, `git push origin main && git push origin --tags`.
5. `gh release create <version> --title "<version>" --notes "<notes>"` (real newlines, not literal `\n`), then check
   the Releases page.
6. After the release: `dev/gate/gate.sh --baseline` so the next release is compared with this one.
