import { JSONSchema } from "../../types.js";
import { type ValidateFunction } from "ajv";

export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (args: any) => Promise<ToolResult>;
}

export type ToolResult =
  | { isError?: false; content: ContentBlock[] }
  | { isError: true; content: ContentBlock[] };

export interface ContentBlock {
  type: "text";
  text: string;
}

export interface CompiledToolValidator {
  toolName: string;
  validate: ValidateFunction;
  rawSchema: JSONSchema;
}
