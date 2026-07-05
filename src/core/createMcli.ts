import Ajv from "ajv";
import type { McliApp, CommandGroup, GroupOptions, CommandOptions, CommandNode } from "../types";
import { CommandTree } from "./tree";

interface CreateMcliOptions {
  name: string;
  version: string;
  summary?: string;
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

  function makeBinder(prefix: string): CommandGroup {
    return {
      command(name: string, cmdOpts: CommandOptions): void {
        validateNoDots(name, "Command");
        const fullPath = prefix ? `${prefix}.${name}` : name;

        // Validate examples against input schema at registration time
        if (cmdOpts.examples && cmdOpts.input) {
          const ajv = new Ajv();
          const validate = ajv.compile(cmdOpts.input);
          for (const ex of cmdOpts.examples) {
            if (!validate(ex.input)) {
              const details = (validate.errors ?? [])
                .map((e) => `${e.instancePath || "(root)"}: ${e.message}`)
                .join("; ");
              throw new Error(
                `Command "${fullPath}" example "${ex.title}" input invalid: ${details}`,
              );
            }
          }
        }

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

      // Validate examples against input schema at registration time
      if (cmdOpts.examples && cmdOpts.input) {
        const ajv = new Ajv();
        const validate = ajv.compile(cmdOpts.input);
        for (const ex of cmdOpts.examples) {
          if (!validate(ex.input)) {
            const details = (validate.errors ?? [])
              .map((e) => `${e.instancePath || "(root)"}: ${e.message}`)
              .join("; ");
            throw new Error(`Command "${name}" example "${ex.title}" input invalid: ${details}`);
          }
        }
      }

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
