import { buildCssRule } from "@ui-devtools/core";

import type { StyleChange } from "@ui-devtools/shared";

const STYLE_ELEMENT_ID = "__ui-devtools-styles__";

export class StyleInjector {
  private readonly rulesBySelector = new Map<string, Record<string, string>>();

  public applyChange(change: StyleChange): void {
    const existing = this.rulesBySelector.get(change.selector) ?? {};
    const nextStyles = { ...existing };

    if (change.afterValue.trim().length === 0) {
      delete nextStyles[change.property];
    } else {
      nextStyles[change.property] = change.afterValue;
    }

    if (Object.keys(nextStyles).length === 0) {
      this.rulesBySelector.delete(change.selector);
    } else {
      this.rulesBySelector.set(change.selector, nextStyles);
    }

    this.render();
  }

  public reset(): void {
    this.rulesBySelector.clear();
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
    if (this.rulesBySelector.size === 0) {
      this.reset();
      return;
    }

    const cssRules = Array.from(this.rulesBySelector.entries())
      .map(([selector, styles]) => buildCssRule(selector, styles))
      .join("\n\n");

    this.getStyleElement().textContent = cssRules;
  }
}
