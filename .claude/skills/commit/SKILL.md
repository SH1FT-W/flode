---
name: commit
description: Create a git commit. Always use this skill when the user asks to commit changes, stage files, or create a git commit message. Runs linting and type checking before committing to ensure quality gates pass.
user-invocable: true
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

The user wants to commit changes. Before creating a git commit, run quality checks and fix any issues. Follow these steps:

## Step 1: Review changes

```bash
git status
git diff
```

Get an overview of what has changed to inform staging and the commit message.

## Step 2: Run quality checks

Run checks sequentially:

```bash
yarn lint:biome --fix
yarn typecheck
yarn format:check --fix
```

If tests are fast (unit tests only, no E2E), run them as well:

```bash
yarn test --passWithNoTests
```

> Skip slow or flaky test suites (E2E, integration) unless the user explicitly asks for them.

## Step 3: Fix remaining issues

If any check still fails after auto-fix:

- **Lint errors**: Manually fix remaining issues in the affected files, then re-run `yarn lint:biome`
- **Type errors**: Fix TypeScript errors in the affected files, then re-run `yarn typecheck`
- **Formatting**: Re-run `yarn format:check --fix`

Do **not** proceed to commit until every check passes with zero errors.

## Step 4: Stage files

Stage only the files relevant to this commit:

```bash
git add <specific files>
```

If the user wants to review and selectively stage hunks, use `git add -p`.

## Step 5: Create the commit

Write a clear commit message following the existing style in the repo (check recent commits via `git log --oneline -10` if unsure). Use a heredoc to avoid shell escaping issues:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <short summary>

<optional body>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

Then confirm success:

```bash
git status
git log --oneline -3
```

**IMPORTANT**: Never use `--no-verify` or skip hooks. Never commit if lint, typecheck, or format checks are still failing.
