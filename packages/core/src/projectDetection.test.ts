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
  it("detects Next.js, React, Tailwind, pnpm, configs, and source directories", async () => {
    const rootPath = await createTempProject();
    await mkdir(join(rootPath, "src"));
    await writeFile(join(rootPath, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    await writeFile(join(rootPath, "next.config.mjs"), "export default {};\n", "utf8");
    await writeFile(join(rootPath, "tailwind.config.ts"), "export default {};\n", "utf8");
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
  });

  it("detects Vite and Vue with yarn lockfiles", async () => {
    const rootPath = await createTempProject();
    await mkdir(join(rootPath, "components"));
    await writeFile(join(rootPath, "yarn.lock"), "# yarn lockfile\n", "utf8");
    await writeFile(join(rootPath, "vite.config.ts"), "export default {};\n", "utf8");
    await writeFile(join(rootPath, "vue.config.js"), "module.exports = {};\n", "utf8");
    await writeFile(
      join(rootPath, "package.json"),
      JSON.stringify({ dependencies: { vue: "3.0.0" }, devDependencies: { vite: "5.0.0" } }),
      "utf8",
    );

    const report = await detectProject(rootPath);

    expect(report.packageManager).toBe("yarn");
    expect(report.directories).toEqual(["components"]);
    expect(report.detections.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Vite", "Vue"]),
    );
  });

  it("returns project context without package metadata when package.json is absent", async () => {
    const rootPath = await createTempProject();
    await mkdir(join(rootPath, "app"));

    const context = await scanProjectContext(rootPath);

    expect(context).toEqual({ rootPath, configFiles: [], directories: ["app"] });
  });
});
