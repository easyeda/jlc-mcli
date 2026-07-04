import Ajv from "ajv";
import type { CommandNode, CommandContext, CommandResult, JSONSchema } from "../types";

export interface McliError {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export class McliValidationError extends Error {
  code = "VALIDATION_ERROR";
  details: Array<{ field: string; message: string }>;

  constructor(details: Array<{ field: string; message: string }>) {
    const msg = details.map((d) => `${d.field}: ${d.message}`).join("; ");
    super(msg);
    this.details = details;
  }
}

export class McliExecutionError extends Error {
  code = "EXECUTION_ERROR";
  constructor(message: string) {
    super(message);
  }
}

function fillDefaults(schema: JSONSchema, input: Record<string, unknown>): Record<string, unknown> {
  if (!schema.properties) return input;
  const result = { ...input };
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (result[key] === undefined && "default" in prop) {
      result[key] = prop.default;
    }
  }
  return result;
}

const ajv = new Ajv({ allErrors: true });

export async function execute(
  node: CommandNode,
  input: Record<string, unknown>,
  ctx: CommandContext = {},
): Promise<CommandResult> {
  if (!node.input || !node.handler) {
    throw new McliExecutionError(`Command ${node.path} has no handler or input schema`);
  }

  const validate = ajv.compile(node.input);
  const withDefaults = fillDefaults(node.input, input);

  if (!validate(withDefaults)) {
    const details = (validate.errors ?? []).map((err) => ({
      field: err.instancePath || "(root)",
      message: err.message ?? "invalid",
    }));
    throw new McliValidationError(details);
  }

  return node.handler(withDefaults, ctx);
}
