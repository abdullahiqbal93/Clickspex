import { expect, test as extensionTest } from "./extension.js";
import { createFixtureProject, type FixtureProject } from "./fixtureProject.js";
import { startStaticServer, type StaticServer } from "./staticServer.js";

type AppFixtures = {
  project: FixtureProject;
  server: StaticServer;
};

export const test = extensionTest.extend<AppFixtures>({
  project: async ({}, use) => {
    const project = await createFixtureProject();
    await use(project);
    await project.cleanup();
  },
  server: async ({ project }, use) => {
    const server = await startStaticServer(project.rootPath);
    await use(server);
    await server.close();
  },
});

export { expect };
