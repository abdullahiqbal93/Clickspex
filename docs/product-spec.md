# Product Spec

UI DevTools is a Chrome Manifest V3 extension for inspecting a live page, making temporary visual edits, measuring layout, and exporting the result as structured intent that another tool can review.

## Goals

- Let a developer select an element directly on a page.
- Capture a stable element snapshot: selector, DOM path, attributes, computed styles, box model, geometry, and parent layout context.
- Allow scoped, temporary style edits from the side panel.
- Support undo, redo, and reset for the current element session.
- Provide measurement overlays for selected elements.
- Surface lightweight accessibility notes for missing labels, missing image alt text, and simple foreground/background contrast.
- Export a `UIChangeIntent` plus CSS, conservative Tailwind classes, JSON, and Markdown.
- Provide local project detection through the CLI and a read-only MCP server.

## Non-Goals For v1

- The extension does not mutate source files.
- Framework patching is not automatic in v1.
- Tailwind export is conservative and value-based; it does not merge or remove existing classes.
- Cross-origin iframe inspection is not supported.
- Temporary style edits live in the page through an injected style tag and disappear on reload.

## Primary Workflow

1. Open the side panel.
2. Click Pick Element.
3. Select an element in the page.
4. Review the inspector, style, box model, measure, and accessibility panels.
5. Apply temporary visual edits.
6. Export the change intent or generated CSS/Tailwind output.

## Outputs

The central artifact is `UIChangeIntent`. It records page context, target metadata, before/after styles, individual style changes, box model data, and accessibility notes. Adapters can use that artifact to produce exports or patch suggestions.

`PatchSuggestion` is intentionally advisory. It includes an adapter id, confidence, explanation, files to change when known, a diff preview, warnings, and manual steps. In v1 the CSS and Tailwind adapters produce useful previews, while framework adapters return documented unsupported suggestions.

## Current Safety Boundary

The browser extension affects only the active tab through content scripts and the current extension side panel session. The CLI and MCP server inspect local project metadata and generate suggestions, but do not edit project source.
