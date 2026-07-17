import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureSource = resolve(fileURLToPath(new URL(".", import.meta.url)), "../fixtures/project");

export type FixtureProject = {
  rootPath: string;
  stylesPath: string;
  cleanup: () => Promise<void>;
};

export const createFixtureProject = async (): Promise<FixtureProject> => {
  const rootPath = await mkdtemp(join(tmpdir(), "clickspex-e2e-project-"));
  await cp(fixtureSource, rootPath, { recursive: true });

  return {
    rootPath,
    stylesPath: join(rootPath, "src", "styles.css"),
    cleanup: () => rm(rootPath, { recursive: true, force: true }).catch(() => undefined),
  };
};
