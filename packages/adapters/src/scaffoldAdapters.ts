import { createUnsupportedPatchSuggestion } from "@clickspex/shared";

import type {
  AdapterDetectionResult,
  AdapterExport,
  FrameworkAdapter,
  PatchSuggestion,
  ProjectContext,
  ProjectSourceFile,
  UIChangeIntent,
} from "@clickspex/shared";

type ScaffoldDefinition = {
  id: string;
  name: string;
  dependencies: string[];
  configPrefixes: string[];
  fileExtensions: string[];
};

const scaffoldDefinitions: ScaffoldDefinition[] = [
  {
    id: "react",
    name: "React",
    dependencies: ["react"],
    configPrefixes: [],
    fileExtensions: [".jsx", ".tsx"],
  },
  {
    id: "next",
    name: "Next.js",
    dependencies: ["next"],
    configPrefixes: ["next.config"],
    fileExtensions: [".jsx", ".tsx"],
  },
  {
    id: "vue",
    name: "Vue",
    dependencies: ["vue"],
    configPrefixes: ["vue.config", "vite.config"],
    fileExtensions: [".vue"],
  },
  {
    id: "angular",
    name: "Angular",
    dependencies: ["@angular/core"],
    configPrefixes: ["angular.json"],
    fileExtensions: [".html", ".ts"],
  },
  {
    id: "svelte",
    name: "Svelte",
    dependencies: ["svelte"],
    configPrefixes: ["svelte.config"],
    fileExtensions: [".svelte"],
  },
  {
    id: "shadcn",
    name: "shadcn/ui",
    dependencies: ["class-variance-authority", "tailwind-merge", "lucide-react"],
    configPrefixes: ["components.json"],
    fileExtensions: [".jsx", ".tsx"],
  },
  {
    id: "mui",
    name: "MUI",
    dependencies: ["@mui/material", "@emotion/react", "@emotion/styled"],
    configPrefixes: [],
    fileExtensions: [".jsx", ".tsx"],
  },
  {
    id: "css-modules",
    name: "CSS Modules",
    dependencies: [],
    configPrefixes: [],
    fileExtensions: [".module.css", ".module.scss", ".module.sass"],
  },
  {
    id: "scss",
    name: "SCSS",
    dependencies: ["sass"],
    configPrefixes: [],
    fileExtensions: [".scss", ".sass"],
  },
  {
    id: "styled-components",
    name: "styled-components",
    dependencies: ["styled-components"],
    configPrefixes: [],
    fileExtensions: [".jsx", ".tsx"],
  },
];

const dependenciesFor = (projectContext: ProjectContext): Record<string, string> => ({
  ...projectContext.packageJson?.dependencies,
  ...projectContext.packageJson?.devDependencies,
});

const hasMatchingExtension = (filePath: string, extensions: string[]): boolean =>
  extensions.some((extension) => filePath.endsWith(extension));

const detectScaffold = (
  definition: ScaffoldDefinition,
  projectContext: ProjectContext,
): AdapterDetectionResult => {
  const dependencies = dependenciesFor(projectContext);
  const evidence = [
    ...definition.dependencies
      .filter((dependency) => dependency in dependencies)
      .map((dependency) => `${dependency} dependency found.`),
    ...definition.configPrefixes
      .filter((prefix) => projectContext.configFiles.some((file) => file.startsWith(prefix)))
      .map((prefix) => `${prefix} config found.`),
  ];
  const fileMatches =
    projectContext.files?.filter((file) =>
      hasMatchingExtension(file.path, definition.fileExtensions),
    ) ?? [];

  if (evidence.length > 0 && fileMatches.length > 0) {
    evidence.push(`${fileMatches.length} matching source file(s) indexed.`);
  }

  return {
    adapterId: definition.id,
    name: definition.name,
    detected: evidence.length > 0,
    confidence: evidence.length === 0 ? 0 : Math.min(0.9, 0.25 + evidence.length * 0.18),
    evidence,
  };
};

const scoreSourceFile = (
  definition: ScaffoldDefinition,
  file: ProjectSourceFile,
  changeIntent: UIChangeIntent,
): number => {
  if (!hasMatchingExtension(file.path, definition.fileExtensions)) {
    return 0;
  }

  let score = file.kind === "component" || file.kind === "route" ? 0.28 : 0.16;

  if (
    changeIntent.target.id !== undefined &&
    changeIntent.target.id.length > 0 &&
    file.ids.includes(changeIntent.target.id)
  ) {
    score += 0.28;
  }

  score +=
    changeIntent.target.classList.filter((className) => file.classNames.includes(className))
      .length * 0.16;

  const textPreview = changeIntent.target.textPreview?.trim();

  if (textPreview !== undefined && textPreview.length > 0 && file.content.includes(textPreview)) {
    score += 0.08;
  }

  return Math.min(0.75, score);
};

const selectSourceFile = (
  definition: ScaffoldDefinition,
  projectContext: ProjectContext | undefined,
  changeIntent: UIChangeIntent,
): { file: ProjectSourceFile; confidence: number } | null => {
  const sourceFiles = projectContext?.sourceFiles ?? [];

  return (
    sourceFiles
      .map((file) => ({ file, confidence: scoreSourceFile(definition, file, changeIntent) }))
      .filter((candidate) => candidate.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence || a.file.path.localeCompare(b.file.path))[0] ??
    null
  );
};

const sourceAwareSuggestion = (
  definition: ScaffoldDefinition,
  changeIntent: UIChangeIntent,
  projectContext?: ProjectContext,
): PatchSuggestion[] => {
  if (projectContext === undefined || !detectScaffold(definition, projectContext).detected) {
    return [createUnsupportedPatchSuggestion(definition.id, `${definition.name} patch generation`)];
  }

  const selected = selectSourceFile(definition, projectContext, changeIntent);

  if (selected === null) {
    return [createUnsupportedPatchSuggestion(definition.id, `${definition.name} patch generation`)];
  }

  return [
    {
      adapterId: definition.id,
      title: `Review ${definition.name} source in ${selected.file.path}`,
      confidence: selected.confidence,
      explanation:
        "Matched a likely source file by framework signals plus captured element id, classes, or text. This adapter does not generate AST-safe framework edits yet.",
      filesToChange: [selected.file.path],
      diffPreview: "",
      warnings: [
        "No automatic framework AST patch is generated for this adapter yet.",
        "Use the CSS or Tailwind suggestions as the concrete patch source when appropriate.",
      ],
      manualSteps: [
        `Open ${selected.file.path} and confirm it renders ${changeIntent.target.selector}.`,
        "Apply the smallest equivalent prop, class, or stylesheet change after review.",
      ],
    },
  ];
};

const createScaffoldAdapter = (definition: ScaffoldDefinition): FrameworkAdapter => ({
  id: definition.id,
  name: definition.name,
  detect: (projectContext: ProjectContext): AdapterDetectionResult =>
    detectScaffold(definition, projectContext),
  generatePatch: (changeIntent: UIChangeIntent, projectContext?: ProjectContext) =>
    sourceAwareSuggestion(definition, changeIntent, projectContext),
  generateExport: (_changeIntent: UIChangeIntent): AdapterExport => ({
    adapterId: definition.id,
    label: definition.name,
    content: "",
    warnings: ["This adapter provides source hints but does not generate AST-safe patches yet."],
  }),
});

export const scaffoldAdapters: FrameworkAdapter[] = scaffoldDefinitions.map((definition) =>
  createScaffoldAdapter(definition),
);
