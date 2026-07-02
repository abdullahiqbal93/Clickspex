import { buildCssRule } from "@ui-buddy/core";

import type { StyleChange } from "@ui-buddy/shared";

const STYLE_ELEMENT_ID = "__ui-buddy-styles__";

const applyChangeToRules = (
  rulesBySelector: Map<string, Record<string, string>>,
  change: StyleChange,
): void => {
  const existing = rulesBySelector.get(change.selector) ?? {};
  const nextStyles = { ...existing };

  if (change.afterValue.trim().length === 0) {
    delete nextStyles[change.property];
  } else {
    nextStyles[change.property] = change.afterValue;
  }

  if (Object.keys(nextStyles).length === 0) {
    rulesBySelector.delete(change.selector);
  } else {
    rulesBySelector.set(change.selector, nextStyles);
  }
};

export class StyleInjector {
  private readonly appliedChanges: StyleChange[] = [];
  private readonly redoStack: StyleChange[] = [];

  public applyChange(change: StyleChange): void {
    this.appliedChanges.push(change);
    this.redoStack.length = 0;
    this.render();
  }

  public undo(): void {
    const change = this.appliedChanges.pop();

    if (change === undefined) {
      return;
    }

    this.redoStack.push(change);
    this.render();
  }

  public redo(): void {
    const change = this.redoStack.pop();

    if (change === undefined) {
      return;
    }

    this.appliedChanges.push(change);
    this.render();
  }

  public reset(): void {
    this.appliedChanges.length = 0;
    this.redoStack.length = 0;
    document.getElementById(STYLE_ELEMENT_ID)?.remove();
  }

  private getStyleElement(): HTMLStyleElement {
    const existing = document.getElementById(STYLE_ELEMENT_ID);

    if (existing instanceof HTMLStyleElement) {
      return existing;
    }

    const styleElement = document.createElement("style");
    styleElement.id = STYLE_ELEMENT_ID;
    document.head.append(styleElement);
    return styleElement;
  }

  private render(): void {
    const rulesBySelector = new Map<string, Record<string, string>>();

    for (const change of this.appliedChanges) {
      applyChangeToRules(rulesBySelector, change);
    }

    if (rulesBySelector.size === 0) {
      document.getElementById(STYLE_ELEMENT_ID)?.remove();
      return;
    }

    const cssRules = Array.from(rulesBySelector.entries())
      .map(([selector, styles]) => buildCssRule(selector, styles))
      .join("\n\n");

    this.getStyleElement().textContent = cssRules;
  }
}
