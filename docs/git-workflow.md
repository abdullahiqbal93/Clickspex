# Git Workflow

This repository is built as a sequence of small, verified commits. Each meaningful slice should compile and pass the relevant checks before it is committed.

## Commit Expectations

- Keep commits focused on one product slice.
- Use conventional, industry-standard commit messages.
- Do not commit user prompt files such as `Implementation.md` or local cleanup notes.
- Do not commit package `dist` outputs.
- Run validation before important commits.

## Recommended Validation

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For narrow documentation-only edits, `pnpm format`, `pnpm lint`, and `pnpm typecheck` are usually enough. Run the full set before release or final handoff.

## Branching

Use feature branches for future changes. Keep the main branch releasable and avoid mixing framework adapter experiments with extension runtime fixes.
