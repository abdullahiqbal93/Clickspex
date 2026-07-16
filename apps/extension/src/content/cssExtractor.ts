import { generateUniqueSelector } from "@clickspex/core";

export type ElementCssExtraction = {
  css: string;
  html: string | null;
  /**
   * "authored" when the rules came from readable stylesheets, "computed" when
   * every stylesheet was cross-origin and we fell back to a computed-style diff
   * (approximate — resolved values, not the author's source).
   */
  source: "authored" | "computed";
};

const MAX_DESCENDANTS = 40;

// ── Authored-rule extraction (primary) ──────────────────────
// Walks same-origin stylesheets and collects the rules that actually match
// the element, exactly as the site author wrote them.

const stripPseudo = (selector: string): string =>
  selector.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").trim();

// Document-scope rules (`:root { --var: ... }`, `:host { ... }`, bare `*`)
// technically "match" every element but only define global variables or resets.
// They flood the extracted CSS with noise, so we never attribute them to a
// specific element.
const isGlobalScopeSelector = (selector: string): boolean => {
  const normalized = selector.trim().toLowerCase();
  return (
    normalized === "*" ||
    normalized === ":root" ||
    normalized === "html:root" ||
    normalized === ":host" ||
    normalized.startsWith(":host(") ||
    normalized.startsWith(":host-context(")
  );
};

const selectorMatches = (element: Element, selectorText: string): boolean =>
  selectorText.split(",").some((part) => {
    const selector = part.trim();

    if (selector.length === 0 || isGlobalScopeSelector(selector)) {
      return false;
    }

    try {
      if (element.matches(selector)) {
        return true;
      }
    } catch {
      /* invalid or unsupported selector */
    }

    // Retry with pseudo-classes/elements removed so :hover/:focus rules and
    // ::before styles are still captured - but only when a real compound
    // selector remains. A selector that strips down to "" or "*" (e.g. `:root`,
    // `:host`, `:focus-visible`) would otherwise match every element.
    if (/:/.test(selector)) {
      const stripped = stripPseudo(selector);

      if (stripped.length === 0 || stripped === "*") {
        return false;
      }

      try {
        return element.matches(stripped);
      } catch {
        return false;
      }
    }

    return false;
  });

const collectRulesFor = (
  element: Element,
  ruleList: CSSRuleList,
  conditionPrefix: string,
  out: string[],
  seen: Set<string>,
): void => {
  for (const rule of Array.from(ruleList)) {
    if (rule instanceof CSSStyleRule) {
      if (selectorMatches(element, rule.selectorText)) {
        const text =
          conditionPrefix.length === 0
            ? rule.cssText
            : `${conditionPrefix} {\n  ${rule.cssText.replaceAll("\n", "\n  ")}\n}`;

        if (!seen.has(text)) {
          seen.add(text);
          out.push(text);
        }
      }
      continue;
    }

    if (rule instanceof CSSMediaRule) {
      collectRulesFor(element, rule.cssRules, `@media ${rule.conditionText}`, out, seen);
      continue;
    }

    if (rule instanceof CSSSupportsRule) {
      collectRulesFor(element, rule.cssRules, `@supports ${rule.conditionText}`, out, seen);
    }
  }
};

const collectAuthoredRules = (element: Element, out: string[], seen: Set<string>): void => {
  for (const sheet of Array.from(element.ownerDocument.styleSheets)) {
    let cssRules: CSSRuleList;

    try {
      cssRules = sheet.cssRules;
    } catch {
      continue; // cross-origin stylesheet
    }

    collectRulesFor(element, cssRules, "", out, seen);
  }

  if (element instanceof HTMLElement && element.style.length > 0) {
    const inline = `${generateUniqueSelector(element)} {\n  /* inline style attribute */\n  ${element.style.cssText.trim()}\n}`;

    if (!seen.has(inline)) {
      seen.add(inline);
      out.push(inline);
    }
  }
};

// ── Computed-diff extraction (fallback) ─────────────────────
// Used when every stylesheet is cross-origin. Diffs computed styles against a
// pristine element of the same tag and filters derived/duplicate properties.

let defaultsFrame: HTMLIFrameElement | null = null;

const ensureDefaultsDocument = (): Document | null => {
  if (defaultsFrame !== null && defaultsFrame.contentDocument !== null) {
    return defaultsFrame.contentDocument;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.display = "none";
  document.documentElement.append(iframe);
  defaultsFrame = iframe;
  return iframe.contentDocument;
};

const defaultStyleCache = new Map<string, Record<string, string>>();

const getDefaultStyles = (tagName: string): Record<string, string> | null => {
  const cached = defaultStyleCache.get(tagName);

  if (cached !== undefined) {
    return cached;
  }

  const doc = ensureDefaultsDocument();

  if (doc === null || doc.body === null || doc.defaultView === null) {
    return null;
  }

  const probe = doc.createElement(tagName);
  doc.body.append(probe);
  const styles = doc.defaultView.getComputedStyle(probe);
  const record: Record<string, string> = {};

  for (let index = 0; index < styles.length; index += 1) {
    const property = styles.item(index);
    record[property] = styles.getPropertyValue(property);
  }

  probe.remove();
  defaultStyleCache.set(tagName, record);
  return record;
};

/** Derived/duplicate properties that only add noise to extracted CSS. */
const NOISY_PROPERTIES = new Set([
  "block-size",
  "inline-size",
  "min-block-size",
  "min-inline-size",
  "max-block-size",
  "max-inline-size",
  "perspective-origin",
  "transform-origin",
  "caret-color",
  "column-rule-color",
  "row-rule-color",
  "text-emphasis-color",
  "text-decoration-color",
  "outline-color",
  "text-size-adjust",
  "tab-size",
  "border-image-source",
  "interactivity",
]);

const NOISY_PREFIXES = [
  "--",
  "-webkit-",
  "-moz-",
  "border-block",
  "border-inline",
  "margin-block",
  "margin-inline",
  "padding-block",
  "padding-inline",
  "inset-block",
  "inset-inline",
  "view-",
  "anchor-",
];

const isNoiseProperty = (property: string): boolean =>
  NOISY_PROPERTIES.has(property) || NOISY_PREFIXES.some((prefix) => property.startsWith(prefix));

const computedStyleDeclarations = (element: Element): string[] => {
  const view = element.ownerDocument.defaultView;

  if (view === null) {
    return [];
  }

  const styles = view.getComputedStyle(element);
  const defaults = getDefaultStyles(element.tagName.toLowerCase());
  const declarations: string[] = [];

  for (let index = 0; index < styles.length; index += 1) {
    const property = styles.item(index);

    if (isNoiseProperty(property)) {
      continue;
    }

    const value = styles.getPropertyValue(property);

    if (defaults !== null && defaults[property] === value) {
      continue;
    }

    declarations.push(`  ${property}: ${value};`);
  }

  return declarations;
};

// ── Shared helpers ──────────────────────────────────────────

const relativeSelector = (root: Element, element: Element): string => {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current !== null && current !== root) {
    const parent: Element | null = current.parentElement;

    if (parent === null) {
      break;
    }

    const index = Array.from(parent.children).indexOf(current) + 1;
    segments.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parent;
  }

  return segments.join(" > ");
};

const cleanedOuterHtml = (element: Element): string => {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("script, style").forEach((node) => node.remove());
  clone.removeAttribute("data-cs-source-target");
  clone
    .querySelectorAll("[data-cs-source-target]")
    .forEach((node) => node.removeAttribute("data-cs-source-target"));
  return clone.outerHTML;
};

/**
 * Extract the CSS affecting an element (optionally with its descendants and
 * cleaned HTML). Prefers the author's own stylesheet rules; falls back to a
 * filtered computed-style diff when stylesheets are cross-origin.
 */
export const extractElementCss = (
  element: Element,
  includeChildren: boolean,
): ElementCssExtraction => {
  const rules: string[] = [];
  const seen = new Set<string>();

  collectAuthoredRules(element, rules, seen);

  const targets = includeChildren
    ? Array.from(element.querySelectorAll("*")).slice(0, MAX_DESCENDANTS)
    : [];

  for (const child of targets) {
    collectAuthoredRules(child, rules, seen);
  }

  let source: ElementCssExtraction["source"] = "authored";

  // Fallback: no readable stylesheet matched anything (e.g. all cross-origin).
  if (rules.length === 0) {
    source = "computed";
    const rootSelector = generateUniqueSelector(element);
    rules.push(`${rootSelector} {\n${computedStyleDeclarations(element).join("\n")}\n}`);

    for (const child of targets) {
      const declarations = computedStyleDeclarations(child);
      const suffix = relativeSelector(element, child);

      if (declarations.length === 0 || suffix.length === 0) {
        continue;
      }

      rules.push(`${rootSelector} > ${suffix} {\n${declarations.join("\n")}\n}`);
    }
  }

  return {
    css: rules.join("\n\n"),
    html: includeChildren ? cleanedOuterHtml(element) : null,
    source,
  };
};
