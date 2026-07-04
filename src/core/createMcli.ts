import Ajv from "ajv";
import type { McliApp, GroupOptions, CommandOptions, CommandNode } from "../types";
import { CommandTree } from "./tree";

interface CreateMcliOptions {
  name: string;
  version: string;
  summary?: string;
}

export function createMcli(opts: CreateMcliOptions): McliApp {
  const tree = new CommandTree();

  const app: McliApp = {
    name: opts.name,
    version: opts.version,
    summary: opts.summary ?? "",

    group(path: string, groupOpts: GroupOptions): void {
      const existing = tree.find(path.split("."));
      if (existing) {
        existing.summary = groupOpts.summary;
        existing.description = groupOpts.description;
      } else {
        tree.insert(path, {
          path,
          argv: path.split("."),
          name: path.split(".").pop()!,
          summary: groupOpts.summary,
          description: groupOpts.description,
          isGroup: true,
          children: new Map(),
        });
      }
    },

    command(path: string, cmdOpts: CommandOptions): void {
      // Validate examples against input schema at registration time
      if (cmdOpts.examples && cmdOpts.input) {
        const ajv = new Ajv();
        const validate = ajv.compile(cmdOpts.input);
        for (const ex of cmdOpts.examples) {
          if (!validate(ex.input)) {
            const details = (validate.errors ?? [])
              .map((e) => `${e.instancePath || "(root)"}: ${e.message}`)
              .join("; ");
            throw new Error(`Command "${path}" example "${ex.title}" input invalid: ${details}`);
          }
        }
      }

      tree.insert(path, {
        path,
        argv: path.split("."),
        name: path.split(".").pop()!,
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
