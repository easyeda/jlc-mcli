import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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

// Returns a Zod schema for use in McpServer.registerTool inputSchema.
// For `object` type we use passthrough() so that arbitrary request payloads are
// preserved (required for mcli.call which forwards arbitrary input shapes).
const s = (desc: string, jsonType = "string") => {
  if (jsonType === "number") return z.number().describe(desc);
  if (jsonType === "object") return z.object({}).passthrough().describe(desc);
  return z.string().describe(desc);
};

export async function startMcp(app: McliApp, opts: McpStartOptions): Promise<void> {
  const server = new McpServer({
    name: app.name,
    version: app.version,
  });

  server.registerTool(
    "mcli.help",
    {
      description:
        "ALWAYS call this FIRST when interacting with a CLI capability. Returns available subcommands, their purpose, input schemas, and usage examples. After understanding via mcli.help, use mcli.discover to find specific commands or mcli.call to execute them.",
      inputSchema: {
        path: s(
          "Optional command path like 'github' or 'github.issue'. Omit to see top-level.",
        ).optional(),
      },
    },
    async (argsRaw: any) => {
      const args = argsRaw ?? {};
      // If no path provided, return top-level overview
      if (!args.path) {
        const cmds = app.allCommands();
        const topLevel = new Map<string, string>();
        for (const c of cmds) {
          const parts = c.path.split(".");
          if (!topLevel.has(parts[0])) {
            topLevel.set(parts[0], c.summary);
          }
        }
        const result = {
          name: app.name,
          summary: app.summary,
          children: [...topLevel.entries()].map(([path, summary]) => ({
            path,
            summary,
          })),
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }

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
    "mcli.discover",
    {
      description:
        "Search for commands by keyword AFTER using mcli.help to understand the tool. Returns matching command paths and summaries. Use mcli.help first for overview, then discover to find specifics, then mcli.call to execute.",
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
    "mcli.call",
    {
      description:
        "Execute a registered command. Returns real data (search results, page content, etc.). Call mcli.help FIRST for overview, optionally mcli.discover to find commands, then mcli.call to fulfill user requests.",
      inputSchema: {
        path: s("Command path like 'github.issue.close' or 'search'"),
        input: s("Command input parameters", "object"),
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
