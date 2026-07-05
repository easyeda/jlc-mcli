import { JSONSchema } from "../../types.js";
import { CompiledToolValidator } from "./types.local.js";
import Ajv, { type ValidateFunction } from "ajv";

export const JSON_SCHEMA_V7_WHITELIST: ReadonlySet<string> = new Set([
  "type",
  "enum",
  "const",
  "properties",
  "required",
  "additionalProperties",
  "patternProperties",
  "dependencies",
  "propertyNames",
  "items",
  "additionalItems",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "title",
  "description",
  "default",
  "examples",
  "$id",
  "$schema",
  "$ref",
  "$comment",
]);

export class JsonSchemaToolkit {
  private ajv: Ajv;
  private cache = new Map<string, CompiledToolValidator>();
  private currentToolName = "(unknown)";

  constructor() {
    this.ajv = new Ajv({
      strict: true,
      allErrors: true,
    });
  }

  assertV7Subset(schema: JSONSchema, path = "inputSchema"): void {
    for (const key of Object.keys(schema)) {
      if (key.startsWith("$")) continue;
      if (!JSON_SCHEMA_V7_WHITELIST.has(key)) {
        throw new Error(
          `mcli: tool '${this.currentToolName}' contains unsupported inputSchema keyword '${key}'. ` +
            `mcli bare MCP accepts only JSON Schema Draft-7 subset. ` +
            `If 'format' is needed, handle it inside your command handler. ` +
            `If you need extended metadata, use CommandOptions-level fields (examples, etc.).`,
        );
      }
    }

    if (schema.properties && typeof schema.properties === "object") {
      for (const [subKey, sub] of Object.entries(schema.properties)) {
        if (sub && typeof sub === "object") {
          this.assertV7Subset(sub as JSONSchema, `${path}.properties.${subKey}`);
        }
      }
    }

    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      this.assertV7Subset(schema.items as JSONSchema, `${path}.items`);
    }

    for (const combiner of ["allOf", "anyOf", "oneOf"] as const) {
      const sub = schema[combiner];
      if (Array.isArray(sub)) {
        sub.forEach((s, idx) => {
          if (s && typeof s === "object") {
            this.assertV7Subset(s, `${path}.${combiner}[${idx}]`);
          }
        });
      }
    }
  }

  compile(toolName: string, schema: JSONSchema): CompiledToolValidator {
    const cached = this.cache.get(toolName);
    if (cached) return cached;

    this.currentToolName = toolName;
    this.assertV7Subset(schema);

    let validate: ValidateFunction;
    try {
      validate = this.ajv.compile(schema);
    } catch (err: any) {
      throw new Error(`mcli: tool '${toolName}' inputSchema invalid: ${err.message}.`);
    }

    const compiled: CompiledToolValidator = {
      toolName,
      validate,
      rawSchema: schema,
    };
    this.cache.set(toolName, compiled);
    return compiled;
  }
}
