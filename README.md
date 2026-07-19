# Clickspex

Clickspex is a Chrome Manifest V3 extension for inspecting live UI, making temporary visual edits, measuring layout, checking lightweight accessibility signals, and exporting those changes as structured `UIChangeIntent` data.

The repo is intentionally conservative: the extension can prototype UI changes in the browser, while the CLI and MCP server inspect local projects and generate source-aware suggestions. By default, v1 does not edit source files. Experimental CSS-only source apply is available only when the local bridge is started with `--enable-code-sync-writes`.

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
apps/e2e            Playwright end-to-end suite (real Chromium + built extension)
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

- Node.js 22.13 or newer
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

## Code Sync

Once published, developers do not touch this repo. They install the extension from the Chrome Web Store, then run the bridge in their own project with zero install:

```bash
npx clickspex connect
# open the app in Chrome -> Clickspex side panel -> edit -> Export -> Code sync -> Preview diff
```

The bridge is a localhost-only server scoped to `--path` (default port `7317`, current directory). In the extension, open **Export -> Code sync**: it detects the bridge, shows the connected project, and provides **Preview diff** and export flows.

Source writes are disabled by default. To test guarded source apply, start the bridge explicitly with the write flag:

```bash
npx clickspex connect --enable-code-sync-writes
# Preview first, then Apply to code only after confirming the diff.
```

When writes are enabled, Apply is still guarded: it writes only matched plain `.css` stylesheet files inside the project root, backs up originals to `.clickspex/backups/`, and offers one-click rollback. Framework, Tailwind, SCSS, Sass, Less, CSS Modules, and CSS-in-JS edits remain preview/review-only.

Other launch styles:

```bash
clickspex connect --path . --open http://localhost:3000   # open the app automatically
npm i -g clickspex && clickspex connect                    # global install instead of npx
```

By default the bridge accepts any `chrome-extension://` origin (still gated by the pairing code and bearer token). To pin it to only the published extension, pass its Chrome Web Store ID:

```bash
clickspex connect --extension-id dcnamgaackjkhmegicgafmickfoeodke
```

## CLI

```bash
npx clickspex connect                                      # start the preview-only code-sync bridge
npx clickspex connect --enable-code-sync-writes            # enable experimental CSS apply/rollback
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

Clickspex releases are generated from the repository root. Release-affecting changes should include a Changeset so the CLI, extension, MCP server, shared protocol, core package, and adapters move together as one product version.

```bash
pnpm changeset          # describe a release-affecting change
pnpm version:packages   # apply pending Changesets before cutting a release
pnpm release:artifacts  # build, check versions, pack artifacts, generate SBOM/checksums
```

The release artifact command produces ignored files in `artifacts/`:

- `clickspex-cli-<version>.tgz` - self-contained npm CLI package.
- `clickspex-extension-<version>.zip` - deterministic Chrome extension ZIP built from `apps/extension/dist`.
- `clickspex-sbom.cdx.json` - CycloneDX SBOM for the workspace dependency graph.
- `CHECKSUMS.sha256` - SHA-256 checksums for release artifacts.
- `clickspex-provenance.json` - local provenance metadata including product versions, git commit, Node, package manager, and artifact hashes.

Before publishing, run the production release gate in [docs/release.md](docs/release.md). Source writes remain disabled by default and must not be marketed as production-safe until the full gate passes.

## Documentation

- `CONTRIBUTING.md` - setup, workflow, and conventions for contributors
- `docs/product-spec.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/extension-permissions.md`
- `docs/mcp-tools.md`
- `docs/ai-code-sync-roadmap.md`
- `docs/git-workflow.md`
- `docs/release.md`
- [`PRIVACY.md`](PRIVACY.md) - privacy policy (no data collected, all processing local)

## Security And Safety

- Overlay UI is isolated in a Shadow DOM host, injected only when inspection actually starts.
- In-browser edits are injected through page style tags; CSS/raw-CSS edits are persisted per URL in `chrome.storage.session` so a reload does not lose work.
- The Code Sync bridge (`clickspex connect`) listens on `127.0.0.1` and only accepts requests whose origin is `chrome-extension://...`; arbitrary websites cannot reach it to read or write your source.
- Source writes are disabled unless the bridge is started with `--enable-code-sync-writes`.
- When enabled, source apply is guarded: it writes only matched plain `.css` stylesheet files inside the project root, backs up originals to `.clickspex/backups/`, and refuses stale/conflicting operations.
- The MCP server is read-only: it can index source and generate diff previews, but it does not write files.
- Project scans skip `.git`, `node_modules`, build outputs, oversized files, and secret-looking files.

## v1 Limitations

- Source writes are disabled by default and are experimental even when enabled with `--enable-code-sync-writes`.
- Automatic source mutation is limited to matched plain `.css` files. Framework, Tailwind, SCSS, Sass, Less, CSS Modules, and CSS-in-JS edits are preview/review-only.
- Structural edits (DOM moves, deletes, text, image swaps) are captured and exported but not written to source or persisted across reloads.
- Tailwind export is conservative and does not inspect, merge, or remove existing source classes.
- Cross-origin iframe inspection is not supported; extracted CSS falls back to computed values for cross-origin stylesheets.
- Chrome internal pages, browser store pages, and other restricted pages cannot be inspected by extension content scripts.
- Accessibility checks are intentionally lightweight and do not replace a full WCAG audit.
- Backups are local project files under `.clickspex/backups/`; they are not cloud recovery or a replacement for Git.
