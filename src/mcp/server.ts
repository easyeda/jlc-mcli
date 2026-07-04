import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McliApp } from "../types";
import { execute } from "../core/execute";
import { search } from "../core/search";
import { startStreamableHttp } from "./streamableHttp";

export interface McpStartOptions {
  transport: "stdio" | "http";
  host?: string;
  port?: number;
  token?: string;
  cors?: string;
}

// Minimal shape accepted by McpServer.registerTool (ZodRawShape compat).
// Properties cast to any satisfy the AnySchema type.
const s = (desc: string, jsonType = "string") => ({ type: jsonType, description: desc }) as any;

export async function startMcp(app: McliApp, opts: McpStartOptions): Promise<void> {
  const server = new McpServer({
    name: app.name,
    version: app.version,
  });

  server.registerTool(
    "mcli.search",
    {
      description: "Search commands by query",
      inputSchema: {
        query: s("Search query"),
        limit: s("Max results (default 10)", "number"),
      },
    },
    async (args: any) => {
      const matches = search(app, args.query, args.limit);
      return { content: [{ type: "text" as const, text: JSON.stringify({ matches }, null, 2) }] };
    },
  );

  server.registerTool(
    "mcli.help",
    {
      description: "Get help for a command or group path (includes input schema when applicable)",
      inputSchema: {
        path: s("Command path like github.issue or github.issue.close"),
      },
    },
    async (args: any) => {
      const node = app.resolve(args.path.split("."));
      if (!node) {
        return { content: [{ type: "text" as const, text: `Unknown path: ${args.path}` }] };
      }
      const result: Record<string, unknown> = {
        path: node.path,
        argv: node.argv,
        summary: node.summary,
        description: node.description,
        isGroup: node.isGroup,
        children: [...node.children.values()].map((c) => ({
          path: c.path,
          argv: c.argv,
          summary: c.summary,
        })),
      };
      if (!node.isGroup && node.input) {
        result.input = node.input;
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "mcli.call",
    {
      description: "Execute a command",
      inputSchema: {
        path: s("Command path like github.issue.close"),
        input: s("Command input", "object"),
      },
    },
    async (args: any) => {
      const node = app.resolve(args.path.split("."));
      if (!node) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { ok: false, error: { message: `Unknown path: ${args.path}` } },
                null,
                2,
              ),
            },
          ],
        };
      }
      try {
        const result = await execute(node, args.input ?? {});
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { ok: true, path: node.path, data: result.data, next: result.next },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: false,
                  path: node.path,
                  error: { code: err.code || "ERROR", message: err.message, details: err.details },
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );

  if (opts.transport === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  // http (stateless Streamable HTTP)
  await startStreamableHttp(server, opts);
}
