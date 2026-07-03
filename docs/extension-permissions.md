# Extension Permissions

The extension uses a small Manifest V3 permission set and avoids broad host permissions.

## activeTab

`activeTab` allows the side panel to send commands to the current active tab after the user interacts with the extension. It is used for element picking, style changes, reset, undo/redo, measurement, and export commands.

## sidePanel

`sidePanel` enables the Chrome side panel UI. The extension also calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so the extension action opens the panel.

## storage

`storage` is available for extension state that needs Chrome-managed persistence. Current product state is mostly session-scoped, but this permission supports future local preferences without requesting a new permission.

## scripting

`scripting` powers two features that must run in the page's MAIN JavaScript world (content scripts are isolated and cannot see page globals):

- **Find source**: reads React fiber `_debugSource` / Vue `__file` metadata from the element the user marked, to open the component in the editor.
- **Page tech detection**: inspects page globals (`__REACT_DEVTOOLS_GLOBAL_HOOK__`, `__NEXT_DATA__`, `Livewire`, `Alpine`, ...) and DOM markers.

Both are one-shot, user-initiated function injections. No remote code is ever injected.

## host_permissions (http/https)

`host_permissions: ["http://*/*", "https://*/*"]` mirrors the content-script match list. It exists because `chrome.scripting.executeScript` and `chrome.tabs.captureVisibleTab` (element screenshots) require host access to the page, and the transient `activeTab` grant expires on navigation, which made those features fail intermittently. The scope granted is the same set of pages the content script already runs on.

## Content Script Matches

The content script is registered for `http://*/*` and `https://*/*` so the picker and overlays are available on normal web pages. This is not a host permission grant for background access; content scripts run in matching pages and communicate through validated extension messages.

## Content Security Policy

Extension pages use `script-src 'self'; object-src 'self';`. Remote scripts are not allowed.

## Not Requested

The extension does not request `tabs`, `webRequest`, `cookies`, `history`, or `downloads`.
