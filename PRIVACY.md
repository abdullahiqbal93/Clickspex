# Clickspex Privacy Policy

_Last updated: July 19, 2026_

**In short:** Clickspex does not collect, transmit, sell, or share any personal data. There are no accounts, no analytics, no trackers, and no advertising. Everything the extension does runs locally in your browser, and no information is ever sent to the developer or to any third party.

## 1. Who this policy covers

This policy applies to the Clickspex browser extension ("Clickspex", "the extension", "we") and its optional companion command-line tool, the local Code Sync bridge. It explains what information the extension handles and, more importantly, what it does not.

## 2. Information we collect

**None.** Clickspex does not collect any personal or sensitive user data. We do not operate any server that receives your data, we do not use analytics or telemetry, we set no cookies, and we do not track your browsing. The extension has no sign-in and no account.

## 3. Information processed locally on your device

To do its job — inspecting and editing the page you are viewing — Clickspex reads and processes page content directly in your browser. This information is used only to display the inspector and your edits, and it never leaves your device. Specifically:

| What                                                                 | Why                                                          | Where it lives                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Selected element data (styles, box model, DOM structure, attributes) | To show you the inspector and let you edit styles            | In-memory in the side panel; never stored or sent          |
| In-progress edits for the current page                               | So your temporary edits survive a page reload while you work | `chrome.storage.session` (cleared when the browser closes) |
| Recent colors from the palette / eyedropper tool                     | Convenience history in the Palette panel                     | `chrome.storage.local` on your device                      |
| Screenshots of the active tab (only when you trigger a capture)      | To display and export a visual reference of your edits       | Held locally in the panel; never uploaded                  |
| Code Sync pairing token                                              | To authenticate to your own local bridge (see section 5)     | `chrome.storage.session` (cleared when the browser closes) |

None of this data is transmitted to the developer or any third party. It stays on your machine.

## 4. Permissions and how they are used

| Permission                                       | Use                                                                                                                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                                      | Grants temporary access to the tab you are inspecting, only after you start an inspection action, for user-initiated screenshots and helper scripts.                                      |
| `sidePanel`                                      | Displays the Clickspex user interface in Chrome's side panel.                                                                                                                             |
| `storage`                                        | Stores the local, session-scoped state described in section 3. No personal data is stored.                                                                                                |
| `scripting`                                      | Runs the extension's own bundled inspection code in the page you choose to inspect (framework detection, component-source lookup, content-script recovery).                               |
| `host_permissions` (`http://*/*`, `https://*/*`) | Lets you inspect any standard web page you choose, including your own localhost development servers. Excludes `file://` and browser-internal pages. No page data is transmitted anywhere. |

## 5. Code Sync (optional local bridge)

Clickspex includes an optional feature that can preview and apply your visual edits to your own source files. This works only if you separately install and run the open-source `clickspex connect` command-line tool inside your own project, on your own machine. When you use it:

- The bridge listens only on `127.0.0.1` (your local machine). It is never exposed to the internet, and arbitrary websites cannot reach it.
- You explicitly connect by entering a one-time pairing code shown in your own terminal.
- The extension sends your edits (such as selectors and CSS changes) to that local bridge so it can show a diff and, only if you explicitly enable writes, update your local files.
- This data travels only between the extension and your own machine. It is never sent to the developer or any third party.

## 6. Third parties, advertising, and analytics

Clickspex contains no advertising, no analytics, and no third-party tracking SDKs. It loads no remote code; all executable code ships inside the extension package. We do not sell or transfer any user data to third parties.

## 7. Data retention and deletion

Because nothing is collected or sent anywhere, there is no server-side data to retain or delete. Local state stored via `chrome.storage.session` is cleared when you close the browser. Palette history in `chrome.storage.local` remains until you clear it in the extension or uninstall Clickspex. Uninstalling the extension removes all of its local data.

## 8. Children's privacy

Clickspex is a developer tool intended for general audiences and is not directed to children under 13. It does not knowingly collect any information from anyone, including children.

## 9. Changes to this policy

If this policy changes, we will update the "Last updated" date above and publish the revised version. Material changes will be reflected here before they take effect.

## 10. Contact

Questions about this policy or Clickspex's privacy practices can be raised via the project's issue tracker: <https://github.com/abdullahiqbal93/Clickspex/issues>.
