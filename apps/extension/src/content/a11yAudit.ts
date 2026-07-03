import {
  contrastRatio,
  generateUniqueSelector,
  getEffectiveBackgroundColor,
  parseCssColor,
} from "@ui-buddy/core";

import type { A11yIssue } from "@ui-buddy/shared";

const MAX_ELEMENTS = 3000;
const MAX_ISSUES = 150;
const TIME_BUDGET_MS = 600;

const LABELLABLE_SELECTOR = "button, [role='button'], a[href], select, textarea";

const hasDirectText = (element: Element): boolean =>
  Array.from(element.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 2,
  );

const resolveLabelledBy = (element: Element): string => {
  const ids = (element.getAttribute("aria-labelledby") ?? "").trim();

  if (ids.length === 0) {
    return "";
  }

  return ids
    .split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? "")
    .join(" ")
    .trim();
};

const accessibleName = (element: Element): string =>
  (element.getAttribute("aria-label") ?? "").trim() ||
  resolveLabelledBy(element) ||
  (element.getAttribute("title") ?? "").trim() ||
  (element.textContent ?? "").trim() ||
  (element.querySelector("img[alt]")?.getAttribute("alt") ?? "").trim();

const inputAccessibleName = (input: HTMLInputElement): string => {
  const document = input.ownerDocument;
  const byFor = input.id.length > 0 ? document.querySelector(`label[for="${input.id}"]`) : null;

  return (
    (input.getAttribute("aria-label") ?? "").trim() ||
    resolveLabelledBy(input) ||
    (byFor?.textContent ?? "").trim() ||
    (input.closest("label")?.textContent ?? "").trim() ||
    (input.getAttribute("placeholder") ?? "").trim() ||
    (input.getAttribute("title") ?? "").trim()
  );
};

const contrastThreshold = (styles: CSSStyleDeclaration): number => {
  const fontSize = Number.parseFloat(styles.getPropertyValue("font-size"));
  const fontWeight = Number.parseFloat(styles.getPropertyValue("font-weight")) || 400;
  const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
  return isLarge ? 3 : 4.5;
};

/** Lightweight whole-page accessibility sweep. Not a full WCAG audit. */
export const runA11yAudit = (): A11yIssue[] => {
  const issues: A11yIssue[] = [];
  const startedAt = performance.now();
  const documentElement = document.documentElement;

  const pushIssue = (issue: A11yIssue): boolean => {
    issues.push(issue);
    return issues.length < MAX_ISSUES;
  };

  if ((documentElement.getAttribute("lang") ?? "").trim().length === 0) {
    pushIssue({
      id: "missing-lang",
      selector: "html",
      severity: "warning",
      title: "Missing document language",
      message: "The <html> element has no lang attribute, so screen readers must guess.",
    });
  }

  const seenIds = new Map<string, number>();

  for (const el of Array.from(document.querySelectorAll("[id]")).slice(0, MAX_ELEMENTS)) {
    seenIds.set(el.id, (seenIds.get(el.id) ?? 0) + 1);
  }

  for (const [id, count] of seenIds) {
    if (count > 1 && id.trim().length > 0) {
      if (
        !pushIssue({
          id: `duplicate-id-${id}`,
          selector: `[id="${id}"]`,
          severity: "warning",
          title: "Duplicate id",
          message: `The id "${id}" appears ${count} times. Duplicate ids break label and ARIA references.`,
        })
      ) {
        return issues;
      }
    }
  }

  let lastHeadingLevel = 0;

  for (const heading of Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))) {
    const level = Number.parseInt(heading.tagName.slice(1), 10);

    if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
      if (
        !pushIssue({
          id: `heading-skip-${level}-${issues.length}`,
          selector: generateUniqueSelector(heading),
          severity: "info",
          title: "Skipped heading level",
          message: `Heading jumps from h${lastHeadingLevel} to h${level}. Sequential levels help navigation.`,
        })
      ) {
        return issues;
      }
    }

    lastHeadingLevel = level;
  }

  const elements = Array.from(document.body?.querySelectorAll("*") ?? []).slice(0, MAX_ELEMENTS);

  for (const el of elements) {
    if (performance.now() - startedAt > TIME_BUDGET_MS || issues.length >= MAX_ISSUES) {
      break;
    }

    const styles = window.getComputedStyle(el);

    if (styles.display === "none" || styles.visibility === "hidden") {
      continue;
    }

    if (el instanceof HTMLImageElement && !el.hasAttribute("alt")) {
      if (
        !pushIssue({
          id: `img-alt-${issues.length}`,
          selector: generateUniqueSelector(el),
          severity: "error",
          title: "Image missing alt text",
          message: 'Add alt text (or alt="" for decorative images).',
        })
      ) {
        break;
      }
      continue;
    }

    if (el instanceof HTMLInputElement && el.type !== "hidden") {
      if (inputAccessibleName(el).length === 0) {
        if (
          !pushIssue({
            id: `input-label-${issues.length}`,
            selector: generateUniqueSelector(el),
            severity: "warning",
            title: "Input without a label",
            message: "This input has no label, aria-label, or placeholder.",
          })
        ) {
          break;
        }
      }
      continue;
    }

    if (el.matches(LABELLABLE_SELECTOR) && accessibleName(el).length === 0) {
      if (
        !pushIssue({
          id: `name-${issues.length}`,
          selector: generateUniqueSelector(el),
          severity: "warning",
          title: "Interactive element without accessible name",
          message: `<${el.tagName.toLowerCase()}> has no text, aria-label, or title.`,
        })
      ) {
        break;
      }
      continue;
    }

    if (hasDirectText(el)) {
      const foreground = parseCssColor(styles.getPropertyValue("color"));
      const background = parseCssColor(getEffectiveBackgroundColor(el) ?? "");

      if (foreground !== null && background !== null && background.a >= 1) {
        const ratio = contrastRatio(foreground, background);
        const threshold = contrastThreshold(styles);

        if (ratio < threshold) {
          if (
            !pushIssue({
              id: `contrast-${issues.length}`,
              selector: generateUniqueSelector(el),
              severity: "warning",
              title: "Low text contrast",
              message: `Contrast is ${ratio}:1 (needs ${threshold}:1).`,
            })
          ) {
            break;
          }
        }
      }
    }
  }

  return issues;
};
