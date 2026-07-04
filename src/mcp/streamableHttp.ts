import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpStartOptions } from "./server.js";

// Stateless: each POST creates a new transport, handles one request, closes.
// No session lifecycle — matches the framework's simple connect-and-serve model.
export async function startStreamableHttp(server: McpServer, opts: McpStartOptions): Promise<void> {
  const port = opts.port ?? 3030;
  const host = opts.host ?? "127.0.0.1";

  const httpServer = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      if (opts.cors) {
        res.setHeader("Access-Control-Allow-Origin", opts.cors);
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      }
      res.writeHead(204);
      res.end();
      return;
    }

    // Only POST /mcp is supported in stateless mode
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method Not Allowed");
      return;
    }

    // Optional token check
    if (opts.token) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${opts.token}`) {
        res.writeHead(401, { "Content-Type": "text/plain" });
        res.end("Unauthorized");
        return;
      }
    }

    // Read body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString();

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } }));
      return;
    }

    // Stateless: new transport per request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);

    try {
      await transport.handleRequest(req, res, parsed);
    } finally {
      await transport.close();
    }
  });

  return new Promise((resolve, reject) => {
    httpServer.on("error", reject);
    httpServer.listen(port, host, () => resolve());
  });
}
