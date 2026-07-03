const CSS_IDENTIFIER_ESCAPE = /[^a-zA-Z0-9_-]/g;

export const escapeCssIdentifier = (identifier: string): string => {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(identifier);
  }

  return identifier.replace(CSS_IDENTIFIER_ESCAPE, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint === undefined ? "" : `\\${codePoint.toString(16)} `;
  });
};

const getElementClasses = (element: Element): string[] =>
  Array.from(element.classList).filter((className) => className.trim().length > 0);

const getNthOfType = (element: Element): number => {
  let index = 1;
  let sibling = element.previousElementSibling;

  while (sibling !== null) {
    if (sibling.tagName === element.tagName) {
      index += 1;
    }

    sibling = sibling.previousElementSibling;
  }

  return index;
};

const queryCount = (document: Document, selector: string): number => {
  try {
    return document.querySelectorAll(selector).length;
  } catch {
    return 0;
  }
};

const isUniqueSelector = (document: Document, selector: string): boolean =>
  queryCount(document, selector) === 1;

const buildSimpleSelector = (element: Element, includeNth: boolean): string => {
  const tagName = element.tagName.toLowerCase();
  const classes = getElementClasses(element).map(
    (className) => `.${escapeCssIdentifier(className)}`,
  );
  const classSuffix = classes.length > 0 ? classes.join("") : "";
  const nthSuffix = includeNth ? `:nth-of-type(${getNthOfType(element)})` : "";
  return `${tagName}${classSuffix}${nthSuffix}`;
};

const candidateSelectorsFor = (element: Element): string[] => {
  const tagName = element.tagName.toLowerCase();
  const candidates: string[] = [];

  if (element.id.trim().length > 0) {
    candidates.push(`#${escapeCssIdentifier(element.id)}`);
    candidates.push(`${tagName}#${escapeCssIdentifier(element.id)}`);
  }

  for (const attributeName of ["data-testid", "data-test", "data-cy", "aria-label", "name"]) {
    const attributeValue = element.getAttribute(attributeName);

    if (attributeValue !== null && attributeValue.trim().length > 0) {
      candidates.push(`${tagName}[${attributeName}="${attributeValue.replaceAll('"', '\\"')}"]`);
    }
  }

  const classes = getElementClasses(element);

  if (classes.length > 0) {
    candidates.push(`${tagName}.${escapeCssIdentifier(classes[0] ?? "")}`);
    candidates.push(
      `${tagName}${classes.map((className) => `.${escapeCssIdentifier(className)}`).join("")}`,
    );
  }

  candidates.push(tagName);
  return candidates;
};

/** Unique selector candidates for an element, most stable first (capped at 4). */
export const generateSelectorCandidates = (element: Element): string[] => {
  const ownerDocument = element.ownerDocument;
  const unique: string[] = [];

  for (const candidate of candidateSelectorsFor(element)) {
    if (unique.length >= 4) {
      break;
    }

    if (isUniqueSelector(ownerDocument, candidate) && !unique.includes(candidate)) {
      unique.push(candidate);
    }
  }

  return unique;
};

export const generateUniqueSelector = (element: Element): string => {
  const ownerDocument = element.ownerDocument;

  for (const candidate of candidateSelectorsFor(element)) {
    if (isUniqueSelector(ownerDocument, candidate)) {
      return candidate;
    }
  }

  // Before resorting to a positional path, try anchoring on the nearest
  // ancestor that is itself uniquely selectable (ids first). A descendant
  // selector like `#panel button.save` is far more stable than
  // `a > button.save:nth-of-type(1)` and survives sibling/DOM shuffles.
  const targetSimple = buildSimpleSelector(element, false);
  let ancestor: Element | null = element.parentElement;

  while (ancestor !== null) {
    const [anchor] = generateSelectorCandidates(ancestor);

    if (anchor !== undefined) {
      const descendant = `${anchor} ${targetSimple}`;

      if (isUniqueSelector(ownerDocument, descendant)) {
        return descendant;
      }

      const directChild = `${anchor} > ${targetSimple}`;

      if (isUniqueSelector(ownerDocument, directChild)) {
        return directChild;
      }
    }

    ancestor = ancestor.parentElement;
  }

  const path: string[] = [];
  let current: Element | null = element;

  while (current !== null && current.nodeType === Node.ELEMENT_NODE) {
    const simpleSelector = buildSimpleSelector(current, false);
    const nthSelector = buildSimpleSelector(current, true);
    path.unshift(simpleSelector);

    const descendantSelector = path.join(" > ");
    if (isUniqueSelector(ownerDocument, descendantSelector)) {
      return descendantSelector;
    }

    path[0] = nthSelector;
    const nthDescendantSelector = path.join(" > ");
    if (isUniqueSelector(ownerDocument, nthDescendantSelector)) {
      return nthDescendantSelector;
    }

    current = current.parentElement;
  }

  return path.join(" > ");
};

export const getDomPath = (element: Element): string => {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current !== null && current.nodeType === Node.ELEMENT_NODE) {
    const tagName = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : "";
    const nth = current.parentElement === null ? "" : `:nth-of-type(${getNthOfType(current)})`;
    segments.unshift(`${tagName}${id}${nth}`);
    current = current.parentElement;
  }

  return segments.join(" > ");
};
