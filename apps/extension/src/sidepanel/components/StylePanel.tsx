import {
  buildCssRulesFromChanges,
  buildScopedCssRule,
  buildStyleTargetSelector,
  escapeCssIdentifier,
} from "@ui-buddy/core";
import {
  STYLE_RESPONSIVE_TARGET_DEFINITIONS,
  type StyleChange,
  type StyleResponsiveTarget,
  type StyleResponsiveTargetDefinition,
  type StyleTargetState,
  type SupportedStyleProperty,
} from "@ui-buddy/shared";
import {
  ChevronDown,
  CircleAlert,
  Clipboard,
  Code2,
  Redo2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { getCurrentStyleRecord, usePanelStore } from "../store";

import { CommitInput } from "./CommitInput";
import { RawCssRuleEditor } from "./RawCssRuleEditor";

type StylePreset = {
  label: string;
  value: string;
  title?: string;
};

type StyleGuidance = {
  placeholder?: string;
  presets?: readonly StylePreset[];
  suggestions?: readonly string[];
};

type StyleField = {
  property: SupportedStyleProperty;
  label: string;
  group: string;
  options?: readonly string[];
  suggestions?: readonly string[];
};

type StyleStateOption = {
  state: StyleTargetState;
  label: string;
};

const STYLE_STATE_OPTIONS: StyleStateOption[] = [
  { state: "base", label: "Base" },
  { state: "hover", label: ":hover" },
  { state: "focus", label: ":focus" },
  { state: "focus-visible", label: ":focus-visible" },
  { state: "focus-within", label: ":focus-within" },
  { state: "active", label: ":active" },
  { state: "disabled", label: ":disabled" },
  { state: "checked", label: ":checked" },
];

const DEFAULT_RESPONSIVE_TARGET_DEFINITION: StyleResponsiveTargetDefinition = {
  target: "all",
  label: "All screens",
  shortLabel: "All",
  mediaQuery: null,
};

const BREAKPOINT_RANGE_LABELS: Record<StyleResponsiveTarget, string> = {
  all: "Always",
  mobile: "<=767px",
  tablet: "768-1023px",
  desktop: ">=1024px",
};

const getResponsiveTargetTitle = (target: StyleResponsiveTarget): string => {
  const definition = STYLE_RESPONSIVE_TARGET_DEFINITIONS.find((item) => item.target === target);
  const range = BREAKPOINT_RANGE_LABELS[target];

  if (definition?.mediaQuery === null) {
    return "Apply without a media query";
  }

  return definition === undefined
    ? range
    : `${definition.label} ${range} - @media ${definition.mediaQuery}`;
};

const FONT_WEIGHT_OPTIONS = [
  "",
  "normal",
  "bold",
  "lighter",
  "bolder",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
] as const;

const DISPLAY_OPTIONS = [
  "",
  "block",
  "inline",
  "inline-block",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "flow-root",
  "contents",
  "list-item",
  "table",
  "table-row",
  "table-cell",
  "none",
] as const;

const OVERFLOW_OPTIONS = ["", "visible", "hidden", "clip", "scroll", "auto"] as const;

const FLEX_ALIGNMENT_OPTIONS = [
  "",
  "normal",
  "stretch",
  "flex-start",
  "center",
  "flex-end",
  "start",
  "end",
  "baseline",
] as const;

const CONTENT_DISTRIBUTION_OPTIONS = [
  "",
  "normal",
  "stretch",
  "flex-start",
  "center",
  "flex-end",
  "space-between",
  "space-around",
  "space-evenly",
  "baseline",
] as const;

const CURSOR_OPTIONS = [
  "",
  "auto",
  "default",
  "pointer",
  "text",
  "move",
  "not-allowed",
  "help",
  "wait",
  "progress",
  "grab",
  "grabbing",
  "crosshair",
  "zoom-in",
  "zoom-out",
  "ew-resize",
  "ns-resize",
  "nesw-resize",
  "nwse-resize",
  "col-resize",
  "row-resize",
] as const;

const TIMING_FUNCTION_SUGGESTIONS = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
  "cubic-bezier(0.4, 0, 0.2, 1)",
  "steps(4, end)",
] as const;

const ANIMATION_PRESET_NAMES = [
  "ui-buddy-fade-in",
  "ui-buddy-slide-up",
  "ui-buddy-pop",
  "ui-buddy-pulse",
] as const;

const ANIMATION_PRESET_SUGGESTIONS = [
  "ui-buddy-fade-in 300ms ease-out both",
  "ui-buddy-slide-up 300ms ease-out both",
  "ui-buddy-pop 220ms ease-out both",
  "ui-buddy-pulse 1s ease-in-out infinite",
] as const;

const preset = (label: string, value: string, title?: string): StylePreset => ({
  label,
  value,
  ...(title === undefined ? {} : { title }),
});

const valuePresets = (...values: string[]): StylePreset[] =>
  values.map((value) => preset(value, value));

const SIZE_SUGGESTIONS = [
  "auto",
  "0",
  "50%",
  "100%",
  "16rem",
  "32rem",
  "50vw",
  "100vw",
  "50vh",
  "100vh",
  "fit-content",
  "min-content",
  "max-content",
  "clamp(16rem, 50vw, 48rem)",
] as const;
const MIN_SIZE_SUGGESTIONS = [
  "0",
  "10rem",
  "20rem",
  "50%",
  "100%",
  "min-content",
  "max-content",
] as const;
const MAX_SIZE_SUGGESTIONS = ["none", "100%", "32rem", "48rem", "64rem", "max-content"] as const;
const SPACING_SUGGESTIONS = [
  "0",
  "2px",
  "4px",
  "8px",
  "12px",
  "16px",
  "24px",
  "32px",
  "0.5rem",
  "1rem",
  "2rem",
  "5%",
  "10%",
] as const;
const MARGIN_SUGGESTIONS = [...SPACING_SUGGESTIONS, "auto"] as const;
const COLOR_SUGGESTIONS = [
  "transparent",
  "currentColor",
  "#000000",
  "#ffffff",
  "#0f172a",
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#f59e0b",
  "rgb(15, 23, 42)",
  "rgba(15, 23, 42, 0.5)",
  "var(--color-primary)",
] as const;
const FONT_FAMILY_SUGGESTIONS = [
  "inherit",
  "system-ui, sans-serif",
  "Arial, sans-serif",
  "Inter, sans-serif",
  "Georgia, serif",
  "ui-monospace, monospace",
  "var(--font-sans)",
] as const;
const FONT_SIZE_SUGGESTIONS = [
  "inherit",
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "32px",
  "0.875rem",
  "1rem",
  "1.25rem",
  "1.5rem",
  "2rem",
  "clamp(1rem, 2vw, 1.5rem)",
] as const;
const LINE_HEIGHT_SUGGESTIONS = [
  "normal",
  "1",
  "1.2",
  "1.4",
  "1.5",
  "1.6",
  "2",
  "20px",
  "24px",
  "32px",
] as const;
const LETTER_SPACING_SUGGESTIONS = [
  "normal",
  "-0.02em",
  "-0.01em",
  "0",
  "0.02em",
  "0.05em",
  "0.08em",
  "1px",
  "2px",
] as const;
const BORDER_WIDTH_SUGGESTIONS = [
  "0",
  "1px",
  "2px",
  "4px",
  "8px",
  "thin",
  "medium",
  "thick",
] as const;
const BORDER_RADIUS_SUGGESTIONS = [
  "0",
  "2px",
  "4px",
  "6px",
  "8px",
  "12px",
  "16px",
  "24px",
  "9999px",
  "50%",
] as const;
const POSITION_OFFSET_SUGGESTIONS = [
  "auto",
  "0",
  "4px",
  "8px",
  "16px",
  "24px",
  "1rem",
  "2rem",
  "10%",
  "50%",
  "100%",
] as const;
const Z_INDEX_SUGGESTIONS = ["auto", "0", "1", "10", "50", "100", "999", "9999"] as const;
const OPACITY_SUGGESTIONS = ["0", "0.1", "0.25", "0.5", "0.75", "0.9", "1"] as const;
const OBJECT_POSITION_SUGGESTIONS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "left top",
  "right top",
  "left bottom",
  "right bottom",
  "50% 50%",
] as const;
const TRANSFORM_SUGGESTIONS = [
  "none",
  "translateX(8px)",
  "translateY(-8px)",
  "scale(1.05)",
  "scale(0.95)",
  "rotate(3deg)",
  "rotate(-3deg)",
  "translateY(-4px) scale(1.02)",
  "skewX(6deg)",
  "perspective(800px) rotateX(8deg)",
] as const;
const TRANSFORM_ORIGIN_SUGGESTIONS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top left",
  "top right",
  "bottom left",
  "bottom right",
  "50% 50%",
] as const;
const FILTER_SUGGESTIONS = [
  "none",
  "blur(4px)",
  "brightness(1.1)",
  "contrast(1.15)",
  "grayscale(1)",
  "saturate(1.4)",
  "sepia(0.6)",
  "hue-rotate(30deg)",
  "hue-rotate(90deg)",
  "drop-shadow(0 8px 16px rgba(15, 23, 42, 0.2))",
] as const;
const BOX_SHADOW_SUGGESTIONS = [
  "none",
  "0 1px 2px rgba(15, 23, 42, 0.08)",
  "0 4px 12px rgba(15, 23, 42, 0.12)",
  "0 12px 32px rgba(15, 23, 42, 0.18)",
  "inset 0 0 0 1px rgba(15, 23, 42, 0.12)",
  "0 0 0 3px rgba(37, 99, 235, 0.25)",
] as const;
const TRANSITION_PROPERTY_SUGGESTIONS = [
  "all",
  "none",
  "opacity",
  "transform",
  "color",
  "background-color",
  "border-color",
  "box-shadow",
  "width",
  "height",
  "filter",
] as const;
const DURATION_SUGGESTIONS = [
  "0ms",
  "75ms",
  "100ms",
  "150ms",
  "200ms",
  "300ms",
  "500ms",
  "1s",
  "2s",
] as const;
const DELAY_SUGGESTIONS = ["0ms", "75ms", "100ms", "150ms", "300ms", "500ms", "1s"] as const;
const ITERATION_COUNT_SUGGESTIONS = ["1", "2", "3", "5", "infinite"] as const;

const SIZE_PRESETS = valuePresets("auto", "100%", "50%", "16rem", "32rem", "fit-content");
const MIN_SIZE_PRESETS = valuePresets("0", "10rem", "50%", "100%", "min-content", "max-content");
const MAX_SIZE_PRESETS = valuePresets("none", "100%", "32rem", "48rem", "64rem", "max-content");
const SPACING_PRESETS = valuePresets("0", "4px", "8px", "16px", "24px", "1rem");
const MARGIN_PRESETS = valuePresets("0", "8px", "16px", "1rem", "auto");
const COLOR_PRESETS = [
  preset("Black", "#000000"),
  preset("White", "#ffffff"),
  preset("Slate", "#0f172a"),
  preset("Blue", "#2563eb"),
  preset("Green", "#16a34a"),
  preset("Red", "#dc2626"),
  preset("Clear", "transparent"),
];
const FONT_SIZE_PRESETS = valuePresets("12px", "14px", "16px", "20px", "24px", "32px");
const LINE_HEIGHT_PRESETS = valuePresets("normal", "1", "1.2", "1.5", "1.75", "2");
const LETTER_SPACING_PRESETS = valuePresets("normal", "0", "0.02em", "0.05em", "1px");
const BORDER_WIDTH_PRESETS = valuePresets("0", "1px", "2px", "4px");
const BORDER_RADIUS_PRESETS = valuePresets("0", "4px", "8px", "12px", "9999px", "50%");
const OFFSET_PRESETS = valuePresets("auto", "0", "8px", "16px", "1rem", "50%");
const Z_INDEX_PRESETS = valuePresets("auto", "0", "1", "10", "100", "999");
const OPACITY_PRESETS = valuePresets("0", "0.25", "0.5", "0.75", "1");
const OBJECT_POSITION_PRESETS = valuePresets("center", "top", "bottom", "left", "right", "50% 50%");
const TRANSFORM_PRESETS = [
  preset("None", "none"),
  preset("Move X", "translateX(8px)"),
  preset("Move Up", "translateY(-8px)"),
  preset("Grow", "scale(1.05)"),
  preset("Shrink", "scale(0.95)"),
  preset("Rotate", "rotate(3deg)"),
  preset("Lift", "translateY(-4px) scale(1.02)"),
];
const FILTER_PRESETS = [
  preset("None", "none"),
  preset("Blur", "blur(4px)"),
  preset("Bright", "brightness(1.1)"),
  preset("Gray", "grayscale(1)"),
  preset("Vivid", "saturate(1.4)"),
  preset("Hue +", "hue-rotate(30deg)"),
  preset("Hue ++", "hue-rotate(90deg)"),
  preset("Shadow", "drop-shadow(0 8px 16px rgba(15, 23, 42, 0.2))"),
];
const SHADOW_PRESETS = [
  preset("None", "none"),
  preset("Soft", "0 1px 2px rgba(15, 23, 42, 0.08)"),
  preset("Card", "0 4px 12px rgba(15, 23, 42, 0.12)"),
  preset("Float", "0 12px 32px rgba(15, 23, 42, 0.18)"),
  preset("Ring", "0 0 0 3px rgba(37, 99, 235, 0.25)"),
];
const TRANSITION_PRESETS = [
  preset("All", "all 150ms ease"),
  preset("Fade", "opacity 150ms ease"),
  preset("Move", "transform 200ms ease-out"),
  preset("Color", "color 150ms ease, background-color 150ms ease"),
  preset("Slow", "all 500ms ease-in-out"),
];
const ANIMATION_PRESETS = [
  preset("Fade", "ui-buddy-fade-in 300ms ease-out both"),
  preset("Slide", "ui-buddy-slide-up 300ms ease-out both"),
  preset("Pop", "ui-buddy-pop 220ms ease-out both"),
  preset("Pulse", "ui-buddy-pulse 1s ease-in-out infinite"),
];
const ANIMATION_NAME_PRESETS = [
  preset("None", "none"),
  preset("Fade", "ui-buddy-fade-in"),
  preset("Slide", "ui-buddy-slide-up"),
  preset("Pop", "ui-buddy-pop"),
  preset("Pulse", "ui-buddy-pulse"),
];

const getFieldGuidance = (property: SupportedStyleProperty): StyleGuidance => {
  switch (property) {
    case "width":
    case "height":
      return {
        placeholder: "auto, 100%, 32rem",
        presets: SIZE_PRESETS,
        suggestions: SIZE_SUGGESTIONS,
      };
    case "min-width":
    case "min-height":
      return {
        placeholder: "0, 10rem, 100%",
        presets: MIN_SIZE_PRESETS,
        suggestions: MIN_SIZE_SUGGESTIONS,
      };
    case "max-width":
    case "max-height":
      return {
        placeholder: "none, 100%, 48rem",
        presets: MAX_SIZE_PRESETS,
        suggestions: MAX_SIZE_SUGGESTIONS,
      };
    case "margin-top":
    case "margin-right":
    case "margin-bottom":
    case "margin-left":
      return {
        placeholder: "0, 1rem, auto",
        presets: MARGIN_PRESETS,
        suggestions: MARGIN_SUGGESTIONS,
      };
    case "padding-top":
    case "padding-right":
    case "padding-bottom":
    case "padding-left":
      return { placeholder: "0, 1rem", presets: SPACING_PRESETS, suggestions: SPACING_SUGGESTIONS };
    case "gap":
      return {
        placeholder: "0, 1rem",
        presets: SPACING_PRESETS,
        suggestions: ["normal", ...SPACING_SUGGESTIONS],
      };
    case "color":
    case "background-color":
    case "border-color":
      return {
        placeholder: "#2563eb, transparent",
        presets: COLOR_PRESETS,
        suggestions: COLOR_SUGGESTIONS,
      };
    case "font-family":
      return {
        placeholder: "system-ui, sans-serif",
        presets: [
          preset("System", "system-ui, sans-serif"),
          preset("Sans", "Arial, sans-serif"),
          preset("Serif", "Georgia, serif"),
          preset("Mono", "ui-monospace, monospace"),
          preset("Inherit", "inherit"),
        ],
        suggestions: FONT_FAMILY_SUGGESTIONS,
      };
    case "font-size":
      return {
        placeholder: "16px, 1rem",
        presets: FONT_SIZE_PRESETS,
        suggestions: FONT_SIZE_SUGGESTIONS,
      };
    case "line-height":
      return {
        placeholder: "normal, 1.5, 24px",
        presets: LINE_HEIGHT_PRESETS,
        suggestions: LINE_HEIGHT_SUGGESTIONS,
      };
    case "letter-spacing":
      return {
        placeholder: "normal, 0.02em",
        presets: LETTER_SPACING_PRESETS,
        suggestions: LETTER_SPACING_SUGGESTIONS,
      };
    case "border-width":
      return {
        placeholder: "0, 1px, thin",
        presets: BORDER_WIDTH_PRESETS,
        suggestions: BORDER_WIDTH_SUGGESTIONS,
      };
    case "border-radius":
      return {
        placeholder: "0, 8px, 50%",
        presets: BORDER_RADIUS_PRESETS,
        suggestions: BORDER_RADIUS_SUGGESTIONS,
      };
    case "top":
    case "right":
    case "bottom":
    case "left":
      return {
        placeholder: "auto, 0, 1rem",
        presets: OFFSET_PRESETS,
        suggestions: POSITION_OFFSET_SUGGESTIONS,
      };
    case "z-index":
      return {
        placeholder: "auto, 10, 999",
        presets: Z_INDEX_PRESETS,
        suggestions: Z_INDEX_SUGGESTIONS,
      };
    case "opacity":
      return { placeholder: "0 to 1", presets: OPACITY_PRESETS, suggestions: OPACITY_SUGGESTIONS };
    case "order":
      return {
        placeholder: "0",
        presets: valuePresets("-1", "0", "1", "2"),
        suggestions: ["-2", "-1", "0", "1", "2", "3"],
      };
    case "flex-grow":
    case "flex-shrink":
      return {
        placeholder: "0, 1, 2",
        presets: valuePresets("0", "1", "2", "3"),
        suggestions: ["0", "1", "2", "3", "999"],
      };
    case "flex-basis":
      return {
        placeholder: "auto, 0, 50%",
        presets: valuePresets("auto", "0", "25%", "50%", "100%"),
        suggestions: ["auto", "0", "25%", "50%", "100%", "10rem", "20rem"],
      };
    case "object-position":
      return {
        placeholder: "center, top, 50% 50%",
        presets: OBJECT_POSITION_PRESETS,
        suggestions: OBJECT_POSITION_SUGGESTIONS,
      };
    case "transform":
      return {
        placeholder: "scale(1.05), translateY(-8px)",
        presets: TRANSFORM_PRESETS,
        suggestions: TRANSFORM_SUGGESTIONS,
      };
    case "transform-origin":
      return {
        placeholder: "center, top left",
        presets: valuePresets("center", "top", "bottom", "left", "right", "top left"),
        suggestions: TRANSFORM_ORIGIN_SUGGESTIONS,
      };
    case "filter":
      return {
        placeholder: "none, blur(4px)",
        presets: FILTER_PRESETS,
        suggestions: FILTER_SUGGESTIONS,
      };
    case "box-shadow":
      return {
        placeholder: "none, 0 4px 12px rgba(...)",
        presets: SHADOW_PRESETS,
        suggestions: BOX_SHADOW_SUGGESTIONS,
      };
    case "transition":
      return {
        placeholder: "all 150ms ease",
        presets: TRANSITION_PRESETS,
        suggestions: [
          "none",
          "all 150ms ease",
          "all 200ms ease-out",
          "opacity 150ms ease",
          "transform 200ms ease-out",
          "color 150ms ease, background-color 150ms ease",
        ],
      };
    case "transition-property":
      return {
        placeholder: "all, opacity, transform",
        presets: valuePresets(
          "all",
          "opacity",
          "transform",
          "color",
          "background-color",
          "box-shadow",
        ),
        suggestions: TRANSITION_PROPERTY_SUGGESTIONS,
      };
    case "transition-duration":
    case "animation-duration":
      return {
        placeholder: "150ms, 1s",
        presets: valuePresets("0ms", "150ms", "200ms", "300ms", "500ms", "1s"),
        suggestions: DURATION_SUGGESTIONS,
      };
    case "transition-timing-function":
    case "animation-timing-function":
      return {
        placeholder: "ease, ease-out",
        presets: valuePresets("linear", "ease", "ease-in", "ease-out", "ease-in-out"),
        suggestions: TIMING_FUNCTION_SUGGESTIONS,
      };
    case "transition-delay":
    case "animation-delay":
      return {
        placeholder: "0ms, 150ms",
        presets: valuePresets("0ms", "75ms", "150ms", "300ms", "1s"),
        suggestions: DELAY_SUGGESTIONS,
      };
    case "animation":
      return {
        placeholder: "ui-buddy-fade-in 300ms ease-out both",
        presets: ANIMATION_PRESETS,
        suggestions: ["none", ...ANIMATION_PRESET_SUGGESTIONS],
      };
    case "animation-name":
      return {
        placeholder: "ui-buddy-fade-in",
        presets: ANIMATION_NAME_PRESETS,
        suggestions: ["none", ...ANIMATION_PRESET_NAMES],
      };
    case "animation-iteration-count":
      return {
        placeholder: "1, 3, infinite",
        presets: valuePresets("1", "2", "3", "infinite"),
        suggestions: ITERATION_COUNT_SUGGESTIONS,
      };
    default:
      return {};
  }
};
const STYLE_FIELDS: StyleField[] = [
  { property: "width", label: "Width", group: "Size" },
  { property: "min-width", label: "Min width", group: "Size" },
  { property: "max-width", label: "Max width", group: "Size" },
  { property: "height", label: "Height", group: "Size" },
  { property: "min-height", label: "Min height", group: "Size" },
  { property: "max-height", label: "Max height", group: "Size" },
  { property: "margin-top", label: "Margin top", group: "Spacing" },
  { property: "margin-right", label: "Margin right", group: "Spacing" },
  { property: "margin-bottom", label: "Margin bottom", group: "Spacing" },
  { property: "margin-left", label: "Margin left", group: "Spacing" },
  { property: "padding-top", label: "Padding top", group: "Spacing" },
  { property: "padding-right", label: "Padding right", group: "Spacing" },
  { property: "padding-bottom", label: "Padding bottom", group: "Spacing" },
  { property: "padding-left", label: "Padding left", group: "Spacing" },
  { property: "gap", label: "Gap", group: "Spacing" },
  { property: "color", label: "Text color", group: "Color" },
  { property: "background-color", label: "Background", group: "Color" },
  {
    property: "background-repeat",
    label: "Repeat",
    group: "Color",
    options: ["", "repeat", "repeat-x", "repeat-y", "no-repeat", "space", "round"],
  },
  { property: "font-family", label: "Font family", group: "Typography" },
  { property: "font-size", label: "Font size", group: "Typography" },
  { property: "font-weight", label: "Weight", group: "Typography", options: FONT_WEIGHT_OPTIONS },
  {
    property: "font-style",
    label: "Style",
    group: "Typography",
    options: ["", "normal", "italic", "oblique"],
  },
  { property: "line-height", label: "Line height", group: "Typography" },
  { property: "letter-spacing", label: "Letter spacing", group: "Typography" },
  {
    property: "text-align",
    label: "Align text",
    group: "Typography",
    options: ["", "start", "end", "left", "right", "center", "justify", "match-parent"],
  },
  {
    property: "text-transform",
    label: "Transform text",
    group: "Typography",
    options: ["", "none", "capitalize", "uppercase", "lowercase", "full-width", "full-size-kana"],
  },
  {
    property: "text-decoration-line",
    label: "Decoration",
    group: "Typography",
    options: ["", "none", "underline", "overline", "line-through"],
  },
  { property: "border-width", label: "Border width", group: "Shape" },
  {
    property: "border-style",
    label: "Border style",
    group: "Shape",
    options: [
      "",
      "none",
      "hidden",
      "dotted",
      "dashed",
      "solid",
      "double",
      "groove",
      "ridge",
      "inset",
      "outset",
    ],
  },
  { property: "border-color", label: "Border color", group: "Shape" },
  { property: "border-radius", label: "Radius", group: "Shape" },
  { property: "display", label: "Display", group: "Layout", options: DISPLAY_OPTIONS },
  {
    property: "box-sizing",
    label: "Box sizing",
    group: "Layout",
    options: ["", "content-box", "border-box"],
  },
  { property: "overflow", label: "Overflow", group: "Layout", options: OVERFLOW_OPTIONS },
  { property: "overflow-x", label: "Overflow X", group: "Layout", options: OVERFLOW_OPTIONS },
  { property: "overflow-y", label: "Overflow Y", group: "Layout", options: OVERFLOW_OPTIONS },
  {
    property: "flex-direction",
    label: "Direction",
    group: "Layout",
    options: ["", "row", "row-reverse", "column", "column-reverse"],
  },
  {
    property: "flex-wrap",
    label: "Wrap",
    group: "Layout",
    options: ["", "nowrap", "wrap", "wrap-reverse"],
  },
  {
    property: "justify-content",
    label: "Justify",
    group: "Layout",
    options: CONTENT_DISTRIBUTION_OPTIONS,
  },
  { property: "align-items", label: "Align", group: "Layout", options: FLEX_ALIGNMENT_OPTIONS },
  {
    property: "align-content",
    label: "Align content",
    group: "Layout",
    options: CONTENT_DISTRIBUTION_OPTIONS,
  },
  {
    property: "align-self",
    label: "Align self",
    group: "Layout",
    options: ["", "auto", "normal", "stretch", "flex-start", "center", "flex-end", "baseline"],
  },
  { property: "order", label: "Order", group: "Layout" },
  { property: "flex-grow", label: "Grow", group: "Layout" },
  { property: "flex-shrink", label: "Shrink", group: "Layout" },
  { property: "flex-basis", label: "Basis", group: "Layout" },
  {
    property: "justify-items",
    label: "Justify items",
    group: "Layout",
    options: ["", "normal", "stretch", "start", "end", "center", "left", "right"],
  },
  {
    property: "justify-self",
    label: "Justify self",
    group: "Layout",
    options: ["", "auto", "normal", "stretch", "start", "end", "center", "left", "right"],
  },
  {
    property: "position",
    label: "Position",
    group: "Position",
    options: ["", "static", "relative", "absolute", "fixed", "sticky"],
  },
  { property: "top", label: "Top", group: "Position" },
  { property: "right", label: "Right", group: "Position" },
  { property: "bottom", label: "Bottom", group: "Position" },
  { property: "left", label: "Left", group: "Position" },
  { property: "z-index", label: "Z index", group: "Position" },
  {
    property: "visibility",
    label: "Visibility",
    group: "Effects",
    options: ["", "visible", "hidden", "collapse"],
  },
  { property: "opacity", label: "Opacity", group: "Effects" },
  { property: "cursor", label: "Cursor", group: "Effects", options: CURSOR_OPTIONS },
  {
    property: "pointer-events",
    label: "Pointer events",
    group: "Effects",
    options: ["", "auto", "none"],
  },
  {
    property: "user-select",
    label: "User select",
    group: "Effects",
    options: ["", "auto", "text", "none", "contain", "all"],
  },
  {
    property: "object-fit",
    label: "Object fit",
    group: "Effects",
    options: ["", "fill", "contain", "cover", "none", "scale-down"],
  },
  { property: "object-position", label: "Object position", group: "Effects" },
  { property: "transform", label: "Transform", group: "Effects" },
  { property: "transform-origin", label: "Transform origin", group: "Effects" },
  { property: "filter", label: "Filter", group: "Effects" },
  { property: "box-shadow", label: "Shadow", group: "Effects" },
  {
    property: "transition",
    label: "Transition",
    group: "Transition",
    suggestions: [
      "all 150ms ease",
      "all 200ms ease-out",
      "opacity 150ms ease",
      "transform 200ms ease-out",
    ],
  },
  {
    property: "transition-property",
    label: "Property",
    group: "Transition",
    suggestions: [
      "all",
      "none",
      "opacity",
      "transform",
      "color",
      "background-color",
      "width",
      "height",
    ],
  },
  {
    property: "transition-duration",
    label: "Duration",
    group: "Transition",
    suggestions: ["150ms", "200ms", "300ms", "500ms", "1s"],
  },
  {
    property: "transition-timing-function",
    label: "Timing",
    group: "Transition",
    suggestions: TIMING_FUNCTION_SUGGESTIONS,
  },
  {
    property: "transition-delay",
    label: "Delay",
    group: "Transition",
    suggestions: ["0ms", "75ms", "150ms", "300ms", "1s"],
  },
  {
    property: "animation",
    label: "Animation",
    group: "Animation",
    suggestions: ANIMATION_PRESET_SUGGESTIONS,
  },
  {
    property: "animation-name",
    label: "Name",
    group: "Animation",
    suggestions: ANIMATION_PRESET_NAMES,
  },
  {
    property: "animation-duration",
    label: "Duration",
    group: "Animation",
    suggestions: ["150ms", "300ms", "500ms", "1s", "2s"],
  },
  {
    property: "animation-timing-function",
    label: "Timing",
    group: "Animation",
    suggestions: TIMING_FUNCTION_SUGGESTIONS,
  },
  {
    property: "animation-delay",
    label: "Delay",
    group: "Animation",
    suggestions: ["0ms", "75ms", "150ms", "300ms", "1s"],
  },
  {
    property: "animation-iteration-count",
    label: "Iterations",
    group: "Animation",
    suggestions: ["1", "2", "3", "infinite"],
  },
  {
    property: "animation-direction",
    label: "Direction",
    group: "Animation",
    options: ["", "normal", "reverse", "alternate", "alternate-reverse"],
  },
  {
    property: "animation-fill-mode",
    label: "Fill mode",
    group: "Animation",
    options: ["", "none", "forwards", "backwards", "both"],
  },
  {
    property: "animation-play-state",
    label: "Play state",
    group: "Animation",
    options: ["", "running", "paused"],
  },
];

const getSelectOptions = (options: readonly string[], value: string): string[] => {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 && !options.includes(trimmedValue)
    ? [trimmedValue, ...options]
    : [...options];
};

const getOptionLabel = (option: string, fieldOptions: readonly string[], value: string): string => {
  if (option.length === 0) {
    return "No override";
  }

  return !fieldOptions.includes(option) && option === value.trim() ? `Current: ${option}` : option;
};

const getSuggestionValues = (field: StyleField, guidance: StyleGuidance): string[] => {
  const values = [
    ...(field.suggestions ?? []),
    ...(guidance.suggestions ?? []),
    ...(guidance.presets?.map((fieldPreset) => fieldPreset.value) ?? []),
  ];

  return [...new Set(values.filter((value) => value.trim().length > 0))];
};

const getPresetTitle = (field: StyleField, fieldPreset: StylePreset): string =>
  fieldPreset.title ?? `${field.label}: ${fieldPreset.value}`;
const groupedFields = STYLE_FIELDS.reduce<Record<string, StyleField[]>>((groups, field) => {
  groups[field.group] = [...(groups[field.group] ?? []), field];
  return groups;
}, {});
const styleFieldGroups = Object.entries(groupedFields);
const defaultExpandedGroup = styleFieldGroups[0]?.[0];

const CSS_WIDE_KEYWORDS = ["inherit", "initial", "unset", "revert", "revert-layer"];

const getRawCssValueSuggestions = (property: string): string[] => {
  const field = STYLE_FIELDS.find((candidate) => candidate.property === property);
  const fieldValues =
    field === undefined ? [] : getSuggestionValues(field, getFieldGuidance(field.property));

  return [...new Set([...fieldValues, ...CSS_WIDE_KEYWORDS])];
};

const cssColorToHex = (value: string): string | null => {
  const match = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);

  if (match === null) {
    return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null;
  }

  const [, red, green, blue] = match;
  const channels = [red, green, blue].map((channel) =>
    Number.parseInt(channel ?? "0", 10)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${channels.join("")}`;
};

const isCssValueSupported = (property: string, value: string): boolean =>
  value.trim().length === 0 || typeof CSS === "undefined" || CSS.supports(property, value);

export const StylePanel = () => {
  const changes = usePanelStore((state) => state.changes);
  const rawCssEntries = usePanelStore((state) => state.rawCssEntries);
  const historyUndoDepth = usePanelStore((state) => state.historyUndoDepth);
  const historyRedoDepth = usePanelStore((state) => state.historyRedoDepth);
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const [styleTargetState, setStyleTargetState] = useState<StyleTargetState>("base");
  const [styleResponsiveTarget, setStyleResponsiveTarget] = useState<StyleResponsiveTarget>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(defaultExpandedGroup === undefined ? [] : [defaultExpandedGroup]),
  );
  const styles = getCurrentStyleRecord(
    { changes, selectedElement },
    styleTargetState,
    styleResponsiveTarget,
  );
  const prepareStyleChange = usePanelStore((state) => state.prepareStyleChange);
  const applyLocalStyleChange = usePanelStore((state) => state.applyLocalStyleChange);
  const resetElementChanges = usePanelStore((state) => state.resetElementChanges);
  const setError = usePanelStore((state) => state.setError);
  const setSelectedElement = usePanelStore((state) => state.setSelectedElement);
  // Remember the element-unique selector so scope can be switched back.
  const uniqueSelectorRef = useRef<{ domPath: string; selector: string } | null>(null);
  const selectedSelector = selectedElement?.selector ?? null;
  const rawCssSelector =
    selectedSelector === null ? "" : buildStyleTargetSelector(selectedSelector, styleTargetState);
  const selectedRawCss =
    rawCssSelector.length === 0
      ? ""
      : (rawCssEntries.find((entry) => entry.selector === rawCssSelector)?.css ?? "");
  // Raw CSS editor.
  const [rawCss, setRawCss] = useState(selectedRawCss);
  const [rawCssApplied, setRawCssApplied] = useState(false);
  const [rawCssExpanded, setRawCssExpanded] = useState(true);
  const rawCssAppliedTimer = useRef<number | null>(null);
  const [quickProperty, setQuickProperty] = useState<SupportedStyleProperty>("color");
  const [quickDraft, setQuickDraft] = useState("");
  const [styleFilter, setStyleFilter] = useState("");

  useEffect(() => {
    const currentStyles = getCurrentStyleRecord(
      { changes, selectedElement },
      styleTargetState,
      styleResponsiveTarget,
    );
    setQuickDraft(currentStyles[quickProperty] ?? "");
  }, [changes, quickProperty, selectedElement, styleResponsiveTarget, styleTargetState]);

  useEffect(() => {
    setRawCss(selectedRawCss);
  }, [rawCssSelector, selectedRawCss]);

  useEffect(
    () => () => {
      if (rawCssAppliedTimer.current !== null) {
        window.clearTimeout(rawCssAppliedTimer.current);
      }
    },
    [],
  );

  const applyRawCss = async (css: string, coalesce = false) => {
    if (selectedElement === null) {
      return;
    }

    setError(null);

    try {
      await sendMessageToActiveTab({
        type: "APPLY_RAW_CSS",
        payload: { selector: rawCssSelector, css, coalesce },
      });
      setRawCssApplied(true);

      if (rawCssAppliedTimer.current !== null) {
        window.clearTimeout(rawCssAppliedTimer.current);
      }
      rawCssAppliedTimer.current = window.setTimeout(() => {
        rawCssAppliedTimer.current = null;
        setRawCssApplied(false);
      }, 800);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to apply raw CSS.");
    }
  };

  const updateRawCss = (css: string) => {
    setRawCss(css);
    void applyRawCss(css, true);
  };

  const clearRawCss = () => {
    setRawCss("");
    void applyRawCss("");
  };
  const classSelector =
    selectedElement !== null && selectedElement.classList.length > 0
      ? `${selectedElement.tagName}${selectedElement.classList
          .map((className) => `.${escapeCssIdentifier(className)}`)
          .join("")}`
      : null;
  const isClassScope =
    selectedElement !== null &&
    classSelector !== null &&
    selectedElement.selector === classSelector;

  const setSelectorScope = (scope: "unique" | "class") => {
    if (selectedElement === null || classSelector === null) {
      return;
    }

    if (scope === "class" && !isClassScope) {
      uniqueSelectorRef.current = {
        domPath: selectedElement.domPath,
        selector: selectedElement.selector,
      };
      setSelectedElement({ ...selectedElement, selector: classSelector });
    }

    if (scope === "unique" && isClassScope) {
      const remembered =
        uniqueSelectorRef.current?.domPath === selectedElement.domPath
          ? uniqueSelectorRef.current.selector
          : (selectedElement.fallbackSelectors?.[0] ?? selectedElement.selector);
      setSelectedElement({ ...selectedElement, selector: remembered });
    }
  };

  const commitChange = async (property: SupportedStyleProperty, afterValue: string) => {
    setError(null);
    const change = prepareStyleChange(
      property,
      afterValue,
      styleTargetState,
      styleResponsiveTarget,
    );

    if (change === null) {
      return;
    }

    try {
      await sendMessageToActiveTab({ type: "APPLY_STYLE_CHANGE", payload: change });
      applyLocalStyleChange(change);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to apply style change.",
      );
    }
  };

  const undoChange = async () => {
    setError(null);

    try {
      await sendMessageToActiveTab({ type: "UNDO_CHANGE" });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to undo visual change.",
      );
    }
  };

  const redoChange = async () => {
    setError(null);

    try {
      await sendMessageToActiveTab({ type: "REDO_CHANGE" });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to redo visual change.",
      );
    }
  };
  const resetChanges = async () => {
    setError(null);

    try {
      await sendMessageToActiveTab({ type: "RESET_ELEMENT_CHANGES" });
      resetElementChanges();
      setRawCss("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to reset visual changes.",
      );
    }
  };

  if (selectedElement === null) {
    return (
      <div className="ub-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <SlidersHorizontal aria-hidden="true" size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Styles</h2>
            <p className="text-2xs text-muted">Select an element to edit its styles.</p>
          </div>
        </div>
      </div>
    );
  }

  const writeCssToClipboard = async (css: string) => {
    try {
      await navigator.clipboard.writeText(css);
    } catch {
      // ignore
    }
  };

  const copyAllCss = async () => {
    const selectedChanges = changes.filter(
      (change) =>
        change.selector === selectedElement.selector && change.afterValue.trim().length > 0,
    );

    if (selectedChanges.length === 0) {
      return;
    }

    await writeCssToClipboard(buildCssRulesFromChanges(selectedElement.selector, selectedChanges));
  };

  const copyGroupCss = async (fields: StyleField[]) => {
    const declarations = fields.reduce<Record<string, string>>((record, field) => {
      const value = styles[field.property];

      if (value !== undefined && value.trim().length > 0) {
        record[field.property] = value;
      }

      return record;
    }, {});

    if (Object.keys(declarations).length === 0) {
      return;
    }

    await writeCssToClipboard(
      buildScopedCssRule(
        selectedElement.selector,
        declarations,
        styleTargetState,
        styleResponsiveTarget,
      ),
    );
  };

  const activeChangeMap = new Map<SupportedStyleProperty, StyleChange>();
  for (const change of changes) {
    if (
      change.selector === selectedElement.selector &&
      (change.state ?? "base") === styleTargetState &&
      (change.responsiveTarget ?? "all") === styleResponsiveTarget
    ) {
      activeChangeMap.set(change.property, change);
    }
  }
  const modifiedDeclarations = Array.from(activeChangeMap.values())
    .filter((change) => change.afterValue.trim().length > 0)
    .sort(
      (left, right) =>
        STYLE_FIELDS.findIndex((field) => field.property === left.property) -
        STYLE_FIELDS.findIndex((field) => field.property === right.property),
    );
  const quickField =
    STYLE_FIELDS.find((field) => field.property === quickProperty) ?? STYLE_FIELDS[0]!;
  const quickGuidance = getFieldGuidance(quickProperty);
  const quickSuggestions = getSuggestionValues(quickField, quickGuidance);
  const quickValid = isCssValueSupported(quickProperty, quickDraft);
  const normalizedStyleFilter = styleFilter.trim().toLowerCase();
  const filteredStyleFieldGroups = styleFieldGroups
    .map(
      ([group, fields]) =>
        [
          group,
          normalizedStyleFilter.length === 0
            ? fields
            : fields.filter(
                (field) =>
                  field.label.toLowerCase().includes(normalizedStyleFilter) ||
                  field.property.includes(normalizedStyleFilter) ||
                  field.group.toLowerCase().includes(normalizedStyleFilter),
              ),
        ] as const,
    )
    .filter(([, fields]) => fields.length > 0);

  const selectQuickProperty = (property: SupportedStyleProperty) => {
    setQuickProperty(property);
    setQuickDraft(styles[property] ?? "");
  };

  const previewQuickValue = (nextValue: string) => {
    setQuickDraft(nextValue);

    if (isCssValueSupported(quickProperty, nextValue)) {
      void commitChange(quickProperty, nextValue);
    }
  };

  const copyCurrentRule = async () => {
    const declarations = Object.fromEntries(
      modifiedDeclarations
        .filter((change) => change.afterValue.trim().length > 0)
        .map((change) => [change.property, change.afterValue]),
    );

    if (Object.keys(declarations).length === 0) {
      return;
    }

    await writeCssToClipboard(
      buildScopedCssRule(
        selectedElement.selector,
        declarations,
        styleTargetState,
        styleResponsiveTarget,
      ),
    );
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((currentGroups) => {
      const nextGroups = new Set(currentGroups);

      if (nextGroups.has(group)) {
        nextGroups.delete(group);
      } else {
        nextGroups.add(group);
      }

      return nextGroups;
    });
  };

  const activeResponsiveDefinition =
    STYLE_RESPONSIVE_TARGET_DEFINITIONS.find(
      (definition) => definition.target === styleResponsiveTarget,
    ) ?? DEFAULT_RESPONSIVE_TARGET_DEFINITION;

  return (
    <div className="space-y-3">
      <div className="ub-card p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Styles</h2>
            <p className="mt-0.5 text-2xs text-muted">
              {changes.length} {changes.length === 1 ? "change" : "changes"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="ub-icon-btn"
              disabled={historyUndoDepth === 0}
              onClick={() => void undoChange()}
              title="Undo (all change types)"
              type="button"
            >
              <Undo2 aria-hidden="true" size={14} />
            </button>
            <button
              className="ub-icon-btn"
              disabled={historyRedoDepth === 0}
              onClick={() => void redoChange()}
              title="Redo (all change types)"
              type="button"
            >
              <Redo2 aria-hidden="true" size={14} />
            </button>
            <button
              className="ub-btn ml-1 px-2.5"
              onClick={() => void copyAllCss()}
              title="Copy all modified styles"
              type="button"
            >
              <Clipboard aria-hidden="true" size={13} />
              Copy
            </button>
            <button
              className="ub-btn px-2.5"
              onClick={() => void resetChanges()}
              title="Remove every style and raw-CSS edit from this whole session"
              type="button"
            >
              <RotateCcw aria-hidden="true" size={13} />
              Reset all
            </button>
          </div>
        </div>
        {classSelector !== null ? (
          <div className="mt-3 flex items-center gap-1 rounded-xl bg-accent-softer p-1">
            <button
              className={`h-7 flex-1 truncate rounded-xl px-2 text-2xs font-medium transition ${
                !isClassScope
                  ? "bg-panel text-accent shadow-sm"
                  : "text-muted hover:bg-panel/60 hover:text-ink"
              }`}
              onClick={() => setSelectorScope("unique")}
              title="Changes apply to this element only"
              type="button"
            >
              This element
            </button>
            <button
              className={`h-7 flex-1 truncate rounded-xl px-2 text-2xs font-medium transition ${
                isClassScope
                  ? "bg-panel text-accent shadow-sm"
                  : "text-muted hover:bg-panel/60 hover:text-ink"
              }`}
              onClick={() => setSelectorScope("class")}
              title={`Changes apply to every ${classSelector}`}
              type="button"
            >
              All {classSelector}
            </button>
          </div>
        ) : null}
        <div className="mt-3 flex overflow-x-auto rounded-xl bg-accent-softer p-1 scrollbar-hide">
          {STYLE_STATE_OPTIONS.map((option) => (
            <button
              className={`h-7 shrink-0 rounded-xl px-2.5 text-2xs font-medium transition ${
                styleTargetState === option.state
                  ? "bg-panel text-accent shadow-sm"
                  : "text-muted hover:bg-panel/60 hover:text-ink"
              }`}
              key={option.state}
              onClick={() => setStyleTargetState(option.state)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex overflow-x-auto rounded-xl bg-accent-softer p-1 scrollbar-hide">
          {STYLE_RESPONSIVE_TARGET_DEFINITIONS.map((definition) => (
            <button
              className={`flex h-9 min-w-[78px] shrink-0 flex-col items-center justify-center rounded-xl px-2 text-2xs font-medium transition ${
                styleResponsiveTarget === definition.target
                  ? "bg-panel text-accent shadow-sm"
                  : "text-muted hover:bg-panel/60 hover:text-ink"
              }`}
              key={definition.target}
              onClick={() => setStyleResponsiveTarget(definition.target)}
              title={getResponsiveTargetTitle(definition.target)}
              type="button"
            >
              <span>{definition.shortLabel}</span>
              <span className="text-[9px] font-normal tabular-nums text-slate-400">
                {BREAKPOINT_RANGE_LABELS[definition.target]}
              </span>
            </button>
          ))}
        </div>
        {activeResponsiveDefinition.mediaQuery === null ? null : (
          <div className="mt-2 flex min-w-0 items-center justify-between gap-2 rounded-xl bg-accent-softer px-2.5 py-2 text-2xs text-accent-hover ring-1 ring-inset ring-accent-soft">
            <span className="shrink-0 font-medium">{activeResponsiveDefinition.label}</span>
            <code className="min-w-0 truncate rounded-xl bg-panel/80 px-1.5 py-0.5 font-mono text-[10px] text-accent-hover">
              @media {activeResponsiveDefinition.mediaQuery}
            </code>
          </div>
        )}
      </div>

      <section className="ub-card overflow-hidden">
        <div className="border-b border-line px-3.5 py-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="text-accent" size={14} />
            <h3 className="text-sm font-semibold tracking-tight">Quick edit</h3>
          </div>
          <p className="mt-0.5 text-2xs text-muted">
            Pick any property and preview valid values as you type.
          </p>
        </div>
        <div className="space-y-2.5 px-3.5 py-3">
          <label className="block text-2xs font-medium text-muted" htmlFor="quick-style-property">
            Property
          </label>
          <select
            className="ub-input h-9 w-full font-mono text-xs"
            id="quick-style-property"
            onChange={(event) => selectQuickProperty(event.target.value as SupportedStyleProperty)}
            value={quickProperty}
          >
            {styleFieldGroups.map(([group, fields]) => (
              <optgroup key={group} label={group}>
                {fields.map((field) => (
                  <option key={field.property} value={field.property}>
                    {field.label} ({field.property})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="flex min-w-0 items-center gap-2">
            {cssColorToHex(quickDraft) === null ? null : (
              <input
                aria-label={quickField.label + " color"}
                className="h-9 w-10 shrink-0 cursor-pointer rounded-xl border border-line bg-transparent p-0.5"
                onChange={(event) => previewQuickValue(event.target.value)}
                type="color"
                value={cssColorToHex(quickDraft) ?? "#000000"}
              />
            )}
            {quickField.options === undefined ? (
              <>
                <input
                  aria-invalid={!quickValid}
                  className="ub-input h-9 min-w-0 flex-1 font-mono text-xs"
                  id="quick-style-value"
                  list={quickSuggestions.length === 0 ? undefined : "quick-style-suggestions"}
                  onChange={(event) => previewQuickValue(event.target.value)}
                  placeholder={quickGuidance.placeholder ?? "Enter a CSS value"}
                  spellCheck={false}
                  value={quickDraft}
                />
                {quickSuggestions.length === 0 ? null : (
                  <datalist id="quick-style-suggestions">
                    {quickSuggestions.map((suggestion) => (
                      <option key={suggestion} value={suggestion} />
                    ))}
                  </datalist>
                )}
              </>
            ) : (
              <select
                className="ub-input h-9 min-w-0 flex-1"
                id="quick-style-value"
                onChange={(event) => previewQuickValue(event.target.value)}
                value={quickDraft}
              >
                {getSelectOptions(quickField.options, quickDraft).map((option) => (
                  <option key={option || "no-override"} value={option}>
                    {getOptionLabel(option, quickField.options ?? [], quickDraft)}
                  </option>
                ))}
              </select>
            )}
            <button
              aria-label={"Clear " + quickField.label}
              className="ub-icon-btn"
              onClick={() => previewQuickValue("")}
              title={"Clear " + quickField.label}
              type="button"
            >
              <X aria-hidden="true" size={13} />
            </button>
          </div>
          {quickValid ? null : (
            <div className="flex items-center gap-1.5 text-[10px] text-rose-600">
              <CircleAlert aria-hidden="true" size={12} />
              This value is not valid for {quickProperty}; it has not been applied.
            </div>
          )}
          {(quickGuidance.presets?.length ?? 0) === 0 ? null : (
            <div className="flex flex-wrap gap-1.5">
              {quickGuidance.presets?.map((fieldPreset) => (
                <button
                  className="max-w-[130px] truncate rounded-xl bg-accent-softer px-2 py-1 text-[10px] font-medium text-muted transition hover:bg-accent-soft hover:text-ink"
                  key={fieldPreset.label + fieldPreset.value}
                  onClick={() => previewQuickValue(fieldPreset.value)}
                  title={getPresetTitle(quickField, fieldPreset)}
                  type="button"
                >
                  {fieldPreset.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {modifiedDeclarations.length === 0 ? null : (
        <section className="ub-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Modified</h3>
              <p className="text-[10px] text-muted">
                {modifiedDeclarations.length} in {styleTargetState} / {styleResponsiveTarget}
              </p>
            </div>
            <button
              className="ub-icon-btn h-7 w-7"
              onClick={() => void copyCurrentRule()}
              title="Copy the current scoped rule"
              type="button"
            >
              <Clipboard aria-hidden="true" size={12} />
            </button>
          </div>
          <div className="divide-y divide-line/70">
            {modifiedDeclarations.map((change) => (
              <div
                className="grid grid-cols-[minmax(90px,0.8fr)_minmax(0,1fr)_28px] items-center gap-2 px-3.5 py-2"
                key={change.property}
              >
                <button
                  className="truncate text-left font-mono text-[10px] font-semibold text-accent-hover"
                  onClick={() => selectQuickProperty(change.property)}
                  title={"Edit " + change.property}
                  type="button"
                >
                  {change.property}
                </button>
                <code className="truncate text-[10px] text-slate-600" title={change.afterValue}>
                  {change.afterValue}
                </code>
                <button
                  aria-label={"Remove " + change.property}
                  className="ub-icon-btn h-7 w-7"
                  onClick={() => void commitChange(change.property, "")}
                  title={"Remove " + change.property}
                  type="button"
                >
                  <X aria-hidden="true" size={12} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="ub-card p-3">
        <label className="relative block" htmlFor="style-property-search">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            size={13}
          />
          <input
            className="ub-input h-9 w-full pl-8 pr-8 text-xs"
            id="style-property-search"
            onChange={(event) => setStyleFilter(event.target.value)}
            placeholder="Find a CSS property..."
            type="search"
            value={styleFilter}
          />
          {styleFilter.length === 0 ? null : (
            <button
              aria-label="Clear property search"
              className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-accent-softer hover:text-ink"
              onClick={() => setStyleFilter("")}
              type="button"
            >
              <X aria-hidden="true" size={12} />
            </button>
          )}
        </label>
      </div>

      <section className="overflow-hidden border-y border-slate-300 bg-white">
        <button
          aria-expanded={rawCssExpanded}
          className="flex h-10 w-full items-center justify-between gap-2 bg-slate-50 px-3 text-left hover:bg-slate-100"
          onClick={() => setRawCssExpanded((expanded) => !expanded)}
          type="button"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <ChevronDown
              aria-hidden="true"
              className={
                "text-slate-500 transition-transform " + (rawCssExpanded ? "" : "-rotate-90")
              }
              size={13}
            />
            <Code2 aria-hidden="true" className="text-slate-600" size={13} />
            Raw CSS
          </span>
          <span className="font-mono text-[10px] text-slate-500">
            {rawCss.trim().length === 0 ? "All screens" : "Live | All screens"}
          </span>
        </button>
        {rawCssExpanded ? (
          <div className="border-t border-slate-300 p-2">
            <RawCssRuleEditor
              applied={rawCssApplied}
              css={rawCss}
              getValueSuggestions={getRawCssValueSuggestions}
              onChange={updateRawCss}
              onClear={clearRawCss}
              selector={rawCssSelector}
            />
          </div>
        ) : null}
      </section>
      {filteredStyleFieldGroups.length === 0 ? (
        <div className="ub-card px-4 py-6 text-center text-xs text-muted">
          No CSS properties match <code>{styleFilter.trim()}</code>.
        </div>
      ) : null}

      {filteredStyleFieldGroups.map(([group, fields]) => {
        const isExpanded = normalizedStyleFilter.length > 0 || expandedGroups.has(group);
        const contentId = `style-group-${group.toLowerCase().replace(/\s+/g, "-")}`;

        return (
          <section className="ub-card overflow-hidden" key={group}>
            <div
              className={`flex items-center justify-between gap-2 p-3 transition-colors ${
                isExpanded ? "bg-accent-softer/60" : "hover:bg-slate-50"
              }`}
            >
              <button
                aria-controls={contentId}
                aria-expanded={isExpanded}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold tracking-tight text-ink"
                onClick={() => toggleGroup(group)}
                type="button"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={`shrink-0 text-muted transition-transform ${isExpanded ? "text-accent" : "-rotate-90"}`}
                  size={14}
                />
                <span className="truncate">{group}</span>
              </button>
              <button
                className="inline-flex h-6 w-6 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-accent-softer hover:text-ink"
                onClick={() => void copyGroupCss(fields)}
                title={`Copy ${group} CSS`}
                type="button"
              >
                <Clipboard aria-hidden="true" size={12} />
              </button>
            </div>
            {isExpanded ? (
              <div className="space-y-2.5 border-t border-line px-3.5 py-3" id={contentId}>
                {fields.map((field) => {
                  const value = styles[field.property] ?? "";
                  const trimmedValue = value.trim();
                  const inputId = `style-${styleResponsiveTarget}-${styleTargetState}-${field.property}`;
                  const selectOptionsSource = field.options;
                  const guidance = getFieldGuidance(field.property);
                  const suggestionValues = getSuggestionValues(field, guidance);
                  const suggestionListId =
                    suggestionValues.length === 0 ? undefined : `${inputId}-suggestions`;
                  const hexColor =
                    field.property === "color" || field.property.endsWith("color")
                      ? cssColorToHex(value)
                      : null;
                  const fieldPresets = guidance.presets ?? [];

                  return (
                    <div
                      className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-3"
                      key={field.property}
                    >
                      <label className="pt-2 text-xs font-medium text-muted" htmlFor={inputId}>
                        {field.label}
                      </label>
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          {hexColor !== null ? (
                            <input
                              aria-label={`${field.label} swatch`}
                              className="h-8 w-9 shrink-0 cursor-pointer rounded-xl border border-line bg-transparent p-0.5"
                              onChange={(event) =>
                                void commitChange(field.property, event.target.value)
                              }
                              type="color"
                              value={hexColor}
                            />
                          ) : null}
                          {selectOptionsSource === undefined ? (
                            <>
                              <CommitInput
                                className="ub-input h-8 min-w-0 flex-1 font-mono"
                                id={inputId}
                                list={suggestionListId}
                                onCommit={(nextValue) =>
                                  void commitChange(field.property, nextValue)
                                }
                                placeholder={guidance.placeholder}
                                value={value}
                              />
                              {suggestionValues.length === 0 ? null : (
                                <datalist id={suggestionListId}>
                                  {suggestionValues.map((suggestion) => (
                                    <option key={suggestion} value={suggestion} />
                                  ))}
                                </datalist>
                              )}
                            </>
                          ) : (
                            <select
                              className="ub-input h-8 min-w-0 flex-1"
                              id={inputId}
                              onChange={(event) =>
                                void commitChange(field.property, event.target.value)
                              }
                              value={value}
                            >
                              {getSelectOptions(selectOptionsSource, value).map((option) => (
                                <option key={option || "no-override"} value={option}>
                                  {getOptionLabel(option, selectOptionsSource, value)}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        {fieldPresets.length === 0 ? null : (
                          <div className="flex flex-wrap gap-1.5">
                            {fieldPresets.map((fieldPreset) => {
                              const isActive = trimmedValue === fieldPreset.value.trim();

                              return (
                                <button
                                  className={`max-w-[118px] truncate rounded-xl px-2 py-1 text-[10px] font-medium transition-colors ${
                                    isActive
                                      ? "bg-accent-soft text-accent ring-1 ring-inset ring-accent-ring"
                                      : "bg-accent-softer text-muted hover:bg-accent-soft hover:text-ink"
                                  }`}
                                  key={`${fieldPreset.label}-${fieldPreset.value}`}
                                  onClick={() =>
                                    void commitChange(field.property, fieldPreset.value)
                                  }
                                  title={getPresetTitle(field, fieldPreset)}
                                  type="button"
                                >
                                  {fieldPreset.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
};
