import {
  getStyleChangeResponsiveTarget,
  getStyleChangeState,
  getStyleResponsiveTargetDefinition,
  mergeStyleChanges,
} from "./styleDiff";

import type {
  AccessibilityNote,
  ElementSnapshot,
  StructuralEdit,
  StyleChange,
  UIChangeIntent,
  UIChangeSession,
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

  if (target.fallbackSelectors !== undefined && target.fallbackSelectors.length > 0) {
    intentTarget.fallbackSelectors = target.fallbackSelectors;
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

export type SessionElementInput = {
  target: ElementSnapshot;
  changes: StyleChange[];
  rawCss?: string;
  accessibilityNotes?: AccessibilityNote[];
};

export type CreateUIChangeSessionInput = {
  pageUrl: string;
  viewport: UIChangeSession["viewport"];
  elements: SessionElementInput[];
  structuralEdits?: StructuralEdit[];
  timestamp?: string;
  id?: string;
};

/**
 * Build a full editing session from every edited element (style changes + raw
 * CSS) plus structural edits. Only elements that actually changed are kept, so
 * the export reflects the entire session rather than one selected element.
 */
export const createUIChangeSession = ({
  pageUrl,
  viewport,
  elements,
  structuralEdits = [],
  timestamp = new Date().toISOString(),
  id = createId(),
}: CreateUIChangeSessionInput): UIChangeSession => {
  const intents = elements
    .map((element) => {
      const intent = createUIChangeIntent({
        pageUrl,
        viewport,
        target: element.target,
        changes: element.changes,
        accessibilityNotes: element.accessibilityNotes ?? [],
        timestamp,
      });

      const rawCss = element.rawCss?.trim();

      return rawCss !== undefined && rawCss.length > 0 ? { ...intent, rawCss } : intent;
    })
    .filter(
      (intent) =>
        intent.changes.length > 0 || (intent.rawCss !== undefined && intent.rawCss.length > 0),
    );

  const styleChanges = intents.reduce((total, intent) => total + intent.changes.length, 0);

  return {
    id,
    timestamp,
    pageUrl,
    viewport,
    elements: intents,
    structuralEdits,
    stats: {
      editedElements: intents.length,
      styleChanges,
      structuralEdits: structuralEdits.length,
    },
  };
};

export const summarizeChangeIntentAsMarkdown = (changeIntent: UIChangeIntent): string => {
  const changes = changeIntent.changes
    .map((change) => {
      const state = getStyleChangeState(change);
      const responsiveTarget = getStyleChangeResponsiveTarget(change);
      const responsiveDefinition = getStyleResponsiveTargetDefinition(responsiveTarget);
      const responsiveLabel = responsiveTarget === "all" ? "" : `[${responsiveDefinition.label}] `;
      const stateLabel = state === "base" ? "" : `:${state} `;
      return `- ${responsiveLabel}${stateLabel}${change.property}: ${change.beforeValue} -> ${change.afterValue}`;
    })
    .join("\n");

  const rawCssSection =
    changeIntent.rawCss !== undefined && changeIntent.rawCss.trim().length > 0
      ? ["", "## Raw CSS", "```css", changeIntent.rawCss.trim(), "```"]
      : [];

  return [
    `# UI change ${changeIntent.id}`,
    "",
    `Target: \`${changeIntent.target.selector}\``,
    `Page: ${changeIntent.pageUrl}`,
    "",
    "## Changes",
    changes.length > 0 ? changes : "No visual changes recorded.",
    ...rawCssSection,
  ].join("\n");
};

export const summarizeSessionAsMarkdown = (session: UIChangeSession): string => {
  const header = [
    `# UI change session ${session.id}`,
    "",
    `Page: ${session.pageUrl}`,
    `Elements edited: ${session.stats.editedElements}`,
    `Style changes: ${session.stats.styleChanges}`,
    `Structural edits: ${session.stats.structuralEdits}`,
  ];

  const elementSections = session.elements.map((intent, index) => {
    const changes = intent.changes
      .map((change) => {
        const state = getStyleChangeState(change);
        const responsiveTarget = getStyleChangeResponsiveTarget(change);
        const responsiveDefinition = getStyleResponsiveTargetDefinition(responsiveTarget);
        const responsiveLabel =
          responsiveTarget === "all" ? "" : `[${responsiveDefinition.label}] `;
        const stateLabel = state === "base" ? "" : `:${state} `;
        return `- ${responsiveLabel}${stateLabel}${change.property}: ${change.beforeValue} -> ${change.afterValue}`;
      })
      .join("\n");

    const rawCssSection =
      intent.rawCss !== undefined && intent.rawCss.trim().length > 0
        ? ["", "Raw CSS:", "```css", intent.rawCss.trim(), "```"]
        : [];

    return [
      `## ${index + 1}. \`${intent.target.selector}\``,
      changes.length > 0 ? changes : "No declarative changes.",
      ...rawCssSection,
    ].join("\n");
  });

  const structuralSection =
    session.structuralEdits.length > 0
      ? [
          "## Structural edits",
          ...session.structuralEdits.map(
            (edit) => `- (${edit.kind}) \`${edit.target.selector}\` — ${edit.summary}`,
          ),
        ]
      : [];

  return [...header, "", ...elementSections, "", ...structuralSection].join("\n").trim();
};
