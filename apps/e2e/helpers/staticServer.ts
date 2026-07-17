import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export type StaticServer = {
  port: number;
  origin: string;
  close: () => Promise<void>;
};

export const startStaticServer = async (rootDir: string): Promise<StaticServer> => {
  const server = createServer((req, res) => {
    void (async () => {
      const urlPath = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      const relPath = normalize(urlPath === "/" ? "index.html" : urlPath.slice(1));

      if (relPath.startsWith("..") || relPath.startsWith(sep)) {
        res.writeHead(400);
        res.end("bad request");
        return;
      }

      try {
        const data = await readFile(join(rootDir, relPath));
        res.writeHead(200, {
          "content-type": CONTENT_TYPES[extname(relPath)] ?? "application/octet-stream",
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    })();
  });

  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
        // Drop keep-alive connections so close() resolves promptly.
        server.closeAllConnections();
      }),
  };
};
