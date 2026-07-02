import { buildStyleTargetSelector } from "@ui-buddy/core";

import type { StyleChange } from "@ui-buddy/shared";

// Live preview rules use !important so temporary edits reliably win over the
// page's own (often more specific or inline) styles. Exported CSS stays clean.
const buildImportantCssRule = (selector: string, styles: Record<string, string>): string => {
  const declarations = Object.entries(styles)
    .filter(([, value]) => value.trim().length > 0)
    .map(([property, value]) => `  ${property}: ${value} !important;`);

  if (declarations.length === 0) {
    return `${selector} {}`;
  }

  return [`${selector} {`, ...declarations, "}"].join("\n");
};

const STYLE_ELEMENT_ID = "__ui-buddy-styles__";

const ANIMATION_PRESET_KEYFRAMES: Record<string, string> = {
  "ui-buddy-fade-in": `@keyframes ui-buddy-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}`,
  "ui-buddy-slide-up": `@keyframes ui-buddy-slide-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}`,
  "ui-buddy-pop": `@keyframes ui-buddy-pop {
  0% { opacity: 0; transform: scale(0.96); }
  100% { opacity: 1; transform: scale(1); }
}`,
  "ui-buddy-pulse": `@keyframes ui-buddy-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}`,
};

const getAnimationPresetKeyframes = (
  rulesBySelector: Map<string, Record<string, string>>,
): string[] => {
  const keyframes = new Set<string>();

  for (const styles of rulesBySelector.values()) {
    const animationValues = [styles.animation, styles["animation-name"]].filter(
      (value): value is string => value !== undefined,
    );

    for (const value of animationValues) {
      for (const [name, css] of Object.entries(ANIMATION_PRESET_KEYFRAMES)) {
        if (value.includes(name)) {
          keyframes.add(css);
        }
      }
    }
  }

  return [...keyframes];
};

const applyChangeToRules = (
  rulesBySelector: Map<string, Record<string, string>>,
  change: StyleChange,
): void => {
  const selector = buildStyleTargetSelector(change.selector, change.state ?? "base");
  const existing = rulesBySelector.get(selector) ?? {};
  const nextStyles = { ...existing };

  if (change.afterValue.trim().length === 0) {
    delete nextStyles[change.property];
  } else {
    nextStyles[change.property] = change.afterValue;
  }

  if (Object.keys(nextStyles).length === 0) {
    rulesBySelector.delete(selector);
  } else {
    rulesBySelector.set(selector, nextStyles);
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
      .map(([selector, styles]) => buildImportantCssRule(selector, styles))
      .join("\n\n");
    const animationKeyframes = getAnimationPresetKeyframes(rulesBySelector);

    this.getStyleElement().textContent = [cssRules, ...animationKeyframes].join("\n\n");
  }
}
