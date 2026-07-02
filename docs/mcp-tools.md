# MCP Tools

The MCP server runs as a local stdio process from `apps/mcp-server`. It is read-only: tools inspect project metadata, build bounded source indexes, or generate suggestions from supplied JSON, but they do not write source files.

Start it after building:

```bash
pnpm --filter @ui-buddy/mcp-server build
node apps/mcp-server/dist/index.js
```

All tool results use this wrapper:

```ts
type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
};
```

## scan_project

Input:

```json
{ "path": "E:/Dev/AI Projects/ui-buddy" }
```

Returns a shallow file listing up to depth 2. It skips `node_modules`, `.git`, and filenames that look like secrets, credentials, tokens, keys, or `.env` files.

## detect_framework

Input:

```json
{ "path": "E:/Dev/AI Projects/ui-buddy" }
```

Returns the same framework and tooling detection report used by the CLI, including package manager, config files, source directories, indexed file summaries, index stats, and confidence-scored detections.

## index_project

Input:

```json
{ "path": "E:/Dev/AI Projects/ui-buddy" }
```

Builds a bounded source index and returns file metadata: path, kind, size, selectors, class names, ids, and imports. Source contents are not returned by this tool.

## read_project_summary

Input:

```json
{ "path": "E:/Dev/AI Projects/ui-buddy" }
```

Returns root path, package name/version when available, dependencies, devDependencies, detected config files, source directories, indexed file summaries, and index stats.

## generate_export_from_change_intent

Input:

```json
{ "changeIntent": { "id": "...", "timestamp": "..." } }
```

The full `changeIntent` must match the `UIChangeIntent` schema from `packages/shared`. Returns CSS and Tailwind adapter exports.

## preview_patch_suggestions

Input without source context:

```json
{ "changeIntent": { "id": "...", "timestamp": "..." } }
```

Input with source-aware previews:

```json
{
  "projectPath": "E:/Dev/AI Projects/ui-buddy",
  "changeIntent": { "id": "...", "timestamp": "..." }
}
```

Returns patch suggestions from CSS, Tailwind, and framework adapters. When `projectPath` is supplied, the server indexes source internally and may return file-specific CSS diffs, Tailwind class attribute diffs, and framework source review hints. Suggestions remain advisory and are not applied automatically.

## Security Notes

- The server resolves local paths but does not write files.
- Secret-looking files, dependency folders, build outputs, and oversized files are skipped by project scans and indexes.
- Generated patch previews are advisory and should be reviewed before manual application.
- Do not expose this stdio server as a network service without adding authentication, path allowlists, and audit logging.
