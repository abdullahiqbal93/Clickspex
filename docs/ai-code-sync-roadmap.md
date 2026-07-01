# AI Code Sync Roadmap

The v1 implementation exports structured UI intent and read-only suggestions. Real code patching is intentionally deferred until adapters can prove they understand a project safely.

## Phase 1: Current Read-Only Sync

- Capture `UIChangeIntent` from the browser extension.
- Export CSS, Tailwind, JSON, and Markdown from the side panel.
- Detect local project frameworks and styling tools through the CLI and MCP server.
- Produce advisory patch suggestions without writing source files.

## Phase 2: Source-Aware Discovery

- Build a project index that maps routes, components, stylesheets, and class usage.
- Connect selected DOM metadata to likely source files through sourcemaps, framework dev metadata, or user confirmation.
- Add adapter-specific confidence thresholds before any patch suggestion can become actionable.

## Phase 3: Human-Reviewed Patches

- Generate file-specific patches for CSS modules, plain CSS, and Tailwind class changes.
- Show exact changed files, diff previews, confidence, warnings, and rollback instructions.
- Require explicit user approval before applying patches.
- Keep all generated patches small and reversible.

## Phase 4: Framework Adapters

- React/Next.js: map component source and JSX class/style props.
- Vue/Svelte: map single-file component templates and scoped styles.
- Angular: map component templates and stylesheets.
- Design-system adapters: add library-aware suggestions for shadcn/ui, MUI, styled-components, and SCSS.

## Phase 5: Verification Loop

- Rebuild and typecheck after patches.
- Optionally reload the extension session and compare a fresh snapshot against the intended `UIChangeIntent`.
- Record applied patch metadata so changes can be audited or reverted.
