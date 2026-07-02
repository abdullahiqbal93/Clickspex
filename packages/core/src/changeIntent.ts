import { getStyleChangeState, mergeStyleChanges } from "./styleDiff";

import type {
  AccessibilityNote,
  ElementSnapshot,
  StyleChange,
  UIChangeIntent,
} from "@ui-buddy/shared";

export type CreateUIChangeIntentInput = {
  pageUrl: string;
  viewport: UIChangeIntent["viewport"];
  target: ElementSnapshot;
  changes: StyleChange[];
  accessibilityNotes?: AccessibilityNote[];
  visualIntent?: string;
  frameworkHints?: string[];
  timestamp?: string;
  id?: string;
};

const createId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `ui-change-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const createUIChangeIntent = ({
  pageUrl,
  viewport,
  target,
  changes,
  accessibilityNotes = [],
  visualIntent,
  frameworkHints,
  timestamp = new Date().toISOString(),
  id = createId(),
}: CreateUIChangeIntentInput): UIChangeIntent => {
  const targetChanges = changes.filter((change) => change.selector === target.selector);
  const afterStyles = mergeStyleChanges(target.computedStyles, targetChanges);
  const intentTarget: UIChangeIntent["target"] = {
    tagName: target.tagName,
    classList: target.classList,
    selector: target.selector,
    domPath: target.domPath,
    attributes: target.attributes,
  };

  if (target.id.length > 0) {
    intentTarget.id = target.id;
  }

  if (target.textPreview.length > 0) {
    intentTarget.textPreview = target.textPreview;
  }

  const intent: UIChangeIntent = {
    id,
    timestamp,
    pageUrl,
    viewport,
    target: intentTarget,
    before: {
      styles: target.computedStyles,
      rect: target.rect,
      boxModel: target.boxModel,
    },
    after: {
      styles: afterStyles,
    },
    changes: targetChanges,
    accessibilityNotes,
  };

  if (visualIntent !== undefined) {
    intent.visualIntent = visualIntent;
  }

  if (frameworkHints !== undefined) {
    intent.frameworkHints = frameworkHints;
  }

  return intent;
};

export const summarizeChangeIntentAsMarkdown = (changeIntent: UIChangeIntent): string => {
  const changes = changeIntent.changes
    .map((change) => {
      const state = getStyleChangeState(change);
      const stateLabel = state === "base" ? "" : `:${state} `;
      return `- ${stateLabel}${change.property}: ${change.beforeValue} -> ${change.afterValue}`;
    })
    .join("\n");

  return [
    `# UI change ${changeIntent.id}`,
    "",
    `Target: \`${changeIntent.target.selector}\``,
    `Page: ${changeIntent.pageUrl}`,
    "",
    "## Changes",
    changes.length > 0 ? changes : "No visual changes recorded.",
  ].join("\n");
};
