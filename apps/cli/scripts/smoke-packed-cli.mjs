import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resolvePackageManagerCli = (command) => {
  if (process.platform !== "win32") {
    return null;
  }

  if (command === "pnpm") {
    return process.env.npm_execpath?.includes("pnpm") === true ? process.env.npm_execpath : null;
  }

  if (command === "npm") {
    const npmCliPath = resolve(
      dirname(process.execPath),
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    return existsSync(npmCliPath) ? npmCliPath : null;
  }

  return null;
};

const run = async (command, args, options) => {
  const packageManagerCli = resolvePackageManagerCli(command);
  const executable = packageManagerCli === null ? command : process.execPath;
  const executableArgs = packageManagerCli === null ? args : [packageManagerCli, ...args];

  try {
    return await execFileAsync(executable, executableArgs, options);
  } catch (error) {
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    throw new Error(
      [`command failed: ${command} ${args.join(" ")}`, stdout.trim(), stderr.trim()]
        .filter(Boolean)
        .join("\n"),
      { cause: error },
    );
  }
};

const tempRoot = await mkdtemp(join(tmpdir(), "clickspex-packed-cli-"));
const packDir = join(tempRoot, "pack");
const consumerDir = join(tempRoot, "consumer");

try {
  await mkdir(packDir, { recursive: true });
  await mkdir(consumerDir, { recursive: true });

  await run("pnpm", ["pack", "--pack-destination", packDir], { cwd: packageRoot });

  const packedFiles = (await readdir(packDir)).filter((file) => file.endsWith(".tgz"));
  if (packedFiles.length !== 1) {
    throw new Error(`expected one packed tarball, found ${packedFiles.length}`);
  }

  const tarball = join(packDir, packedFiles[0]);
  await run("npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: consumerDir });

  const cliPath = join(consumerDir, "node_modules", "clickspex", "dist", "index.js");
  const { stdout } = await run(process.execPath, [cliPath, "--version"], { cwd: consumerDir });

  if (!stdout.trim()) {
    throw new Error("packed CLI did not print a version");
  }

  process.stdout.write(`packed CLI smoke passed: ${stdout.trim()}\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
