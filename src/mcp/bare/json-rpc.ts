export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export type JSONRPCMessage = JSONRPCRequest | JSONRPCNotification;

export interface JSONRPCSuccessResponse {
  jsonrpc: "2.0";
  id: string | number;
  result: unknown;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JSONRPCErrorResponse {
  jsonrpc: "2.0";
  id: string | number;
  error: JSONRPCError;
}

export function makeErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JSONRPCErrorResponse {
  return { jsonrpc: "2.0", id: id as any, error: { code, message, data } };
}

export function makeSuccessResponse(id: string | number, result: unknown): JSONRPCSuccessResponse {
  return { jsonrpc: "2.0", id, result };
}

// 方法常量
export const METHOD_INITIALIZE = "initialize";
export const METHOD_INITIALIZED = "initialized";
export const METHOD_TOOLS_LIST = "tools/list";
export const METHOD_TOOLS_CALL = "tools/call";

// JSON-RPC 2.0 标准错误码
export const JSON_RPC_ERROR_PARSE_ERROR = -32700;
export const JSON_RPC_ERROR_INVALID_REQUEST = -32600;
export const JSON_RPC_ERROR_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_ERROR_INVALID_PARAMS = -32602;
export const JSON_RPC_ERROR_INTERNAL_ERROR = -32603;

// MCP 协议层错误码
export const MCP_ERROR_FUNCTION_NOT_FOUND = -32001;
export const MCP_ERROR_INVALID_INPUT = -32010;
