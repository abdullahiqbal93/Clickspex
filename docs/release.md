# Release process

Clickspex ships as two user-facing artifacts: the `clickspex` npm CLI package and the Chrome extension ZIP. Release automation must keep those artifacts, the MCP server, and the shared bridge protocol on the same product version.

## Version management

Use Changesets for every release-affecting change:

```bash
pnpm changeset
pnpm version:packages
```

The Changesets configuration fixes all workspace packages together. This avoids subtle mismatches between the CLI, extension, bridge protocol types, adapters, core utilities, and MCP server.

Before cutting a release, run:

```bash
pnpm release:check
```

This verifies:

- every package version matches the root product version;
- the Chrome extension manifest version matches the package version;
- the CLI `PRODUCT_VERSION`, bridge health version, and MCP server version match;
- the bridge imports the shared `BRIDGE_PROTOCOL_VERSION`;
- CI includes release consistency and high-severity dependency-audit gates.

## Release artifacts

Generate release artifacts from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm release:artifacts
```

The command builds the monorepo, verifies version consistency, packs the CLI, creates a deterministic extension ZIP, generates a CycloneDX SBOM, and writes checksums/provenance under `artifacts/`.

Expected outputs:

- `artifacts/clickspex-cli-<version>.tgz`
- `artifacts/clickspex-extension-<version>.zip`
- `artifacts/clickspex-sbom.cdx.json`
- `artifacts/CHECKSUMS.sha256`
- `artifacts/clickspex-provenance.json`

`artifacts/` is intentionally ignored by Git. Attach these files to the release rather than committing them.

## Documentation source of truth

Use this table when updating docs, release notes, or store listings.

| Topic                           | Shipped behavior                                                                                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source writes                   | The browser extension cannot write local files directly. The local `clickspex connect` bridge can write only when explicitly started with `--enable-code-sync-writes`; otherwise preview/export remain available and apply/rollback are refused.            |
| Supported automatic write files | Plain `.css` files only, based on immutable preview artifacts and content-hash binding. SCSS, Sass, Less, CSS Modules, Tailwind, framework component files, and CSS-in-JS are preview/review only.                                                          |
| Authentication and pairing      | The bridge listens on `127.0.0.1`, accepts `chrome-extension://` origins only (pin one with `--extension-id`), requires a one-time pairing code (locked after 5 failed attempts), and then requires `Authorization: Bearer <token>` for protected requests. |
| Preview/apply guarantees        | Apply must reference a preview artifact created by the same bridge instance, project identity, protocol version, request hash, source file path, and source hash. Stale or missing previews are rejected.                                                   |
| Backup and rollback             | Writes are transactional and backed up under `.clickspex/backups/`. Rollback refuses invalid IDs and source files that changed after apply. Backups are local project files, not cloud recovery.                                                            |
| Permissions and privacy         | Chrome permissions are documented in `docs/extension-permissions.md`. The extension uses active-tab/page access for inspection and does not expose the local bridge to arbitrary websites.                                                                  |
| Unsupported frameworks          | Framework-specific source edits remain review-only unless a parser and tests have been added for that file type. Unsupported contexts should produce preview hints, not automatic writes.                                                                   |

## Production release gate

Do not enable or advertise production source writing until all of these are true:

1. Fresh install, format, lint, typecheck, tests, builds, extension validation, packed CLI smoke, release consistency, and high-severity audit pass on Windows and Linux.
2. All P0 security and correctness tests pass.
3. Preview/apply hash binding is implemented and covered by tests.
4. Writes and rollback are transactional and covered by conflict tests.
5. Multi-tab and multi-window extension tests pass.
6. No high-severity dependency advisories remain.
7. Permissions, privacy notes, and documentation match shipped behavior.
8. A real external-project beta completes without source corruption.

Until this gate is complete, source writes stay disabled by default and are beta-only behind the explicit bridge flag.
