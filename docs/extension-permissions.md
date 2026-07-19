# Extension permission justification

This document records the shipped Chrome extension permissions for Web Store review and future audits.

## Required permissions

1. `activeTab`
   - Used only after the user opens the side panel or starts an inspection action.
   - Required for user-initiated screenshot capture and for injecting/recovering the content script in the inspected tab.

2. `sidePanel`
   - Required to provide the Clickspex side panel UI.

3. `storage`
   - Used for session-scoped pairing tokens, inspected-page context, and temporary in-progress edit state.
   - Persistent source code is not stored in extension storage.

4. `scripting`
   - Used for user-initiated content-script recovery, technology detection, and component-source lookup in the inspected tab.

## Host permissions

The extension declares only:

- `http://*/*`
- `https://*/*`

These match the content-script surface and intentionally exclude `file://`, browser-internal pages, and the previous `<all_urls>` grant. The local Code Sync bridge uses `http://127.0.0.1` or `http://localhost`, which are covered by the HTTP host pattern.

## Permission boundaries

- Restricted browser pages are rejected before messaging.
- Source writes remain behind the explicit experimental Code Sync write flag.
- Broader host access must not be added without updating this document and the manifest together.

## Store listing

- Chrome Web Store extension ID: `dcnamgaackjkhmegicgafmickfoeodke`.
- Remote code: **No** — the manifest CSP is `script-src 'self'` and all executable code ships inside the package.
- Data collection: **None** — no data is collected or transmitted; all processing is local. See [PRIVACY.md](../PRIVACY.md) (published at `docs/privacy-policy.html`).
