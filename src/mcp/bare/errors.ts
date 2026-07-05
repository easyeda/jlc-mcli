import { JSONRPCError, JSON_RPC_ERROR_INVALID_PARAMS } from "./json-rpc.js";
import { ToolResult } from "./types.local.js";

export interface ToolError {
  code: string;
  message: string;
  details?: unknown;
}

export function toolCallErrorToResult(err: ToolError | Error): ToolResult {
  const body = {
    ok: false,
    error: {
      code: (err as ToolError).code ?? "ERROR",
      message: err.message,
      details: (err as ToolError).details,
    },
  };
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
  };
}

export function toolCallSuccessToResult(payload: unknown): ToolResult {
  return {
    isError: false,
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

export function invalidParamsError(toolName: string, ajvErrors: unknown): JSONRPCError {
  return {
    code: JSON_RPC_ERROR_INVALID_PARAMS,
    message: `Invalid arguments for tool '${toolName}'`,
    data: { toolName, errors: ajvErrors },
  };
}
