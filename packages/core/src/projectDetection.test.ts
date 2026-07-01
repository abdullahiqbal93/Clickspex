import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { detectProject, scanProjectContext } from "./projectDetection";

const tempRoots: string[] = [];

const createTempProject = async (): Promise<string> => {
  const rootPath = await mkdtemp(join(tmpdir(), "ui-devtools-project-"));
  tempRoots.push(rootPath);
  return rootPath;
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true })));
});

describe("project detection", () => {
  it("detects Next.js, React, Tailwind, pnpm, configs, source directories, and indexed files", async () => {
    const rootPath = await createTempProject();
    await mkdir(join(rootPath, "src"));
    await mkdir(join(rootPath, "src", "components"));
    await writeFile(join(rootPath, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    await writeFile(join(rootPath, "next.config.mjs"), "export default {};\n", "utf8");
    await writeFile(join(rootPath, "tailwind.config.ts"), "export default {};\n", "utf8");
    await writeFile(
      join(rootPath, "src", "components", "Button.tsx"),
      'export const Button = () => <button id="save" className="btn px-2">Save</button>;\n',
      "utf8",
    );
    await writeFile(join(rootPath, "src", "styles.css"), "#save { color: black; }\n", "utf8");
    await writeFile(
      join(rootPath, "package.json"),
      JSON.stringify({
        dependencies: { next: "15.0.0", react: "18.3.0" },
        devDependencies: { tailwindcss: "3.4.0" },
      }),
      "utf8",
    );

    const report = await detectProject(rootPath);

    expect(report.packageManager).toBe("pnpm");
    expect(report.configFiles).toEqual([
      "next.config.mjs",
      "package.json",
      "pnpm-lock.yaml",
      "tailwind.config.ts",
    ]);
    expect(report.directories).toEqual(["src"]);
    expect(report.detections.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Next.js", "React", "Tailwind CSS"]),
    );
    expect(report.files?.map((file) => file.path)).toEqual(
      expect.arrayContaining(["src/components/Button.tsx", "src/styles.css"]),
    );
    expect(report.indexStats).toMatchObject({ indexedFiles: 3, truncated: false });
  });

  it("detects Vite and Vue with yarn lockfiles", async () => {
    const rootPath = await createTempProject();
    await mkdir(join(rootPath, "components"));
    await writeFile(join(rootPath, "yarn.lock"), "# yarn lockfile\n", "utf8");
    await writeFile(join(rootPath, "vite.config.ts"), "export default {};\n", "utf8");
    await writeFile(join(rootPath, "vue.config.js"), "module.exports = {};\n", "utf8");
    await writeFile(
      join(rootPath, "components", "Card.vue"),
      '<template><article class="card">Card</article></template>\n',
      "utf8",
    );
    await writeFile(
      join(rootPath, "package.json"),
      JSON.stringify({ dependencies: { vue: "3.0.0" }, devDependencies: { vite: "5.0.0" } }),
      "utf8",
    );

    const report = await detectProject(rootPath);

    expect(report.packageManager).toBe("yarn");
    expect(report.directories).toEqual(["components"]);
    expect(report.files?.find((file) => file.path === "components/Card.vue")).toMatchObject({
      kind: "component",
      classNames: ["card"],
    });
    expect(report.detections.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Vite", "Vue"]),
    );
  });

  it("returns source-aware context only when requested", async () => {
    const rootPath = await createTempProject();
    await mkdir(join(rootPath, "src"));
    await writeFile(join(rootPath, "src", "styles.css"), ".btn { color: black; }\n", "utf8");

    const summaryContext = await scanProjectContext(rootPath);
    const sourceContext = await scanProjectContext(rootPath, { includeSource: true });

    expect(summaryContext.sourceFiles).toBeUndefined();
    expect(summaryContext.files?.[0]).toMatchObject({
      path: "src/styles.css",
      kind: "stylesheet",
      selectors: [".btn"],
      classNames: ["btn"],
    });
    expect(sourceContext.sourceFiles?.[0]).toMatchObject({
      path: "src/styles.css",
      content: ".btn { color: black; }\n",
    });
  });

  it("returns project context without package metadata when package.json is absent", async () => {
    const rootPath = await createTempProject();
    await mkdir(join(rootPath, "app"));

    const context = await scanProjectContext(rootPath);

    expect(context).toMatchObject({
      rootPath,
      configFiles: [],
      directories: ["app"],
      files: [],
      indexStats: { indexedFiles: 0, truncated: false },
    });
    expect(context.packageJson).toBeUndefined();
  });
});
