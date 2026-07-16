import {
  IMPORTANT_COMPUTED_STYLE_PROPERTIES,
  type ElementSnapshot,
  type ParentLayoutInfo,
  type RectSnapshot,
} from "@clickspex/shared";

import { parseBoxModel } from "./boxModel";
import { parseCssColor } from "./contrast";
import { generateSelectorCandidates, generateUniqueSelector, getDomPath } from "./selector";

export const rectToSnapshot = (rect: DOMRect | DOMRectReadOnly): RectSnapshot => ({
  x: rect.x,
  y: rect.y,
  width: rect.width,
  height: rect.height,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
  left: rect.left,
});

const collectAttributes = (element: Element): Record<string, string> => {
  const attributes: Record<string, string> = {};

  for (const attribute of Array.from(element.attributes)) {
    attributes[attribute.name] = attribute.value;
  }

  return attributes;
};

export const getTextPreview = (element: Element, maxLength = 120): string => {
  const normalized = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
};

export const getImportantComputedStyles = (styles: CSSStyleDeclaration): Record<string, string> => {
  const snapshot: Record<string, string> = {};

  for (const property of IMPORTANT_COMPUTED_STYLE_PROPERTIES) {
    snapshot[property] = styles.getPropertyValue(property).trim();
  }

  return snapshot;
};

const getParentLayoutInfo = (element: Element): ParentLayoutInfo | null => {
  const parent = element.parentElement;

  if (parent === null) {
    return null;
  }

  const parentStyles = parent.ownerDocument.defaultView?.getComputedStyle(parent);

  if (parentStyles === undefined) {
    return null;
  }

  return {
    tagName: parent.tagName.toLowerCase(),
    selector: generateUniqueSelector(parent),
    display: parentStyles.getPropertyValue("display"),
    flexDirection: parentStyles.getPropertyValue("flex-direction") || null,
    flexWrap: parentStyles.getPropertyValue("flex-wrap") || null,
    gap: parentStyles.getPropertyValue("gap") || null,
    alignItems: parentStyles.getPropertyValue("align-items") || null,
    alignContent: parentStyles.getPropertyValue("align-content") || null,
    justifyContent: parentStyles.getPropertyValue("justify-content") || null,
  };
};

/**
 * Walk up the tree to the first fully opaque background color. Returns null
 * when nothing opaque is found (e.g. transparent page over browser default).
 */
export const getEffectiveBackgroundColor = (element: Element): string | null => {
  const view = element.ownerDocument.defaultView;

  if (view === null) {
    return null;
  }

  let current: Element | null = element;

  while (current !== null) {
    const value = view.getComputedStyle(current).getPropertyValue("background-color").trim();
    const parsed = parseCssColor(value);

    if (parsed !== null && parsed.a >= 1) {
      return value;
    }

    current = current.parentElement;
  }

  return null;
};

export const captureElementSnapshot = (element: Element): ElementSnapshot => {
  const view = element.ownerDocument.defaultView;

  if (view === null) {
    throw new Error("Cannot capture an element snapshot without a window context.");
  }

  const computedStyles = view.getComputedStyle(element);
  const effectiveBackground = getEffectiveBackgroundColor(element);

  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id,
    classList: Array.from(element.classList),
    textPreview: getTextPreview(element),
    attributes: collectAttributes(element),
    selector: generateUniqueSelector(element),
    domPath: getDomPath(element),
    rect: rectToSnapshot(element.getBoundingClientRect()),
    computedStyles: getImportantComputedStyles(computedStyles),
    boxModel: parseBoxModel(computedStyles),
    parentLayout: getParentLayoutInfo(element),
    ...(effectiveBackground === null ? {} : { effectiveBackgroundColor: effectiveBackground }),
    fallbackSelectors: generateSelectorCandidates(element),
  };
};
