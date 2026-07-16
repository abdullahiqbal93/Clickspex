# Clickspex

Clickspex is a Chrome Manifest V3 extension for inspecting live UI, making temporary visual edits, measuring layout, checking lightweight accessibility signals, and exporting those changes as structured `UIChangeIntent` data.

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
- `clickspex` CLI for local init, project detection, source indexing, patch previews, and example change-intent export.
- Read-only MCP server for project scanning, framework detection, summaries, exports, and patch previews.

## Workspace

```text
apps/extension      Chrome extension and side panel UI
apps/cli            Local Clickspex CLI
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
pnpm --filter @clickspex/extension dev
```

Production bundle:

```bash
pnpm --filter @clickspex/extension build
```

Load `apps/extension/dist` in Chrome via `chrome://extensions` -> Developer mode -> Load unpacked.

## Code Sync (one-click apply)

Once published, developers do not touch this repo. They install the extension from the Chrome Web
Store, then run the bridge in their own project with **zero install**:

```bash
npx clickspex connect
# open the app in Chrome -> Clickspex side panel -> edit -> Export -> Code sync -> Apply
```

The bridge is a localhost-only server scoped to `--path` (default port `7317`, current directory).
In the extension, open **Export -> Code sync**: it detects the bridge, shows the connected project,
and gives you **Preview diff** and **Apply to code**. Apply is guarded: it only writes matched
stylesheet files, backs up the originals to `.clickspex/backups/`, and offers a one-click **Undo**.
CSS edits are written today; framework adapters stay preview-only.

Other launch styles:

```bash
clickspex connect --path . --open http://localhost:3000   # open the app automatically
npm i -g clickspex && clickspex connect                    # global install instead of npx
```

## CLI

```bash
npx clickspex connect                                      # start the code-sync bridge
npx clickspex detect --path .                              # report detected frameworks
npx clickspex index --path .                               # build a bounded source index
npx clickspex preview-session --session session.json --project .
```

During development in this monorepo, run the local build first:

```bash
pnpm --filter clickspex build
pnpm connect --path .                                     # builds + starts the bridge here
```

## MCP Server

```bash
pnpm --filter @clickspex/mcp-server build
node apps/mcp-server/dist/index.js
```

The MCP server exposes read-only tools only. See `docs/mcp-tools.md` for tool signatures and examples.

## Publishing

Two artifacts ship to users: the **CLI** (npm) and the **extension** (Chrome Web Store).

**CLI -> npm.** The `clickspex` package bundles its internal `@clickspex/*` packages into a single
self-contained binary (via tsup), so `npx clickspex` needs nothing else on npm. To cut a release:

```bash
pnpm install          # first time, to fetch tsup
pnpm typecheck        # type-safe across all packages
pnpm test             # unit tests incl. the bridge apply/rollback
pnpm release:cli      # builds, bundles (prepack), and publishes `clickspex`
```

`pnpm --filter clickspex bundle` produces the standalone `apps/cli/dist/index.js` if you want to
inspect the artifact before publishing. If the unscoped name `clickspex` is taken on npm, publish
under a scope (e.g. `@your-org/clickspex`); the command then becomes `npx @your-org/clickspex connect`.

**Extension -> Chrome Web Store.** Build and zip the unpacked build, then upload it in the Web Store
developer dashboard:

```bash
pnpm --filter @clickspex/extension build
# Windows:  Compress-Archive -Path apps/extension/dist/* -DestinationPath clickspex-extension.zip
# macOS/Linux:  (cd apps/extension/dist && zip -r ../../../clickspex-extension.zip .)
```

The manifest, permissions, and icons are already in place; the store listing (name, description,
screenshots) is added in the dashboard.

## Documentation

- `CONTRIBUTING.md` — setup, workflow, and conventions for contributors
- `docs/product-spec.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/extension-permissions.md`
- `docs/mcp-tools.md`
- `docs/ai-code-sync-roadmap.md`
- `docs/git-workflow.md`

## Security And Safety

- Overlay UI is isolated in a Shadow DOM host, injected only when inspection actually starts.
- In-browser edits are injected through page style tags; CSS/raw-CSS edits are persisted per URL in `chrome.storage.session` so a reload doesn't lose work.
- The Code Sync bridge (`clickspex connect`) listens on `127.0.0.1` and only accepts requests whose origin is `chrome-extension://…` — arbitrary websites cannot reach it to read or write your source.
- Applying to source is guarded: it writes only matched stylesheet files inside the project root, backs up originals to `.clickspex/backups/`, and offers a one-click undo.
- The MCP server is read-only: it can index source and generate diff previews, but it does not write files.
- Project scans skip `.git`, `node_modules`, and secret-looking files.

## v1 Limitations

- Source mutation is CSS-only (via the Code Sync bridge); framework/Tailwind edits are preview-only until AST-safe patches land.
- Structural edits (DOM moves, deletes, text, image swaps) are captured and exported but not written to source or persisted across reloads.
- Tailwind export is conservative and does not inspect existing source classes.
- Cross-origin iframe inspection is not supported; extracted CSS falls back to computed values (flagged in the UI) for cross-origin stylesheets.
- Accessibility checks are intentionally lightweight and do not replace a full audit.
