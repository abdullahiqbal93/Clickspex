import type {
  AdapterDetectionResult,
  AdapterExport,
  FrameworkAdapter,
  PatchSuggestion,
  ProjectContext,
  StyleChange,
  UIChangeIntent,
} from "@ui-devtools/shared";

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

    if (!classes.includes(className)) {
      classes.push(className);
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

  return {
    adapterId: "tailwind",
    name: "Tailwind CSS",
    detected: evidence.length > 0,
    confidence: evidence.length === 0 ? 0 : Math.min(1, evidence.length * 0.45),
    evidence,
  };
};

const generateTailwindPatch = (changeIntent: UIChangeIntent): PatchSuggestion[] => {
  const result = generateTailwindClassesFromChangeIntent(changeIntent);

  return [
    {
      adapterId: "tailwind",
      title: "Apply conservative Tailwind utility classes",
      confidence: result.classes.length > 0 ? 0.45 : 0,
      explanation:
        "Generated utility classes only for exact value mappings. v1 does not inspect source components.",
      filesToChange: [],
      diffPreview: "",
      warnings: result.warnings,
      manualSteps: result.classes.length > 0 ? [`Review and add: ${result.classes.join(" ")}`] : [],
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
