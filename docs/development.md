# Development

## Prerequisites

- Node.js 22 or newer.
- pnpm 11.x, as declared by `packageManager`.
- Chrome or another Chromium browser for loading the built extension.

## Install

```bash
pnpm install
```

## Workspace Commands

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` compiles shared packages, the CLI, the MCP server, and the production extension bundle.

## Extension Development

```bash
pnpm --filter @clickspex/extension dev
```

For a production bundle:

```bash
pnpm --filter @clickspex/extension build
```

Load `apps/extension/dist` as an unpacked extension in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `apps/extension/dist`.
5. Open a web page and click the extension action to open the side panel.

## CLI

```bash
pnpm --filter clickspex build
node apps/cli/dist/index.js init --path .
node apps/cli/dist/index.js detect --path .
node apps/cli/dist/index.js index --path .
node apps/cli/dist/index.js export-example --output ui-change-intent.example.json
node apps/cli/dist/index.js preview-patch --intent ui-change-intent.example.json --project .
```

`init` writes `.clickspex/config.json` with read-only code-sync metadata. `detect` reports known frameworks, package manager, config files, common source directories, and index stats. `index` returns bounded source metadata without file contents. `preview-patch` reads a `UIChangeIntent` JSON file and prints advisory source-aware patch suggestions.

## MCP Server

```bash
pnpm --filter @clickspex/mcp-server build
node apps/mcp-server/dist/index.js
```

The server uses stdio and exposes read-only tools documented in `docs/mcp-tools.md`.

## Generated Files

Build outputs live in package `dist` folders and are ignored by Git. Do not commit generated extension bundles or compiled TypeScript output unless release packaging is added later.

## Release hardening

Phase 10 release automation lives at the repository root:

```bash
pnpm release:check      # version/protocol/workflow consistency
pnpm release:artifacts  # build, package CLI and extension, generate SBOM/checksums
```

Generated release files are written to `artifacts/` and ignored by Git. See `docs/release.md` for the production release gate and source-of-truth behavior table.
