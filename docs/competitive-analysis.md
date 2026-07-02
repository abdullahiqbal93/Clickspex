# ui-buddy — Competitive Analysis & Roadmap

Audit date: 2026-07-02. Competitors reviewed: VisBug, CSS Scan, Wappalyzer, LocatorJS, WhatFont, Dimensions, ColorZilla.

## 1. Where ui-buddy stands today

ui-buddy already covers, in a single extension, what most competitors do as single-purpose tools: element inspection with computed styles and box model (WhatFont/CSS Scan territory), live style editing with pseudo-states, undo/redo and animation presets (beyond VisBug's editing), measurement + alignment + manual ruler (Dimensions territory), page palette/typography/asset scanning (ColorZilla/WhatFont/CSS Scan territory), lightweight a11y checks (VisBug territory), and — uniquely — structured `UIChangeIntent` export with CSS/Tailwind adapters, a project-indexing CLI, and a read-only MCP server that turns browser edits into source-aware patch previews. No competitor has that last pipeline.

## 2. Feature comparison

| Capability | VisBug | CSS Scan | Wappalyzer | LocatorJS | WhatFont | Dimensions | ColorZilla | ui-buddy |
|---|---|---|---|---|---|---|---|---|
| Hover-inspect styles | ✔ | ✔✔ (instant CSS window) | — | — | fonts only | — | — | ✔ |
| Copy full CSS of element (+children, pseudo, media queries) | partial | ✔✔ | — | — | — | — | — | partial (changed styles only) |
| Copy element HTML+CSS as component | — | ✔ | — | — | — | — | — | ✖ |
| Live visual editing (drag, resize, text, images) | ✔✔ | edit-in-window | — | — | — | — | — | ✔ (move/nudge/text/image/styles) |
| Design-tool hotkeys / multi-select | ✔✔ | — | — | — | — | — | — | ✖ |
| Measure distances between elements | ✔ | ✔ | — | — | — | ✔✔ (cursor-based) | — | ✔ |
| Element→source-code jump (IDE) | — | — | — | ✔✔ | — | — | — | ✖ (CLI hints only) |
| Framework/tech detection on page | — | — | ✔✔ | ✔ (component names) | — | — | — | ✖ in browser (CLI/MCP only, local project) |
| Font identification | partial | ✔ | — | — | ✔✔ | — | — | ✔ |
| Color picker / palette extraction | ✔ | ✔ | — | — | — | — | ✔✔ (history, gradients) | ✔ (+EyeDropper) |
| CSS→Tailwind conversion | — | ✔ (Pro) | — | — | — | — | — | ✔ (conservative) |
| Accessibility checks | ✔ (contrast, a11y overlays) | — | — | — | — | — | — | ✔ (contrast, labels, alt) |
| Structured change export (JSON intent) | — | — | — | — | — | — | — | ✔✔ unique |
| Source-aware patch preview (CLI/MCP) | — | — | — | — | — | — | — | ✔✔ unique |
| AI-agent integration (MCP) | — | — | — | — | — | — | — | ✔✔ unique |

## 3. Missing features (ranked)

1. **Copy full computed/authored CSS of any element** — CSS Scan's core value. ui-buddy only exports *changed* styles. Add "Copy element CSS" (all relevant computed styles + optionally children and matched CSS rules via `element.matchedCSSRules`-style extraction from stylesheets).
2. **Element → component/source jump (LocatorJS)** — read React/Vue/Svelte devtools hooks (`__REACT_DEVTOOLS_GLOBAL_HOOK__`, fiber `_debugSource`) to show component name in the inspector and open `vscode://` links. This pairs perfectly with the existing CLI project index: ui-buddy could map a picked element to the indexed source file with far better confidence than class-name matching alone.
3. **Page tech detection (Wappalyzer-lite)** — the CLI already detects frameworks from package.json; the extension detects nothing on the live page. A lightweight detector (global variables, meta tags, script srcs) would show "React 18 + Tailwind + Next.js" in the panel and would also improve adapter confidence automatically.
4. **Copy HTML+CSS of a component** — extract subtree markup with inlined relevant styles for handoff to a sandbox or an AI agent.
5. **Multi-select and design-tool hotkeys (VisBug)** — VisBug's killer interaction model: arrow keys to walk siblings/parents (partially present), shift-click multi-select, batch alignment/spacing.
6. **Color history & gradient generator (ColorZilla)** — EyeDropper exists; add a persistent picked-color history and a gradient CSS generator in the Palette tab.
7. **Screenshot/annotate an element state** — quick capture of the edited element (before/after) for sharing; competitors are weak here, low-hanging fruit.
8. **Responsive/breakpoint preview** — apply and preview changes per media query (CSS Scan copies media queries; VisBug works at any size).
9. **Full-page a11y sweep** — current checks are per-element; a page-wide scan (all images without alt, all low-contrast text, tab order) would leapfrog VisBug's a11y tool.
10. **Undo for element delete** — Delete currently hides an element with no history entry to restore it (Restore only fixes moves).

## 4. Existing features to improve

- **Selector durability**: prefer `data-testid`/stable attributes (already done) but add a warning score in exports when a selector relies on nth-of-type, and record 2–3 fallback selectors in `UIChangeIntent`.
- **Contrast checking**: now skips unknown/transparent backgrounds (fixed); next step is walking up ancestors to compute the effective background so more elements get a real ratio instead of "Unknown".
- **Tailwind adapter coverage**: the value→class map is very conservative (no arbitrary values). Emit `w-[123px]`-style arbitrary values with a warning instead of "no mapping".
- **Page scan depth**: now time-budgeted at 5,000 elements (fixed, was 150); consider sampling below-the-fold elements via `IntersectionObserver` for even better palettes on long pages.
- **Asset downloads**: cross-origin images can't be force-downloaded with `<a download>`; add the `downloads` permission (optional) or route through fetch in the content script.
- **Export panel**: offer file download (.json/.css/.md), not just clipboard.
- **Onboarding**: a short interactive tour; competitors with strong ratings (CSS Scan, VisBug) invest heavily in first-run UX.

## 5. What makes ui-buddy unique — and how to win

The seven competitors are all *read* or *tweak* tools: they end at the clipboard. ui-buddy's pipeline (browser edit → structured intent → project index → source-aware patch preview → MCP) is the only one that closes the loop from "pixel tweak in the browser" to "reviewable diff in the repo". In 2026, with Figma MCP, agentic IDEs, and design-to-code workflows going mainstream, this is exactly the seam the market is moving toward — and none of the incumbent extensions sit on it.

Positioning: **"The inspector that ends in a pull request."**

Priority bets, in order:

1. **Deepen the MCP/agent story** (moat): let an AI agent read pending `UIChangeIntent`s from the extension in real time (native messaging or local relay), so a developer tweaks a button in Chrome and asks Claude/Cursor "apply this to the codebase". This is the single most differentiated feature and nobody else can copy it quickly.
2. **Element→source jump** (adoption driver): LocatorJS-style clicking bridges the browser and the repo instantly, and feeds better data into patch confidence scoring.
3. **Copy-full-CSS + copy-component** (parity): removes the last reason to keep CSS Scan installed alongside.
4. **Page tech detection** (parity, cheap): removes the reason to keep Wappalyzer for front-end work and improves adapter selection.
5. **A11y page sweep** (differentiation vs. paid tools): contrast + labels + alt across the page, exportable as Markdown — pairs naturally with the intent/export pipeline.

One-tool consolidation (VisBug + CSS Scan + WhatFont + Dimensions + ColorZilla use cases) plus the unique code-sync pipeline is the winning combination: parity keeps users in the tool, the pipeline makes it irreplaceable.

## Sources

- [VisBug — GitHub (GoogleChromeLabs)](https://github.com/GoogleChromeLabs/ProjectVisBug), [Chrome Web Store](https://chromewebstore.google.com/detail/visbug/cdockenadnadldjbbgcallicgledbeoc)
- [CSS Scan](https://getcssscan.com/), [CSS Scan 4.0 (Gumroad)](https://gvrizzo.gumroad.com/l/cssscan), [Chrome Web Store](https://chromewebstore.google.com/detail/css-scan/gieabiemggnpnminflinemaickipbebg)
- [LocatorJS](https://www.locatorjs.com/), [GitHub](https://github.com/infi-pc/locatorjs)
- [Wappalyzer](https://www.wappalyzer.com/download), [Firefox add-on](https://addons.mozilla.org/en-US/firefox/addon/wappalyzer/)
- [BrowserStack: Best Chrome Extensions for Developers](https://www.browserstack.com/guide/chrome-extensions-for-web-developers) (WhatFont, ColorZilla, Dimensions)
- [Figma MCP server guide](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server), [Figma Dev Mode](https://www.figma.com/dev-mode/) (design-to-code trend)
