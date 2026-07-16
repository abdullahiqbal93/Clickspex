# AI Code Sync Roadmap

The implementation now supports read-only source discovery and human-reviewed patch previews. It still does not automatically mutate source files: every generated diff is advisory until a developer applies it.

## Phase 1: Browser Intent Capture

Implemented:

- Capture `UIChangeIntent` from the browser extension.
- Export CSS, Tailwind, JSON, and Markdown from the side panel.
- Keep temporary edits scoped to the active tab through injected CSS, undo, redo, and reset.

## Phase 2: Source-Aware Discovery

Implemented:

- Build a bounded project index for routes, components, stylesheets, selectors, class names, ids, and imports.
- Skip dependency folders, build outputs, secret-looking files, and oversized files.
- Expose source discovery through the CLI `index` command and the MCP `index_project` tool.
- Match captured DOM metadata to likely source files by id, class names, text preview, file kind, and framework signals.

Still future work:

- Sourcemap-aware matching.
- Framework dev-metadata integration.
- User-confirmed source mapping when confidence is low.

## Phase 3: Human-Reviewed Patches

Implemented:

- Generate file-specific CSS patch previews when an indexed stylesheet is available.
- Generate file-specific Tailwind class attribute previews when an indexed component or route is available.
- Show changed files, diff previews, confidence, warnings, and manual review steps.
- Capture the full multi-element session (styles, raw CSS, and structural edits), not just the last-selected element.
- Guarded apply for CSS: `clickspex connect` runs a localhost bridge; the extension's Code Sync panel previews the diff and writes matched stylesheet files on explicit confirmation.
- Rollback: every apply writes originals to `.clickspex/backups/<id>/` with a manifest, and the bridge exposes a one-click Undo that restores them.
- Cumulative edits: multiple elements mapping to the same stylesheet stack instead of overwriting.

Still future work:

- Extend guarded apply to Tailwind class edits and framework components (currently CSS-only).
- Richer conflict detection for Tailwind utility replacement/removal.
- Multi-backup history browser and per-file selective rollback.

## Phase 4: Framework Adapters

Implemented:

- React/Next.js, Vue, Svelte, Angular, shadcn/ui, MUI, CSS Modules, SCSS, and styled-components adapters detect project signals and return source-aware review hints when indexed source is available.

Still future work:

- AST-safe React/Next JSX prop edits.
- Vue/Svelte single-file component template and scoped-style edits.
- Angular template/style edits.
- Library-aware transforms for design-system APIs.

## Phase 5: Verification Loop

Implemented:

- Workspace build, typecheck, lint, and tests validate generated package outputs.
- CLI and MCP can generate preview data for human review.

Still future work:

- Optional extension-session reload and fresh snapshot comparison against the intended `UIChangeIntent`.
- Stored audit history for applied patches once source mutation is introduced.
