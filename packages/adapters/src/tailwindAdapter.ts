import { getStyleChangeState } from "@ui-buddy/core/styleDiff";

import { createUnifiedDiff } from "./diffPreview.js";

import type {
  AdapterDetectionResult,
  AdapterExport,
  FrameworkAdapter,
  PatchSuggestion,
  ProjectContext,
  ProjectSourceFile,
  StyleChange,
  UIChangeIntent,
} from "@ui-buddy/shared";

type MappingResult = {
  classes: string[];
  warnings: string[];
};

const spacingScale: Record<string, string> = {
  "0px": "0",
  "4px": "1",
  "8px": "2",
  "12px": "3",
  "16px": "4",
  "20px": "5",
  "24px": "6",
  "32px": "8",
  "40px": "10",
  "48px": "12",
  "64px": "16",
};

const fontSizeScale: Record<string, string> = {
  "12px": "text-xs",
  "14px": "text-sm",
  "16px": "text-base",
  "18px": "text-lg",
  "20px": "text-xl",
  "24px": "text-2xl",
  "30px": "text-3xl",
};

const fontWeightScale: Record<string, string> = {
  "300": "font-light",
  "400": "font-normal",
  "500": "font-medium",
  "600": "font-semibold",
  "700": "font-bold",
  "800": "font-extrabold",
};

const simpleMappings: Record<string, Record<string, string>> = {
  "align-items": {
    baseline: "items-baseline",
    center: "items-center",
    "flex-end": "items-end",
    "flex-start": "items-start",
    stretch: "items-stretch",
  },
  display: {
    block: "block",
    flex: "flex",
    grid: "grid",
    inline: "inline",
    "inline-block": "inline-block",
    "inline-flex": "inline-flex",
    none: "hidden",
  },
  "flex-direction": {
    column: "flex-col",
    "column-reverse": "flex-col-reverse",
    row: "flex-row",
    "row-reverse": "flex-row-reverse",
  },
  "justify-content": {
    center: "justify-center",
    "flex-end": "justify-end",
    "flex-start": "justify-start",
    "space-around": "justify-around",
    "space-between": "justify-between",
    "space-evenly": "justify-evenly",
  },
  opacity: {
    "0": "opacity-0",
    "0.25": "opacity-25",
    "0.5": "opacity-50",
    "0.75": "opacity-75",
    "1": "opacity-100",
  },
  position: {
    absolute: "absolute",
    fixed: "fixed",
    relative: "relative",
    static: "static",
    sticky: "sticky",
  },
};

const colorMappings: Record<string, { background: string; text: string }> = {
  "#000000": { background: "bg-black", text: "text-black" },
  "#ffffff": { background: "bg-white", text: "text-white" },
  black: { background: "bg-black", text: "text-black" },
  transparent: { background: "bg-transparent", text: "text-transparent" },
  white: { background: "bg-white", text: "text-white" },
};

const radiusScale: Record<string, string> = {
  "0px": "rounded-none",
  "2px": "rounded-sm",
  "4px": "rounded",
  "6px": "rounded-md",
  "8px": "rounded-lg",
  "12px": "rounded-xl",
  "16px": "rounded-2xl",
  "9999px": "rounded-full",
};

const sizePrefixByProperty: Record<string, string> = {
  height: "h",
  width: "w",
};

const spacingPrefixByProperty: Record<string, string> = {
  gap: "gap",
  "margin-bottom": "mb",
  "margin-left": "ml",
  "margin-right": "mr",
  "margin-top": "mt",
  "padding-bottom": "pb",
  "padding-left": "pl",
  "padding-right": "pr",
  "padding-top": "pt",
};

const normalizeColor = (value: string): string => value.trim().toLowerCase().replaceAll(" ", "");

const mapChangeToClass = (change: StyleChange): string | null => {
  const value = change.afterValue.trim();
  const property = change.property;

  if (value.length === 0) {
    return null;
  }

  const simple = simpleMappings[property]?.[value];

  if (simple !== undefined) {
    return simple;
  }

  if (property in spacingPrefixByProperty) {
    const scale = spacingScale[value];
    const prefix = spacingPrefixByProperty[property];
    return scale === undefined || prefix === undefined ? null : `${prefix}-${scale}`;
  }

  if (property in sizePrefixByProperty) {
    const prefix = sizePrefixByProperty[property];

    if (value === "100%") {
      return `${prefix}-full`;
    }

    if (value === "auto") {
      return `${prefix}-auto`;
    }

    const scale = spacingScale[value];
    return scale === undefined || prefix === undefined ? null : `${prefix}-${scale}`;
  }

  if (property === "font-size") {
    return fontSizeScale[value] ?? null;
  }

  if (property === "font-weight") {
    return fontWeightScale[value] ?? null;
  }

  if (property === "border-radius") {
    return radiusScale[value] ?? null;
  }

  if (property === "color" || property === "background-color") {
    const mapped = colorMappings[normalizeColor(value)];

    if (mapped === undefined) {
      return null;
    }

    return property === "color" ? mapped.text : mapped.background;
  }

  return null;
};

export const generateTailwindClassesFromChangeIntent = (
  changeIntent: UIChangeIntent,
): MappingResult => {
  const classes: string[] = [];
  const warnings: string[] = [];

  for (const change of changeIntent.changes) {
    const className = mapChangeToClass(change);

    if (className === null) {
      warnings.push(
        `No conservative Tailwind mapping for ${change.property}: ${change.afterValue}`,
      );
      continue;
    }

    const state = getStyleChangeState(change);
    const targetClassName = state === "base" ? className : `${state}:${className}`;

    if (!classes.includes(targetClassName)) {
      classes.push(targetClassName);
    }
  }

  return { classes, warnings };
};

const detectTailwind = (projectContext: ProjectContext): AdapterDetectionResult => {
  const dependencies = {
    ...projectContext.packageJson?.dependencies,
    ...projectContext.packageJson?.devDependencies,
  };
  const evidence: string[] = [];

  if ("tailwindcss" in dependencies) {
    evidence.push("tailwindcss dependency found in package.json.");
  }

  if (projectContext.configFiles.some((file) => file.startsWith("tailwind.config"))) {
    evidence.push("Tailwind config file found.");
  }

  if (
    projectContext.files?.some((file) =>
      file.classNames.some((className) => className.includes("-")),
    )
  ) {
    evidence.push("Utility-like classes found in indexed source files.");
  }

  return {
    adapterId: "tailwind",
    name: "Tailwind CSS",
    detected: evidence.length > 0,
    confidence: evidence.length === 0 ? 0 : Math.min(1, evidence.length * 0.35 + 0.1),
    evidence,
  };
};

const scoreSourceFile = (file: ProjectSourceFile, changeIntent: UIChangeIntent): number => {
  if (file.kind !== "component" && file.kind !== "route") {
    return 0;
  }

  let score = file.kind === "route" ? 0.32 : 0.38;

  if (
    changeIntent.target.id !== undefined &&
    changeIntent.target.id.length > 0 &&
    file.ids.includes(changeIntent.target.id)
  ) {
    score += 0.28;
  }

  const matchingClasses = changeIntent.target.classList.filter((className) =>
    file.classNames.includes(className),
  ).length;
  score += matchingClasses * 0.18;

  const textPreview = changeIntent.target.textPreview?.trim();

  if (textPreview !== undefined && textPreview.length > 0 && file.content.includes(textPreview)) {
    score += 0.08;
  }

  return Math.min(0.9, score);
};

const selectSourceFile = (
  projectContext: ProjectContext | undefined,
  changeIntent: UIChangeIntent,
): { file: ProjectSourceFile; confidence: number } | null => {
  const candidates = projectContext?.sourceFiles ?? [];

  return (
    candidates
      .map((file) => ({ file, confidence: scoreSourceFile(file, changeIntent) }))
      .filter((candidate) => candidate.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence || a.file.path.localeCompare(b.file.path))[0] ??
    null
  );
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const mergeClasses = (existingValue: string, additions: string[]): string => {
  const existing = existingValue.split(/\s+/).filter((className) => className.length > 0);
  const merged = [...existing];

  for (const className of additions) {
    if (!merged.includes(className)) {
      merged.push(className);
    }
  }

  return merged.join(" ");
};

const patchMatchingClassAttribute = (
  content: string,
  targetClasses: string[],
  additions: string[],
): string | null => {
  if (targetClasses.length === 0) {
    return null;
  }

  const classAttributeRegex = /\b(className|class)\s*=\s*(["'`])([^"'`]*)(["'`])/g;
  let match: RegExpExecArray | null;

  while ((match = classAttributeRegex.exec(content)) !== null) {
    const currentValue = match[3] ?? "";
    const currentClasses = currentValue.split(/\s+/);

    if (!targetClasses.some((className) => currentClasses.includes(className))) {
      continue;
    }

    const nextValue = mergeClasses(currentValue, additions);
    const start = match.index + match[0].indexOf(currentValue);
    return `${content.slice(0, start)}${nextValue}${content.slice(start + currentValue.length)}`;
  }

  return null;
};

const patchElementWithId = (
  content: string,
  id: string | undefined,
  additions: string[],
  path: string,
): string | null => {
  if (id === undefined || id.length === 0) {
    return null;
  }

  const idRegex = new RegExp(`<[^>]*\\bid\\s*=\\s*(["'\`])${escapeRegExp(id)}\\1[^>]*>`, "m");
  const tagMatch = idRegex.exec(content);

  if (tagMatch === null || tagMatch.index === undefined) {
    return null;
  }

  const tag = tagMatch[0];
  const classAttribute = /\b(className|class)\s*=\s*(["'`])([^"'`]*)(["'`])/.exec(tag);

  if (classAttribute !== null && classAttribute.index !== undefined) {
    const currentValue = classAttribute[3] ?? "";
    const nextValue = mergeClasses(currentValue, additions);
    const start = classAttribute.index + classAttribute[0].indexOf(currentValue);
    const nextTag = `${tag.slice(0, start)}${nextValue}${tag.slice(start + currentValue.length)}`;
    return `${content.slice(0, tagMatch.index)}${nextTag}${content.slice(tagMatch.index + tag.length)}`;
  }

  const attributeName = /\.(html|vue|svelte)$/i.test(path) ? "class" : "className";
  const insertAt = tag.endsWith("/>") ? tag.length - 2 : tag.length - 1;
  const nextTag = `${tag.slice(0, insertAt)} ${attributeName}="${additions.join(" ")}"${tag.slice(insertAt)}`;
  return `${content.slice(0, tagMatch.index)}${nextTag}${content.slice(tagMatch.index + tag.length)}`;
};

const sourceAwareTailwindPatch = (
  changeIntent: UIChangeIntent,
  projectContext: ProjectContext | undefined,
  additions: string[],
): { file: ProjectSourceFile; confidence: number; nextContent: string } | null => {
  const selected = selectSourceFile(projectContext, changeIntent);

  if (selected === null) {
    return null;
  }

  const classPatched = patchMatchingClassAttribute(
    selected.file.content,
    changeIntent.target.classList,
    additions,
  );
  const nextContent =
    classPatched ??
    patchElementWithId(
      selected.file.content,
      changeIntent.target.id,
      additions,
      selected.file.path,
    );

  if (nextContent === null || nextContent === selected.file.content) {
    return null;
  }

  return { ...selected, nextContent };
};

const generateTailwindPatch = (
  changeIntent: UIChangeIntent,
  projectContext?: ProjectContext,
): PatchSuggestion[] => {
  const result = generateTailwindClassesFromChangeIntent(changeIntent);

  if (result.classes.length === 0) {
    return [
      {
        adapterId: "tailwind",
        title: "Apply conservative Tailwind utility classes",
        confidence: 0,
        explanation: "No exact Tailwind utility mapping was available for the captured changes.",
        filesToChange: [],
        diffPreview: "",
        warnings: result.warnings,
        manualSteps: [],
      },
    ];
  }

  const patch = sourceAwareTailwindPatch(changeIntent, projectContext, result.classes);

  if (patch !== null) {
    return [
      {
        adapterId: "tailwind",
        title: `Apply Tailwind classes in ${patch.file.path}`,
        confidence: patch.confidence,
        explanation:
          "Selected an indexed component or route by matching the captured element id, classes, and text.",
        filesToChange: [patch.file.path],
        diffPreview: createUnifiedDiff(patch.file.path, patch.file.content, patch.nextContent),
        warnings: [
          ...result.warnings,
          "Review for conflicting existing utilities before applying this class edit.",
        ],
        manualSteps: [
          "Apply the diff after confirming this source element matches the selected DOM node.",
        ],
      },
    ];
  }

  return [
    {
      adapterId: "tailwind",
      title: "Apply conservative Tailwind utility classes",
      confidence: 0.45,
      explanation:
        "Generated utility classes only for exact value mappings. Provide indexed source content to preview a file-specific class edit.",
      filesToChange: [],
      diffPreview: "",
      warnings: result.warnings,
      manualSteps: [`Review and add: ${result.classes.join(" ")}`],
    },
  ];
};

const generateTailwindExport = (changeIntent: UIChangeIntent): AdapterExport => {
  const result = generateTailwindClassesFromChangeIntent(changeIntent);

  return {
    adapterId: "tailwind",
    label: "Tailwind",
    content: result.classes.join(" "),
    warnings: result.warnings,
  };
};

export const tailwindAdapter: FrameworkAdapter = {
  id: "tailwind",
  name: "Tailwind CSS",
  detect: detectTailwind,
  generatePatch: generateTailwindPatch,
  generateExport: generateTailwindExport,
};
