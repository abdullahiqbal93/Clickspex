import { generateUniqueSelector } from "@ui-buddy/core";

import type {
  MatchedStyleDeclaration,
  MatchedStyleDeclarationMutation,
  MatchedStyleRule,
  MatchedStylesResult,
} from "@ui-buddy/shared";

type Specificity = [number, number, number];

type RuleCandidate = MatchedStyleRule & {
  order: number;
};

type ReadableSheet = {
  sheet: CSSStyleSheet;
  index: number;
};

const INHERITED_PROPERTIES = new Set([
  "azimuth",
  "border-collapse",
  "border-spacing",
  "caption-side",
  "color",
  "cursor",
  "direction",
  "empty-cells",
  "font",
  "font-family",
  "font-feature-settings",
  "font-kerning",
  "font-language-override",
  "font-optical-sizing",
  "font-size",
  "font-stretch",
  "font-style",
  "font-synthesis",
  "font-variant",
  "font-weight",
  "hyphens",
  "letter-spacing",
  "line-height",
  "list-style",
  "list-style-image",
  "list-style-position",
  "list-style-type",
  "orphans",
  "pointer-events",
  "quotes",
  "tab-size",
  "text-align",
  "text-align-last",
  "text-indent",
  "text-justify",
  "text-rendering",
  "text-shadow",
  "text-transform",
  "visibility",
  "white-space",
  "widows",
  "word-break",
  "word-spacing",
  "word-wrap",
  "writing-mode",
]);

const splitSelectorList = (selectorText: string): string[] => {
  const selectors: string[] = [];
  let start = 0;
  let depth = 0;

  for (let index = 0; index < selectorText.length; index += 1) {
    const character = selectorText[index];

    if (character === "(" || character === "[") {
      depth += 1;
    } else if (character === ")" || character === "]") {
      depth = Math.max(0, depth - 1);
    } else if (character === "," && depth === 0) {
      selectors.push(selectorText.slice(start, index).trim());
      start = index + 1;
    }
  }

  selectors.push(selectorText.slice(start).trim());
  return selectors.filter((selector) => selector.length > 0);
};

const countMatches = (value: string, pattern: RegExp): number => value.match(pattern)?.length ?? 0;

/**
 * A compact CSS specificity calculator for cascade explanation. :where() is
 * zeroed and :is()/:not() remain conservative; the browser still decides the
 * real cascade, while this score is used only to explain relative rule weight.
 */
export const calculateSpecificity = (selector: string): Specificity => {
  const withoutWhere = selector.replace(/:where\([^)]*\)/g, "");
  const ids = countMatches(withoutWhere, /#[\w-]+/g);
  const classes = countMatches(withoutWhere, /\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(?:\([^)]*\))?/g);
  const types = countMatches(
    withoutWhere.replace(/::[\w-]+/g, " type "),
    /(^|[\s>+~,(])(?:[a-zA-Z][\w-]*|type)(?=$|[\s.#:[>+~,)])/g,
  );

  return [ids, classes, types];
};

const compareSpecificity = (left: Specificity, right: Specificity): number => {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!;

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

const stripDynamicPseudos = (selector: string): string =>
  selector
    .replace(
      /:(?:hover|active|focus|focus-visible|focus-within|visited|target|checked|disabled|enabled)(?:\([^)]*\))?/gi,
      "",
    )
    .replace(/::[\w-]+(?:\([^)]*\))?/g, "")
    .trim();

const selectorMatch = (
  element: Element,
  selectorText: string,
): { matches: boolean; active: boolean; specificity: Specificity } => {
  let bestActive: Specificity | null = null;
  let bestPotential: Specificity | null = null;

  for (const selector of splitSelectorList(selectorText)) {
    try {
      if (element.matches(selector)) {
        const specificity = calculateSpecificity(selector);

        if (bestActive === null || compareSpecificity(specificity, bestActive) > 0) {
          bestActive = specificity;
        }
        continue;
      }
    } catch {
      // Try a state-neutral version below.
    }

    const stripped = stripDynamicPseudos(selector);

    if (stripped.length === 0 || stripped === "*") {
      continue;
    }

    try {
      if (element.matches(stripped)) {
        const specificity = calculateSpecificity(selector);

        if (bestPotential === null || compareSpecificity(specificity, bestPotential) > 0) {
          bestPotential = specificity;
        }
      }
    } catch {
      // Invalid selector in this browser.
    }
  }

  return {
    matches: bestActive !== null || bestPotential !== null,
    active: bestActive !== null,
    specificity: bestActive ?? bestPotential ?? [0, 0, 0],
  };
};

const isInheritedProperty = (property: string): boolean =>
  property.startsWith("--") || INHERITED_PROPERTIES.has(property);

const sourceForSheet = (
  sheet: CSSStyleSheet,
  index: number,
): { label: string; url: string | null; origin: MatchedStyleRule["origin"] } => {
  const owner = sheet.ownerNode;
  const inspector = owner instanceof HTMLElement && owner.id === "__ui-buddy-styles__";

  if (sheet.href !== null) {
    let label = sheet.href;

    try {
      const url = new URL(sheet.href);
      label = url.pathname.split("/").filter(Boolean).at(-1) ?? url.hostname;
    } catch {
      // Keep the full href as a useful fallback.
    }

    return {
      label,
      url: sheet.href,
      origin: inspector ? "inspector" : "author",
    };
  }

  if (owner instanceof HTMLElement && owner.id.length > 0) {
    return {
      label: `<style>#${owner.id}`,
      url: null,
      origin: inspector ? "inspector" : "author",
    };
  }

  return {
    label: `inline <style> #${index + 1}`,
    url: null,
    origin: inspector ? "inspector" : "author",
  };
};

const conditionIsActive = (rule: CSSRule, view: Window): boolean => {
  const conditionText = (rule as CSSRule & { conditionText?: string }).conditionText;

  if (typeof conditionText !== "string") {
    return true;
  }

  if (rule.type === CSSRule.MEDIA_RULE) {
    return typeof view.matchMedia === "function" ? view.matchMedia(conditionText).matches : true;
  }

  if (rule.type === CSSRule.SUPPORTS_RULE) {
    return typeof CSS === "undefined" || CSS.supports(conditionText);
  }

  return true;
};

const conditionLabel = (rule: CSSRule): string | null => {
  const conditionText = (rule as CSSRule & { conditionText?: string }).conditionText;

  if (typeof conditionText !== "string") {
    return null;
  }

  if (rule.type === CSSRule.MEDIA_RULE) {
    return `@media ${conditionText}`;
  }

  if (rule.type === CSSRule.SUPPORTS_RULE) {
    return `@supports ${conditionText}`;
  }

  return `@condition ${conditionText}`;
};

const declarationsFromStyle = (
  style: CSSStyleDeclaration,
  active: boolean,
  inherited: boolean,
): MatchedStyleDeclaration[] => {
  const declarations: MatchedStyleDeclaration[] = [];

  for (let index = 0; index < style.length; index += 1) {
    const property = style.item?.(index) ?? style[index] ?? "";

    if (property.length === 0) {
      continue;
    }

    if (inherited && !isInheritedProperty(property)) {
      continue;
    }

    declarations.push({
      property,
      value: style.getPropertyValue(property).trim(),
      important: style.getPropertyPriority(property) === "important",
      active,
      overridden: !active,
      inherited,
    });
  }

  return declarations;
};

const collectRules = (
  element: Element,
  rules: CSSRuleList,
  sheet: ReadableSheet,
  inheritedFrom: MatchedStyleRule["inheritedFrom"],
  view: Window,
  parentActive: boolean,
  parentConditions: string[],
  order: { value: number },
  output: RuleCandidate[],
): void => {
  for (const rule of Array.from(rules)) {
    const styleRule = rule as CSSStyleRule;

    if (typeof styleRule.selectorText === "string" && styleRule.style !== undefined) {
      const match = selectorMatch(element, styleRule.selectorText);

      if (!match.matches) {
        order.value += 1;
        continue;
      }

      const active = parentActive && match.active;
      const source = sourceForSheet(sheet.sheet, sheet.index);
      const declarations = declarationsFromStyle(styleRule.style, active, inheritedFrom !== null);

      if (declarations.length > 0) {
        output.push({
          id: `rule-${sheet.index}-${order.value}-${inheritedFrom?.selector ?? "selected"}`,
          selector: styleRule.selectorText,
          specificity: match.specificity,
          origin: source.origin,
          source: { label: source.label, url: source.url },
          declarations,
          active,
          conditional: parentConditions.length === 0 ? null : parentConditions.join(" / "),
          inheritedFrom,
          order: order.value,
        });
      }

      order.value += 1;
      continue;
    }

    const groupingRule = rule as CSSRule & { cssRules?: CSSRuleList };

    if (groupingRule.cssRules === undefined) {
      order.value += 1;
      continue;
    }

    const label = conditionLabel(rule);
    collectRules(
      element,
      groupingRule.cssRules,
      sheet,
      inheritedFrom,
      view,
      parentActive && conditionIsActive(rule, view),
      label === null ? parentConditions : [...parentConditions, label],
      order,
      output,
    );
  }
};

const ruleWeight = (rule: RuleCandidate, declaration: MatchedStyleDeclaration) => ({
  important: declaration.important ? 1 : 0,
  inline: rule.origin === "inline" ? 1 : 0,
  specificity: rule.specificity,
  order: rule.order,
});

const isStronger = (
  leftRule: RuleCandidate,
  left: MatchedStyleDeclaration,
  rightRule: RuleCandidate,
  right: MatchedStyleDeclaration,
): boolean => {
  const leftWeight = ruleWeight(leftRule, left);
  const rightWeight = ruleWeight(rightRule, right);

  if (leftWeight.important !== rightWeight.important) {
    return leftWeight.important > rightWeight.important;
  }

  if (leftWeight.inline !== rightWeight.inline) {
    return leftWeight.inline > rightWeight.inline;
  }

  const specificityDifference = compareSpecificity(leftWeight.specificity, rightWeight.specificity);

  return specificityDifference !== 0
    ? specificityDifference > 0
    : leftWeight.order > rightWeight.order;
};

const markLocalWinners = (rules: RuleCandidate[]): void => {
  const winners = new Map<string, { rule: RuleCandidate; declaration: MatchedStyleDeclaration }>();

  for (const rule of rules) {
    for (const declaration of rule.declarations) {
      if (!declaration.active) {
        declaration.overridden = true;
        continue;
      }

      const winner = winners.get(declaration.property);

      if (winner === undefined || isStronger(rule, declaration, winner.rule, winner.declaration)) {
        if (winner !== undefined) {
          winner.declaration.overridden = true;
        }

        declaration.overridden = false;
        winners.set(declaration.property, { rule, declaration });
      } else {
        declaration.overridden = true;
      }
    }
  }
};

const inlineRule = (
  element: Element,
  inheritedFrom: MatchedStyleRule["inheritedFrom"],
  order: number,
): RuleCandidate | null => {
  if (!(element instanceof HTMLElement) || element.style.length === 0) {
    return null;
  }

  const declarations = declarationsFromStyle(element.style, true, inheritedFrom !== null);

  if (declarations.length === 0) {
    return null;
  }

  return {
    id: `inline-${inheritedFrom?.selector ?? "selected"}`,
    selector: "element.style",
    specificity: [1, 0, 0],
    origin: "inline",
    source: { label: "style attribute", url: null },
    declarations,
    active: true,
    conditional: null,
    inheritedFrom,
    order,
  };
};

const collectComputed = (
  element: Element,
): { computed: Record<string, string>; variables: Record<string, string> } => {
  const view = element.ownerDocument.defaultView;
  const computed: Record<string, string> = {};
  const variables: Record<string, string> = {};

  if (view === null) {
    return { computed, variables };
  }

  const styles = view.getComputedStyle(element);

  for (let index = 0; index < styles.length; index += 1) {
    const property = styles.item?.(index) ?? styles[index] ?? "";

    if (property.length === 0) {
      continue;
    }
    const value = styles.getPropertyValue(property).trim();

    if (property.startsWith("--")) {
      variables[property] = value;
    } else if (!property.startsWith("-webkit-") && !property.startsWith("-moz-")) {
      computed[property] = value;
    }
  }

  return { computed, variables };
};

const findMutableStyleRule = (
  rules: CSSRuleList,
  sheetIndex: number,
  targetSheetIndex: number,
  targetOrder: number,
  order: { value: number },
): CSSStyleRule | null => {
  for (const rule of Array.from(rules)) {
    const styleRule = rule as CSSStyleRule;

    if (typeof styleRule.selectorText === "string" && styleRule.style !== undefined) {
      if (sheetIndex === targetSheetIndex && order.value === targetOrder) {
        return styleRule;
      }

      order.value += 1;
      continue;
    }

    const groupingRule = rule as CSSRule & { cssRules?: CSSRuleList };

    if (groupingRule.cssRules === undefined) {
      order.value += 1;
      continue;
    }

    const nested = findMutableStyleRule(
      groupingRule.cssRules,
      sheetIndex,
      targetSheetIndex,
      targetOrder,
      order,
    );

    if (nested !== null) {
      return nested;
    }
  }

  return null;
};

const mutableDeclarationForRule = (
  element: Element,
  mutation: MatchedStyleDeclarationMutation,
): CSSStyleDeclaration | null => {
  if (mutation.ruleId.startsWith("inline-")) {
    const target =
      mutation.inheritedSelector === null
        ? element
        : element.ownerDocument.querySelector(mutation.inheritedSelector);

    return target instanceof HTMLElement ? target.style : null;
  }

  const match = /^rule-(\d+)-(\d+)-/.exec(mutation.ruleId);

  if (match === null) {
    return null;
  }

  const sheetIndex = Number.parseInt(match[1] ?? "", 10);
  const targetOrder = Number.parseInt(match[2] ?? "", 10);
  const order = { value: 0 };

  for (const [index, sheet] of Array.from(element.ownerDocument.styleSheets).entries()) {
    try {
      const styleRule = findMutableStyleRule(sheet.cssRules, index, sheetIndex, targetOrder, order);

      if (styleRule !== null) {
        return styleRule.style;
      }
    } catch {
      // Cross-origin stylesheets are intentionally read-only.
    }
  }

  return null;
};

export const mutateMatchedStyleDeclaration = (
  element: Element,
  mutation: MatchedStyleDeclarationMutation,
): boolean => {
  const style = mutableDeclarationForRule(element, mutation);

  if (style === null || style.getPropertyValue(mutation.property).length === 0) {
    return false;
  }

  if (mutation.nextProperty === mutation.property) {
    return true;
  }

  const value = style.getPropertyValue(mutation.property);
  const priority = style.getPropertyPriority(mutation.property);
  style.removeProperty(mutation.property);

  if (mutation.nextProperty !== null) {
    style.setProperty(mutation.nextProperty, value, priority);
  }

  return true;
};

export const collectMatchedStyles = (element: Element): MatchedStylesResult => {
  const document = element.ownerDocument;
  const view = document.defaultView;
  const readableSheets: ReadableSheet[] = [];
  let unreadableStylesheets = 0;

  for (const [index, sheet] of Array.from(document.styleSheets).entries()) {
    try {
      void sheet.cssRules;
      readableSheets.push({ sheet, index });
    } catch {
      unreadableStylesheets += 1;
    }
  }

  const collectForElement = (
    target: Element,
    inheritedFrom: MatchedStyleRule["inheritedFrom"],
  ): RuleCandidate[] => {
    const candidates: RuleCandidate[] = [];
    const order = { value: 0 };

    if (view !== null) {
      for (const sheet of readableSheets) {
        collectRules(
          target,
          sheet.sheet.cssRules,
          sheet,
          inheritedFrom,
          view,
          true,
          [],
          order,
          candidates,
        );
      }
    }

    const inline = inlineRule(target, inheritedFrom, order.value + 1);

    if (inline !== null) {
      candidates.push(inline);
    }

    markLocalWinners(candidates);
    return candidates;
  };

  const directRules = collectForElement(element, null);
  const winningProperties = new Set(
    directRules.flatMap((rule) =>
      rule.declarations
        .filter((declaration) => declaration.active && !declaration.overridden)
        .map((declaration) => declaration.property),
    ),
  );

  const inheritedGroups: RuleCandidate[][] = [];
  let ancestor = element.parentElement;
  let depth = 0;

  while (ancestor !== null && depth < 8) {
    const selector = generateUniqueSelector(ancestor);
    const rules = collectForElement(ancestor, {
      selector,
      tagName: ancestor.tagName.toLowerCase(),
    });

    for (const rule of rules) {
      for (const declaration of rule.declarations) {
        if (winningProperties.has(declaration.property)) {
          declaration.overridden = true;
        } else if (declaration.active && !declaration.overridden) {
          winningProperties.add(declaration.property);
        }
      }
    }

    if (rules.length > 0) {
      inheritedGroups.push(rules);
    }

    ancestor = ancestor.parentElement;
    depth += 1;
  }

  const { computed, variables } = collectComputed(element);

  for (const rule of [...directRules, ...inheritedGroups.flat()]) {
    for (const declaration of rule.declarations) {
      if (declaration.property.startsWith("--") && variables[declaration.property] === undefined) {
        variables[declaration.property] = declaration.value;
      }
    }
  }

  const orderForDisplay = (rules: RuleCandidate[]): MatchedStyleRule[] =>
    [...rules]
      .sort((left, right) => right.order - left.order)
      .map(({ order: _order, ...rule }) => rule);

  return {
    selector: generateUniqueSelector(element),
    rules: [...orderForDisplay(directRules), ...inheritedGroups.flatMap(orderForDisplay)],
    computed,
    variables,
    unreadableStylesheets,
  };
};
