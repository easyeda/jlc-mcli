import type { McliApp } from "../../types.js";
import {
  JSONRPCRequest,
  JSONRPCSuccessResponse,
  JSONRPCErrorResponse,
  METHOD_INITIALIZE,
  METHOD_TOOLS_LIST,
  METHOD_TOOLS_CALL,
  JSON_RPC_ERROR_METHOD_NOT_FOUND,
  makeErrorResponse,
  makeSuccessResponse,
} from "./json-rpc.js";
import { MCP_PROTOCOL_VERSION, MCP_CAPABILITIES_DEFAULT } from "./constants.js";
import { invalidParamsError, toolCallSuccessToResult, toolCallErrorToResult } from "./errors.js";
import { JsonSchemaToolkit } from "./validator.js";
import type { RegisteredTool } from "./types.local.js";
import { execute } from "../../core/execute.js";
import { search } from "../../core/search.js";

export interface StartBareMcpOptions {
  transport: "stdio" | "http";
  host?: string;
  port?: number;
  token?: string;
  cors?: string;
  toolPrefix?: string;
}

interface InternalTool {
  description: string;
  inputSchema: RegisteredTool["inputSchema"];
  handler: RegisteredTool["handler"];
}

export class McpBareServer {
  private app: McliApp;
  private tools = new Map<string, RegisteredTool>();
  private validators = new JsonSchemaToolkit();
  private prefix: string;

  constructor(app: McliApp, opts: StartBareMcpOptions) {
    this.app = app;
    this.prefix = opts.toolPrefix ?? app.___mcli?.toolPrefix ?? app.name;
    this.registerBuiltinTools();
  }

  private toolName(name: string): string {
    return `${this.prefix}.${name}`;
  }

  private registerBuiltinTools(): void {
    this.internalRegister(this.toolName("help"), {
      description:
        "ALWAYS call this FIRST when interacting with a CLI capability. Returns available subcommands, their purpose, input schemas, and usage examples. After understanding via mcli.help, use mcli.discover to find specific commands or mcli.call to execute them.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Optional command path like 'github' or 'github.issue'. Omit to see top-level.",
          },
        },
      },
      handler: async (args: any) => {
        const a = args ?? {};
        if (!a.path) {
          const cmds = this.app.allCommands();
          const topLevel = new Map<string, string>();
          for (const c of cmds) {
            const parts = c.path.split(".");
            if (!topLevel.has(parts[0])) topLevel.set(parts[0], c.summary);
          }
          return toolCallSuccessToResult({
            name: this.app.name,
            summary: this.app.summary,
            children: [...topLevel.entries()].map(([path, summary]) => ({
              path,
              summary,
            })),
          });
        }
        const node = this.app.resolve(a.path.split("."));
        if (!node) {
          return toolCallSuccessToResult({
            ok: false,
            error: `Unknown path: ${a.path}`,
          });
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
        if (!node.isGroup && node.input) result.input = node.input;
        return toolCallSuccessToResult(result);
      },
    });

    this.internalRegister(this.toolName("discover"), {
      description:
        "Search for commands by keyword AFTER using mcli.help to understand the tool. Returns matching command paths and summaries. Use mcli.help first for overview, then discover to find specifics, then mcli.call to execute.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default 10)" },
        },
        required: ["query"],
      },
      handler: async (args: any) => {
        const matches = search(this.app, args.query, args.limit);
        return toolCallSuccessToResult({ matches });
      },
    });

    this.internalRegister(this.toolName("call"), {
      description:
        "Execute a registered command. Returns real data (search results, page content, etc.). Call mcli.help FIRST for overview, optionally mcli.discover to find commands, then mcli.call to fulfill user requests.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Command path like 'github.issue.close' or 'search'",
          },
          input: {
            type: "object",
            additionalProperties: true,
            description: "Command input parameters",
          },
        },
        required: ["path"],
      },
      handler: async (args: any) => {
        const node = this.app.resolve(args.path.split("."));
        if (!node) {
          return toolCallErrorToResult({
            code: "NOT_FOUND",
            message: `Unknown path: ${args.path}`,
          });
        }
        try {
          const result = await execute(node, args.input ?? {});
          return toolCallSuccessToResult({
            ok: true,
            path: node.path,
            data: result.data,
            next: result.next,
          });
        } catch (err: any) {
          return toolCallErrorToResult({
            code: err.code || "ERROR",
            message: err.message,
            details: err.details,
          });
        }
      },
    });
  }

  private internalRegister(name: string, def: InternalTool): void {
    const tool: RegisteredTool = {
      name,
      description: def.description,
      inputSchema: def.inputSchema,
      handler: def.handler,
    };
    this.tools.set(name, tool);
    this.validators.compile(name, def.inputSchema);
  }

  async dispatch(req: JSONRPCRequest): Promise<JSONRPCSuccessResponse | JSONRPCErrorResponse> {
    switch (req.method) {
      case METHOD_INITIALIZE:
        return this.handleInitialize(req);
      case METHOD_TOOLS_LIST:
        return this.handleToolsList(req);
      case METHOD_TOOLS_CALL:
        return this.handleToolsCall(req);
      default:
        return makeErrorResponse(
          req.id,
          JSON_RPC_ERROR_METHOD_NOT_FOUND,
          `Unsupported method: ${req.method}`,
        );
    }
  }

  private handleInitialize(req: JSONRPCRequest): JSONRPCSuccessResponse {
    return makeSuccessResponse(req.id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: MCP_CAPABILITIES_DEFAULT,
      serverInfo: {
        name: this.app.name,
        version: this.app.version,
      },
    });
  }

  private handleToolsList(req: JSONRPCRequest): JSONRPCSuccessResponse {
    const tools = [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return makeSuccessResponse(req.id, { tools });
  }

  private async handleToolsCall(
    req: JSONRPCRequest,
  ): Promise<JSONRPCSuccessResponse | JSONRPCErrorResponse> {
    const params = (req.params ?? {}) as {
      name: string;
      arguments?: Record<string, unknown>;
    };
    const tool = this.tools.get(params.name);
    if (!tool) {
      return makeErrorResponse(
        req.id,
        JSON_RPC_ERROR_METHOD_NOT_FOUND,
        `Tool not found: ${params.name}`,
      );
    }

    const compiled = this.validators.compile(tool.name, tool.inputSchema);
    const valid = compiled.validate(params.arguments ?? {});
    if (!valid) {
      const err = invalidParamsError(tool.name, compiled.validate.errors);
      return makeErrorResponse(req.id, err.code, err.message, err.data);
    }

    try {
      const result = await tool.handler(params.arguments ?? {});
      return makeSuccessResponse(req.id, result);
    } catch (err: any) {
      return makeSuccessResponse(req.id, toolCallErrorToResult(err));
    }
  }
}
