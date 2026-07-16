# Contributing to Clickspex

Thanks for your interest in improving Clickspex! This guide covers how to set up
the project, the day-to-day workflow, and the conventions we follow.

Clickspex is a Chrome extension plus a local CLI/bridge and a read-only MCP
server. The extension lets you inspect and edit UI in the browser; the CLI maps
those edits to your source files and can apply them (CSS today).

## Prerequisites

- **Node.js 22+**
- **pnpm 11.x** (`corepack enable` will provide it)
- **Chrome or Chromium** for testing the extension

## Setup

```bash
git clone https://github.com/abdullahiqbal93/clickspex.git
cd clickspex
pnpm install
pnpm build
```

## Repository layout

```text
apps/extension      Chrome MV3 extension + side panel UI (React)
apps/cli            The `clickspex` CLI: source indexer, patch previews, Code Sync bridge
apps/mcp-server     Read-only MCP stdio server
packages/shared     Types, message contracts + runtime guards
packages/core       Pure utilities: selectors, snapshots, style diffs, a11y, project scan
packages/adapters   CSS / Tailwind / framework adapters
packages/config     Shared TypeScript, ESLint, Prettier, Vitest config
docs                Architecture, product spec, roadmap
```

Dependencies flow one way: `extension`/`cli`/`mcp-server` depend on `adapters`,
`core`, and `shared`. Browser-only code stays in `apps/extension`; everything in
`packages/core` and below must run without Chrome APIs.

## Everyday commands

Run from the repo root:

```bash
pnpm typecheck     # type-check every package
pnpm lint          # eslint
pnpm test          # vitest across all packages
pnpm format        # prettier --write
pnpm build         # build every package
```

**Please run `pnpm typecheck`, `pnpm lint`, and `pnpm test` before opening a PR.**

## Working on the extension

```bash
pnpm --filter @clickspex/extension dev     # watch build
# or: pnpm --filter @clickspex/extension build
```

Load it in Chrome: `chrome://extensions` → enable Developer mode → **Load
unpacked** → select `apps/extension/dist`. Reload the extension from that page
after each rebuild.

## Working on the CLI / Code Sync bridge

```bash
pnpm --filter clickspex build
pnpm connect --path .          # builds + starts the bridge for this repo
# or target another project:
node apps/cli/dist/index.js connect --path /path/to/app
```

The bridge only accepts requests whose `Origin` is `chrome-extension://…` (or no
origin, e.g. curl). Keep that check intact — it is what stops arbitrary websites
from reading or writing source through the local server. Any new endpoint that
reads or writes files must go through the same guard and stay inside the project
root (see `isInsideRoot`), and writes must back up originals to
`.clickspex/backups/`.

## Working on the MCP server

```bash
pnpm --filter @clickspex/mcp-server build
node apps/mcp-server/dist/index.js
```

MCP tools are **read-only** by design — they may index source and produce diff
previews, but must not mutate files.

## Testing

- Unit tests live next to the code as `*.test.ts` and run under Vitest.
- `packages/core` and `packages/adapters` tests must run without Chrome — mock
  Chrome APIs at the edge (see `apps/extension/src/chrome/messaging.test.ts`).
- Add or update tests for any behavior change, especially around the message
  contracts, the style/edit action log, selector generation, and the bridge's
  apply/rollback + origin checks.

## Code style

- TypeScript, strict mode. Prefer explicit types on exported APIs.
- ESLint + Prettier enforce formatting; run `pnpm format` before committing.
- Keep browser globals out of `packages/*`; isolate Chrome APIs to the extension
  entry points and `apps/extension/src/chrome`.
- New cross-context messages must be added to the `ExtensionMessage` union **and**
  its runtime validator in `packages/shared`, and (if content→panel) to the
  router allow-list.

## Commits and pull requests

- Use clear, conventional-ish commit messages (`fix(extension): …`,
  `feat(cli): …`, `docs: …`).
- Keep PRs focused. Describe the change, the reasoning, and how you tested it.
- Update `README.md` / `docs/` when you change user-facing behavior.

## Reporting security issues

The Code Sync bridge writes to the filesystem, so please treat security
seriously. If you find a vulnerability (e.g. a way for a web page to reach the
bridge, a path-traversal, or an unguarded write), **do not open a public issue** —
report it privately to the maintainer first so it can be fixed before disclosure.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
