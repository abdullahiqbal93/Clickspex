#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { cssAdapter, scaffoldAdapters, tailwindAdapter } from "@ui-devtools/adapters";
import { detectProject, scanProjectContext } from "@ui-devtools/core/project";
import chalk from "chalk";
import { Command } from "commander";

import type { PatchSuggestion, UIChangeIntent } from "@ui-devtools/shared";

const program = new Command();

const exampleIntent = (): UIChangeIntent => ({
  id: "example-ui-change-intent",
  timestamp: new Date().toISOString(),
  pageUrl: "https://example.com",
  viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
  target: {
    tagName: "button",
    id: "primary-action",
    classList: ["button"],
    textPreview: "Save",
    selector: "#primary-action",
    domPath: "html > body > main > button#primary-action",
    attributes: { id: "primary-action", class: "button" },
  },
  before: {
    styles: { color: "#000000", "font-size": "14px" },
    rect: { x: 0, y: 0, top: 0, right: 120, bottom: 40, left: 0, width: 120, height: 40 },
    boxModel: {
      margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
      border: { top: "1px", right: "1px", bottom: "1px", left: "1px" },
      padding: { top: "8px", right: "16px", bottom: "8px", left: "16px" },
      content: { width: "120px", height: "40px" },
    },
  },
  after: {
    styles: { color: "#ffffff", "font-size": "16px" },
  },
  changes: [
    {
      selector: "#primary-action",
      property: "color",
      beforeValue: "#000000",
      afterValue: "#ffffff",
      timestamp: new Date().toISOString(),
    },
  ],
  accessibilityNotes: [],
});

const readChangeIntent = async (path: string): Promise<UIChangeIntent> => {
  const raw = await readFile(resolve(path), "utf8");
  return JSON.parse(raw) as UIChangeIntent;
};

const previewPatchSuggestions = async (
  changeIntent: UIChangeIntent,
  projectPath: string,
): Promise<PatchSuggestion[]> => {
  const projectContext = await scanProjectContext(projectPath, { includeSource: true });
  return [
    ...(await cssAdapter.generatePatch(changeIntent, projectContext)),
    ...(await tailwindAdapter.generatePatch(changeIntent, projectContext)),
    ...(await Promise.all(
      scaffoldAdapters.map((adapter) => adapter.generatePatch(changeIntent, projectContext)),
    ).then((patches) => patches.flat())),
  ];
};

program.name("ui-sync").description("UI DevTools local project utility").version("0.1.0");

program
  .command("init")
  .description("initialize a .ui-sync config in the project")
  .option("--path <path>", "project path", process.cwd())
  .action(async (options: { path: string }) => {
    const rootPath = resolve(options.path);
    const configDir = resolve(rootPath, ".ui-sync");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      resolve(configDir, "config.json"),
      `${JSON.stringify({ version: 1, readOnlyCodeSync: true }, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${chalk.green("initialized")} ${configDir}\n`);
  });

program
  .command("detect")
  .description("scan and report detected frameworks and styling tools")
  .option("--path <path>", "project path", process.cwd())
  .action(async (options: { path: string }) => {
    const report = await detectProject(resolve(options.path));
    process.stdout.write(`${chalk.bold("Project")} ${report.rootPath}\n`);
    process.stdout.write(`${chalk.bold("Package manager")} ${report.packageManager}\n`);
    process.stdout.write(
      `${chalk.bold("Config files")} ${report.configFiles.join(", ") || "none"}\n`,
    );
    process.stdout.write(
      `${chalk.bold("Directories")} ${report.directories.join(", ") || "none"}\n`,
    );
    process.stdout.write(
      `${chalk.bold("Indexed files")} ${report.indexStats?.indexedFiles ?? 0}${report.indexStats?.truncated ? " (truncated)" : ""}\n`,
    );

    for (const item of report.detections) {
      process.stdout.write(
        `${chalk.cyan(item.name)} ${item.category} confidence=${item.confidence} evidence=${item.evidence.join("; ")}\n`,
      );
    }
  });

program
  .command("index")
  .description("build a bounded source index for a local project")
  .option("--path <path>", "project path", process.cwd())
  .action(async (options: { path: string }) => {
    const rootPath = resolve(options.path);
    const context = await scanProjectContext(rootPath);
    process.stdout.write(
      `${JSON.stringify({ rootPath, files: context.files ?? [], indexStats: context.indexStats }, null, 2)}\n`,
    );
  });

program
  .command("preview-patch")
  .description("preview source-aware patch suggestions from a UIChangeIntent JSON file")
  .requiredOption("--intent <path>", "UIChangeIntent JSON file")
  .option("--project <path>", "project path", process.cwd())
  .option("--output <path>", "write suggestions JSON to this file")
  .action(async (options: { intent: string; project: string; output?: string }) => {
    const projectPath = resolve(options.project);
    const changeIntent = await readChangeIntent(options.intent);
    const suggestions = await previewPatchSuggestions(changeIntent, projectPath);
    const output = `${JSON.stringify({ projectPath, suggestions }, null, 2)}\n`;

    if (options.output === undefined) {
      process.stdout.write(output);
      return;
    }

    const outputPath = resolve(options.output);
    await writeFile(outputPath, output, "utf8");
    process.stdout.write(`${chalk.green("wrote")} ${outputPath}\n`);
  });

program
  .command("export-example")
  .description("write an example UIChangeIntent JSON to disk")
  .option("--output <path>", "output file", "ui-change-intent.example.json")
  .action(async (options: { output: string }) => {
    const outputPath = resolve(options.output);
    await writeFile(outputPath, `${JSON.stringify(exampleIntent(), null, 2)}\n`, "utf8");
    process.stdout.write(`${chalk.green("wrote")} ${outputPath}\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error";
  process.stderr.write(`${chalk.red("error")} ${message}\n`);
  process.exitCode = 1;
});
