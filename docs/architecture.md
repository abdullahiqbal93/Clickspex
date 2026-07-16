# Architecture

Clickspex is a pnpm monorepo with browser, shared, Node CLI, and MCP packages. Browser code owns live-page interaction. Shared/core packages own stable data contracts and pure utilities. Local tools consume the same contracts without reaching into Chrome APIs.

## Packages

- `apps/extension`: Chrome MV3 extension, side panel UI, background service worker, content script, element picker, overlays, and temporary style injection.
- `apps/cli`: `clickspex` local project utility for init, project detection, source indexing, patch previews, and example change-intent export.
- `apps/mcp-server`: read-only MCP stdio server for project scans, framework detection, source indexes, summaries, export generation, and patch previews.
- `packages/shared`: runtime message guards, `UIChangeIntent`, `PatchSuggestion`, adapter interfaces, and shared snapshot types.
- `packages/core`: browser-independent utilities for selectors, snapshots, style diffs, contrast, box model extraction, measurements, accessibility notes, project detection, and bounded source indexing.
- `packages/adapters`: CSS and Tailwind export/patch-preview adapters plus framework adapters that provide source-aware review hints without AST-safe automatic edits.
- `packages/config`: shared TypeScript, Vitest, ESLint, and Prettier configuration.

## MV3 Message Routing

```mermaid
sequenceDiagram
  participant SP as Side panel
  participant BG as Background service worker
  participant CS as Content script
  participant Page as Active tab

  SP->>BG: connect runtime port
  SP->>CS: send picker/style/measure commands through active tab messaging
  CS->>Page: read DOM, inject overlay, inject temporary style tag
  CS->>BG: post selected/hovered element messages
  BG->>SP: forward validated extension messages to connected side panel ports
```

The background service worker is deliberately stateless. It keeps only a transient set of connected side panel ports for routing. Selection state, undo/redo stacks, and export data live in the side panel store or content-script session.

## Overlay And Style Isolation

The content script creates a single Shadow DOM host named `__clickspex-host__` for visual overlays. Overlay CSS is scoped inside the shadow root, so the inspected page does not receive extension classes or global overlay styles.

Temporary user edits are injected into one page style tag named `__clickspex-styles__`. The style injector rewrites rules for the current session, supports undo, redo, and reset, and does not persist changes to the source application.

## Adapter Boundary

Adapters accept a `UIChangeIntent` and optional `ProjectContext`. CSS and Tailwind adapters generate exports plus file-specific patch previews when indexed source content is available. Framework adapters use dependency/config signals and indexed DOM metadata to point at likely source files, but they do not generate AST-safe framework edits yet.

## Source Index Boundary

The project scanner indexes only known source/style extensions and skips dependency folders, build outputs, secret-looking files, and oversized files. Public summary tools return metadata only. Patch-preview flows can load source content internally to build advisory diffs, but neither the CLI nor MCP server writes source files.

## Test Isolation

Core and adapter utilities run in Vitest without Chrome. Extension-layer tests should mock Chrome APIs at the edge and keep pure routing logic separate from runtime globals. Browser APIs are isolated to extension entrypoints and Chrome helper modules.
