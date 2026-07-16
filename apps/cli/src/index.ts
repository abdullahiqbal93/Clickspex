#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { cssAdapter, scaffoldAdapters, tailwindAdapter } from "@ui-buddy/adapters";
import { detectProject, scanProjectContext } from "@ui-buddy/core/project";
import chalk from "chalk";
import { Command } from "commander";

import { startBridge } from "./bridge.js";

/** Best-effort cross-platform "open this URL in the default browser". */
const openBrowser = (url: string): void => {
  const [command, args]: [string, string[]] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];

  try {
    spawn(command, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // Non-fatal: the user can open the URL manually.
  }
};

import type { PatchSuggestion, UIChangeIntent, UIChangeSession } from "@ui-buddy/shared";

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

const readChangeSession = async (path: string): Promise<UIChangeSession> => {
  const raw = await readFile(resolve(path), "utf8");
  return JSON.parse(raw) as UIChangeSession;
};

type SessionElementSuggestions = {
  selector: string;
  suggestions: PatchSuggestion[];
};

const previewSessionPatches = async (
  session: UIChangeSession,
  projectPath: string,
): Promise<SessionElementSuggestions[]> => {
  const projectContext = await scanProjectContext(projectPath, { includeSource: true });
  const results: SessionElementSuggestions[] = [];

  for (const intent of session.elements) {
    const suggestions = [
      ...(await cssAdapter.generatePatch(intent, projectContext)),
      ...(await tailwindAdapter.generatePatch(intent, projectContext)),
      ...(await Promise.all(
        scaffoldAdapters.map((adapter) => adapter.generatePatch(intent, projectContext)),
      ).then((patches) => patches.flat())),
    ];

    results.push({ selector: intent.target.selector, suggestions });
  }

  return results;
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

program.name("ui-buddy").description("ui-buddy local project utility").version("0.1.0");

program
  .command("init")
  .description("initialize a .ui-buddy config in the project")
  .option("--path <path>", "project path", process.cwd())
  .action(async (options: { path: string }) => {
    const rootPath = resolve(options.path);
    const configDir = resolve(rootPath, ".ui-buddy");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      resolve(configDir, "config.json"),
      `${JSON.stringify({ version: 1, readOnlyCodeSync: true }, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${chalk.green("*")} ${configDir}\n`);
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
  .command("preview-session")
  .description("preview source-aware patch suggestions for a whole UIChangeSession JSON file")
  .requiredOption("--session <path>", "UIChangeSession JSON file")
  .option("--project <path>", "project path", process.cwd())
  .option("--output <path>", "write suggestions JSON to this file")
  .action(async (options: { session: string; project: string; output?: string }) => {
    const projectPath = resolve(options.project);
    const session = await readChangeSession(options.session);
    const elements = await previewSessionPatches(session, projectPath);
    const output = `${JSON.stringify(
      {
        projectPath,
        sessionId: session.id,
        stats: session.stats,
        elements,
        structuralEdits: session.structuralEdits.map((edit) => ({
          kind: edit.kind,
          selector: edit.target.selector,
          summary: edit.summary,
        })),
      },
      null,
      2,
    )}\n`;

    if (options.output === undefined) {
      process.stdout.write(output);
      return;
    }

    const outputPath = resolve(options.output);
    await writeFile(outputPath, output, "utf8");
    process.stdout.write(`${chalk.green("wrote")} ${outputPath}\n`);
  });

program
  .command("connect")
  .description("start a paired localhost bridge so the ui-buddy extension can preview changes")
  .option("--path <path>", "project path", process.cwd())
  .option("--port <port>", "port to listen on", "7317")
  .option("--open <url>", "open this URL (your running app) in the browser after starting")
  .option(
    "--extension-id <id>",
    "Chrome extension ID allowed to pair with this bridge",
    process.env.UI_BUDDY_EXTENSION_ID,
  )
  .option(
    "--allow-any-extension-origin",
    "debug only: allow any chrome-extension:// origin to pair",
  )
  .option(
    "--allow-unauthenticated-local-access",
    "debug only: allow no-Origin local requests without bearer auth",
  )
  .option(
    "--enable-code-sync-writes",
    "enable experimental source apply and rollback endpoints; disabled by default",
  )
  .action(
    async (options: {
      path: string;
      port: string;
      open?: string;
      extensionId?: string | undefined;
      allowAnyExtensionOrigin?: boolean;
      allowUnauthenticatedLocalAccess?: boolean;
      enableCodeSyncWrites?: boolean;
    }) => {
      const rootPath = resolve(options.path);
      const parsedPort = Number.parseInt(options.port, 10);
      const port = Number.isNaN(parsedPort) ? 7317 : parsedPort;
      const codeSyncWriteEnabled = options.enableCodeSyncWrites === true;
      const bridge = await startBridge({
        rootPath,
        port,
        codeSyncWriteEnabled,
        allowedExtensionId: options.extensionId,
        allowAnyExtensionOrigin: options.allowAnyExtensionOrigin === true,
        allowUnauthenticatedLocalAccess: options.allowUnauthenticatedLocalAccess === true,
      });
      const url = `http://127.0.0.1:${bridge.port}`;

      process.stdout.write("\n");
      process.stdout.write(`${chalk.green("*")} ${chalk.bold("ui-buddy bridge")}  ${url}\n`);
      process.stdout.write(`  ${chalk.bold("project")}  ${bridge.projectName}\n`);
      process.stdout.write(`  ${chalk.bold("root")}     ${bridge.canonicalRoot}\n`);
      process.stdout.write(`  ${chalk.bold("port")}     ${bridge.port}\n`);
      process.stdout.write(`  ${chalk.bold("project id")} ${bridge.projectId}\n`);
      process.stdout.write(`  ${chalk.bold("pair code")} ${chalk.yellow(bridge.pairingCode)}\n`);
      process.stdout.write(
        `  ${chalk.bold("origin")}   ${
          bridge.allowedExtensionId === undefined
            ? chalk.yellow("debug extension origin mode")
            : `chrome-extension://${bridge.allowedExtensionId}`
        }\n`,
      );
      process.stdout.write(
        `  ${chalk.bold("writes")}   ${
          codeSyncWriteEnabled
            ? chalk.yellow("experimental apply/rollback enabled")
            : chalk.dim("disabled; preview/export only")
        }\n\n`,
      );
      process.stdout.write("  Next steps:\n");
      process.stdout.write(
        "   1. Start the installed UI Buddy extension for the configured extension ID\n",
      );
      process.stdout.write("   2. Enter the pairing code shown above in Code sync\n");
      process.stdout.write("   3. Open your running app in Chrome and edit elements\n");
      process.stdout.write(`   4. Export -> Code sync (port ${bridge.port}) -> Preview diff\n`);
      if (!codeSyncWriteEnabled) {
        process.stdout.write(
          chalk.dim(
            "      Source apply is off by default. Restart with --enable-code-sync-writes to test it.\n",
          ),
        );
      }
      process.stdout.write("\n");
      process.stdout.write(chalk.dim("  Ctrl+C to stop.\n"));

      if (options.open !== undefined) {
        openBrowser(options.open);
      }

      process.on("SIGINT", () => {
        bridge.close();
        process.exit(0);
      });
    },
  );
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
