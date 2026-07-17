import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliEntry = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../cli/dist/index.js");
const STARTUP_TIMEOUT_MS = 20_000;

export type BridgeProcess = {
  port: number;
  pairingCode: string;
  stop: () => Promise<void>;
};

/**
 * Start the real `clickspex connect` bridge as a child process against a
 * project directory, exactly as an end user would, and parse the port and
 * pairing code from its terminal output.
 */
export const startBridgeProcess = async (options: {
  projectPath: string;
  enableWrites?: boolean;
}): Promise<BridgeProcess> => {
  if (!existsSync(cliEntry)) {
    throw new Error(`CLI build output missing at ${cliEntry}. Run \`pnpm build\` first.`);
  }

  const args = [cliEntry, "connect", "--path", options.projectPath, "--port", "0"];

  if (options.enableWrites === true) {
    args.push("--enable-code-sync-writes");
  }

  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  delete env.FORCE_COLOR;

  const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"], env });
  let output = "";
  const ansiPattern = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
  const plainOutput = () => output.replace(ansiPattern, "");

  const startup = new Promise<{ port: number; pairingCode: string }>(
    (resolveStartup, rejectStartup) => {
      const timer = setTimeout(() => {
        rejectStartup(
          new Error(`Bridge did not report a port and pairing code in time. Output:\n${output}`),
        );
      }, STARTUP_TIMEOUT_MS);

      const tryResolve = () => {
        const text = plainOutput();
        const portMatch = /^\s*port\s+(\d+)\s*$/m.exec(text);
        const codeMatch = /^\s*pair code\s+(\d{6})\s*$/m.exec(text);

        if (portMatch?.[1] !== undefined && codeMatch?.[1] !== undefined) {
          clearTimeout(timer);
          resolveStartup({ port: Number(portMatch[1]), pairingCode: codeMatch[1] });
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        tryResolve();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        rejectStartup(new Error(`Bridge exited early with code ${String(code)}:\n${output}`));
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        rejectStartup(error);
      });
    },
  );

  const { port, pairingCode } = await startup;

  return {
    port,
    pairingCode,
    stop: () =>
      new Promise<void>((resolveStop) => {
        if (child.exitCode !== null) {
          resolveStop();
          return;
        }

        child.once("exit", () => resolveStop());
        child.kill();
        // Fallback for platforms where the signal is not delivered promptly.
        setTimeout(() => {
          if (child.exitCode === null) {
            child.kill("SIGKILL");
          }
          resolveStop();
        }, 3000).unref();
      }),
  };
};
