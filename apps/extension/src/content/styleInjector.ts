import {
  buildMediaQueryFromResponsiveTarget,
  buildStyleTargetSelector,
  canCoalesceStyleChange,
  getStyleChangeResponsiveTarget,
} from "@ui-buddy/core";
import {
  STYLE_RESPONSIVE_TARGET_DEFINITIONS,
  type StyleChange,
  type StyleResponsiveTarget,
} from "@ui-buddy/shared";

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

const indentCss = (css: string): string =>
  css
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

const wrapImportantCssForResponsiveTarget = (
  css: string,
  responsiveTarget: StyleResponsiveTarget,
): string => {
  const mediaQuery = buildMediaQueryFromResponsiveTarget(responsiveTarget);

  if (mediaQuery === null) {
    return css;
  }

  return [`@media ${mediaQuery} {`, indentCss(css), "}"].join("\n");
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

type RulesByResponsiveTarget = Map<StyleResponsiveTarget, Map<string, Record<string, string>>>;

const getAnimationPresetKeyframes = (rulesByTarget: RulesByResponsiveTarget): string[] => {
  const keyframes = new Set<string>();

  for (const rulesBySelector of rulesByTarget.values()) {
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
  }

  return [...keyframes];
};

const getRulesForResponsiveTarget = (
  rulesByTarget: RulesByResponsiveTarget,
  responsiveTarget: StyleResponsiveTarget,
): Map<string, Record<string, string>> => {
  const existing = rulesByTarget.get(responsiveTarget);

  if (existing !== undefined) {
    return existing;
  }

  const next = new Map<string, Record<string, string>>();
  rulesByTarget.set(responsiveTarget, next);
  return next;
};

const applyChangeToRules = (rulesByTarget: RulesByResponsiveTarget, change: StyleChange): void => {
  const selector = buildStyleTargetSelector(change.selector, change.state ?? "base");
  const responsiveTarget = getStyleChangeResponsiveTarget(change);
  const rulesBySelector = getRulesForResponsiveTarget(rulesByTarget, responsiveTarget);
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

  if (rulesBySelector.size === 0) {
    rulesByTarget.delete(responsiveTarget);
  }
};

/**
 * Force `!important` on any declaration that doesn't already carry it, so raw
 * CSS reliably wins over the page's own rules (matching the live-preview
 * behaviour of the structured fields). Comments and empty fragments are dropped.
 */
const enforceImportant = (rawCss: string): string =>
  rawCss
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration.includes(":"))
    .map((declaration) =>
      /!important\s*$/i.test(declaration) ? declaration : `${declaration} !important`,
    )
    .map((declaration) => `  ${declaration};`)
    .join("\n");

export class StyleInjector {
  private readonly appliedChanges: StyleChange[] = [];
  private readonly redoStack: StyleChange[] = [];
  // Free-form CSS entered in the Styles → Raw CSS editor, keyed by selector.
  private readonly rawCssBySelector = new Map<string, string>();
  private readonly rawCssUndoStack: Array<{ selector: string; before: string; after: string }> = [];
  private readonly rawCssRedoStack: Array<{ selector: string; before: string; after: string }> = [];

  public getAppliedChanges(): StyleChange[] {
    return [...this.appliedChanges];
  }

  /**
   * Rehydrate style + raw CSS edits after a page reload and re-inject them.
   * Rebuilds the raw-CSS undo stack so each restored raw block stays undoable.
   */
  public restore(styleChanges: StyleChange[], rawCss: Array<{ selector: string; css: string }>): void {
    this.appliedChanges.length = 0;
    this.appliedChanges.push(...styleChanges);
    this.redoStack.length = 0;

    this.rawCssBySelector.clear();
    this.rawCssUndoStack.length = 0;
    this.rawCssRedoStack.length = 0;

    for (const { selector, css } of rawCss) {
      if (css.trim().length === 0) {
        continue;
      }

      this.rawCssBySelector.set(selector, css);
      this.rawCssUndoStack.push({ selector, before: "", after: css });
    }

    this.render();
  }

  public getRawCssEntries(): Array<{ selector: string; css: string }> {
    return Array.from(this.rawCssBySelector.entries()).map(([selector, css]) => ({
      selector,
      css,
    }));
  }

  private setRawCssValue(selector: string, value: string): void {
    if (value.length === 0) {
      this.rawCssBySelector.delete(selector);
    } else {
      this.rawCssBySelector.set(selector, value);
    }
  }

  /** Apply raw CSS for a selector as an undoable step. Returns true if it changed. */
  public applyRawCss(selector: string, css: string): boolean {
    const before = this.rawCssBySelector.get(selector) ?? "";
    const after = css.trim();

    if (before === after) {
      return false;
    }

    this.setRawCssValue(selector, after);
    this.rawCssUndoStack.push({ selector, before, after });
    this.rawCssRedoStack.length = 0;
    this.render();
    return true;
  }

  public undoRawCss(): void {
    const entry = this.rawCssUndoStack.pop();

    if (entry === undefined) {
      return;
    }

    this.setRawCssValue(entry.selector, entry.before);
    this.rawCssRedoStack.push(entry);
    this.render();
  }

  public redoRawCss(): void {
    const entry = this.rawCssRedoStack.pop();

    if (entry === undefined) {
      return;
    }

    this.setRawCssValue(entry.selector, entry.after);
    this.rawCssUndoStack.push(entry);
    this.render();
  }

  /**
   * Apply a style change. Returns true when it starts a new undo step, or false
   * when it coalesced into the previous change (a continuous slider/picker drag),
   * so callers can avoid recording a separate history entry per intermediate value.
   */
  public applyChange(change: StyleChange): boolean {
    const last = this.appliedChanges[this.appliedChanges.length - 1];

    if (last !== undefined && canCoalesceStyleChange(last, change)) {
      // Keep the original beforeValue, adopt the newest afterValue/timestamp.
      this.appliedChanges[this.appliedChanges.length - 1] = {
        ...last,
        afterValue: change.afterValue,
        timestamp: change.timestamp,
      };
      this.redoStack.length = 0;
      this.render();
      return false;
    }

    this.appliedChanges.push(change);
    this.redoStack.length = 0;
    this.render();
    return true;
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
    this.rawCssBySelector.clear();
    this.rawCssUndoStack.length = 0;
    this.rawCssRedoStack.length = 0;
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

  private buildRawCss(): string {
    return Array.from(this.rawCssBySelector.entries())
      .map(([selector, css]) => {
        const declarations = enforceImportant(css);
        return declarations.length === 0 ? "" : `${selector} {\n${declarations}\n}`;
      })
      .filter((block) => block.length > 0)
      .join("\n\n");
  }

  private render(): void {
    const rulesByTarget: RulesByResponsiveTarget = new Map();

    for (const change of this.appliedChanges) {
      applyChangeToRules(rulesByTarget, change);
    }

    const rawCss = this.buildRawCss();

    if (rulesByTarget.size === 0 && rawCss.length === 0) {
      document.getElementById(STYLE_ELEMENT_ID)?.remove();
      return;
    }

    const cssRules = STYLE_RESPONSIVE_TARGET_DEFINITIONS.flatMap((definition) => {
      const rulesBySelector = rulesByTarget.get(definition.target);

      if (rulesBySelector === undefined || rulesBySelector.size === 0) {
        return [];
      }

      const targetCss = Array.from(rulesBySelector.entries())
        .map(([selector, styles]) => buildImportantCssRule(selector, styles))
        .join("\n\n");

      return [wrapImportantCssForResponsiveTarget(targetCss, definition.target)];
    }).join("\n\n");
    const animationKeyframes = getAnimationPresetKeyframes(rulesByTarget);

    // Raw CSS goes last so it wins on equal specificity, closest to DevTools.
    this.getStyleElement().textContent = [cssRules, ...animationKeyframes, rawCss]
      .filter((block) => block.length > 0)
      .join("\n\n");
  }
}
