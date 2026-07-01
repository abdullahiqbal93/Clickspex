# Extension Permissions

The extension uses a small Manifest V3 permission set and avoids broad host permissions.

## activeTab

`activeTab` allows the side panel to send commands to the current active tab after the user interacts with the extension. It is used for element picking, style changes, reset, undo/redo, measurement, and export commands.

## sidePanel

`sidePanel` enables the Chrome side panel UI. The extension also calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so the extension action opens the panel.

## storage

`storage` is available for extension state that needs Chrome-managed persistence. Current product state is mostly session-scoped, but this permission supports future local preferences without requesting a new permission.

## Content Script Matches

The content script is registered for `http://*/*` and `https://*/*` so the picker and overlays are available on normal web pages. This is not a host permission grant for background access; content scripts run in matching pages and communicate through validated extension messages.

## Content Security Policy

Extension pages use `script-src 'self'; object-src 'self';`. Remote scripts are not allowed.

## Not Requested

The extension does not request `tabs`, `scripting`, `webRequest`, cookies, history, downloads, or broad background host permissions.
