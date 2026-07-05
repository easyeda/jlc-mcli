import http from "node:http";
import type { McpBareServer } from "../server.js";
import type { StartBareMcpOptions } from "../server.js";

export class HttpTransport {
  constructor(
    private server: McpBareServer,
    private opts: StartBareMcpOptions,
  ) {}

  async run(): Promise<void> {
    const port = this.opts.port ?? 3030;
    const host = this.opts.host ?? "127.0.0.1";

    const httpServer = http.createServer(async (req, res) => {
      if (req.method === "OPTIONS") {
        if (this.opts.cors) {
          res.setHeader("Access-Control-Allow-Origin", this.opts.cors);
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        }
        res.writeHead(204).end();
        return;
      }

      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "text/plain" }).end("Method Not Allowed");
        return;
      }

      if (this.opts.token) {
        if (req.headers.authorization !== `Bearer ${this.opts.token}`) {
          res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized");
          return;
        }
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks).toString();

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          }),
        );
        return;
      }

      const resp = await this.server.dispatch(parsed as any);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(resp));
    });

    return new Promise<void>((resolve, reject) => {
      httpServer.on("error", reject);
      httpServer.listen(port, host, () => resolve());
    });
  }
}
