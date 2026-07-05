import Ajv from "ajv";
import type { McliApp, CommandGroup, GroupOptions, CommandOptions, CommandNode } from "../types";
import { CommandTree } from "./tree";

export interface CreateMcliOptions {
  name: string;
  version: string;
  summary?: string;
  /** MCP tool 名字前缀,默认等于 name */
  toolPrefix?: string;
}

const JSON_SCHEMA_V7_WHITELIST = new Set([
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

function assertV7Subset(schema: Record<string, unknown>, path = "inputSchema"): void {
  for (const key of Object.keys(schema)) {
    if (key.startsWith("$")) continue;
    if (!JSON_SCHEMA_V7_WHITELIST.has(key)) {
      throw new Error(
        `mcli: ${path} contains unsupported keyword '${key}'. mcli accepts only JSON Schema Draft-7 subset. ` +
          `If 'format' is needed, handle it inside your command handler. ` +
          `If you need extended metadata, use CommandOptions-level fields (examples, etc.).`,
      );
    }
  }
  if (schema.properties && typeof schema.properties === "object") {
    for (const [subKey, sub] of Object.entries(schema.properties)) {
      if (sub && typeof sub === "object") {
        assertV7Subset(sub as any, `${path}.properties.${subKey}`);
      }
    }
  }
  if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
    assertV7Subset(schema.items as any, `${path}.items`);
  }
  for (const combiner of ["allOf", "anyOf", "oneOf"] as const) {
    const sub = schema[combiner];
    if (Array.isArray(sub)) {
      sub.forEach((s, idx) => {
        if (s && typeof s === "object") assertV7Subset(s as any, `${path}.${combiner}[${idx}]`);
      });
    }
  }
}

function validateNoDots(name: string, kind: string): void {
  if (name.includes(".")) {
    throw new Error(
      `${kind} name "${name}" must not contain dots. Use app.group() to nest commands.`,
    );
  }
}

export function createMcli(opts: CreateMcliOptions): McliApp {
  const tree = new CommandTree();
  const toolPrefix = opts.toolPrefix ?? opts.name;

  function validateInputSchema(input: any, cmdPath: string): void {
    if (!input) return;
    // 后端 v7 子集预检(Q6)
    assertV7Subset(input, `command "${cmdPath}".inputSchema`);
    // ajv 严格编译(二次兜底)
    const ajv = new Ajv({ strict: true });
    try {
      ajv.compile(input);
    } catch (err: any) {
      throw new Error(`Command "${cmdPath}" inputSchema invalid: ${err.message}.`);
    }
  }

  function validateExamples(cmdOpts: CommandOptions, cmdPath: string): void {
    if (cmdOpts.examples && cmdOpts.input) {
      const ajv = new Ajv({ strict: true });
      const validate = ajv.compile(cmdOpts.input);
      for (const ex of cmdOpts.examples) {
        if (!validate(ex.input)) {
          const details = (validate.errors ?? [])
            .map((e) => `${e.instancePath || "(root)"}: ${e.message}`)
            .join("; ");
          throw new Error(`Command "${cmdPath}" example "${ex.title}" input invalid: ${details}`);
        }
      }
    }
  }

  function makeBinder(prefix: string): CommandGroup {
    return {
      command(name: string, cmdOpts: CommandOptions): void {
        validateNoDots(name, "Command");
        const fullPath = prefix ? `${prefix}.${name}` : name;

        // 后端 v7 子集预检
        validateInputSchema(cmdOpts.input, fullPath);
        // 示例校验
        validateExamples(cmdOpts, fullPath);

        tree.insert(fullPath, {
          path: fullPath,
          argv: fullPath.split("."),
          name,
          summary: cmdOpts.summary,
          description: cmdOpts.description,
          input: cmdOpts.input,
          examples: cmdOpts.examples,
          related: cmdOpts.related,
          handler: cmdOpts.handler,
          display: cmdOpts.display,
          isGroup: false,
          children: new Map(),
        });
      },

      group(name: string, groupOpts: GroupOptions): CommandGroup {
        validateNoDots(name, "Group");
        const fullPath = prefix ? `${prefix}.${name}` : name;

        const existing = tree.find(fullPath.split("."));
        if (existing) {
          existing.summary = groupOpts.summary;
          existing.description = groupOpts.description;
        } else {
          tree.insert(fullPath, {
            path: fullPath,
            argv: fullPath.split("."),
            name,
            summary: groupOpts.summary,
            description: groupOpts.description,
            isGroup: true,
            children: new Map(),
          });
        }

        return makeBinder(fullPath);
      },
    };
  }

  const app: McliApp = {
    name: opts.name,
    version: opts.version,
    summary: opts.summary ?? "",
    ___mcli: { toolPrefix },

    group(name: string, groupOpts: GroupOptions): CommandGroup {
      validateNoDots(name, "Group");

      const existing = tree.find([name]);
      if (existing) {
        existing.summary = groupOpts.summary;
        existing.description = groupOpts.description;
      } else {
        tree.insert(name, {
          path: name,
          argv: [name],
          name,
          summary: groupOpts.summary,
          description: groupOpts.description,
          isGroup: true,
          children: new Map(),
        });
      }

      return makeBinder(name);
    },

    command(name: string, cmdOpts: CommandOptions): void {
      validateNoDots(name, "Command");

      // 后端 v7 子集预检
      validateInputSchema(cmdOpts.input, name);
      // 示例校验
      validateExamples(cmdOpts, name);

      tree.insert(name, {
        path: name,
        argv: [name],
        name,
        summary: cmdOpts.summary,
        description: cmdOpts.description,
        input: cmdOpts.input,
        examples: cmdOpts.examples,
        related: cmdOpts.related,
        handler: cmdOpts.handler,
        display: cmdOpts.display,
        isGroup: false,
        children: new Map(),
      });
    },

    resolve(argv: string[]): CommandNode | null {
      return tree.find(argv);
    },

    allCommands(): CommandNode[] {
      const result: CommandNode[] = [];
      tree.traverse((node) => {
        if (!node.isGroup && node.path) result.push(node);
      });
      return result;
    },
  };

  return app;
}
