## Coding Guidelines

- **Never use IIFEs (Immediately Invoked Function Expressions) in TypeScript files.**
  - Always extract logic into a named helper function, method or element instead of using IIFEs.
  - Use plain variables or helper functions for local logic, but prefer separate elements for UI logic.
  - IIFEs are forbidden in all TypeScript code.

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
- **Strings**: UI text lives in `packages/frontend/src/strings.ts` (de + en); card texts in `@flode/ui-core` locales
- **Import Aliases**: `@flode/*` for packages

# Common Commands

```bash
yarn dev          # Watch mode (rebuilds the panel into custom_components/flode/www)
yarn build        # Build all packages
yarn build:ha     # Build + copy to custom_components
yarn test         # Run tests
yarn typecheck    # Type checking
yarn lint:biome   # Linting
```

# Development Guidelines

## Release and Commit Policy

**IMPORTANT**: Never cut a new release or commit changes without first asking the user for permission.

Always ask before:

- Creating git commits
- Pushing changes to the repository
- Bumping version numbers
- Creating new releases/tags
- Running any git operations that modify the repository

The user should have full control over when changes are committed and released.

## TypeScript Code Quality

**STRICT TYPING REQUIRED**: Always maintain strict TypeScript types throughout the codebase.

**FORBIDDEN PRACTICES**:

- Never use `as` type assertions unless absolutely necessary for external API boundaries
- Never use `any` type - use proper type definitions or `unknown` with type guards
- Avoid type casting hacks or workarounds
- Don't suppress TypeScript errors with `@ts-ignore` or `@ts-expect-error`

**REQUIRED PRACTICES**:

- Define proper interfaces and types for all data structures
- Use type guards for runtime type checking
- Leverage TypeScript's strict mode features
- Create proper type definitions for external libraries if needed
- Use generic types appropriately for reusable components

The codebase should compile with zero TypeScript errors and maintain type safety throughout.

# Best Practices

## Code Reusability (DRY) - VITAL AND MANDATORY

**⚠️ THIS IS A NON-NEGOTIABLE REQUIREMENT ⚠️**

**ZERO TOLERANCE FOR CODE DUPLICATION.** Every single piece of duplicated code is a violation of this project's core principles. Before writing ANY code, you MUST check if similar logic already exists and reuse it.

**MANDATORY PRACTICES**:

- **Helper Functions/Utilities**: Extract common logic into reusable helper functions or utility modules. If you write the same logic twice, you have failed.
- **Generic Elements**: Design Lit elements and helpers to be as generic and reusable as possible, accepting properties to customize behavior and appearance. They MUST be designed for reuse from the start.
- **Shared Types/Schemas**: Leverage `@flode/shared` for all common types, interfaces, and Zod schemas to ensure consistency and avoid duplication across `frontend` and `transpiler`.
- **Shared Logic**: Logic both the panel and tests need, and anything framework-free, belongs in `@flode/ui-core`. ANY repeated stateful pattern MUST become a shared helper.
- **Before Writing Code**: ALWAYS search the codebase first to check if similar functionality exists. Reuse and extend existing code rather than creating new duplicates.
- **Refactor Immediately**: If you discover existing duplication while working, refactor it into a shared abstraction before proceeding.

**ABSOLUTELY FORBIDDEN - VIOLATIONS WILL NOT BE ACCEPTED**:

- **Copy-pasting code**: NEVER duplicate blocks of code under any circumstances. If you find yourself copying and pasting, STOP and create a reusable function or element instead.
- **Redundant Type Definitions**: NEVER redefine types or interfaces that already exist in `@flode/shared` or can be derived from existing schemas.
- **Similar but slightly different implementations**: If two pieces of code do similar things, they MUST be unified into a single parameterized implementation.
- **Duplicated constants or configuration**: All shared values MUST be defined once and imported where needed.
- **Repeated UI patterns**: Any UI pattern used more than once MUST be extracted into a reusable component.

**THE RULE IS SIMPLE: If code appears more than once, it's wrong. No exceptions.**

# Cutting a New Release

To cut a new release, follow these steps:

**Important:** Before tagging and releasing, always bump the version in `custom_components/flode/manifest.json` to match the new release version.

**All information for the release (version number and release notes) must be automatically derived from the git commit history since the last release.**

- The version number should be determined based on semantic versioning and recent changes.
- The release notes should be compiled from user-facing changes in the commit history (new features, bug fixes, breaking changes), without requiring user input.

1. **Commit your changes**

- Ensure all changes are staged and committed with a clear message.
- Bump the version in `custom_components/flode/manifest.json` to the new release version (e.g., "0.7.7").
- Example:
  ```bash
  # Edit manifest.json and update the version field
  git add .
  git commit -m "Release: v0.x.x - <short description>"
  ```

2. **Create a new git tag**

- Use semantic versioning (e.g., v0.7.7). For 1.x.x.
- Example:
  ```bash
  git tag v0.7.7
  ```

3. **Push changes to remote**

- Push your commits and tags to the remote repository.
- Example:
  ```bash
  git push origin main
  git push origin --tags
  ```

4. **Create a GitHub release**

- Use the GitHub CLI (`gh`) to create a release.
- **Include the changelog in the GitHub release notes. Do NOT create a literal CHANGELOG.md file.**
- The changelog must be compiled automatically from the git commit history since the last release, focusing on user-facing changes:
  - New features
  - Bug fixes
  - Breaking changes
- Example:

```bash
# IMPORTANT: Use real newlines in the --notes argument, not literal \n. For multiline notes, write each line on a new line inside the string.
gh release create v0.7.7 --title "FLODE v0.7.7" --notes "<release notes>"
```

5. **Verify release on GitHub**

- Check the Releases page to confirm the new release is published.

**Note:** Do not cut a release without explicit user approval. Always confirm before pushing tags or creating releases.
