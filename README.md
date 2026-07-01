# UI DevTools

UI DevTools is a Chrome Manifest V3 extension for inspecting live UI, making temporary visual edits, measuring layout, checking lightweight accessibility signals, and exporting those changes as structured `UIChangeIntent` data.

The repo is intentionally conservative: the extension can prototype UI changes in the browser, while the CLI and MCP server inspect local projects and generate read-only suggestions. v1 does not automatically edit source files.

## What Is Included

- Chrome MV3 extension with side panel, content script, background routing, and Shadow DOM overlay isolation.
- Element picker with selector, DOM path, attributes, computed style, box model, geometry, and parent layout snapshots.
- Temporary style editing with reset, undo, redo, and box model controls.
- Measurement and alignment overlay tools.
- Lightweight accessibility notes for missing labels, missing image alt text, and simple contrast checks.
- Exports for CSS, conservative Tailwind classes, JSON, and Markdown.
- Source-aware project indexing for components, routes, stylesheets, selectors, classes, ids, and imports.
- Framework adapter interface with working CSS/Tailwind patch previews and source-aware framework review hints.
- `ui-sync` CLI for local init, project detection, source indexing, patch previews, and example change-intent export.
- Read-only MCP server for project scanning, framework detection, summaries, exports, and patch previews.

## Workspace

```text
apps/extension      Chrome extension and side panel UI
apps/cli            Local ui-sync CLI
apps/mcp-server     Read-only MCP stdio server
packages/shared     Shared types, message guards, adapter contracts
packages/core       Pure selector, style, measurement, a11y, and project-detection utilities
packages/adapters   CSS, Tailwind, and scaffold framework adapters
packages/config     Shared TypeScript, ESLint, Prettier, and Vitest config
docs                Product, architecture, permissions, MCP, and roadmap docs
```

## Setup

```bash
pnpm install
pnpm build
```

Requirements:

- Node.js 22 or newer
- pnpm 11.x
- Chrome or Chromium for extension testing

## Development Commands

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Run The Extension

Development mode:

```bash
pnpm --filter @ui-devtools/extension dev
```

Production bundle:

```bash
pnpm --filter @ui-devtools/extension build
```

Load `apps/extension/dist` in Chrome via `chrome://extensions` -> Developer mode -> Load unpacked.

## CLI

```bash
pnpm --filter @ui-devtools/cli build
node apps/cli/dist/index.js init --path .
node apps/cli/dist/index.js detect --path .
node apps/cli/dist/index.js index --path .
node apps/cli/dist/index.js export-example --output ui-change-intent.example.json
node apps/cli/dist/index.js preview-patch --intent ui-change-intent.example.json --project .
```

## MCP Server

```bash
pnpm --filter @ui-devtools/mcp-server build
node apps/mcp-server/dist/index.js
```

The MCP server exposes read-only tools only. See `docs/mcp-tools.md` for tool signatures and examples.

## Documentation

- `docs/product-spec.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/extension-permissions.md`
- `docs/mcp-tools.md`
- `docs/ai-code-sync-roadmap.md`
- `docs/git-workflow.md`

## Security And Safety

- The extension requests `activeTab`, `sidePanel`, and `storage`; it avoids broad background host permissions.
- Overlay UI is isolated in a Shadow DOM host.
- Temporary edits are injected through one page style tag and are not persisted to source.
- CLI and MCP project tooling is read-only: it can index source and generate diff previews, but it does not write source files.
- MCP project scans skip `.git`, `node_modules`, and secret-looking files.
- Patch previews are advisory and require human review.

## v1 Limitations

- No automatic source-code mutation.
- Framework adapters provide source hints, but AST-safe framework patches are not generated automatically yet.
- Tailwind export is conservative and does not inspect existing source classes.
- Cross-origin iframe inspection is not supported.
- Accessibility checks are intentionally lightweight and do not replace a full audit.
